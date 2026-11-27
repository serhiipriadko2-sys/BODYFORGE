import type { DurableJournalEntry, DurableWriteResult } from './durableJournal';
import { DURABLE_COMPACT_VERSION, DURABLE_JOURNAL_DATABASE, DURABLE_META_STORE, DURABLE_RESULT_STORE,
  isVersionedJournalLayout } from './durableJournalSchema';
import { packCheckpointBatch, unpackCheckpointBatch, MAX_CHECKPOINT_ROWS, type PackedCheckpointBatch } from './journalCheckpointBatch';
import { RESULT_JOURNAL_PREFIX } from './workoutJournal';
import { withDurableJournalGate } from './durableJournalGate';
import { withProfileWriteLock } from './profileLock';
import { proveJournalActivation, type JournalActivationProof } from './journalActivationProof';

/** Explicitly prepared v2. Revision fences cooperating writers only.
 * No async codec operations run inside an active IDB transaction. */
const PAGE_ROWS = 32;
const TX_TIMEOUT = 5000;
type Original = DurableJournalEntry & { schemaVersion: 1 };
type Compact = { key: string; schemaVersion: 2; batch: PackedCheckpointBatch };
type Physical = Original | Compact;
type EntryInput = Pick<DurableJournalEntry, 'key' | 'raw'>;
type State = 'settled' | 'quarantined' | null;
type Read<T> = { status: 'ready' | 'unavailable'; entries: T[] };
type Marker = { key: 'state'; format: 'bodyforge-keyed-journal'; version: 2; revision: number };
type Selection = { revision: number; rows: Map<string, unknown> };
type TxMode = 'readonly' | 'readwrite';
const unavailable = <T>(): Read<T> => ({status:'unavailable', entries:[]});
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, fields: string[]) => Object.keys(v).length === fields.length &&
  fields.every(key => Object.prototype.hasOwnProperty.call(v,key));
const validKey = (v: unknown): v is string => typeof v === 'string' && v.startsWith(RESULT_JOURNAL_PREFIX);
const marker = (revision: number): Marker => ({key:'state', format:'bodyforge-keyed-journal', version:2, revision});
function revision(value: unknown): number | null {
  return record(value) && exact(value,['key','format','version','revision']) &&
    value.key === 'state' && value.format === 'bodyforge-keyed-journal' && value.version === 2 &&
    typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 0
    ? value.revision : null;
}
function original(value: unknown): DurableJournalEntry | null {
  if (!record(value) || !exact(value,['schemaVersion','key','raw','baseProfileRaw','state']) ||
      value.schemaVersion !== 1 || !validKey(value.key) || typeof value.raw !== 'string' ||
      (value.baseProfileRaw !== null && typeof value.baseProfileRaw !== 'string') ||
      (value.state !== 'active' && value.state !== 'settled' && value.state !== 'quarantined')) return null;
  return {key:value.key,raw:value.raw,baseProfileRaw:value.baseProfileRaw,state:value.state};
}
function plain(row: DurableJournalEntry): Original {
  return {schemaVersion:1,key:row.key,raw:row.raw,baseProfileRaw:row.baseProfileRaw,state:row.state};
}
function isCompact(value: unknown): value is Compact {
  return record(value) && exact(value,['key','schemaVersion','batch']) && value.schemaVersion === 2 &&
    validKey(value.key) && record(value.batch) && Array.isArray(value.batch.rows) && value.batch.rows.length === 1 &&
    record(value.batch.rows[0]) && value.batch.rows[0].key === value.key;
}
async function logical(value: unknown, signal?: AbortSignal): Promise<DurableJournalEntry | null> {
  if (signal?.aborted) return null;
  const row = original(value);
  if (row) return row;
  if (!isCompact(value)) return null;
  const decoded = await unpackCheckpointBatch(value.batch,signal);
  return decoded?.length === 1 && decoded[0].key === value.key ? decoded[0] : null;
}
function sameRow(a: DurableJournalEntry, b: DurableJournalEntry) {
  return a.key === b.key && a.raw === b.raw && a.baseProfileRaw === b.baseProfileRaw && a.state === b.state;
}
function samePhysical(a: unknown,b: unknown): boolean {
  if (a === undefined || b === undefined) return a === b;
  const x = original(a), y = original(b);
  if (x || y) return !!x && !!y && sameRow(x,y);
  if (!isCompact(a) || !isCompact(b) || a.key !== b.key) return false;
  try {
    const {checkpointData:ad,...am} = a.batch, {checkpointData:bd,...bm} = b.batch;
    if (!(ad instanceof ArrayBuffer) || !(bd instanceof ArrayBuffer) ||
        ad.byteLength !== bd.byteLength || JSON.stringify(am) !== JSON.stringify(bm)) return false;
    const av = new Uint8Array(ad), bv = new Uint8Array(bd);
    return av.every((n,i) => n === bv[i]);
  } catch { return false; }
}
function storeShape(store: IDBObjectStore) {
  return store.keyPath === 'key' && !store.autoIncrement && store.indexNames.length === 0;
}

