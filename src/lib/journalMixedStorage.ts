import { DURABLE_JOURNAL_DATABASE, type DurableJournalEntry } from './durableJournal';
import { withDurableJournalGate } from './durableJournalGate';
import { MAX_CHECKPOINT_BATCH_BYTES, MAX_CHECKPOINT_ROWS, packCheckpointBatch,
  unpackCheckpointBatch, type PackedCheckpointBatch } from './journalCheckpointBatch';
import { RESULT_JOURNAL_PREFIX } from './workoutJournal';

/** Candidate-only bridge. No production opener, schema upgrade, wallet write
 * or automatic migration. The existing v1 database is outside scope. */
export const CANDIDATE_JOURNAL_DB = 'bodyforge:durable-results:v2-candidate';
export const CANDIDATE_JOURNAL_VERSION = 2;
export const CANDIDATE_STORE = 'results';
export const PACKED_KEY_PREFIX = 'bodyforge:checkpoint-batch:';
export const MAX_MIXED_RECORDS = 4096;
const MAX_LOGICAL_BYTES = 16 * 1024 * 1024;
const TIMEOUT_MS = 5000;
type Original = DurableJournalEntry & { schemaVersion: 1 };
type Packed = { key: string; schemaVersion: 2; batch: PackedCheckpointBatch };
type Physical = Original | Packed;
type ReadFailure = 'invalid' | 'too-large' | 'unavailable' | 'cancelled';
type Read = { status: 'ready'; entries: DurableJournalEntry[] } |
  { status: ReadFailure; entries: [] };
type Snapshot = { status: 'ready'; records: Physical[] } | { status: ReadFailure };
export type MigrationResult =
  | { status: 'saved' | 'unchanged'; batchKey: string; count: number }
  | { status: ReadFailure | 'conflict' | 'not-smaller' | 'unverified' };

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length &&
  expected.every(key => Object.prototype.hasOwnProperty.call(v, key));
const validKey = (v: unknown): v is string => typeof v === 'string' && v.startsWith(RESULT_JOURNAL_PREFIX);
const order = (a: {key: string}, b: {key: string}) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
const encoder = new TextEncoder();
const failed = (status: ReadFailure): Read => ({ status, entries: [] });
function original(v: unknown): Original | null {
  if (!object(v) || !exact(v, ['key','schemaVersion','raw','baseProfileRaw','state']) ||
      v.schemaVersion !== 1 || !validKey(v.key) || typeof v.raw !== 'string' ||
      (v.baseProfileRaw !== null && typeof v.baseProfileRaw !== 'string') ||
      (v.state !== 'active' && v.state !== 'settled' && v.state !== 'quarantined')) return null;
  return { key: v.key, schemaVersion: 1, raw: v.raw, baseProfileRaw: v.baseProfileRaw, state: v.state };
}
function publicRow(v: Original): DurableJournalEntry {
  return { key: v.key, raw: v.raw, baseProfileRaw: v.baseProfileRaw, state: v.state };
}
function rowSize(row: Original) {
  if (row.key.length + row.raw.length + (row.baseProfileRaw?.length ?? 0) > MAX_LOGICAL_BYTES) return Infinity;
  return encoder.encode(JSON.stringify(publicRow(row))).byteLength + 1;
}
function integer(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
}
/** Snapshot only the bounded, known fields. Do not clone arbitrary unknown
 * objects before validation. The full codec subsequently checks the digest. */
