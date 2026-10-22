import { RESULT_JOURNAL_PREFIX } from './workoutJournal';

export const DURABLE_JOURNAL_DATABASE = 'bodyforge:durable-results:v1';
const STORE = 'results';
const TIMEOUT_MS = 5000;
export interface DurableJournalEntry {
  key: string;
  raw: string;
  baseProfileRaw: string | null;
  state: 'active' | 'settled' | 'quarantined';
}
interface StoredEntry extends DurableJournalEntry { schemaVersion: 1 }
type EntryInput = Pick<DurableJournalEntry, 'key' | 'raw'>;
type WriteResult = { status: 'saved' | 'invalid' | 'unavailable' };
type ReadResult = { status: 'ready' | 'unavailable'; entries: DurableJournalEntry[] };
const validInput = (value: unknown): value is EntryInput => !!value && typeof value === 'object'
  && typeof (value as EntryInput).key === 'string' && (value as EntryInput).key.startsWith(RESULT_JOURNAL_PREFIX)
  && typeof (value as EntryInput).raw === 'string';
function storedEntry(value: unknown): StoredEntry | null {
  if (!validInput(value)) return null;
  const row = value as StoredEntry;
  if (row.schemaVersion !== 1 || (row.baseProfileRaw !== null && typeof row.baseProfileRaw !== 'string')
      || !['active', 'settled', 'quarantined'].includes(row.state)) return null;
  return { schemaVersion: 1, key: row.key, raw: row.raw, baseProfileRaw: row.baseProfileRaw, state: row.state };
}
function publicEntry(row: StoredEntry): DurableJournalEntry {
  return { key: row.key, raw: row.raw, baseProfileRaw: row.baseProfileRaw, state: row.state };
}

/** Every handle is short lived. Blocked/late opens never become hidden writers. */
function openDatabase(signal?: AbortSignal): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (signal?.aborted || typeof indexedDB === 'undefined') { resolve(null); return; }
    let done = false;
    const finish = (db: IDBDatabase | null) => {
      if (done) { db?.close(); return; }
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', aborted); resolve(db);
    };
    const aborted = () => finish(null);
    const timer = setTimeout(aborted, TIMEOUT_MS);
    signal?.addEventListener('abort', aborted, { once: true });
    try {
      const request = indexedDB.open(DURABLE_JOURNAL_DATABASE, 1);
      request.onblocked = () => finish(null);
      request.onerror = () => finish(null);
      request.onupgradeneeded = () => {
        if (done || signal?.aborted) { request.transaction?.abort(); return; }
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        if (done || signal?.aborted || !db.objectStoreNames.contains(STORE)) { db.close(); finish(null); return; }
        finish(db);
      };
    } catch { finish(null); }
  });
}

/** Opaque raw records are preserved; unknown store schema fails closed. */
export async function readDurableJournal(): Promise<ReadResult> {
  const db = await openDatabase();
  if (!db) return { status: 'unavailable', entries: [] };
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: ReadResult) => {
      if (done) return;
      done = true; clearTimeout(timer); db.close(); resolve(result);
    };
    let tx: IDBTransaction | undefined;
    const timer = setTimeout(() => {
      try { tx?.abort(); } catch { /* Already inactive. */ }
      finish({ status: 'unavailable', entries: [] });
    }, TIMEOUT_MS);
    try {
      tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      if (store.keyPath !== 'key') { tx.abort(); finish({ status: 'unavailable', entries: [] }); return; }
      let rows: StoredEntry[] | null = null;
      const request = store.getAll();
      request.onsuccess = () => {
        const decoded = (request.result as unknown[]).map(storedEntry);
        if (decoded.every((entry): entry is StoredEntry => entry !== null)) rows = decoded;
      };
      tx.oncomplete = () => finish(rows ? { status: 'ready', entries: rows.map(publicEntry) } : { status: 'unavailable', entries: [] });
      tx.onabort = tx.onerror = () => finish({ status: 'unavailable', entries: [] });
    } catch { finish({ status: 'unavailable', entries: [] }); }
  });
}