/** Completion proves the native transaction settled; it is not yet a saved
 * receipt. Request callbacks schedule writes synchronously. */
function transact<T>(db: IDBDatabase, mode: TxMode, signal: AbortSignal | undefined,
  run: (results: IDBObjectStore, meta: IDBObjectStore, tx: IDBTransaction) => () => T | null): Promise<T | null> {
  return new Promise(resolve => {
    if (signal?.aborted || !isVersionedJournalLayout(db)) { resolve(null); return; }
    let done = false, tx: IDBTransaction | undefined, complete: (() => T | null) | undefined;
    const finish = (value: T | null) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener('abort',abort); resolve(value);
    };
    const abort = () => {
      try { tx?.abort(); } catch { /* Commit may have happened. */ }
      finish(null);
    };
    const timer = setTimeout(abort,TX_TIMEOUT);
    signal?.addEventListener('abort',abort,{once:true});
    try {
      const names = [DURABLE_RESULT_STORE,DURABLE_META_STORE];
      tx = mode === 'readwrite' ? db.transaction(names,mode,{durability:'strict'}) : db.transaction(names,mode);
      tx.oncomplete = () => {
        try { finish(!signal?.aborted && complete ? complete() : null); } catch { finish(null); }
      };
      tx.onabort = tx.onerror = () => finish(null);
      const results = tx.objectStore(DURABLE_RESULT_STORE), meta = tx.objectStore(DURABLE_META_STORE);
      if (!storeShape(results) || !storeShape(meta) || (mode === 'readwrite' && tx.durability !== 'strict') || signal?.aborted) {
        abort(); return;
      }
      complete = run(results,meta,tx);
    } catch { abort(); }
  });
}
function readMarker(meta: IDBObjectStore) {
  const value = meta.get('state'), count = meta.count();
  return {value,count,read: () => count.result === 1 ? revision(value.result) : null};
}
function readPage(db: IDBDatabase, after: string | undefined, signal?: AbortSignal) {
  return transact(db,'readonly',signal,(results,meta) => {
    const state = readMarker(meta);
    const rows = results.getAll(after === undefined ? undefined : IDBKeyRange.lowerBound(after,true),PAGE_ROWS);
    return () => {
      const rev = state.read();
      return rev !== null && Array.isArray(rows.result) && rows.result.length <= PAGE_ROWS
        ? {revision:rev, rows:rows.result as unknown[]} : null;
    };
  });
}
function readRevision(db: IDBDatabase, signal?: AbortSignal) {
  return transact(db,'readonly',signal,(_results,meta) => readMarker(meta).read);
}
function select(db: IDBDatabase, keys: readonly string[], signal?: AbortSignal): Promise<Selection | null> {
  return transact(db,'readonly',signal,(results,meta) => {
    const state = readMarker(meta);
    const requests = keys.map(key => [key,results.get(key)] as const);
    return () => {
      const rev = state.read();
      return rev === null ? null : {revision:rev,rows:new Map<string,unknown>(requests.map(([key,req]) => [key,req.result]))};
    };
  });
}

/** Bounded pages, no whole-journal byte/count cap. The same revision must
 * be observed on each page and after the final asynchronous decode. */