function packed(v: unknown): Packed | null {
  if (!object(v) || !exact(v, ['key','schemaVersion','batch']) || v.schemaVersion !== 2 ||
      typeof v.key !== 'string' || !object(v.batch)) return null;
  const b = v.batch;
  if (!exact(b, ['format','version','encoding','rows','checkpointCount','decodedBytes','logicalBytes','digest','checkpointData']) ||
      b.format !== 'bodyforge-settled-checkpoints' || b.version !== 1 ||
      (b.encoding !== 'gzip-json' && b.encoding !== 'utf8-json') ||
      typeof b.digest !== 'string' || !/^[a-f0-9]{64}$/.test(b.digest) || v.key !== PACKED_KEY_PREFIX + b.digest ||
      !Array.isArray(b.rows) || !b.rows.length || b.rows.length > MAX_CHECKPOINT_ROWS ||
      !integer(b.logicalBytes, 2, MAX_CHECKPOINT_BATCH_BYTES) ||
      !integer(b.decodedBytes, 2, MAX_CHECKPOINT_BATCH_BYTES) ||
      !integer(b.checkpointCount, 0, b.rows.length) ||
      !(b.checkpointData instanceof ArrayBuffer) || !b.checkpointData.byteLength ||
      b.checkpointData.byteLength > MAX_CHECKPOINT_BATCH_BYTES) return null;
  const rows: PackedCheckpointBatch['rows'] = [];
  let size = 0;
  for (const ref of b.rows) {
    if (!object(ref) || !exact(ref,['key','raw','checkpoint']) || !validKey(ref.key) ||
        typeof ref.raw !== 'string' || (ref.checkpoint !== null && !integer(ref.checkpoint,0,b.checkpointCount-1))) return null;
    size += ref.key.length + ref.raw.length;
    if (size > b.logicalBytes) return null;
    rows.push({key:ref.key,raw:ref.raw,checkpoint:ref.checkpoint});
  }
  return {key:v.key,schemaVersion:2,batch:{
    format:b.format,version:b.version,encoding:b.encoding,rows,checkpointCount:b.checkpointCount,
    decodedBytes:b.decodedBytes,logicalBytes:b.logicalBytes,digest:b.digest,checkpointData:b.checkpointData.slice(0),
  }};
}
/** Incremental bounds apply even when an IDB cursor yields many records. */
function collector() {
  const records: Physical[] = [], seen = new Set<string>();
  let budget = 2, count = 0;
  return {
    append(value: unknown): ReadFailure | null {
      if (records.length >= MAX_MIXED_RECORDS) return 'too-large';
      const row = original(value) ?? packed(value);
      if (!row || seen.has(row.key)) return 'invalid';
      budget += row.schemaVersion === 1 ? rowSize(row) : row.batch.logicalBytes + row.batch.checkpointData.byteLength;
      count += row.schemaVersion === 1 ? 1 : row.batch.rows.length;
      if (budget > MAX_LOGICAL_BYTES || count > MAX_MIXED_RECORDS) return 'too-large';
      seen.add(row.key); records.push(row);
      return null;
    },
    finish(): Snapshot { return { status:'ready',records:records.sort(order) }; },
  };
}
function snapshot(input: readonly unknown[]): Snapshot {
  try {
    if (!Array.isArray(input)) return {status:'invalid'};
    if (input.length > MAX_MIXED_RECORDS) return {status:'too-large'};
    const c = collector();
    for (const row of input) {
      const error = c.append(row);
      if (error) return {status:error};
    }
    return c.finish();
  } catch { return {status:'invalid'}; }
}
async function decode(s: Snapshot, signal?: AbortSignal): Promise<Read> {
  if (signal?.aborted) return failed('cancelled');
  if (s.status !== 'ready') return failed(s.status);
  try {
    const entries: DurableJournalEntry[] = [], seen = new Set<string>();
    for (const item of s.records) {
      if (signal?.aborted) return failed('cancelled');
      const rows = item.schemaVersion === 1 ? [publicRow(item)] : await unpackCheckpointBatch(item.batch, signal);
      if (!rows) return failed(signal?.aborted ? 'cancelled' : 'invalid');
      for (const row of rows) {
        if (seen.has(row.key)) return failed('invalid');
        seen.add(row.key); entries.push(row);
      }
    }
    return signal?.aborted ? failed('cancelled') : { status:'ready', entries:entries.sort(order) };
  } catch { return failed(signal?.aborted ? 'cancelled' : 'unavailable'); }
}
/** A damaged record or overlap invalidates the entire logical view; never
 * choose a winner or return a partial result as ready. */
