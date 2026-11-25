import { decodeBackupBytes, prepareBackupArchive } from './backupArchive';
import type { DurableJournalEntry } from './durableJournal';
import { MAX_PROGRESS_BACKUP_BYTES } from './progressBackupInspector';
import { RESULT_JOURNAL_PREFIX } from './workoutJournal';

/** Prototype physical representation for an immutable settled batch.
 * NOT a new live journal schema. No database operation or reward authority. */
export const MAX_CHECKPOINT_ROWS = 64;
export const MAX_CHECKPOINT_BATCH_BYTES = 2 * 1024 * 1024;
const MIN_SAVING_BYTES = 128;
type Settled = DurableJournalEntry & { state: 'settled' };
type Ref = { key: string; raw: string; checkpoint: number | null };
export interface PackedCheckpointBatch {
  format: 'bodyforge-settled-checkpoints';
  version: 1;
  encoding: 'gzip-json' | 'utf8-json';
  rows: Ref[];
  checkpointCount: number;
  decodedBytes: number;
  logicalBytes: number;
  digest: string;
  checkpointData: ArrayBuffer;
}
type Stats = { originalBytes: number; packedBytes: number; uniqueCheckpoints: number };
export type CheckpointPackResult =
  | ({ status: 'packed'; batch: PackedCheckpointBatch } & Stats)
  | ({ status: 'not-smaller' } & Stats)
  | { status: 'invalid' | 'unavailable' | 'cancelled' };
type ObjectValue = Record<string, unknown>;
const object = (v: unknown): v is ObjectValue => !!v && typeof v === 'object' && !Array.isArray(v);
const exactKeys = (v: ObjectValue, keys: string[]) => Object.keys(v).length === keys.length &&
  keys.every(key => Object.prototype.hasOwnProperty.call(v, key));
const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s).byteLength;
const validKey = (v: unknown): v is string => typeof v === 'string' && v.startsWith(RESULT_JOURNAL_PREFIX);
const states = ['active', 'settled', 'quarantined'] as const;
function validRow(v: unknown): v is DurableJournalEntry {
  return object(v) && exactKeys(v, ['key', 'raw', 'baseProfileRaw', 'state']) &&
    validKey(v.key) && typeof v.raw === 'string' &&
    (v.baseProfileRaw === null || typeof v.baseProfileRaw === 'string') &&
    states.some(state => state === v.state);
}
function rowBytes(row: DurableJournalEntry): number {
  // Bound code units before materializing UTF-8, including opaque damaged text.
  if (row.key.length + row.raw.length + (row.baseProfileRaw?.length ?? 0) > MAX_CHECKPOINT_BATCH_BYTES)
    return Infinity;
  return bytes(JSON.stringify(row));
}
function logicalRow(row: Pick<DurableJournalEntry, 'key' | 'raw' | 'baseProfileRaw'>): Settled {
  return { key: row.key, raw: row.raw, baseProfileRaw: row.baseProfileRaw, state: 'settled' };
}
async function digest(text: string) {
  if (!globalThis.crypto?.subtle) throw Error('SHA-256 unavailable');
  const value = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(value), x => x.toString(16).padStart(2, '0')).join('');
}
function metadataBytes(batch: PackedCheckpointBatch) {
  const { checkpointData, ...metadata } = batch;
  return bytes(JSON.stringify(metadata)) + checkpointData.byteLength;
}

/** Restore only a bounded, exact representation. A digest detects damaged
 * content, not authenticity or entitlement. Never apply these rows to a wallet. */
