from pathlib import Path
from hashlib import sha256
a=Path('docs/audits/BF_107_CHECKPOINT_PACK_20261125')
p=Path('src/lib/journalCheckpointBatch.ts')
q=Path('src/components/ProgressBackupPanel.tsx')
css=Path('src/components/progressBackup.css')
j=Path('qa/durable-journal-e2e.mjs')
m=Path('qa/mobile-e2e.mjs')
expected={p:'19ea58d288bfc3976d4496fe75d1145943c799b366a8742efb18c7eb275c2eba',q:'730656b0f365542b25d9e2a57b533793d3be8bcae36dc095d4e418c82dc77102',css:'0c7a1b487e9bcc30a8a01e0e8800411b46afb3c5447ee8e1c22c52de0c324f84',j:'38415ab1673693948f6efd5c8f13db9c87193adc81ffa1cea08bf81125f7c554',m:'c6588ef16d7852fc3631d7d13bdf011ff5d5e4182c9df3f1d796f4baa449bcc6'}
old={f:f.read_bytes() for f in expected}
for f,h in expected.items():assert sha256(old[f]).hexdigest()==h,f
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
s=old[p].decode().replace('\r\n','\n')
s=once(s,"function logicalRow(row: Settled): Settled {","function logicalRow(row: Pick<DurableJournalEntry, 'key' | 'raw' | 'baseProfileRaw'>): Settled {")
z=old[q].decode().replace('\r\n','\n')
z=once(z,'{prepared && <details data-checkpoint-preview=','{prepared && <details className="progress-checkpoint-preview" data-checkpoint-preview=')
c=old[css].decode().replace('\r\n','\n')
for sel in ['.progress-storage-capacity {','.progress-storage-capacity summary {','.progress-storage-capacity summary:focus-visible {']:
 c=once(c,sel,sel[:-2]+',\n'+sel.replace('.progress-storage-capacity','.progress-checkpoint-preview'))
