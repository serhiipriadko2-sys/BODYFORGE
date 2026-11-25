from pathlib import Path
import hashlib,json
root=Path.cwd();a=root/'docs/audits/BF_107_MIXED_WRITER_20261125'
files={'src/lib/journalMixedStorage.ts':'9e3f8abaf7bdf0f5cbcb2804218f172f34af764c57afc73be7f5f3b66dd783ab','src/lib/journalMixedStorage.test.ts':'039e5ad7f8e2aebc7db43756edac694d980a3ffd2b71ab2798102cc254d0f530','qa/durable-journal-e2e.mjs':'c273763be83bb339a062604ab7f23c2398456723b5c7db13a2e0144a18c279dd'}
def sha(b):return hashlib.sha256(b).hexdigest()
old={p:(root/p).read_bytes() for p in files}
for p,h in files.items():assert sha(old[p])==h,p
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
def normalized(p):return old[p].decode('utf-8').replace('\r\n','\n')
p,t,q=files.keys()
s=normalized(p).rstrip()+"\n"+r"""

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
"""
v=normalized(t)
v=once(v,"  copyLegacyJournalToCandidate, verifyCandidateAgainstLegacy } from './journalMixedStorage';","  copyLegacyJournalToCandidate, verifyCandidateAgainstLegacy, writeCandidateJournal } from './journalMixedStorage';")
assert v.rstrip().endswith('});')
i=v.rindex('});')
v=v[:i]+r"""
  it('candidate writer rejects wrong identity and malformed inputs without acquiring a lock',async()=>{
    const request=vi.fn(()=>{throw Error('unexpected lock');});
    const transaction=vi.fn(()=>{throw Error('unexpected transaction');});
    vi.stubGlobal('navigator',{locks:{request}});
    const handle=(name:string,version:number)=>({name,version,objectStoreNames:{length:1,contains:()=>true},transaction}) as unknown as IDBDatabase;
    const source=handle('bodyforge:durable-results:v1',1),target=handle(CANDIDATE_JOURNAL_DB,CANDIDATE_JOURNAL_VERSION);
    expect(await writeCandidateJournal(source,[{key:key(1),raw:'x'}],null)).toEqual({status:'unavailable'});
    expect(await writeCandidateJournal(target,[{key:key(1),raw:'x'},{key:key(1),raw:'different'}],null)).toEqual({status:'invalid'});
    expect(await writeCandidateJournal(target,[{key:'wrong',raw:'x'}],null)).toEqual({status:'invalid'});
    expect(await writeCandidateJournal(target,[],null,'unknown' as 'settled')).toEqual({status:'invalid'});
    expect(await writeCandidateJournal(target,[],'x'.repeat(16*1024*1024+1))).toEqual({status:'too-large'});
    expect(await writeCandidateJournal(target,[],null,null,AbortSignal.abort())).toEqual({status:'cancelled'});
    expect(request).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
  it('candidate writer never falls back when the shared journal gate is unsupported',async()=>{
    vi.stubGlobal('navigator',{});
    const transaction=vi.fn(()=>{throw Error('unexpected transaction');});
    const target={name:CANDIDATE_JOURNAL_DB,version:CANDIDATE_JOURNAL_VERSION,objectStoreNames:{length:1,contains:()=>true},transaction} as unknown as IDBDatabase;
    expect(await writeCandidateJournal(target,[{key:key(1),raw:'x'}],null)).toEqual({status:'unavailable'});
    expect(transaction).not.toHaveBeenCalled();
  });
"""+v[i:]
w=normalized(q)
anchor="  console.log('BODYFORGE_DURABLE_JOURNAL_PASS',"
w=once(w,anchor,r"""
  // A real version fence blocks the existing v1 module after upgrade.
  // It is not the owner database: this profile is destroyed by the harness.
  await test(`(async()=>{
    const db=await openNative(2);
    const exactRows=()=>new Promise((resolve,reject)=>{
      const tx=db.transaction('results','readonly'),request=tx.objectStore('results').getAll();
      tx.oncomplete=()=>resolve(JSON.stringify(request.result));tx.onabort=()=>reject(tx.error);
    });
    try{
      const before=await exactRows();
      let oldVersionRejected=false;
      try{const old=await openNative(1);old.close()}catch(error){oldVersionRejected=error.name==='VersionError'}
      const read=await mod.readDurableJournal();
      const stage=await mod.stageDurableResults([extra],null);
      const mark=await mod.markDurableResults([entry],'settled');
      return oldVersionRejected&&read.status==='unavailable'&&stage.status==='unavailable'&&mark.status==='unavailable'&&before===await exactRows();
    }finally{db.close()}
  })()`,'native version fence blocks old journal readers and writers without altering records');
"""+anchor)
anchor="  await test("+chr(96)+"(async()=>{const result=await mod.stageDurableResults([entry],null);const db=await openNative(2);db.close();return result.status==='saved'})()"
w=once(w,anchor,r"""
  // Candidate v2 supports normal result writes as well as compact/restore.
  // This test runs exclusively in the owned temporary browser profile.
  const mixedWriter=await js(`(async()=>{
    const m=await import('/src/lib/journalMixedStorage.ts');
    const target=await new Promise((resolve,reject)=>{
      const r=indexedDB.open(m.CANDIDATE_JOURNAL_DB,m.CANDIDATE_JOURNAL_VERSION);
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
      r.onupgradeneeded=()=>{r.transaction.abort()};
    });
    const prefix='bodyforge:pilot:v1:result:writer-';
    const entries=Array.from({length:5},(_,i)=>({key:prefix+i,raw:'opaque-'+i}));
    const baseline='original checkpoint '.repeat(2048);
    const read=()=>m.readCandidateJournal(target);
    const rows=()=>new Promise((resolve,reject)=>{const tx=target.transaction(m.CANDIDATE_STORE,'readonly'),r=tx.objectStore(m.CANDIDATE_STORE).getAll();
      tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error)});
    const snap=async()=>JSON.stringify((await rows()).map(x=>x.schemaVersion===2?{...x,batch:{...x.batch,checkpointData:Array.from(new Uint8Array(x.batch.checkpointData))}}:x));
    const write=(input,base=null,state=null,signal)=>m.writeCandidateJournal(target,input,base,state,signal);
    const results={},oldAdd=IDBObjectStore.prototype.add,oldDelete=IDBObjectStore.prototype.delete,oldTx=IDBDatabase.prototype.transaction;
    try{
      if((await rows()).length!==0)throw Error('candidate fixture not empty');
      const first=await write(entries.slice(0,3),baseline);
      results.stage=first.status==='saved'&&first.entries.length===3&&first.entries.every(r=>r.state==='active'&&r.baseProfileRaw===baseline);
      const active=await write([entries[0]],'changed');
      results.active=active.status==='saved'&&active.entries[0].baseProfileRaw===baseline&&active.entries[0].state==='active';
      const marked=await write(entries.slice(0,2),null,'settled');
      const packed=await m.compactCandidateJournal(target,entries.slice(0,2).map(r=>r.key));
      results.pack=marked.status==='saved'&&packed.status==='saved'&&(await rows()).length===2;
      const before=await snap();
      let mutations=0;
      IDBObjectStore.prototype.add=function(...args){if(this.transaction.db===target)mutations++;return oldAdd.apply(this,args)};
      IDBObjectStore.prototype.delete=function(...args){if(this.transaction.db===target)mutations++;return oldDelete.apply(this,args)};
      let retry,mark,conflict,missing;
      try{
        retry=await write([entries[1],entries[0]],'new baseline');
        mark=await write(entries.slice(0,2),null,'settled');
        conflict=await write([entries[3],{...entries[0],raw:'bad'}],null);
        missing=await write([entries[3]],null,'quarantined');
      }finally{IDBObjectStore.prototype.add=oldAdd;IDBObjectStore.prototype.delete=oldDelete}
      results.retry=retry.status==='saved'&&retry.entries[0].key===entries[1].key&&retry.entries.every(r=>r.baseProfileRaw===baseline&&r.state==='settled')&&mark.status==='saved'&&mutations===0&&before===await snap();
      results.conflict=conflict.status==='invalid'&&missing.status==='invalid'&&before===await snap();
      IDBObjectStore.prototype.add=function(...args){
        const req=oldAdd.apply(this,args);
        if(this.transaction.db===target&&args[0]?.key===entries[1].key)req.addEventListener('success',()=>this.transaction.abort(),{once:true});
        return req;
      };
      let aborted;
      try{aborted=await write([entries[0]],null,'quarantined')}finally{IDBObjectStore.prototype.add=oldAdd}
      results.abort=aborted.status==='unavailable'&&before===await snap();
      const quarantined=await write([entries[0]],null,'quarantined');
      const restored=await read(),physical=await rows();
      results.materialize=quarantined.status==='saved'&&quarantined.entries[0].state==='quarantined'&&physical.length===3&&
        physical.every(r=>r.schemaVersion===1)&&restored.status==='ready'&&restored.entries.length===3&&
        restored.entries.every((r,i)=>r.key===entries[i].key&&r.raw===entries[i].raw&&r.baseProfileRaw===baseline&&
          r.state===(i===0?'quarantined':i===1?'settled':'active'));
      const terminal=await snap();
      results.quarantine=(await write([entries[0]],null,'settled')).status==='invalid'&&
        (await write([entries[0]],'other')).entries?.[0]?.state==='quarantined'&&terminal===await snap();
      const signal=new AbortController();signal.abort();
      results.cancel=(await write([entries[3]],null,null,signal.signal)).status==='cancelled'&&terminal===await snap();
      let readbacks=0;
      IDBDatabase.prototype.transaction=function(...args){
        if(this===target&&args[1]==='readonly'&&++readbacks===2)throw Error('QA readback lost');
        return oldTx.apply(this,args);
      };
      let lost;
      try{lost=await write([entries[3]],null)}finally{IDBDatabase.prototype.transaction=oldTx}
      const recovered=await write([entries[3]],'changed');
      results.readback=lost.status==='unverified'&&recovered.status==='saved'&&recovered.entries[0].baseProfileRaw===null&&
        recovered.entries[0].raw===entries[3].raw&&(await rows()).length===4;
      let injected=false;
      IDBDatabase.prototype.transaction=function(...args){
        if(this===target&&args[1]==='readwrite'&&!injected){
          injected=true;
          const other=oldTx.call(this,m.CANDIDATE_STORE,'readwrite',{durability:'strict'});
          other.objectStore(m.CANDIDATE_STORE).put({...physical[2],raw:'competing change'});
        }
        return oldTx.apply(this,args);
      };
      let race;
      try{race=await write([entries[4]],null)}finally{IDBDatabase.prototype.transaction=oldTx}
      const end=await read();
      results.race=injected&&race.status==='conflict'&&end.status==='ready'&&end.entries.length===4&&
        end.entries.some(r=>r.key===physical[2].key&&r.raw==='competing change')&&!end.entries.some(r=>r.key===entries[4].key);
      return results;
    }finally{IDBObjectStore.prototype.add=oldAdd;IDBObjectStore.prototype.delete=oldDelete;IDBDatabase.prototype.transaction=oldTx;target.close()}
  })()`);
  console.log('MIXED_WRITER_SAMPLE',JSON.stringify(mixedWriter));
  for(const [flag,label] of [
    ['stage','mixed writer stages active originals with exact baseline'],
    ['active','mixed writer active retry retains first baseline'],
    ['pack','mixed writer settlements can be compacted'],
    ['retry','packed terminal retry retains order and baseline without mutations'],
    ['conflict','mixed writer rejects conflicting or missing result atomically'],
    ['abort','abort during packed state transition retains complete packed block'],
    ['materialize','packed quarantine materializes all exact originals atomically'],
    ['quarantine','mixed writer cannot revive quarantine or silently settle it'],
    ['cancel','cancelled mixed write does not change candidate'],
    ['readback','mixed writer lost acknowledgement is unverified and retry is exact'],
    ['race','mixed writer detects competing physical change before adding result'],
  ])check(mixedWriter[flag]===true,label);
"""+anchor)
updated={p:s.encode(),t:v.encode(),q:w.encode()}
adr="""# BF-107 ADR - dual-format journal write contract and native version fence

Status: accepted for local candidate implementation and disposable browser verification; actual authority handoff deferred.
Context: source-to-candidate copying does not fence legacy writers. A v2 store must support normal stages, terminal acknowledgements and quarantine transitions before switching. IndexedDB native version upgrade fences explicit v1 opens.
Decision: implement candidate writer preserving the v1 immutable payload/baseline, active retries and terminal-state semantics. Atomic CAS over validated physical records with strict completion and fresh exact readback; packed terminal state changes materialize all originals in the same transaction. Test the existing v1 reader/writer against a disposable upgraded database. Keep production v1 unchanged; no pointer switch or upgrade of owner storage.
Alternatives: separate-DB pointer cutover rejected (split-brain); automatic schema upgrade rejected until a scalable live adapter and recovery policy are verified.
Consequences: candidate remains bounded (16 MiB / 4096 logical records), not a production retention solution. Full snapshot CAS is conservative and may reject concurrent changes. Version fence applies only to old code explicitly opening v1; not a guarantee about arbitrary writers or wallet operations.
Tests: exact staging, packed retries, conflict, active/terminal rules, quarantine materialization, abort, cancellation, readback loss, concurrent write, native version fence. Full suite/build/mobile/privacy.
Diff: journalMixedStorage.ts, journalMixedStorage.test.ts, qa/durable-journal-e2e.mjs. Rollback: restore only hash-matching owned files from before copies.
Delta: mixed writer implemented; trace: test logs/receipt; confidence: local candidate only; revisit before production activation.
"""
assert a.is_dir()
with (a/'ADR.md').open('x',encoding='utf-8') as f:f.write(adr)
for path,data in old.items():
 with (a/(Path(path).name+'.before')).open('xb') as f:f.write(data)
for path,data in old.items():assert (root/path).read_bytes()==data,path
for path,data in updated.items():
 (root/path).write_bytes(data)
 print(path,len(data),sha(data),flush=True)
with (a/'owned.json').open('x',encoding='utf-8') as f:json.dump({p:sha(data) for p,data in updated.items()},f,indent=2)