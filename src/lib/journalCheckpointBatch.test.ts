import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_CHECKPOINT_BATCH_BYTES, MAX_CHECKPOINT_ROWS, packCheckpointBatch, previewCheckpointBatch,
  unpackCheckpointBatch, type PackedCheckpointBatch } from './journalCheckpointBatch';
import type { DurableJournalEntry } from './durableJournal';

const baseline = '{"name":"Боец 😀", "raw":"future"}\r\n\ud800' + 'historical-profile;'.repeat(1000);
const row = (i: number, baseProfileRaw: string | null = baseline, state: DurableJournalEntry['state'] = 'settled'): DurableJournalEntry =>
  ({ key: 'bodyforge:pilot:v1:result:checkpoint-' + i, raw: '{opaque result ' + i, baseProfileRaw, state });
const envelope = (rows: DurableJournalEntry[], complete = true) =>
  JSON.stringify({ exportFormat: 'bodyforge-manual-backup', exportSchemaVersion: 1,
    complete, durableReadStatus: 'ready', durableResults: rows });
async function packed(rows: DurableJournalEntry[] = [row(1), row(2), row(3, null)]) {
  const result = await packCheckpointBatch(rows);
  if (result.status !== 'packed') throw Error(result.status);
  return result;
}
afterEach(() => vi.unstubAllGlobals());

describe('BF-107 exact checkpoint batch representation', () => {
  it('pools identical baselines, preserves nullable and damaged opaque strings and checks exact round trip', async () => {
    const rows = [row(1), row(2), row(3, null), row(4, baseline + 'distinct')];
    const result = await packed(rows);
    expect(result.uniqueCheckpoints).toBe(2);
    expect(result.batch.rows.map(r => r.checkpoint)).toEqual([0,0,null,1]);
    expect(result.packedBytes).toBeLessThan(result.originalBytes / 4);
    expect(await unpackCheckpointBatch(structuredClone(result.batch))).toEqual(rows);
    expect(result.originalBytes).toBe(new TextEncoder().encode(JSON.stringify(rows)).length);
  });
  it('does not trim or normalize empty, BOM, escaped or unpaired UTF-16 strings', async () => {
    const rows = [row(1), row(2, ''), row(3, '\ufeff'), row(4, '\udfff'), row(5, '\\n')];
    expect(await unpackCheckpointBatch((await packed(rows)).batch)).toEqual(rows);
  });
  it('falls back to a plain pooled format without native compression support', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const rows = [row(1),row(2),row(3)];
    const result = await packed(rows);
    expect(result.batch.encoding).toBe('utf8-json');
    expect(await unpackCheckpointBatch(result.batch)).toEqual(rows);
  });
  it('rejects altered refs, content, digest, invalid limits and malformed compression without returning a partial batch', async () => {
    const { batch } = await packed([row(1),row(2),row(3, null),row(4, baseline+'different')]);
    const mutations: ((b: PackedCheckpointBatch) => void)[] = [
      b => { b.rows[0].checkpoint = 1; }, b => { b.rows[0].raw += 'changed'; },
      b => { b.rows[0].key = b.rows[1].key; }, b => { b.digest = '0'.repeat(64); },
      b => { b.rows[0].checkpoint = 999; }, b => { b.decodedBytes--; },
      b => { b.logicalBytes--; }, b => { b.checkpointCount++; },
      b => { b.version = 2 as 1; }, b => { b.checkpointData = b.checkpointData.slice(0,-2); },
      b => { new Uint8Array(b.checkpointData)[b.checkpointData.byteLength-8] ^= 1; },
    ];
    for (const mutate of mutations) {
      const candidate = structuredClone(batch); mutate(candidate);
      expect(await unpackCheckpointBatch(candidate)).toBeNull();
    }
  });
  it('rejects active, quarantined, duplicate keys, unexpected fields and oversized batches', async () => {
    for (const input of [[row(1, baseline, 'active')], [row(1, baseline, 'quarantined')], [row(1),row(1)],
      [{...row(1), future: true}], [], Array.from({length:MAX_CHECKPOINT_ROWS+1},(_,i)=>row(i)),
      [row(1,'x'.repeat(MAX_CHECKPOINT_BATCH_BYTES+1))]]) {
      expect(await packCheckpointBatch(input)).toEqual({ status:'invalid' });
    }
    expect((await packCheckpointBatch([row(1,null)])).status).toBe('not-smaller');
  });
  it('aborts without authority or local/network side effects', async () => {
    const controller = new AbortController(); controller.abort();
    expect(await packCheckpointBatch([row(1)],controller.signal)).toEqual({status:'cancelled'});
    const forbidden = vi.fn(() => { throw Error('unexpected IO'); });
    vi.stubGlobal('localStorage',{getItem:forbidden,setItem:forbidden});
    vi.stubGlobal('indexedDB',{open:forbidden});
    vi.stubGlobal('fetch',forbidden);
    const {batch}=await packed();
    expect(await unpackCheckpointBatch(batch,controller.signal)).toBeNull();
    expect(forbidden).not.toHaveBeenCalled();
  });
  it('reports measured sample only, not full journal savings; never includes active or quarantine', async () => {
    const rows = [row(90,baseline,'active'),row(91,baseline,'quarantined'),
      ...Array.from({length:MAX_CHECKPOINT_ROWS+1},(_,i)=>row(i))];
    const result = await previewCheckpointBatch(envelope(rows));
    expect(result).toMatchObject({ status:'ready', sampleCount:MAX_CHECKPOINT_ROWS, settledCount:MAX_CHECKPOINT_ROWS+1,
      totalCount:MAX_CHECKPOINT_ROWS+3, uniqueCheckpoints:1 });
    expect(result).not.toHaveProperty('batch');
    expect(result).not.toHaveProperty('rows');
  });
  it('does not claim empty or ready on incomplete, oversized or invalid input', async () => {
    expect(await previewCheckpointBatch(envelope([row(1)],false))).toEqual({status:'unavailable'});
    expect(await previewCheckpointBatch(envelope([row(1),row(1)]))).toEqual({status:'unavailable'});
    expect(await previewCheckpointBatch(envelope([row(1,null,'active')]))).toEqual({status:'empty'});
    expect(await previewCheckpointBatch(envelope([row(1,'x'.repeat(MAX_CHECKPOINT_BATCH_BYTES+1))]))).toEqual({status:'too-large'});
    expect(await previewCheckpointBatch('x'.repeat(16*1024*1024+1))).toEqual({status:'too-large'});
  });
});