async function writeEntries(entries: readonly EntryInput[], baseProfileRaw: string | null,
  state: 'settled' | 'quarantined' | null, signal?: AbortSignal): Promise<WriteResult> {
  if (signal?.aborted) return { status: 'unavailable' };
  if (!Array.isArray(entries) || entries.some((entry) => !validInput(entry))
      || (baseProfileRaw !== null && typeof baseProfileRaw !== 'string')) return { status: 'invalid' };
  const unique = new Map<string, EntryInput>();
  for (const entry of entries) {
    if (unique.has(entry.key) && unique.get(entry.key)!.raw !== entry.raw) return { status: 'invalid' };
    unique.set(entry.key, { key: entry.key, raw: entry.raw });
  }
  if (!unique.size) return { status: 'saved' };
  const db = await openDatabase(signal);
  if (!db || signal?.aborted) { db?.close(); return { status: 'unavailable' }; }
  const expected = new Map<string, StoredEntry>();
  const acknowledged = await new Promise<WriteResult>((resolve) => {
    let done = false, issue: WriteResult['status'] = 'unavailable', tx: IDBTransaction | undefined;
    const finish = (status: WriteResult['status']) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); db.close(); resolve({ status });
    };
    const abort = () => {
      try { tx?.abort(); } catch { /* May have completed; still no claim on cancellation. */ }
      finish('unavailable');
    };
    const timer = setTimeout(abort, TIMEOUT_MS);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      tx = db.transaction(STORE, 'readwrite', { durability: 'strict' });
      tx.oncomplete = () => finish(signal?.aborted ? 'unavailable' : 'saved');
      tx.onabort = tx.onerror = () => finish(issue);
      // Older engines may silently ignore the options dictionary.
      if (tx.durability !== 'strict' || signal?.aborted) { abort(); return; }
      const store = tx.objectStore(STORE);
      if (store.keyPath !== 'key') { abort(); return; }
      let remaining = unique.size;
      const existing = new Map<string, unknown>();
      const apply = () => {
        for (const entry of unique.values()) {
          const original = existing.get(entry.key), row = original === undefined ? null : storedEntry(original);
          if (original !== undefined && !row) { issue = 'unavailable'; tx!.abort(); return; }
          if ((row && row.raw !== entry.raw) || (state && !row) || (state === 'settled' && row?.state === 'quarantined')) {
            issue = 'invalid'; tx!.abort(); return;
          }
          expected.set(entry.key, row ? { ...row, ...(state ? { state } : {}) }
            : { schemaVersion: 1, ...entry, baseProfileRaw, state: 'active' });
        }
        for (const row of expected.values()) store.put(row);
      };
      for (const entry of unique.values()) {
        const request = store.get(entry.key);
        request.onsuccess = () => {
          existing.set(entry.key, request.result);
          if (--remaining === 0) {
            try { apply(); } catch { abort(); }
          }
        };
      }
    } catch { abort(); }
  });
  if (acknowledged.status !== 'saved') return acknowledged;
  if (signal?.aborted) return { status: 'unavailable' };
  // A request success is insufficient: only transaction complete plus a new
  // readonly transaction can authorize the caller to credit localStorage.
  const checked = await readDurableJournal();
  if (checked.status !== 'ready' || signal?.aborted) return { status: 'unavailable' };
  const actual = new Map(checked.entries.map((entry) => [entry.key, entry]));
  for (const row of expected.values()) {
    const found = actual.get(row.key);
    if (!found || found.raw !== row.raw || found.state !== row.state || found.baseProfileRaw !== row.baseProfileRaw) return { status: 'unavailable' };
  }
  return { status: 'saved' };
}

/** Caller holds the shared write lock until the returned promise settles. */
export function stageDurableResults(entries: readonly EntryInput[], baseProfileRaw: string | null,
  signal?: AbortSignal): Promise<WriteResult> {
  return writeEntries(entries, baseProfileRaw, null, signal);
}
/** Settled rows stay durable: localStorage itself can roll back on browser crash. */
export function markDurableResults(entries: readonly EntryInput[], state: 'settled' | 'quarantined',
  signal?: AbortSignal): Promise<WriteResult> {
  if (state !== 'settled' && state !== 'quarantined') return Promise.resolve({ status: 'invalid' });
  return writeEntries(entries, null, state, signal);
}