export function decodeMixedJournal(input: readonly unknown[], signal?: AbortSignal): Promise<Read> {
  if (signal?.aborted) return Promise.resolve(failed('cancelled'));
  return decode(snapshot(input),signal);
}
function compatible(db: IDBDatabase) {
  return db.name === CANDIDATE_JOURNAL_DB && db.version === CANDIDATE_JOURNAL_VERSION &&
    db.objectStoreNames.length === 1 && db.objectStoreNames.contains(CANDIDATE_STORE);
}
function correctStore(store: IDBObjectStore) {
  return store.keyPath === 'key' && !store.autoIncrement && store.indexNames.length === 0;
}
/** Cursor consumption is synchronous inside callbacks; bounds stop the scan.
 * No asynchronous codec work is scheduled inside a live transaction. */
function scan(store: IDBObjectStore, onResult: (s: Snapshot) => void, legacyOnly = false) {
  const c = collector(), request = store.openCursor();
  request.onsuccess = () => {
    try {
      const cursor = request.result;
      if (!cursor) { onResult(c.finish()); return; }
      if (legacyOnly && !original(cursor.value)) { onResult({status:'invalid'}); return; }
      const error = c.append(cursor.value);
      if (error) { onResult({status:error}); return; }
      cursor.continue();
    } catch { onResult({status:'unavailable'}); }
  };
}
function readPhysical(db: IDBDatabase, signal?: AbortSignal, legacyOnly = false): Promise<Snapshot> {
  return new Promise(resolve => {
    if (signal?.aborted) { resolve({status:'cancelled'}); return; }
    if (!(legacyOnly ? compatibleLegacy(db) : compatible(db))) { resolve({status:'unavailable'}); return; }
    let tx: IDBTransaction | undefined, done = false;
    let result: Snapshot = {status:'unavailable'};
    const finish = (value: Snapshot) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(value);
    };
    const abort = () => {
      try { tx?.abort(); } catch { /* inactive */ }
      finish({status:signal?.aborted ? 'cancelled' : 'unavailable'});
    };
    const timer = setTimeout(abort,TIMEOUT_MS);
    signal?.addEventListener('abort',abort,{once:true});
    try {
      tx = db.transaction(CANDIDATE_STORE,'readonly');
      tx.oncomplete = () => finish(signal?.aborted ? {status:'cancelled'} : result);
      tx.onabort = () => finish({status:'unavailable'});
      const store = tx.objectStore(CANDIDATE_STORE);
      if (!correctStore(store)) { abort(); return; }
      scan(store,s => { result=s; },legacyOnly);
    } catch { abort(); }
  });
}
export async function readCandidateJournal(db: IDBDatabase, signal?: AbortSignal): Promise<Read> {
  try { return await decode(await readPhysical(db,signal),signal); }
  catch { return failed(signal?.aborted ? 'cancelled' : 'unavailable'); }
}
/** Compare normalized records, including every byte of the binary pool. */
function samePhysical(a: Physical[], b: Physical[]): boolean {
  return a.length === b.length && a.every((x,i)=>{
    const y=b[i];
    if (x.key !== y.key || x.schemaVersion !== y.schemaVersion) return false;
    if (x.schemaVersion === 1 && y.schemaVersion === 1) return JSON.stringify(x) === JSON.stringify(y);
    if (x.schemaVersion !== 2 || y.schemaVersion !== 2) return false;
    const {checkpointData:xb,...xm}=x.batch, {checkpointData:yb,...ym}=y.batch;
    const xx=new Uint8Array(xb), yy=new Uint8Array(yb);
    return xx.length === yy.length && JSON.stringify(xm) === JSON.stringify(ym) && xx.every((v,i)=>v===yy[i]);
  });
}
type Commit = 'committed' | 'conflict' | 'unavailable' | 'unverified';
/** Full-store compare-and-swap. Only synchronous requests inside the active
 * callback, and delete/add share the same strict transaction. */