export async function readVersionedJournal<T>(db: IDBDatabase, project: (row: DurableJournalEntry) => T | undefined,
  signal?: AbortSignal): Promise<Read<T>> {
  try {
    const entries: T[] = [];
    let expected: number | undefined, after: string | undefined;
    for (;;) {
      if (signal?.aborted) return unavailable();
      const page = await readPage(db,after,signal);
      if (!page || (expected !== undefined && page.revision !== expected)) return unavailable();
      expected = page.revision;
      for (const stored of page.rows) {
        const row = await logical(stored,signal);
        if (!row || (after !== undefined && row.key <= after)) return unavailable();
        after = row.key;
        const value = project(row);
        if (value !== undefined) entries.push(value);
      }
      if (page.rows.length < PAGE_ROWS) break;
    }
    return !signal?.aborted && await readRevision(db,signal) === expected && !signal?.aborted
      ? {status:'ready',entries} : unavailable();
  } catch { return unavailable(); }
}
async function cas(db: IDBDatabase, before: Selection, writes: ReadonlyMap<string,Physical>, signal?: AbortSignal) {
  return await transact(db,'readwrite',signal,(results,meta,tx) => {
    const state = readMarker(meta);
    const requests = [...before.rows.keys()].map(key => [key,results.get(key)] as const);
    let pending = requests.length + 2, committed = false;
    const apply = () => {
      if (--pending !== 0) return;
      try {
        if (signal?.aborted || state.read() !== before.revision ||
            requests.some(([key,req]) => !samePhysical(before.rows.get(key),req.result)) ||
            (writes.size && before.revision >= Number.MAX_SAFE_INTEGER)) { tx.abort(); return; }
        for (const row of writes.values()) results.put(row);
        if (writes.size) meta.put(marker(before.revision+1));
        committed = true;
      } catch { try { tx.abort(); } catch { /* Unconfirmed. */ } }
    };
    state.value.onsuccess = apply; state.count.onsuccess = apply;
    for (const [,req] of requests) req.onsuccess = apply;
    return () => committed ? true : null;
  }) === true;
}
async function compact(row: DurableJournalEntry, signal?: AbortSignal): Promise<Physical> {
  // Oversized/incompressible checkpoints stay exact plain originals.
  if (row.state === 'settled' && row.baseProfileRaw !== null) {
    const packed = await packCheckpointBatch([row],signal);
    if (packed.status === 'packed') return {key:row.key,schemaVersion:2,batch:packed.batch};
  }
  return plain(row);
}
const rank = {active:0,settled:1,quarantined:2} as const;
/** Called by the public facade while holding shared journal access. */
export async function writeVersionedJournal(db: IDBDatabase, input: ReadonlyMap<string,EntryInput>, baseProfileRaw: string | null,
  state: State, signal?: AbortSignal): Promise<DurableWriteResult> {
  try {
    const keys = [...input.keys()], before = await select(db,keys,signal);
    if (!before || signal?.aborted) return {status:'unavailable'};
    const expected = new Map<string,DurableJournalEntry>(), writes = new Map<string,Physical>();
    for (const [key,entry] of input) {
      const stored = before.rows.get(key);
      const row = stored === undefined ? null : await logical(stored,signal);
      if (stored !== undefined && !row) return {status:'unavailable'};
      if ((row && row.raw !== entry.raw) || (state && !row) ||
          (state === 'settled' && row?.state === 'quarantined')) return {status:'invalid'};
      const next: DurableJournalEntry = row ? {...row,state:state??row.state} : {...entry,baseProfileRaw,state:'active'};
      expected.set(key,next);
      if (!row || row.state === 'active' || row.state !== next.state) writes.set(key,await compact(next,signal));
    }
    if (signal?.aborted || !await cas(db,before,writes,signal)) return {status:'unavailable'};
    const checked = await readVersionedJournal(db,row => expected.has(row.key)?row:undefined,signal);
    if (checked.status !== 'ready' || signal?.aborted) return {status:'unavailable'};
    const actual = new Map(checked.entries.map(row => [row.key,row])), entries: DurableJournalEntry[] = [];
    for (const [key,row] of expected) {
      const found = actual.get(key);
      if (!found || found.raw !== row.raw || found.baseProfileRaw !== row.baseProfileRaw ||
          (state === null ? rank[found.state] < rank[row.state] : found.state !== row.state)) return {status:'unavailable'};
      entries.push(found);
    }
    return {status:'saved',entries};
  } catch { return {status:'unavailable'}; }
}

