from pathlib import Path
from hashlib import sha256
p=Path('qa/durable-journal-e2e.mjs')
a=Path('docs/audits/BF_107_MIXED_STORAGE_20261125')
old=p.read_bytes()
assert sha256(old).hexdigest()=='6a6eb254bb56d1627485111476635c041ff0dbdf094c7775f5802579fac6461c'
text=old.decode().replace('\r\n','\n')
anchor='  await js("(async()=>{await resetDB();await mod.readDurableJournal();return true})()");'
assert text.count(anchor)==2
index=text.rindex(anchor)
fixture=r"""
  // Actual atomic conversion in a separate candidate database, never v1.
  const mixed=await js(`(async()=>{
    const m=await import('/src/lib/journalMixedStorage.ts');
    const liveBefore=JSON.stringify(await directRows());
    const prefix='bodyforge:pilot:v1:result:qa-mixed-';
    const source=Array.from({length:6},(_,i)=>({schemaVersion:1,key:prefix+i,raw:'opaque-'+i,
      baseProfileRaw:i===2?null:'checkpoint-'.repeat(4096),state:i===4?'active':i===5?'quarantined':'settled'}));
    const selected=source.slice(0,3).map(r=>r.key);
    const open=()=>new Promise((resolve,reject)=>{
      const r=indexedDB.open(m.CANDIDATE_JOURNAL_DB,m.CANDIDATE_JOURNAL_VERSION);
      r.onupgradeneeded=()=>r.result.createObjectStore(m.CANDIDATE_STORE,{keyPath:'key'});
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('candidate blocked'));
    });
    let db=await open();
    const physical=()=>new Promise((resolve,reject)=>{
      const tx=db.transaction(m.CANDIDATE_STORE,'readonly'),r=tx.objectStore(m.CANDIDATE_STORE).getAll();
      tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);
    });
    const write=(fn)=>new Promise((resolve,reject)=>{
      const tx=db.transaction(m.CANDIDATE_STORE,'readwrite',{durability:'strict'});
      tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);fn(tx.objectStore(m.CANDIDATE_STORE));
    });
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const initial=source.map(({schemaVersion,...r})=>({key:r.key,raw:r.raw,baseProfileRaw:r.baseProfileRaw,state:r.state}));
    const exact=async()=>{const r=await m.readCandidateJournal(db);return r.status==='ready'&&same(r.entries,initial)};
    const snapshot=async()=>{const r=await physical();return JSON.stringify(r.map(x=>x.schemaVersion===2?{...x,batch:{...x.batch,checkpointData:Array.from(new Uint8Array(x.batch.checkpointData))}}:x))};
    const results={};
    try{
      await write(store=>source.forEach(row=>store.add(row)));
      const before=await snapshot();
      results.legacy=await exact();
      results.cancel=(await m.compactCandidateJournal(db,selected,AbortSignal.abort())).status==='cancelled'&&before===await snapshot();
      results.activeGuard=(await m.compactCandidateJournal(db,[source[4].key])).status==='conflict'&&
        (await m.compactCandidateJournal(db,[source[5].key])).status==='conflict'&&before===await snapshot();
      const oldAdd=IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add=function(...args){
        const req=oldAdd.apply(this,args);
        if(this.transaction.db.name===m.CANDIDATE_JOURNAL_DB)
          req.addEventListener('success',()=>this.transaction.abort(),{once:true});
        return req;
      };
      let aborted;
      try{aborted=await m.compactCandidateJournal(db,selected)}finally{IDBObjectStore.prototype.add=oldAdd}
      results.abort=aborted.status==='unavailable'&&before===await snapshot()&&await exact();
      const oldTransaction=IDBDatabase.prototype.transaction;
      let raced=false;
      IDBDatabase.prototype.transaction=function(...args){
        if(this.name===m.CANDIDATE_JOURNAL_DB&&args[1]==='readwrite'&&!raced){
          raced=true;
          const competing=oldTransaction.call(this,m.CANDIDATE_STORE,'readwrite',{durability:'strict'});
          competing.objectStore(m.CANDIDATE_STORE).put({...source[4],raw:'other-writer'});
        }
        return oldTransaction.apply(this,args);
      };
      let conflict;
      try{conflict=await m.compactCandidateJournal(db,selected)}finally{IDBDatabase.prototype.transaction=oldTransaction}
      const changed=await physical();
      results.race=raced&&conflict.status==='conflict'&&changed.length===source.length&&
        changed.every(r=>r.schemaVersion===1)&&changed.find(r=>r.key===source[4].key)?.raw==='other-writer'&&
        changed.filter(r=>r.key!==source[4].key).every(r=>same(r,source.find(x=>x.key===r.key)));
      await write(store=>store.put(source[4]));
      let reads=0;
      IDBDatabase.prototype.transaction=function(...args){
        if(this.name===m.CANDIDATE_JOURNAL_DB&&args[1]==='readonly'&&++reads===2)throw Error('QA readback unavailable');
        return oldTransaction.apply(this,args);
      };
      let uncertain;
      try{uncertain=await m.compactCandidateJournal(db,selected)}finally{IDBDatabase.prototype.transaction=oldTransaction}
      const committed=await physical(),packed=committed.find(r=>r.schemaVersion===2);
      results.unverified=uncertain.status==='unverified'&&!!packed&&committed.length===4&&await exact();
      const compressed=await snapshot();
      let mutationCount=0;
      const oldDelete=IDBObjectStore.prototype.delete;
      IDBObjectStore.prototype.add=function(...args){if(this.transaction.db.name===m.CANDIDATE_JOURNAL_DB)mutationCount++;return oldAdd.apply(this,args)};
      IDBObjectStore.prototype.delete=function(...args){if(this.transaction.db.name===m.CANDIDATE_JOURNAL_DB)mutationCount++;return oldDelete.apply(this,args)};
      let retry,overlap;
      try{
        retry=await m.compactCandidateJournal(db,[...selected].reverse());
        overlap=await m.compactCandidateJournal(db,[selected[0],source[3].key]);
      }finally{IDBObjectStore.prototype.add=oldAdd;IDBObjectStore.prototype.delete=oldDelete}
      results.retry=retry.status==='unchanged'&&retry.batchKey===packed?.key&&overlap.status==='conflict'&&mutationCount===0&&compressed===await snapshot();
      db.close();db=await open();
      results.reopen=await exact()&&compressed===await snapshot();
      const corrupt=structuredClone(packed);
      new Uint8Array(corrupt.batch.checkpointData)[0]^=1;
      await write(store=>store.put(corrupt));
      const damaged=await snapshot();
      const bad=await m.readCandidateJournal(db),blocked=await m.restoreCandidateJournalBatch(db,packed.key);
      results.corrupt=bad.status==='invalid'&&bad.entries.length===0&&blocked.status==='invalid'&&damaged===await snapshot();
      await write(store=>store.put(packed));
      IDBObjectStore.prototype.add=function(...args){
        const req=oldAdd.apply(this,args);
        if(this.transaction.db.name===m.CANDIDATE_JOURNAL_DB&&args[0]?.key===selected[0])
          req.addEventListener('success',()=>this.transaction.abort(),{once:true});
        return req;
      };
      let undoAborted;
      try{undoAborted=await m.restoreCandidateJournalBatch(db,packed.key)}finally{IDBObjectStore.prototype.add=oldAdd}
      results.rollbackAbort=undoAborted.status==='unavailable'&&compressed===await snapshot()&&await exact();
      const undo=await m.restoreCandidateJournalBatch(db,packed.key);
      const restored=await physical();
      results.rollback=undo.status==='saved'&&undo.count===3&&restored.length===source.length&&
        restored.every(r=>r.schemaVersion===1)&&await exact();
      results.rollbackRetry=(await m.restoreCandidateJournalBatch(db,packed.key)).status==='conflict'&&await exact();
      const complete=await m.compactCandidateJournal(db,selected);
      results.verified=complete.status==='saved'&&complete.count===3&&await exact();
      results.liveUntouched=liveBefore===JSON.stringify(await directRows());
      return results;
    }finally{db.close()}
  })()`);
  console.log('MIXED_STORAGE_SAMPLE',JSON.stringify(mixed));
  for(const [flag,label] of [
    ['legacy','candidate reads all exact legacy records'],
    ['cancel','cancelled conversion leaves every physical row unchanged'],
    ['activeGuard','active and quarantine records cannot be packed'],
    ['abort','abort after compact add rolls back all original deletes'],
    ['race','concurrent change to an unrelated row invalidates entire conversion'],
    ['unverified','post-commit readback failure is unverified, not a false saved result'],
    ['retry','repeat compaction is idempotent and overlap conflicts without writes'],
    ['reopen','mixed records survive database close and reopen with exact logical view'],
    ['corrupt','damaged batch blocks all reads and restoration without partial result'],
    ['rollbackAbort','abort during inverse conversion retains complete packed record'],
    ['rollback','inverse conversion restores every original legacy record'],
    ['rollbackRetry','missing rollback target is a conflict, not false success'],
    ['verified','successful compact conversion requires complete fresh readback'],
    ['liveUntouched','candidate migration never changes the existing v1 journal'],
  ])check(mixed[flag]===true,label);
"""
result=text[:index]+fixture+text[index:]
with (a/'durable-journal-e2e.mjs.before').open('xb') as f:f.write(old)
assert p.read_bytes()==old
p.write_bytes(result.encode())
print('QA_PATCH',p.stat().st_size,sha256(p.read_bytes()).hexdigest())