function applyChange(db: IDBDatabase,before: Physical[],remove: string[],add: Physical[],signal?: AbortSignal): Promise<Commit> {
  return new Promise(resolve=>{
    if (signal?.aborted || !compatible(db)) { resolve('unavailable'); return; }
    let tx: IDBTransaction | undefined, done=false, issued=false, conflict=false;
    const finish=(status:Commit)=>{
      if(done)return;
      done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve(status);
    };
    const abort=()=>{
      try{tx?.abort();}catch{/* completion could already be pending */}
      // On timeout/cancellation after issuing writes, never promise zero writes.
      finish(issued?'unverified':'unavailable');
    };
    const timer=setTimeout(abort,TIMEOUT_MS);
    signal?.addEventListener('abort',abort,{once:true});
    try{
      tx=db.transaction(CANDIDATE_STORE,'readwrite',{durability:'strict'});
      tx.oncomplete=()=>finish(issued&&!signal?.aborted?'committed':'unverified');
      tx.onabort=()=>finish(conflict?'conflict':'unavailable');
      const store=tx.objectStore(CANDIDATE_STORE);
      if(tx.durability!=='strict'||!correctStore(store)){abort();return;}
      scan(store,s=>{
        if(done||signal?.aborted){abort();return;}
        try{
          if(s.status!=='ready'||!samePhysical(before,s.records)){
            conflict=true;tx!.abort();return;
          }
          issued=true;
          for(const key of remove)store.delete(key);
          for(const row of add)store.add(row);
        }catch{abort();}
      });
    }catch{abort();}
  });
}
type Operation = {type:'pack';selected:string[]} | {type:'restore';batchKey:string};
async function migrate(db:IDBDatabase,op:Operation,signal?:AbortSignal):Promise<MigrationResult>{
  const before=await readPhysical(db,signal);
  if(before.status!=='ready')return {status:before.status};
  const logical=await decode(before,signal);
  if(logical.status!=='ready')return {status:logical.status};
  let remove:string[],add:Physical[],batchKey:string,count:number;
  if(op.type==='pack'){
    const selected=new Set(op.selected);
    const existing=before.records.find(row=>row.schemaVersion===2&&row.batch.rows.length===selected.size&&row.batch.rows.every(ref=>selected.has(ref.key)));
    if(existing)return {status:'unchanged',batchKey:existing.key,count:selected.size};
    const source=before.records.filter((row):row is Original=>row.schemaVersion===1&&selected.has(row.key));
    if(source.length!==selected.size||source.some(row=>row.state!=='settled'))return {status:'conflict'};
    const result=await packCheckpointBatch(source.sort(order).map(publicRow),signal);
    if(result.status!=='packed')return {status:result.status};
    batchKey=PACKED_KEY_PREFIX+result.batch.digest;
    if(before.records.some(row=>row.key===batchKey))return {status:'conflict'};
    remove=source.map(row=>row.key);count=remove.length;
    add=[{key:batchKey,schemaVersion:2,batch:result.batch}];
  }else{
    const source=before.records.find((row):row is Packed=>row.schemaVersion===2&&row.key===op.batchKey);
    if(!source)return {status:'conflict'};
    const restored=await unpackCheckpointBatch(source.batch,signal);
    if(!restored)return {status:signal?.aborted?'cancelled':'invalid'};
    batchKey=source.key;remove=[batchKey];count=restored.length;
    add=restored.map(row=>({key:row.key,schemaVersion:1,raw:row.raw,baseProfileRaw:row.baseProfileRaw,state:row.state}));
  }
  const removed=new Set(remove);
  const expected=snapshot([...before.records.filter(row=>!removed.has(row.key)),...add]);
  if(expected.status!=='ready')return {status:expected.status};
  const after=await decode(expected,signal);
  if(after.status!=='ready')return {status:after.status};
  if(JSON.stringify(after.entries)!==JSON.stringify(logical.entries))return {status:'invalid'};
  if(signal?.aborted)return {status:'cancelled'};
  const committed=await applyChange(db,before.records,remove,add,signal);
  if(committed!=='committed')return {status:committed};
  // Only a fresh, exact physical and logical readback authorizes 'saved'.
  const observed=await readPhysical(db,signal);
  if(observed.status!=='ready'||!samePhysical(expected.records,observed.records))return {status:'unverified'};
  const verified=await decode(observed,signal);
  if(verified.status!=='ready'||JSON.stringify(verified.entries)!==JSON.stringify(logical.entries))return {status:'unverified'};
  return {status:'saved',batchKey,count};
}
export async function compactCandidateJournal(db:IDBDatabase,selected:readonly string[],signal?:AbortSignal):Promise<MigrationResult>{
  if(!Array.isArray(selected)||!selected.length||selected.length>MAX_CHECKPOINT_ROWS||
     !selected.every(validKey)||new Set(selected).size!==selected.length)return {status:'invalid'};
  try{return await migrate(db,{type:'pack',selected:[...selected]},signal);}
  catch{return {status:'unverified'};}
}
export async function restoreCandidateJournalBatch(db:IDBDatabase,batchKey:string,signal?:AbortSignal):Promise<MigrationResult>{
  if(typeof batchKey!=='string'||!batchKey.startsWith(PACKED_KEY_PREFIX)||
     !/^[a-f0-9]{64}$/.test(batchKey.slice(PACKED_KEY_PREFIX.length)))return {status:'invalid'};
  try{return await migrate(db,{type:'restore',batchKey},signal);}
  catch{return {status:'unverified'};}
}