export type MaintenanceResult = {status:'saved'|'unchanged';count:number} | {status:'invalid'|'unavailable'|'unverified'};
/** Explicit bounded settled-row maintenance. Restore never downgrades the DB. */
export async function maintainVersionedJournal(db: IDBDatabase, requested: readonly string[], decision: 'compact'|'restore',
  signal?: AbortSignal): Promise<MaintenanceResult> {
  if (!isVersionedJournalLayout(db) || signal?.aborted) return {status:'unavailable'};
  if (!Array.isArray(requested) || !requested.length || requested.length > MAX_CHECKPOINT_ROWS ||
      requested.some(key => !validKey(key)) || new Set(requested).size !== requested.length ||
      (decision !== 'compact' && decision !== 'restore')) return {status:'invalid'};
  const keys = [...requested];
  const locked = await withDurableJournalGate('exclusive',async(): Promise<MaintenanceResult> => {
    const before = await select(db,keys,signal);
    if (!before) return {status:'unavailable'};
    const expected = new Map<string,DurableJournalEntry>(), writes = new Map<string,Physical>();
    for (const key of keys) {
      const stored = before.rows.get(key), row = await logical(stored,signal);
      if (!row || row.state !== 'settled') return {status:'invalid'};
      expected.set(key,row);
      if (decision === 'restore' && isCompact(stored)) writes.set(key,plain(row));
      if (decision === 'compact' && !isCompact(stored)) {
        const next = await compact(row,signal);
        if (next.schemaVersion === 2) writes.set(key,next);
      }
    }
    if (signal?.aborted || !await cas(db,before,writes,signal)) return {status:'unavailable'};
    const observed = await select(db,keys,signal);
    const view = await readVersionedJournal(db,row=>expected.has(row.key)?row:undefined,signal);
    if (!observed || view.status !== 'ready' || signal?.aborted || view.entries.length !== expected.size ||
        view.entries.some(row=>!sameRow(row,expected.get(row.key)!)) ||
        keys.some(key=>!samePhysical(writes.get(key)??before.rows.get(key),observed.rows.get(key)))) return {status:'unverified'};
    return {status:writes.size?'saved':'unchanged',count:writes.size};
  },{signal});
  return locked.status === 'completed' ? locked.value : {status:'unavailable'};
}

export type PrepareVersionedResult = {status:'prepared'|'already-prepared';versionConfirmed:2} |
  {status:'invalid'|'unavailable'|'unverified';versionConfirmed:null};
/** Controlled upgrade only. No production call sites. The upgrade creates a
 * revision marker, validates existing rows and never rewrites their bytes. */
