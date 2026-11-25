from pathlib import Path
import hashlib,json
root=Path.cwd()
a=root/'docs/audits/BF_107_LEGACY_TRANSFER_20261125'
files={'src/lib/journalMixedStorage.ts':'84a954296938e8e93c9b5be7f84ede0fa1a3f6df7ac621ab54d6f87afe06ec7a','src/lib/journalMixedStorage.test.ts':'9f336fc9248d8b602fd39f0a13745335259420cd2ccee3ecfdedf0bbdb3f6989','qa/durable-journal-e2e.mjs':'375f35f3ab3e07772b7fe045804462034fec1c11431d475b31b428b63b64f1de'}
def sha(b):return hashlib.sha256(b).hexdigest()
old={p:(root/p).read_bytes() for p in files}
for p,h in files.items():assert sha(old[p])==h,p
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
def normalized(p):return old[p].decode('utf-8').replace('\r\n','\n')
p,t,q=files.keys()
s=normalized(p)
s=once(s,"import type { DurableJournalEntry } from './durableJournal';","import { DURABLE_JOURNAL_DATABASE, type DurableJournalEntry } from './durableJournal';\nimport { withDurableJournalGate } from './durableJournalGate';")
s=once(s,"function scan(store: IDBObjectStore, onResult: (s: Snapshot) => void) {","function scan(store: IDBObjectStore, onResult: (s: Snapshot) => void, legacyOnly = false) {")
s=once(s,"      const error = c.append(cursor.value);","      if (legacyOnly && !original(cursor.value)) { onResult({status:'invalid'}); return; }\n      const error = c.append(cursor.value);")
s=once(s,"function readPhysical(db: IDBDatabase, signal?: AbortSignal): Promise<Snapshot> {","function readPhysical(db: IDBDatabase, signal?: AbortSignal, legacyOnly = false): Promise<Snapshot> {")
s=once(s,"    if (!compatible(db)) { resolve({status:'unavailable'}); return; }","    if (!(legacyOnly ? compatibleLegacy(db) : compatible(db))) { resolve({status:'unavailable'}); return; }")
s=once(s,"      scan(store,s => { result=s; });","      scan(store,s => { result=s; },legacyOnly);")
s=s.rstrip()+"\n"+r"""
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
"""
v=normalized(t)
v=once(v,"  PACKED_KEY_PREFIX, MAX_MIXED_RECORDS } from './journalMixedStorage';","  PACKED_KEY_PREFIX, MAX_MIXED_RECORDS, CANDIDATE_JOURNAL_DB, CANDIDATE_JOURNAL_VERSION,\n  copyLegacyJournalToCandidate, verifyCandidateAgainstLegacy } from './journalMixedStorage';")
assert v.rstrip().endswith('});')
i=v.rindex('});')
v=v[:i]+r"""
  it('copy and verify reject wrong handles before requesting locks or transactions',async()=>{
    const request=vi.fn(()=>{throw Error('unexpected lock');});
    vi.stubGlobal('navigator',{locks:{request}});
    const transaction=vi.fn(()=>{throw Error('unexpected transaction');});
    const legacy={name:'bodyforge:durable-results:v1',version:1,objectStoreNames:{length:1,contains:()=>true},transaction} as unknown as IDBDatabase;
    expect(await copyLegacyJournalToCandidate(legacy,legacy)).toEqual({status:'unavailable',cutoverAuthorized:false});
    expect(await verifyCandidateAgainstLegacy(legacy,legacy)).toEqual({status:'unavailable',cutoverAuthorized:false});
    expect(request).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
  it('copy and verify never fall back to unlocked operations',async()=>{
    vi.stubGlobal('navigator',{});
    const transaction=vi.fn(()=>{throw Error('unexpected transaction');});
    const handle=(name:string,version:number)=>({name,version,objectStoreNames:{length:1,contains:()=>true},transaction}) as unknown as IDBDatabase;
    const source=handle('bodyforge:durable-results:v1',1),target=handle(CANDIDATE_JOURNAL_DB,CANDIDATE_JOURNAL_VERSION);
    expect(await copyLegacyJournalToCandidate(source,target)).toEqual({status:'unavailable',cutoverAuthorized:false});
    expect(await verifyCandidateAgainstLegacy(source,target)).toEqual({status:'unavailable',cutoverAuthorized:false});
    expect(await copyLegacyJournalToCandidate(source,target,AbortSignal.abort())).toEqual({status:'cancelled',cutoverAuthorized:false});
    expect(transaction).not.toHaveBeenCalled();
  });
"""+v[i:]
w=normalized(q)
anchor='  await test(' + chr(96) + '(async()=>{const result=await mod.stageDurableResults([entry],null);const db=await openNative(2);db.close();return result.status===\'saved\'})()'
assert w.count(anchor)==1
w=w.replace(anchor,r"""
  // Transfer between the two disposable native databases; v1 is read-only.
  const transfer=await js(`(async()=>{
    const m=await import('/src/lib/journalMixedStorage.ts');
    const gate=await import('/src/lib/durableJournalGate.ts');
    const ids=Array.from({length:4},(_,i)=>({key:'bodyforge:pilot:v1:result:transfer-'+i,raw:'original-'+i}));
    if((await mod.stageDurableResults(ids,'baseline-'.repeat(4096))).status!=='saved'||
       (await mod.markDurableResults(ids.slice(0,2),'settled')).status!=='saved'||
       (await mod.markDurableResults([ids[3]],'quarantined')).status!=='saved')throw Error('stage fixture failed');
    const source=await openNative();
    await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(m.CANDIDATE_JOURNAL_DB);
      r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('candidate blocked'))});
    const target=await new Promise((resolve,reject)=>{const r=indexedDB.open(m.CANDIDATE_JOURNAL_DB,m.CANDIDATE_JOURNAL_VERSION);
      r.onupgradeneeded=()=>r.result.createObjectStore(m.CANDIDATE_STORE,{keyPath:'key'});
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    const rows=()=>new Promise((resolve,reject)=>{const tx=target.transaction(m.CANDIDATE_STORE,'readonly'),r=tx.objectStore(m.CANDIDATE_STORE).getAll();
      tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error)});
    const clear=()=>new Promise((resolve,reject)=>{const tx=target.transaction(m.CANDIDATE_STORE,'readwrite',{durability:'strict'});
      tx.objectStore(m.CANDIDATE_STORE).clear();tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
    const snapshot=async()=>JSON.stringify((await rows()).map(x=>x.schemaVersion===2?{...x,batch:{...x.batch,checkpointData:Array.from(new Uint8Array(x.batch.checkpointData))}}:x));
    const sourceBefore=JSON.stringify(await directRows()), logical=await mod.readDurableJournal();
    const exact=async()=>JSON.stringify((await m.readCandidateJournal(target)).entries)===JSON.stringify(logical.entries);
    const results={},txOriginal=IDBDatabase.prototype.transaction,addOriginal=IDBObjectStore.prototype.add;
    try{
      results.identity=(await m.copyLegacyJournalToCandidate(source,source)).status==='unavailable';
      let release,entered;
      const barrier=new Promise(r=>release=r),granted=new Promise(r=>entered=r);
      const holding=navigator.locks.request(gate.DURABLE_JOURNAL_WRITE_LOCK,{mode:'shared'},async()=>{entered();await barrier});
      await granted;
      try{
        const cancel=new AbortController(),pending=m.copyLegacyJournalToCandidate(source,target,cancel.signal);
        let queued=false;
        for(let i=0;i<100;i++){const state=await navigator.locks.query();if(state.pending.some(l=>l.name===gate.DURABLE_JOURNAL_WRITE_LOCK&&l.mode==='exclusive')){queued=true;break}await new Promise(r=>setTimeout(r,10))}
        cancel.abort();
        const cancelled=await pending;
        results.lock=queued&&cancelled.status==='cancelled'&&!cancelled.cutoverAuthorized&&(await rows()).length===0;
      }finally{release();await holding}
      IDBObjectStore.prototype.add=function(...args){
        const req=addOriginal.apply(this,args);
        if(this.transaction.db.name===m.CANDIDATE_JOURNAL_DB&&args[0]?.key===ids[1].key)
          req.addEventListener('success',()=>this.transaction.abort(),{once:true});
        return req;
      };
      let aborted;
      try{aborted=await m.copyLegacyJournalToCandidate(source,target)}finally{IDBObjectStore.prototype.add=addOriginal}
      results.abort=aborted.status==='unavailable'&&(await rows()).length===0&&sourceBefore===JSON.stringify(await directRows());
      let sourceWrites=0;
      IDBDatabase.prototype.transaction=function(...args){
        if(this.name===dbName&&args[1]==='readwrite')sourceWrites++;
        return txOriginal.apply(this,args);
      };
      let copied;
      try{copied=await m.copyLegacyJournalToCandidate(source,target)}finally{IDBDatabase.prototype.transaction=txOriginal}
      results.copy=copied.status==='copied'&&copied.count===4&&!copied.cutoverAuthorized&&sourceWrites===0&&await exact()&&sourceBefore===JSON.stringify(await directRows());
      const packed=await m.compactCandidateJournal(target,ids.slice(0,2).map(r=>r.key));
      let writes=0;
      IDBDatabase.prototype.transaction=function(...args){if(args[1]==='readwrite')writes++;return txOriginal.apply(this,args)};
      let retry,verified;
      try{retry=await m.copyLegacyJournalToCandidate(source,target);verified=await m.verifyCandidateAgainstLegacy(source,target)}
      finally{IDBDatabase.prototype.transaction=txOriginal}
      results.retry=packed.status==='saved'&&retry.status==='unchanged'&&verified.status==='verified'&&!verified.cutoverAuthorized&&writes===0&&await exact();
      const before=await snapshot(),newRow={key:'bodyforge:pilot:v1:result:transfer-4',raw:'newer original'};
      if((await mod.stageDurableResults([newRow],null)).status!=='saved')throw Error('new fixture failed');
      results.conflict=(await m.copyLegacyJournalToCandidate(source,target)).status==='conflict'&&
        (await m.verifyCandidateAgainstLegacy(source,target)).status==='conflict'&&before===await snapshot();
      await clear();
      let injected=false;
      IDBDatabase.prototype.transaction=function(...args){
        if(this.name===m.CANDIDATE_JOURNAL_DB&&args[1]==='readwrite'&&!injected){
          injected=true;
          const competing=txOriginal.call(source,m.CANDIDATE_STORE,'readwrite',{durability:'strict'});
          competing.objectStore(m.CANDIDATE_STORE).add({schemaVersion:1,key:'bodyforge:pilot:v1:result:transfer-race',raw:'racing original',baseProfileRaw:null,state:'active'});
        }
        return txOriginal.apply(this,args);
      };
      let stale;
      try{stale=await m.copyLegacyJournalToCandidate(source,target)}finally{IDBDatabase.prototype.transaction=txOriginal}
      results.stale=injected&&stale.status==='stale'&&!stale.cutoverAuthorized&&(await rows()).length===5&&
        (await mod.readDurableJournal()).entries.length===6;
      await clear();
      let targetReads=0;
      IDBDatabase.prototype.transaction=function(...args){
        if(this.name===m.CANDIDATE_JOURNAL_DB&&args[1]==='readonly'&&++targetReads===2)throw Error('readback lost');
        return txOriginal.apply(this,args);
      };
      let uncertain;
      try{uncertain=await m.copyLegacyJournalToCandidate(source,target)}finally{IDBDatabase.prototype.transaction=txOriginal}
      results.unverified=uncertain.status==='unverified'&&!uncertain.cutoverAuthorized&&(await rows()).length===6&&
        (await m.copyLegacyJournalToCandidate(source,target)).status==='unchanged';
      await clear();
      await directPut({schemaVersion:2,key:'bodyforge:pilot:v1:result:future',raw:'unknown',baseProfileRaw:null,state:'active'});
      results.invalid=(await m.copyLegacyJournalToCandidate(source,target)).status==='invalid'&&(await rows()).length===0;
      return results;
    }finally{IDBDatabase.prototype.transaction=txOriginal;IDBObjectStore.prototype.add=addOriginal;source.close();target.close()}
  })()`);
  console.log('LEGACY_TRANSFER_SAMPLE',JSON.stringify(transfer));
  for(const [flag,label] of [
    ['identity','transfer refuses the live database as a target'],
    ['lock','queued exclusive transfer cancellation never writes'],
    ['abort','copy abort leaves source exact and candidate empty'],
    ['copy','strict copy preserves all legacy states without writing the source'],
    ['retry','packed candidate verifies and retries without mutations or cutover authority'],
    ['conflict','new legacy result blocks mismatching nonempty candidate without overwrite'],
    ['stale','uncooperative source race yields stale candidate, never cutover'],
    ['unverified','lost copy readback is unverified and retry checks retained data'],
    ['invalid','unknown source version blocks copy without partial target'],
  ])check(transfer[flag]===true,label);
  await js("(async()=>{await resetDB();await mod.readDurableJournal();return true})()");
"""+anchor)
updated={p:s.encode(),t:v.encode(),q:w.encode()}
adr="""# BF-107 ADR - guarded legacy to candidate transfer

Status: accepted for local candidate implementation and disposable browser tests only.
Context: v1 remains the production authority. Separate databases cannot share an atomic transaction. Old clients may continue writing v1.
Decision: validate bounded exact v1 rows under exclusive journal gate. Copy only to an empty candidate via strict atomic transaction. Check source and target again. Equal nonempty candidate unchanged, mismatch conflict, observed source drift stale, uncertain commit/readback unverified. No source writes, DB opener, automatic activation, wallet authority or owner-data migration.
Alternatives: automatic pointer switch rejected (split-brain); destructive in-place upgrade deferred pending compatibility and recovery gates; evidence-only transfer selected.
Consequences: temporary duplicate storage, 16 MiB/4096 record candidate budget; cooperative lock only. No durable cutover claim. Device, eviction, actual quota unverified.
QA: exact states, queue cancellation, abort, packed retry, conflict, source race, lost readback, unknown version, old target refusal; full suite/build/preview.
Diff: journalMixedStorage.ts, journalMixedStorage.test.ts, qa/durable-journal-e2e.mjs. Rollback: restore only hash-matching owned files from before copies.
Delta: bounded transfer capability; trace: source/target readback; confidence: local QA only; revisit: before actual cutover.
"""
with (a/'ADR.md').open('x',encoding='utf-8') as f:f.write(adr)
for path,data in old.items():
 with (a/(Path(path).name+'.before')).open('xb') as f:f.write(data)
for path,data in old.items():assert (root/path).read_bytes()==data,path
for path,data in updated.items():
 (root/path).write_bytes(data)
 print(path,len(data),sha(data),flush=True)
with (a/'owned.json').open('x',encoding='utf-8') as f:json.dump({p:sha(data) for p,data in updated.items()},f,indent=2)