export type LegacyCopyResult =
  | { status: 'copied' | 'unchanged' | 'verified'; count: number; cutoverAuthorized: false }
  | { status: ReadFailure | 'conflict' | 'stale' | 'unverified'; cutoverAuthorized: false };
function copyFailure(status: Exclude<LegacyCopyResult['status'], 'copied' | 'unchanged' | 'verified'>): LegacyCopyResult {
  return { status, cutoverAuthorized:false };
}
function copySuccess(status:'copied'|'unchanged'|'verified',count:number): LegacyCopyResult {
  return { status,count,cutoverAuthorized:false };
}
function compatibleLegacy(db: IDBDatabase) {
  return db.name === DURABLE_JOURNAL_DATABASE && db.version === 1 &&
    db.objectStoreNames.length === 1 && db.objectStoreNames.contains(CANDIDATE_STORE);
}

/** Evidence-only transfer. No opener, schema upgrade, production cutover or
 * wallet writes. The gate coordinates cooperating writers, not arbitrary ones. */
async function transferLegacy(source:IDBDatabase,target:IDBDatabase,verifyOnly:boolean,
  signal?:AbortSignal):Promise<LegacyCopyResult>{
  if(signal?.aborted)return copyFailure('cancelled');
  if(!compatibleLegacy(source)||!compatible(target))return copyFailure('unavailable');
  const result=await withDurableJournalGate('exclusive',async():Promise<LegacyCopyResult>=>{
    let committed=false;
    try{
      const before=await readPhysical(source,signal,true);
      if(before.status!=='ready')return copyFailure(before.status);
      const sourceView=await decode(before,signal);
      if(sourceView.status!=='ready')return copyFailure(sourceView.status);
      const current=await readPhysical(target,signal);
      if(current.status!=='ready')return copyFailure(current.status);
      const targetView=await decode(current,signal);
      if(targetView.status!=='ready')return copyFailure(targetView.status);
      const equal=JSON.stringify(sourceView.entries)===JSON.stringify(targetView.entries);
      if(!equal&&(verifyOnly||current.records.length))return copyFailure('conflict');
      if(signal?.aborted)return copyFailure('cancelled');
      // Independent databases cannot share an atomic transaction. Check source
      // before and after writing; never give this observation cutover authority.
      const stable=await readPhysical(source,signal,true);
      if(stable.status!=='ready')return copyFailure(stable.status);
      if(!samePhysical(before.records,stable.records))return copyFailure('stale');
      if(!equal){
        const write=await applyChange(target,[],[],before.records,signal);
        if(write!=='committed')return copyFailure(write);
        committed=true;
      }
      const observed=await readPhysical(target,signal);
      if(observed.status!=='ready')return copyFailure(committed?'unverified':observed.status);
      const observedView=await decode(observed,signal);
      if(observedView.status!=='ready')return copyFailure(committed?'unverified':observedView.status);
      if(JSON.stringify(observedView.entries)!==JSON.stringify(sourceView.entries)||
          !samePhysical(committed?before.records:current.records,observed.records))
        return copyFailure(committed?'unverified':'conflict');
      const finalSource=await readPhysical(source,signal,true);
      if(finalSource.status!=='ready')return copyFailure(committed?'unverified':finalSource.status);
      if(!samePhysical(before.records,finalSource.records))return copyFailure('stale');
      if(signal?.aborted)return copyFailure(committed?'unverified':'cancelled');
      return copySuccess(verifyOnly?'verified':committed?'copied':'unchanged',sourceView.entries.length);
    }catch{return copyFailure(committed?'unverified':'unavailable');}
  },{signal});
  return result.status==='completed'?result.value:copyFailure(result.status==='cancelled'?'cancelled':'unavailable');
}
export async function copyLegacyJournalToCandidate(source:IDBDatabase,target:IDBDatabase,signal?:AbortSignal):Promise<LegacyCopyResult>{
  try{return await transferLegacy(source,target,false,signal);}
  catch{return copyFailure('unverified');}
}
export async function verifyCandidateAgainstLegacy(source:IDBDatabase,target:IDBDatabase,signal?:AbortSignal):Promise<LegacyCopyResult>{
  try{return await transferLegacy(source,target,true,signal);}
  catch{return copyFailure('unavailable');}
}