function upgrade(signal?: AbortSignal, proof?: JournalActivationProof): Promise<PrepareVersionedResult> {
  return new Promise(resolve => {
    const failed = (status:'invalid'|'unavailable'|'unverified'): PrepareVersionedResult => ({status,versionConfirmed:null});
    if (signal?.aborted || typeof indexedDB === 'undefined') { resolve(failed('unavailable')); return; }
    if (proof && !proof.matchesLocal()) { resolve(failed('invalid')); return; }
    let done = false, changing = false, invalid = false, tx: IDBTransaction | null = null;
    const finish = (result: PrepareVersionedResult) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener('abort',abort); resolve(result);
    };
    const abort = () => {
      try { tx?.abort(); } catch { /* Commit may already be durable. */ }
      finish(failed(changing?'unverified':'unavailable'));
    };
    const timer = setTimeout(abort,TX_TIMEOUT);
    signal?.addEventListener('abort',abort,{once:true});
    try {
      const request = indexedDB.open(DURABLE_JOURNAL_DATABASE,DURABLE_COMPACT_VERSION);
      request.onblocked = () => finish(failed('unavailable'));
      request.onerror = () => finish(failed(invalid?'invalid':'unavailable'));
      request.onupgradeneeded = event => {
        tx = request.transaction;
        if (!tx) { finish(failed('unavailable')); return; }
        try {
          const db = request.result;
          if (done || signal?.aborted) { tx.abort(); return; }
          changing = true;
          if (event.oldVersion !== 1 || db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains(DURABLE_RESULT_STORE)) {
            invalid = true; tx.abort(); return;
          }
          const store = tx.objectStore(DURABLE_RESULT_STORE);
          if (!storeShape(store)) { invalid=true; tx.abort(); return; }
          const meta = db.createObjectStore(DURABLE_META_STORE,{keyPath:'key'});
          let count = 0;
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            try {
              if (done || signal?.aborted) { tx?.abort(); return; }
              const row = cursor.result;
              if (!row) {
                if (proof && (count !== proof.rows.size || !proof.matchesLocal())) { invalid=true; tx?.abort(); return; }
                meta.add(marker(0)); return;
              }
              const value = original(row.value);
              if (!value || (proof && !matchesProofRow(proof,value))) { invalid=true; tx?.abort(); return; }
              count++; row.continue();
            } catch { try { tx?.abort(); } catch { /* Unconfirmed. */ } }
          };
        } catch { try { tx.abort(); } catch { /* Unconfirmed. */ } }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        if (done || signal?.aborted) { db.close(); finish(failed(changing?'unverified':'unavailable')); return; }
        clearTimeout(timer);
        void (async () => {
          try {
            const checked = await readVersionedJournal<DurableJournalEntry>(db,row=>proof?row:undefined,signal);
            const exact = !proof || (checked.entries.length === proof.rows.size &&
              checked.entries.every(row=>matchesProofRow(proof,row)) && proof.matchesLocal());
            finish(checked.status==='ready' && exact && !signal?.aborted
              ? {status:changing?'prepared':'already-prepared',versionConfirmed:2}
              : failed(changing?'unverified':'unavailable'));
          } finally { db.close(); }
        })();
      };
    } catch { finish(failed('unavailable')); }
  });
}
export async function prepareVersionedJournal(signal?: AbortSignal): Promise<PrepareVersionedResult> {
  const profile = await withProfileWriteLock(() => withDurableJournalGate('exclusive',()=>upgrade(signal),{signal}),{signal});
  return profile.status === 'completed' && profile.value.status === 'completed' ? profile.value.value :
    {status:'unavailable',versionConfirmed:null};
}

type Match = 'match' | 'stale' | 'unavailable';
function matchesProofRow(proof: JournalActivationProof, row: DurableJournalEntry): boolean {
  const expected = proof.rows.get(row.key);
  return !!expected && sameRow(row,expected);
}

/** Open only the existing legacy database. A missing DB must not be created
 * by an ostensibly read-only preflight, even if its open arrives late. */
function matchLegacyJournal(proof: JournalActivationProof, signal?: AbortSignal): Promise<Match> {
  return new Promise(resolve => {
    if (signal?.aborted || typeof indexedDB === 'undefined') { resolve('unavailable'); return; }
    let done = false, db: IDBDatabase | undefined, tx: IDBTransaction | undefined;
    const finish = (status: Match) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener('abort',cancel); db?.close(); resolve(status);
    };
    const cancel = () => { try { tx?.abort(); } catch { /* readonly */ } finish('unavailable'); };
    const timer = setTimeout(cancel,TX_TIMEOUT);
    signal?.addEventListener('abort',cancel,{once:true});
    try {
      const request = indexedDB.open(DURABLE_JOURNAL_DATABASE);
      request.onblocked = () => finish('unavailable');
      request.onerror = () => finish('unavailable');
      request.onupgradeneeded = () => { request.transaction?.abort(); finish('unavailable'); };
      request.onsuccess = () => {
        db = request.result;
        db.onversionchange = () => db?.close();
        if (done) { db.close(); return; }
        try {
          if (signal?.aborted) { finish('unavailable'); return; }
          if (db.version !== 1 || db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains(DURABLE_RESULT_STORE)) {
            finish('stale'); return;
          }
          tx = db.transaction(DURABLE_RESULT_STORE,'readonly');
          const store = tx.objectStore(DURABLE_RESULT_STORE);
          if (!storeShape(store)) { tx.abort(); finish('stale'); return; }
          let count = 0, matched = false;
          tx.onabort = tx.onerror = () => finish('unavailable');
          tx.oncomplete = () => finish(signal?.aborted ? 'unavailable' : matched && proof.matchesLocal() ? 'match' : 'stale');
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            try {
              if (done || signal?.aborted) { cancel(); return; }
              const next = cursor.result;
              if (!next) { matched = count === proof.rows.size; return; }
              const row = original(next.value);
              if (!row || !matchesProofRow(proof,row)) return;
              count++; next.continue();
            } catch { cancel(); }
          };
        } catch { cancel(); }
      };
    } catch { cancel(); }
  });
}

