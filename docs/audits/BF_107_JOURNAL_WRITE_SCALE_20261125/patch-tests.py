from pathlib import Path
from hashlib import sha256
p=Path('qa/durable-journal-e2e.mjs')
a=Path('docs/audits/BF_107_JOURNAL_WRITE_SCALE_20261125')
raw=p.read_bytes()
assert sha256(raw).hexdigest()=='c4e3df5f0a95de2b159a9f4f578d30676695fb692d30b40f3c40dff63dc2ce0c'
s=raw.decode().replace('\r\n','\n')
def after(x,y):
 global s
 assert s.count(x)==1,x
 s=s.replace(x,x+y)
after(" 'staging never reactivates quarantine');",r"""
  // Terminal rows are immutable evidence. Retries must not rewrite the whole
  // baseline snapshot, even though strict completion and readback still apply.
  await test("(async()=>{const original=await directRows(),put=IDBObjectStore.prototype.put;let puts=0;IDBObjectStore.prototype.put=function(...args){puts++;return put.apply(this,args)};try{const stage=await mod.stageDurableResults([entry],'ignored new baseline'),mark=await mod.markDurableResults([entry],'quarantined');return stage.status==='saved'&&mark.status==='saved'&&stage.entries[0].state==='quarantined'&&mark.entries[0].baseProfileRaw==='baseline-A'&&puts===0&&JSON.stringify(await directRows())===JSON.stringify(original)}finally{IDBObjectStore.prototype.put=put}})()", 'terminal duplicate stage and mark acknowledge without rewriting original');
""")
anchor="  await test(\`(async()=>{const result=await mod.stageDurableResults([entry],null);const db=await openNative(2);db.close();return result.status==='saved'})()\`, 'module releases every handle so a later version upgrade is unblocked');"
# use the unique tail test label to locate the existing full line without JS escaping.
needle=" 'module releases every handle so a later version upgrade is unblocked');"
assert s.count(needle)==1
start=s.rfind('\n',0,s.index(needle))+1
s=s[:start]+r"""
  // 256 retained terminal originals plus one newly completed result. Measure
  // logical IDB puts, not disk bytes or browser-engine compression.
  const scaling = await js("(async()=>{const rows=Array.from({length:256},(_,i)=>({key:'bodyforge:pilot:v1:result:scale-'+String(i).padStart(4,'0'),raw:JSON.stringify({test:i})})),base='old checkpoint '+ 'history-'.repeat(4096),active={key:'bodyforge:pilot:v1:result:scale-active',raw:'new result'};const staged=await mod.stageDurableResults(rows,base);if(staged.status!=='saved')throw Error('fixture stage');const settled=await mod.markDurableResults(rows,'settled');if(settled.status!=='saved')throw Error('fixture settle');const added=await mod.stageDurableResults([active],'active baseline');if(added.status!=='saved')throw Error('fixture active');const before=await directRows(),put=IDBObjectStore.prototype.put;let puts=0;const putKeys=[];IDBObjectStore.prototype.put=function(...args){puts++;putKeys.push(args[0].key);return put.apply(this,args)};try{const marked=await mod.markDurableResults([...rows,active],'settled'),after=await directRows(),expected=before.map(r=>r.key===active.key?{...r,state:'settled'}:r);return {puts,putKeys,ack:marked.status,ackCount:marked.entries?.length,allSettled:marked.entries?.every(r=>r.state==='settled'),exact:JSON.stringify(after)===JSON.stringify(expected)}}finally{IDBObjectStore.prototype.put=put}})()");
  console.log('TERMINAL_SCALING',JSON.stringify(scaling));
  check(scaling.ack==='saved'&&scaling.ackCount===257&&scaling.allSettled&&scaling.exact&&scaling.puts===1&&scaling.putKeys[0]==='bodyforge:pilot:v1:result:scale-active','256 historical terminal rows plus one new settlement require exactly one put and complete receipt');
  await test("(async()=>{const before=await directRows(),put=IDBObjectStore.prototype.put;let puts=0;IDBObjectStore.prototype.put=function(...args){puts++;return put.apply(this,args)};try{const entries=before.map(({key,raw})=>({key,raw}));const r=await mod.markDurableResults(entries,'settled');return r.status==='saved'&&r.entries.length===257&&puts===0&&JSON.stringify(await directRows())===JSON.stringify(before)}finally{IDBObjectStore.prototype.put=put}})()", 'second full reconciliation makes zero puts and still acknowledges every original');
  await test("(async()=>{const before=await directRows(),put=IDBObjectStore.prototype.put;let puts=0;IDBObjectStore.prototype.put=function(...args){puts++;return put.apply(this,args)};try{const entries=before.map(({key,raw})=>({key,raw}));entries[entries.length-1].raw+='changed';const r=await mod.markDurableResults(entries,'settled');return r.status==='invalid'&&puts===0&&JSON.stringify(await directRows())===JSON.stringify(before)}finally{IDBObjectStore.prototype.put=put}})()", 'mixed batch conflict never rewrites any terminal originals');
  await test("(async()=>{const before=await directRows(),entry=before[0],put=IDBObjectStore.prototype.put,transaction=IDBDatabase.prototype.transaction;let puts=0,reads=0,completed=false;IDBObjectStore.prototype.put=function(...args){puts++;return put.apply(this,args)};IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(tx.mode==='readwrite'){tx.addEventListener('complete',()=>completed=true)}else if(completed){reads++;}return tx};try{const r=await mod.markDurableResults([entry],'settled');return r.status==='saved'&&completed&&reads>0&&puts===0&&r.entries[0].baseProfileRaw===entry.baseProfileRaw}finally{IDBObjectStore.prototype.put=put;IDBDatabase.prototype.transaction=transaction}})()", 'no-op terminal acknowledgement still uses strict completion and a fresh readonly transaction');
  await js("await resetDB();await mod.readDurableJournal();true");
"""+s[start:]
with (a/'durable-journal-e2e.mjs.before').open('xb') as f:f.write(raw)
assert p.read_bytes()==raw
p.write_bytes(s.encode())
print('QA',p.stat().st_size,sha256(p.read_bytes()).hexdigest())