export type MixedWriteResult =
  | { status:'saved'; entries:DurableJournalEntry[] }
  | { status:ReadFailure|'conflict'|'unverified' };
type MixedInput = Pick<DurableJournalEntry,'key'|'raw'>;
type MarkState = 'settled'|'quarantined'|null;
function stored(row:DurableJournalEntry):Original {
  return {key:row.key,schemaVersion:1,raw:row.raw,baseProfileRaw:row.baseProfileRaw,state:row.state};
}

/** v2 journal writer with the same immutable result/state contract as v1.
 * Candidate only: no production opener, wallet authority or automatic upgrade.
 * An actual state transition inside a packed batch materializes all its exact
 * originals in the same atomic transaction, before changing the selected row.
 */
async function writeCandidateUnlocked(db:IDBDatabase,input:MixedInput[],baseProfileRaw:string|null,
  state:MarkState,signal?:AbortSignal):Promise<MixedWriteResult>{
  const before=await readPhysical(db,signal);
  if(before.status!=='ready')return {status:before.status};
  const view=await decode(before,signal);
  if(view.status!=='ready')return {status:view.status};
  const logical=new Map(view.entries.map(row=>[row.key,row]));
  const nextRows=new Map(logical);
  const requested=new Map<string,DurableJournalEntry>(),changed=new Set<string>();
  for(const entry of input){
    const existing=logical.get(entry.key);
    if((existing&&existing.raw!==entry.raw)||(!existing&&state!==null)||
       (state==='settled'&&existing?.state==='quarantined'))return {status:'invalid'};
    const next:DurableJournalEntry=existing
      ? {...existing,state:state??existing.state}
      : {...entry,baseProfileRaw,state:'active'};
    nextRows.set(entry.key,next);requested.set(entry.key,next);
    // Retain v1's strict write for active retries and real state changes.
    if(!existing||existing.state==='active'||existing.state!==next.state)changed.add(entry.key);
  }
  const remove:string[]=[],add:Physical[]=[];
  const remaining=new Set(changed);
  for(const row of before.records){
    if(row.schemaVersion===1){
      if(remaining.delete(row.key)){
        remove.push(row.key);add.push(stored(nextRows.get(row.key)!));
      }
    }else if(row.batch.rows.some(ref=>changed.has(ref.key))){
      remove.push(row.key);
      for(const ref of row.batch.rows){
        remaining.delete(ref.key);
        add.push(stored(nextRows.get(ref.key)!));
      }
    }
  }
  for(const key of remaining)add.push(stored(nextRows.get(key)!));
  const deleted=new Set(remove);
  const expected=snapshot([...before.records.filter(row=>!deleted.has(row.key)),...add]);
  if(expected.status!=='ready')return {status:expected.status};
  const nextView=await decode(expected,signal);
  if(nextView.status!=='ready')return {status:nextView.status};
  const exactRows=[...nextRows.values()].sort(order);
  if(JSON.stringify(nextView.entries)!==JSON.stringify(exactRows))return {status:'invalid'};
  if(signal?.aborted)return {status:'cancelled'};
  const committed=await applyChange(db,before.records,remove,add,signal);
  if(committed!=='committed')return {status:committed};
  const observed=await readPhysical(db,signal);
  if(observed.status!=='ready'||!samePhysical(expected.records,observed.records))return {status:'unverified'};
  const checked=await decode(observed,signal);
  if(checked.status!=='ready'||JSON.stringify(checked.entries)!==JSON.stringify(exactRows))return {status:'unverified'};
  const confirmed=new Map(checked.entries.map(row=>[row.key,row]));
  return {status:'saved',entries:[...requested.keys()].map(key=>confirmed.get(key)!)};
}