export async function unpackCheckpointBatch(value: unknown, signal?: AbortSignal): Promise<Settled[] | null> {
  try {
    if (signal?.aborted || !object(value) ||
        !exactKeys(value, ['format','version','encoding','rows','checkpointCount','decodedBytes','logicalBytes','digest','checkpointData'])) return null;
    const { format, version, encoding, rows, checkpointCount, decodedBytes, logicalBytes, digest: expected, checkpointData } = value;
    if (format !== 'bodyforge-settled-checkpoints' || version !== 1 ||
        (encoding !== 'gzip-json' && encoding !== 'utf8-json') ||
        !Array.isArray(rows) || !rows.length || rows.length > MAX_CHECKPOINT_ROWS ||
        typeof checkpointCount !== 'number' || !Number.isInteger(checkpointCount) || checkpointCount < 0 || checkpointCount > rows.length ||
        typeof decodedBytes !== 'number' || !Number.isInteger(decodedBytes) || decodedBytes < 2 || decodedBytes > MAX_CHECKPOINT_BATCH_BYTES ||
        typeof logicalBytes !== 'number' || !Number.isInteger(logicalBytes) || logicalBytes < 2 || logicalBytes > MAX_CHECKPOINT_BATCH_BYTES ||
        typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected) ||
        !(checkpointData instanceof ArrayBuffer) || checkpointData.byteLength === 0 ||
        checkpointData.byteLength > MAX_CHECKPOINT_BATCH_BYTES) return null;
    const header = new Uint8Array(checkpointData, 0, Math.min(2, checkpointData.byteLength));
    if ((header[0] === 0x1f && header[1] === 0x8b) !== (encoding === 'gzip-json')) return null;
    const text = await decodeBackupBytes(checkpointData, signal, decodedBytes);
    if (signal?.aborted || bytes(text) !== decodedBytes) return null;
    const pool: unknown = JSON.parse(text);
    if (!Array.isArray(pool) || pool.length !== checkpointCount ||
        pool.some(item => typeof item !== 'string') || new Set(pool).size !== pool.length ||
        JSON.stringify(pool) !== text) return null;
    const seen = new Set<string>(), used = new Set<number>();
    const restored: Settled[] = [];
    let size = 2;
    for (const row of rows) {
      if (!object(row) || !exactKeys(row, ['key','raw','checkpoint']) || !validKey(row.key) ||
          typeof row.raw !== 'string' || seen.has(row.key)) return null;
      const index = row.checkpoint;
      if (index !== null && (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= pool.length)) return null;
      const next: Settled = { key: row.key, raw: row.raw, baseProfileRaw: index === null ? null : pool[index], state: 'settled' };
      size += rowBytes(next) + (restored.length ? 1 : 0);
      if (size > logicalBytes) return null;
      seen.add(row.key);
      if (index !== null) used.add(index);
      restored.push(next);
    }
    if (used.size !== pool.length || size !== logicalBytes) return null;
    const hash = await digest(JSON.stringify(restored));
    return !signal?.aborted && hash === expected ? restored : null;
  } catch { return null; }
}

/** Pool equal originals once, optionally gzip the bounded pool, and require an
 * exact logical round trip before a candidate is accepted. */