c+='\n.progress-checkpoint-preview button { margin-top: 9px; }\n'
v=old[j].decode().replace('\r\n','\n')
anchor="  await js(\"(async()=>{await resetDB();await mod.readDurableJournal();return true})()\");"
v=once(v,anchor,r"""
  // Candidate compact records live only in this disposable QA database.
  // No conversion of the production v1 object store or owner history.
  const checkpointSample=await js("(async()=>{const codec=await import('/src/lib/journalCheckpointBatch.ts'),before=await directRows(),source=(await mod.readDurableJournal()).entries.slice(0,32),packed=await codec.packCheckpointBatch(source);if(packed.status!=='packed')throw Error('checkpoint pack '+packed.status);const name='bodyforge:checkpoint-pack-qa';const open=()=>new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('batches');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const read=async()=>{const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('batches','readonly'),r=tx.objectStore('batches').get('fixture');let value;r.onsuccess=()=>value=r.result;tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(tx.error)})}finally{db.close()}};const db=await open();try{await new Promise((resolve,reject)=>{const tx=db.transaction('batches','readwrite',{durability:'strict'});if(tx.durability!=='strict'){tx.abort();reject(Error('strict unavailable'));return}tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);tx.objectStore('batches').add(packed.batch,'fixture')})}finally{db.close()}const stored=await read(),restored=await codec.unpackCheckpointBatch(stored);const rollback=await open();try{await new Promise((resolve,reject)=>{const tx=rollback.transaction('batches','readwrite',{durability:'strict'});tx.onabort=resolve;tx.oncomplete=()=>reject(Error('abort fixture committed'));const r=tx.objectStore('batches').put({...stored,digest:'0'.repeat(64)},'fixture');r.onsuccess=()=>tx.abort()})}finally{rollback.close()}const retained=await read();const originalUntouched=JSON.stringify(before)===JSON.stringify(await directRows());return {rows:source.length,originalBytes:packed.originalBytes,packedBytes:packed.packedBytes,uniqueCheckpoints:packed.uniqueCheckpoints,exact:JSON.stringify(restored)===JSON.stringify(source),binary:stored.checkpointData instanceof ArrayBuffer,abortedOriginal:retained.digest===stored.digest&&JSON.stringify(await codec.unpackCheckpointBatch(retained))===JSON.stringify(source),originalUntouched}})()");
  console.log('CHECKPOINT_PACK_SAMPLE',JSON.stringify(checkpointSample));
  check(checkpointSample.rows===32&&checkpointSample.uniqueCheckpoints===1&&checkpointSample.packedBytes<checkpointSample.originalBytes&&checkpointSample.exact&&checkpointSample.binary,'compact checkpoint batch survives a strict native IndexedDB transaction and fresh readback');
  check(checkpointSample.abortedOriginal&&checkpointSample.originalUntouched,'aborted compact prototype write retains verified batch and leaves live v1 journal untouched');
"""+anchor)
w=old[m].decode().replace('\r\n','\n')
anchor="  // Oversized opaque IndexedDB evidence; only the disposable QA origin is seeded."
w=once(w,anchor,r"""
  // Read-only preview on a synthetic settled history in this disposable profile.
  const checkpointSeed=await js("(async()=>{const k='bodyforge:pilot:v1';return navigator.locks.request(k+':write',()=>navigator.locks.request(k+':durable-write',{mode:'exclusive'},async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('bodyforge:durable-results:v1',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});try{const rows=Array.from({length:4},(_,i)=>({schemaVersion:1,key:k+':result:qa-checkpoint-'+i,raw:JSON.stringify({opaqueTest:i}),baseProfileRaw:'checkpoint history '.repeat(1024),state:'settled'}));await new Promise((res,rej)=>{const tx=db.transaction('results','readwrite',{durability:'strict'});for(const row of rows)tx.objectStore('results').add(row);tx.oncomplete=res;tx.onabort=tx.onerror=()=>rej(Error('checkpoint fixture failed'))});return rows.length}finally{db.close()}}))})()");
  check(checkpointSeed===4,'disposable journal includes four exact repeated checkpoint snapshots');
  await js("(async()=>{window.__bfCheckpointBefore=await new Promise((resolve,reject)=>{const open=indexedDB.open('bodyforge:durable-results:v1',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('results','readonly'),r=tx.objectStore('results').getAll();tx.oncomplete=()=>{db.close();resolve(JSON.stringify(r.result))};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error)}}});return true})()");
  await click('[data-action=prepare-progress]');
  await until("document.querySelector('#progress-backup')?.dataset.backupStage==='ready'",'checkpoint source prepared',12000);
  await js("document.querySelector('[data-checkpoint-preview]').open=true;true");
  await click('[data-action=estimate-journal-checkpoints]');
  await until("document.querySelector('[data-checkpoint-preview]')?.dataset.checkpointPreview==='ready'",'checkpoint preview measured',20000);
  const measured=await js("(()=>{const size=document.querySelector('[data-checkpoint-original]');return {sample:Number(document.querySelector('[data-checkpoint-sample]').dataset.checkpointSample),original:Number(size.dataset.checkpointOriginal),packed:Number(size.dataset.checkpointPacked)}})()");
  check(measured.sample===4&&measured.packed<measured.original,'UI reports bounded actual checkpoint sample savings');
  console.log('CHECKPOINT_UI_SAMPLE',JSON.stringify(measured));
  check(await js("(async()=>{const rows=await new Promise((resolve,reject)=>{const open=indexedDB.open('bodyforge:durable-results:v1',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('results','readonly'),r=tx.objectStore('results').getAll();tx.oncomplete=()=>{db.close();resolve(JSON.stringify(r.result))};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error)}}});return rows===window.__bfCheckpointBefore})()")&&await js("localStorage.getItem('bodyforge:pilot:v1')")===beforeBackup,'checkpoint estimate preserves exact journal and wallet');
  await js("window.dispatchEvent(new StorageEvent('storage',{key:'bodyforge:avatar-look:v1'}));true");
  await until("document.querySelector('#progress-backup')?.dataset.backupStage==='idle'&&!document.querySelector('[data-checkpoint-preview]')",'stale checkpoint preview invalidated');
  check(await js("!document.querySelector('[data-checkpoint-preview]')"),'stale checkpoint estimate not presented as current');
  await js("(async()=>{const k='bodyforge:pilot:v1';return navigator.locks.request(k+':write',()=>navigator.locks.request(k+':durable-write',{mode:'exclusive'},async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('bodyforge:durable-results:v1',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});try{await new Promise((res,rej)=>{const tx=db.transaction('results','readwrite',{durability:'strict'});for(let i=0;i<4;i++)tx.objectStore('results').delete(k+':result:qa-checkpoint-'+i);tx.oncomplete=res;tx.onabort=tx.onerror=()=>rej(Error('checkpoint fixture cleanup failed'))});delete window.__bfCheckpointBefore;return true}finally{db.close()}}))})()");
"""+anchor)
for f,data in old.items():
 with (a/(f.name+'.before-qa')).open('xb') as out:out.write(data)
for f,data in old.items():assert f.read_bytes()==data
for f,content in [(p,s),(q,z),(css,c),(j,v),(m,w)]:
 f.write_bytes(content.encode());print(f,f.stat().st_size,sha256(f.read_bytes()).hexdigest())