/** Snapshot caller data before waiting for the journal gate. Never write an
 * unknown layout or fall back to another database if the lock is unavailable. */
export async function writeCandidateJournal(db:IDBDatabase,entries:readonly MixedInput[],baseProfileRaw:string|null,
  state:MarkState=null,signal?:AbortSignal):Promise<MixedWriteResult>{
  try{
    if(signal?.aborted)return {status:'cancelled'};
    if(!compatible(db))return {status:'unavailable'};
    if(!Array.isArray(entries)||entries.length>MAX_MIXED_RECORDS||
       (baseProfileRaw!==null&&typeof baseProfileRaw!=='string')||
       (state!==null&&state!=='settled'&&state!=='quarantined'))return {status:'invalid'};
    if((baseProfileRaw?.length??0)>MAX_LOGICAL_BYTES)return {status:'too-large'};
    const unique=new Map<string,MixedInput>();
    let budget=0;
    for(const entry of entries){
      if(!object(entry)||!validKey(entry.key)||typeof entry.raw!=='string')return {status:'invalid'};
      if(unique.has(entry.key)&&unique.get(entry.key)!.raw!==entry.raw)return {status:'invalid'};
      if(!unique.has(entry.key)){
        budget+=entry.key.length+entry.raw.length;
        if(budget>MAX_LOGICAL_BYTES)return {status:'too-large'};
        unique.set(entry.key,{key:entry.key,raw:entry.raw});
      }
    }
    const input=[...unique.values()];
    const result=await withDurableJournalGate('shared',()=>writeCandidateUnlocked(db,input,baseProfileRaw,state,signal),{signal});
    return result.status==='completed'?result.value:{status:result.status==='cancelled'?'cancelled':'unavailable'};
  }catch{return {status:'unverified'};}
}