export interface JournalActivationPlan {
  readonly kind: 'bodyforge-journal-v2-plan';
  readonly version: 1;
  readonly records: number;
  readonly backupBytes: number;
}
export type JournalActivationPreparation =
  {status:'ready';plan:JournalActivationPlan} |
  {status:'blocked';reason:'local-not-quiet'|'backup-invalid'|'backup-differs'|'paid-history-unproven'|'stale'|'unavailable'};
export type JournalActivationResult =
  {status:'prepared'|'already-prepared';versionConfirmed:2} |
  {status:'cancelled'|'stale'|'unavailable'|'unverified';versionConfirmed:null};
const activationPlans = new WeakMap<JournalActivationPlan,JournalActivationProof>();
const activationFailure = (status: Extract<JournalActivationResult,{versionConfirmed:null}>['status']): JournalActivationResult =>
  ({status,versionConfirmed:null});

/** No UI caller until field acceptance. The input is the JSON of an explicitly
 * selected, bounded backup. Never infer that a download reached disk. */
export async function planJournalActivation(json: string, signal?: AbortSignal): Promise<JournalActivationPreparation> {
  const result = await withProfileWriteLock(() => withDurableJournalGate('exclusive',async(): Promise<JournalActivationPreparation> => {
    if (signal?.aborted) return {status:'blocked',reason:'unavailable'};
    const verified = await proveJournalActivation(json,signal);
    if (verified.status !== 'ready') return verified;
    const proof = verified.proof;
    const match = await matchLegacyJournal(proof,signal);
    if (match !== 'match') return {status:'blocked',reason:match};
    if (signal?.aborted || !proof.matchesLocal()) return {status:'blocked',reason:'stale'};
    const plan: JournalActivationPlan = Object.freeze({kind:'bodyforge-journal-v2-plan',version:1,
      records:proof.rows.size,backupBytes:proof.bytes});
    activationPlans.set(plan,proof);
    return {status:'ready',plan};
  },{signal}),{signal});
  return result.status==='completed' && result.value.status==='completed' ? result.value.value :
    {status:'blocked',reason:'unavailable'};
}

/** Single-use in-memory plan, explicit decision, ordered locks and exact
 * original comparison INSIDE versionchange. A stale plan never writes.
 * A committed but unconfirmed change is unverified, not "rolled back".
 * The caller must be quiescent (no RAM-only workout), and must obtain field
 * approval before exposing this irreversible version change to owner data. */
export async function activateJournalFromBackup(plan: JournalActivationPlan, decision: 'activate'|'cancel',
  signal?: AbortSignal): Promise<JournalActivationResult> {
  const proof = activationPlans.get(plan);
  if (!proof) return activationFailure('stale');
  activationPlans.delete(plan);
  if (decision !== 'activate' || signal?.aborted) return activationFailure('cancelled');
  const result = await withProfileWriteLock(() => withDurableJournalGate('exclusive',async(): Promise<JournalActivationResult> => {
    if (signal?.aborted) return activationFailure('cancelled');
    if (!proof.matchesLocal()) return activationFailure('stale');
    const match = await matchLegacyJournal(proof,signal);
    if (match !== 'match') return activationFailure(signal?.aborted?'cancelled':match);
    if (signal?.aborted) return activationFailure('cancelled');
    if (!proof.matchesLocal()) return activationFailure('stale');
    const upgraded = await upgrade(signal,proof);
    if (upgraded.status==='prepared' || upgraded.status==='already-prepared') {
      return {status:upgraded.status,versionConfirmed:2};
    }
    return activationFailure(upgraded.status==='invalid'?'stale':upgraded.status);
  },{signal}),{signal});
  return result.status==='completed' && result.value.status==='completed' ? result.value.value :
    activationFailure(signal?.aborted?'cancelled':'unavailable');
}