export async function packCheckpointBatch(input: readonly DurableJournalEntry[], signal?: AbortSignal): Promise<CheckpointPackResult> {
  if (signal?.aborted) return { status: 'cancelled' };
  try {
    if (!Array.isArray(input) || !input.length || input.length > MAX_CHECKPOINT_ROWS) return { status: 'invalid' };
    const originals: Settled[] = [], rows: Ref[] = [], pool: string[] = [];
    const index = new Map<string, number>(), seen = new Set<string>();
    let originalBytes = 2;
    for (const row of input) {
      if (!validRow(row) || row.state !== 'settled' || seen.has(row.key)) return { status: 'invalid' };
      const original = logicalRow(row);
      originalBytes += rowBytes(original) + (originals.length ? 1 : 0);
      if (originalBytes > MAX_CHECKPOINT_BATCH_BYTES) return { status: 'invalid' };
      let checkpoint: number | null = null;
      if (original.baseProfileRaw !== null) {
        const existing = index.get(original.baseProfileRaw);
        if (existing === undefined) {
          checkpoint = pool.length;
          index.set(original.baseProfileRaw, checkpoint);
          pool.push(original.baseProfileRaw);
        } else checkpoint = existing;
      }
      seen.add(original.key);
      originals.push(original);
      rows.push({ key: original.key, raw: original.raw, checkpoint });
    }
    const poolJson = JSON.stringify(pool), plain = encoder.encode(poolJson);
    if (plain.byteLength > MAX_CHECKPOINT_BATCH_BYTES) return { status: 'invalid' };
    const hash = await digest(JSON.stringify(originals));
    const packed = await prepareBackupArchive(poolJson, 'checkpoint.json', signal);
    if (signal?.aborted) return { status: 'cancelled' };
    const batch: PackedCheckpointBatch = {
      format: 'bodyforge-settled-checkpoints', version: 1,
      encoding: packed.status === 'ready' ? 'gzip-json' : 'utf8-json',
      rows, checkpointCount: pool.length, decodedBytes: plain.byteLength,
      logicalBytes: originalBytes, digest: hash,
      checkpointData: packed.status === 'ready' ? await packed.blob.arrayBuffer() : plain.buffer as ArrayBuffer,
    };
    const restored = await unpackCheckpointBatch(batch, signal);
    if (signal?.aborted) return { status: 'cancelled' };
    if (!restored || JSON.stringify(restored) !== JSON.stringify(originals)) return { status: 'unavailable' };
    const stats = { originalBytes, packedBytes: metadataBytes(batch), uniqueCheckpoints: pool.length };
    return originalBytes - stats.packedBytes >= MIN_SAVING_BYTES
      ? { status: 'packed', batch, ...stats } : { status: 'not-smaller', ...stats };
  } catch { return { status: signal?.aborted ? 'cancelled' : 'unavailable' }; }
}

export type CheckpointPreview =
  | ({ status: 'ready' | 'not-smaller'; sampleCount: number; settledCount: number; totalCount: number } & Stats)
  | { status: 'empty' | 'too-large' | 'unavailable' | 'cancelled' };

/** Evaluate one bounded batch from an already prepared backup. No IDB read
 * or write is added by this operation, no extrapolation to physical disk. */
export async function previewCheckpointBatch(json: string, signal?: AbortSignal): Promise<CheckpointPreview> {
  if (signal?.aborted) return { status: 'cancelled' };
  try {
    if (json.length > MAX_PROGRESS_BACKUP_BYTES || bytes(json) > MAX_PROGRESS_BACKUP_BYTES) return { status: 'too-large' };
    const backup: unknown = JSON.parse(json);
    if (!object(backup) || backup.exportFormat !== 'bodyforge-manual-backup' || backup.exportSchemaVersion !== 1 ||
        backup.complete !== true || backup.durableReadStatus !== 'ready' || !Array.isArray(backup.durableResults)) return { status: 'unavailable' };
    const rows = backup.durableResults, sample: Settled[] = [], seen = new Set<string>();
    let settledCount = 0, budget = 2;
    for (const row of rows) {
      if (!validRow(row) || seen.has(row.key)) return { status: 'unavailable' };
      seen.add(row.key);
      if (row.state !== 'settled') continue;
      settledCount++;
      if (sample.length >= MAX_CHECKPOINT_ROWS) continue;
      const size = rowBytes(logicalRow(row)) + (sample.length ? 1 : 0);
      if (budget + size > MAX_CHECKPOINT_BATCH_BYTES) continue;
      sample.push(logicalRow(row)); budget += size;
    }
    if (!sample.length) return { status: settledCount ? 'too-large' : 'empty' };
    const result = await packCheckpointBatch(sample, signal);
    if (result.status === 'packed' || result.status === 'not-smaller') return {
      status: result.status === 'packed' ? 'ready' : 'not-smaller',
      sampleCount: sample.length, settledCount, totalCount: rows.length,
      originalBytes: result.originalBytes, packedBytes: result.packedBytes, uniqueCheckpoints: result.uniqueCheckpoints,
    };
    return { status: result.status === 'cancelled' ? 'cancelled' : 'unavailable' };
  } catch { return { status: signal?.aborted ? 'cancelled' : 'unavailable' }; }
}
