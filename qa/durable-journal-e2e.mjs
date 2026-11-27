// Actual IndexedDB, disposable Chrome profile. No App, camera, owner data or network writes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { requireDevOrigin, waitForOwnedBrowser, newOwnedPage, cleanupOwnedChrome } from './owned-chrome.mjs';
const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
await requireDevOrigin(origin);
const ownedProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-durable-journal-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-webgl', '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + ownedProfile, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket, sequence = 0, assertions = 0, browser;
const requests = new Map();
function check(value, label) { if (!value) throw Error('FAIL ' + label); assertions++; console.log('PASS', label); }
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { requests.delete(id); reject(Error(method + ' timeout')); }, 20000);
    requests.set(id, { timer, resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function js(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function test(expression, label) { check(await js(expression), label); }
try {
  browser = await waitForOwnedBrowser(ownedProfile, chrome);
  const target = await newOwnedPage(browser);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data.toString()), request = requests.get(message.id);
    if (request) { clearTimeout(request.timer); requests.delete(message.id); message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result); }
    if (message.method === 'Fetch.requestPaused') void cdp('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], body: Buffer.from('<!doctype html><title>Disposable actual IndexedDB QA</title>').toString('base64') });
  });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: origin + '/?durable-qa', resourceType: 'Document', requestStage: 'Request' }] });
  await cdp('Page.navigate', { url: origin + '/?durable-qa' });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { if (await js("location.href.endsWith('/?durable-qa')&&document.title==='Disposable actual IndexedDB QA'")) break; } catch { /* navigation */ }
    await sleep(100);
  }
  if (Date.now() >= deadline) throw Error('Disposable test document did not load');
  await js(`(async()=>{
    window.mod=await import('/src/lib/durableJournal.ts');window.dbName='bodyforge:durable-results:v1';
    window.entry={key:'bodyforge:pilot:v1:result:durable-test',raw:'{opaque damaged JSON'};
    window.extra={key:'bodyforge:pilot:v1:result:extra',raw:'future envelope'};
    window.openNative=(version=1,upgrade)=>new Promise((resolve,reject)=>{const r=indexedDB.open(dbName,version);r.onupgradeneeded=()=>upgrade?.(r.result);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    window.resetDB=()=>new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(dbName);r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Leaked DB handle'))});
    window.directPut=async(value)=>{const db=await openNative();try{await new Promise((resolve,reject)=>{const tx=db.transaction('results','readwrite',{durability:'strict'});tx.objectStore('results').put(value);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error)})}finally{db.close()}};
    window.directRows=async()=>{const db=await openNative();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('results','readonly'),r=tx.objectStore('results').getAll();let rows;r.onsuccess=()=>rows=r.result;tx.oncomplete=()=>resolve(rows);tx.onerror=tx.onabort=()=>reject(tx.error)})}finally{db.close()}};
    await resetDB();return true;
  })()`);
  await test("(async()=>{const r=await mod.readDurableJournal();return r.status==='ready'&&r.entries.length===0})()", 'fresh real IndexedDB initializes a readable empty store');
  await js(`window.nativeTransaction=IDBDatabase.prototype.transaction;window.txEvents=[];IDBDatabase.prototype.transaction=function(...args){const tx=nativeTransaction.apply(this,args);txEvents.push(tx.mode+':'+tx.durability);tx.addEventListener('complete',()=>txEvents.push(tx.mode+':complete'));return tx};true`);
  await test("(async()=>{const r=await mod.stageDurableResults([entry],'baseline-A');return r.status==='saved'})()", 'opaque result acknowledged after a strict real transaction');
  await test("txEvents.indexOf('readwrite:strict')>=0&&txEvents.indexOf('readonly:default')>txEvents.indexOf('readwrite:complete')", 'separate readback follows strict transaction complete');
  await js('IDBDatabase.prototype.transaction=nativeTransaction;true');
  await test("(async()=>{const r=await mod.readDurableJournal();return r.entries[0].raw===entry.raw&&r.entries[0].baseProfileRaw==='baseline-A'&&r.entries[0].state==='active'})()", 'opaque damaged original and initial profile baseline are preserved');
  await test("(async()=>{const r=await mod.stageDurableResults([entry,entry],'baseline-B');return r.status==='saved'&&(await mod.readDurableJournal()).entries.length===1&&(await mod.readDurableJournal()).entries[0].baseProfileRaw==='baseline-A'})()", 'idempotent duplicate keeps the first baseline and one row');
  await test("(async()=>{const put=IDBObjectStore.prototype.put;let puts=0;IDBObjectStore.prototype.put=function(...args){puts++;return put.apply(this,args)};try{const r=await mod.stageDurableResults([entry],'other');return r.status==='saved'&&r.entries[0].state==='active'&&r.entries[0].baseProfileRaw==='baseline-A'&&puts===1}finally{IDBObjectStore.prototype.put=put}})()", 'active duplicate still issues one strict put');
  await test("(async()=>{const r=await mod.stageDurableResults([{...entry,raw:'different'}],null);return r.status==='invalid'&&(await mod.readDurableJournal()).entries[0].raw===entry.raw})()", 'same key cannot replace immutable raw bytes');
  await test("(async()=>{const r=await mod.stageDurableResults([extra,{...entry,raw:'different'}],null);return r.status==='invalid'&&(await mod.readDurableJournal()).entries.length===1})()", 'conflicting batch aborts atomically before creating another row');
  await test("(async()=>{const r=await mod.stageDurableResults([extra,{...extra,raw:'different'}],null);return r.status==='invalid'&&(await mod.readDurableJournal()).entries.length===1})()", 'conflicting duplicate inside a batch writes nothing');
  await test("(async()=>{return(await mod.stageDurableResults([{key:'wrong-prefix',raw:'x'}],null)).status==='invalid'&&(await mod.stageDurableResults([extra],17)).status==='invalid'})()", 'invalid key and baseline types fail closed');
  await test("(async()=>{return(await mod.markDurableResults([entry],'settled')).status==='saved'&&(await mod.readDurableJournal()).entries[0].state==='settled'})()", 'settlement retains the durable record');
  await test("(async()=>{return(await mod.stageDurableResults([entry],'changed')).status==='saved'&&(await mod.readDurableJournal()).entries[0].state==='settled'})()", 'staging never reactivates settled rows');
  await test("(async()=>{return(await mod.markDurableResults([entry],'quarantined')).status==='saved'&&(await mod.readDurableJournal()).entries[0].state==='quarantined'})()", 'quarantine is durable and retains original bytes');
  await test("(async()=>{return(await mod.stageDurableResults([entry],null)).status==='saved'&&(await mod.readDurableJournal()).entries[0].state==='quarantined'})()", 'staging never reactivates quarantine');
  // Terminal rows are immutable evidence. Retries must not rewrite the whole
  // baseline snapshot, even though strict completion and readback still apply.
  await test("(async()=>{const original=await directRows(),put=IDBObjectStore.prototype.put;let puts=0;IDBObjectStore.prototype.put=function(...args){puts++;return put.apply(this,args)};try{const stage=await mod.stageDurableResults([entry],'ignored new baseline'),mark=await mod.markDurableResults([entry],'quarantined');return stage.status==='saved'&&mark.status==='saved'&&stage.entries[0].state==='quarantined'&&mark.entries[0].baseProfileRaw==='baseline-A'&&puts===0&&JSON.stringify(await directRows())===JSON.stringify(original)}finally{IDBObjectStore.prototype.put=put}})()", 'terminal duplicate stage and mark acknowledge without rewriting original');

  await test("(async()=>{return(await mod.markDurableResults([entry],'settled')).status==='invalid'&&(await mod.readDurableJournal()).entries[0].state==='quarantined'})()", 'terminal quarantine cannot be silently settled');
  await test("(async()=>{return(await mod.markDurableResults([extra],'settled')).status==='invalid'&&(await mod.markDurableResults([{...entry,raw:'different'}],'quarantined')).status==='invalid'})()", 'mark requires an existing exact raw match');
  await test("(async()=>{const c=new AbortController();c.abort();return(await mod.stageDurableResults([extra],null,c.signal)).status==='unavailable'&&(await mod.readDurableJournal()).entries.length===1})()", 'already aborted write does not change storage');
  await test(`(async()=>{const put=IDBObjectStore.prototype.put,c=new AbortController();IDBObjectStore.prototype.put=function(...args){const r=put.apply(this,args);c.abort();return r};let result;try{result=await mod.stageDurableResults([extra],null,c.signal)}finally{IDBObjectStore.prototype.put=put}return result.status==='unavailable'&&(await mod.readDurableJournal()).entries.length===1})()`, 'abort during a real put rolls the whole write back');
  await test(`(async()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const r=put.apply(this,args);r.addEventListener('success',()=>this.transaction.abort());return r};let result;try{result=await mod.stageDurableResults([extra],null)}finally{IDBObjectStore.prototype.put=put}return result.status==='unavailable'&&(await mod.readDurableJournal()).entries.length===1})()`, 'request success followed by abort never becomes a saved receipt');
  await test(`(async()=>{const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args);if(tx.mode==='readwrite')Object.defineProperty(tx,'durability',{value:'default'});return tx};let result;try{result=await mod.stageDurableResults([extra],null)}finally{IDBDatabase.prototype.transaction=original}return result.status==='unavailable'&&(await mod.readDurableJournal()).entries.length===1})()`, 'engines ignoring strict durability cannot acknowledge a durable write');
  await test(`(async()=>{const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){if(args[1]==='readwrite')throw new DOMException('unsupported','NotSupportedError');return original.apply(this,args)};let result;try{result=await mod.stageDurableResults([extra],null)}finally{IDBDatabase.prototype.transaction=original}return result.status==='unavailable'})()`, 'unsupported strict transaction fails without a fallback write');
  await test(`(async()=>{await directPut({schemaVersion:2,key:extra.key,raw:'future bytes',baseProfileRaw:null,state:'active'});const r=await mod.readDurableJournal(),rows=await directRows();return r.status==='unavailable'&&rows.some(x=>x.schemaVersion===2&&x.raw==='future bytes')})()`, 'unknown row version remains untouched and blocks trusted reads');
  await test(`(async()=>{await resetDB();const db=await openNative(2,d=>d.createObjectStore('results',{keyPath:'key'}));db.close();return(await mod.readDurableJournal()).status==='unavailable'})()`, 'future database version is preserved without downgrading');
  await test(`(async()=>{await resetDB();const db=await openNative(1,d=>d.createObjectStore('results',{keyPath:'other'}));db.close();return(await mod.readDurableJournal()).status==='unavailable'})()`, 'unexpected object-store key schema fails closed');
  await js("(async()=>{await resetDB();await mod.readDurableJournal();return true})()");
  await test(`(async()=>{const held=await openNative();let unblocked;const deleted=new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(dbName);r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>unblocked=true});while(!unblocked)await new Promise(r=>setTimeout(r,10));const start=performance.now(),read=await mod.readDurableJournal(),elapsed=performance.now()-start;held.close();await deleted;await new Promise(r=>setTimeout(r,100));const next=await mod.readDurableJournal();return read.status==='unavailable'&&elapsed>=4500&&elapsed<7000&&next.status==='ready'&&next.entries.length===0})()`, 'blocked opening times out, closes late handles and permits clean recovery');
  await test(`(async()=>{const held=await openNative();let blocked=false;const deleted=new Promise(resolve=>{const r=indexedDB.deleteDatabase(dbName);r.onsuccess=resolve;r.onblocked=()=>blocked=true});while(!blocked)await new Promise(r=>setTimeout(r,10));const c=new AbortController();setTimeout(()=>c.abort(),50);const start=performance.now(),result=await mod.stageDurableResults([extra],null,c.signal),elapsed=performance.now()-start;held.close();await deleted;await new Promise(r=>setTimeout(r,100));const rows=await mod.readDurableJournal();return result.status==='unavailable'&&elapsed<1000&&rows.status==='ready'&&rows.entries.length===0})()`, 'cancelled blocked open never performs a delayed hidden write');

  // 256 retained terminal originals plus one newly completed result. Measure
  // logical IDB puts, not disk bytes or browser-engine compression.
  const scaling = await js("(async()=>{const rows=Array.from({length:256},(_,i)=>({key:'bodyforge:pilot:v1:result:scale-'+String(i).padStart(4,'0'),raw:JSON.stringify({test:i})})),base='old checkpoint '+ 'history-'.repeat(4096),active={key:'bodyforge:pilot:v1:result:scale-active',raw:'new result'};const staged=await mod.stageDurableResults(rows,base);if(staged.status!=='saved')throw Error('fixture stage');const settled=await mod.markDurableResults(rows,'settled');if(settled.status!=='saved')throw Error('fixture settle');const added=await mod.stageDurableResults([active],'active baseline');if(added.status!=='saved')throw Error('fixture active');const before=await directRows(),put=IDBObjectStore.prototype.put;let puts=0;const putKeys=[];IDBObjectStore.prototype.put=function(...args){puts++;putKeys.push(args[0].key);return put.apply(this,args)};try{const marked=await mod.markDurableResults([...rows,active],'settled'),after=await directRows(),expected=before.map(r=>r.key===active.key?{...r,state:'settled'}:r);return {puts,putKeys,ack:marked.status,ackCount:marked.entries?.length,allSettled:marked.entries?.every(r=>r.state==='settled'),exact:JSON.stringify(after)===JSON.stringify(expected)}}finally{IDBObjectStore.prototype.put=put}})()");
  console.log('TERMINAL_SCALING',JSON.stringify(scaling));
  check(scaling.ack==='saved'&&scaling.ackCount===257&&scaling.allSettled&&scaling.exact&&scaling.puts===1&&scaling.putKeys[0]==='bodyforge:pilot:v1:result:scale-active','256 historical terminal rows plus one new settlement require exactly one put and complete receipt');
  await test("(async()=>{const before=await directRows(),put=IDBObjectStore.prototype.put;let puts=0;IDBObjectStore.prototype.put=function(...args){puts++;return put.apply(this,args)};try{const entries=before.map(({key,raw})=>({key,raw}));const r=await mod.markDurableResults(entries,'settled');return r.status==='saved'&&r.entries.length===257&&puts===0&&JSON.stringify(await directRows())===JSON.stringify(before)}finally{IDBObjectStore.prototype.put=put}})()", 'second full reconciliation makes zero puts and still acknowledges every original');
  await test("(async()=>{const before=await directRows(),put=IDBObjectStore.prototype.put;let puts=0;IDBObjectStore.prototype.put=function(...args){puts++;return put.apply(this,args)};try{const entries=before.map(({key,raw})=>({key,raw}));entries[entries.length-1].raw+='changed';const r=await mod.markDurableResults(entries,'settled');return r.status==='invalid'&&puts===0&&JSON.stringify(await directRows())===JSON.stringify(before)}finally{IDBObjectStore.prototype.put=put}})()", 'mixed batch conflict never rewrites any terminal originals');
  await test("(async()=>{const before=await directRows(),entry=before[0],put=IDBObjectStore.prototype.put,transaction=IDBDatabase.prototype.transaction;let puts=0,reads=0,completed=false,strict=false;IDBObjectStore.prototype.put=function(...args){puts++;return put.apply(this,args)};IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(tx.mode==='readwrite'){strict=tx.durability==='strict';tx.addEventListener('complete',()=>completed=true)}else if(completed){reads++;}return tx};try{const r=await mod.markDurableResults([entry],'settled');return r.status==='saved'&&strict&&completed&&reads>0&&puts===0&&r.entries[0].baseProfileRaw===entry.baseProfileRaw}finally{IDBObjectStore.prototype.put=put;IDBDatabase.prototype.transaction=transaction}})()", 'no-op terminal acknowledgement still uses strict completion and a fresh readonly transaction');

  // Candidate compact records live only in this disposable QA database.
  // No conversion of the production v1 object store or owner history.
  const checkpointSample=await js("(async()=>{const codec=await import('/src/lib/journalCheckpointBatch.ts'),before=await directRows(),source=(await mod.readDurableJournal()).entries.slice(0,32),packed=await codec.packCheckpointBatch(source);if(packed.status!=='packed')throw Error('checkpoint pack '+packed.status);const name='bodyforge:checkpoint-pack-qa';const open=()=>new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('batches');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const read=async()=>{const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('batches','readonly'),r=tx.objectStore('batches').get('fixture');let value;r.onsuccess=()=>value=r.result;tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(tx.error)})}finally{db.close()}};const db=await open();try{await new Promise((resolve,reject)=>{const tx=db.transaction('batches','readwrite',{durability:'strict'});if(tx.durability!=='strict'){tx.abort();reject(Error('strict unavailable'));return}tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);tx.objectStore('batches').add(packed.batch,'fixture')})}finally{db.close()}const stored=await read(),restored=await codec.unpackCheckpointBatch(stored);const rollback=await open();try{await new Promise((resolve,reject)=>{const tx=rollback.transaction('batches','readwrite',{durability:'strict'});tx.onabort=resolve;tx.oncomplete=()=>reject(Error('abort fixture committed'));const r=tx.objectStore('batches').put({...stored,digest:'0'.repeat(64)},'fixture');r.onsuccess=()=>tx.abort()})}finally{rollback.close()}const retained=await read();const originalUntouched=JSON.stringify(before)===JSON.stringify(await directRows());return {rows:source.length,originalBytes:packed.originalBytes,packedBytes:packed.packedBytes,uniqueCheckpoints:packed.uniqueCheckpoints,exact:JSON.stringify(restored)===JSON.stringify(source),binary:stored.checkpointData instanceof ArrayBuffer,abortedOriginal:retained.digest===stored.digest&&JSON.stringify(await codec.unpackCheckpointBatch(retained))===JSON.stringify(source),originalUntouched}})()");
  console.log('CHECKPOINT_PACK_SAMPLE',JSON.stringify(checkpointSample));
  check(checkpointSample.rows===32&&checkpointSample.uniqueCheckpoints===1&&checkpointSample.packedBytes<checkpointSample.originalBytes&&checkpointSample.exact&&checkpointSample.binary,'compact checkpoint batch survives a strict native IndexedDB transaction and fresh readback');
  check(checkpointSample.abortedOriginal&&checkpointSample.originalUntouched,'aborted compact prototype write retains verified batch and leaves live v1 journal untouched');

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
  await js("(async()=>{await resetDB();await mod.readDurableJournal();return true})()");

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

  // A real large legacy journal exceeds both candidate bounds. The normal
  // production API must not silently truncate, discard or cap that history.
  const largeHistory=await js(`(async()=>{
    const prefix='bodyforge:pilot:v1:result:large-';
    const count=4105,base='long-original-checkpoint-'.repeat(1500)+'\\ud800';
    const rows=Array.from({length:count},(_,i)=>({schemaVersion:1,key:prefix+String(i).padStart(5,'0'),
      raw:'original-'+i,baseProfileRaw:i<520?base:null,state:'settled'}));
    const small={key:prefix+'new',raw:'new original'};
    const putDirect=async list=>{
      const db=await openNative();
      try{await new Promise((resolve,reject)=>{const tx=db.transaction('results','readwrite',{durability:'strict'}),store=tx.objectStore('results');
        tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);list.forEach(row=>store.add(row))})}finally{db.close()}
    };
    const countRows=async()=>{
      const db=await openNative();
      try{return await new Promise((resolve,reject)=>{const tx=db.transaction('results','readonly'),r=tx.objectStore('results').count();
        tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error)})}finally{db.close()}
    };
    await resetDB();await mod.readDurableJournal();await putDirect(rows);
    const old=IDBObjectStore.prototype.getAll, result={};
    let pages=0,largest=0,unbounded=0;
    IDBObjectStore.prototype.getAll=function(...args){
      if(this.transaction.db.name===dbName){
        pages++;if(args[1]!==32)unbounded++;
        const r=old.apply(this,args);
        r.addEventListener('success',()=>{largest=Math.max(largest,r.result.length)});
        return r;
      }
      return old.apply(this,args);
    };
    try{
      const start=performance.now(),stage=await mod.stageDurableResults([small],null),elapsed=performance.now()-start;
      result.stage=stage.status==='saved'&&stage.entries.length===1&&stage.entries[0].key===small.key&&stage.entries[0].baseProfileRaw===null&&stage.entries[0].state==='active';
      result.pageBound=unbounded===0&&largest<=32&&pages===Math.floor((count+1)/32)+1;
      result.pages=pages;result.maxPage=largest;result.elapsedMs=Math.round(elapsed);
      pages=0;largest=0;unbounded=0;
      const full=await mod.readDurableJournal();
      result.full=full.status==='ready'&&full.entries.length===count+1&&full.entries.slice(0,count).every((row,i)=>row.key===rows[i].key&&row.raw===rows[i].raw&&row.baseProfileRaw===rows[i].baseProfileRaw&&row.state==='settled')&&full.entries[count].key===small.key;
      result.fullPages=unbounded===0&&largest<=32&&pages===Math.floor((count+1)/32)+1;
      pages=0;largest=0;unbounded=0;
      const projected=await mod.readDurableHistoryReceipts();
      result.slim=projected.status==='ready'&&projected.entries.length===count&&
        projected.entries.every((row,i)=>row.key===rows[i].key&&row.raw===rows[i].raw&&row.state==='settled'&&
          Object.keys(row).length===3&&!('baseProfileRaw' in row));
      result.slimPages=unbounded===0&&largest<=32&&pages===Math.floor((count+1)/32)+1;
      result.fullJsonBytes=new TextEncoder().encode(JSON.stringify(full.entries)).byteLength;
      result.receiptJsonBytes=new TextEncoder().encode(JSON.stringify(projected.entries)).byteLength;
      result.count=count;result.logicalBaselineBytes=520*new TextEncoder().encode(base).byteLength;
      result.retained=(await countRows())===count+1;
    }finally{IDBObjectStore.prototype.getAll=old}
    // An unrelated damaged row on the final page still blocks the receipt.
    const bad={schemaVersion:99,key:prefix+'zz-invalid',raw:'future',baseProfileRaw:null,state:'active'};
    await putDirect([bad]);
    const refused=await mod.markDurableResults([small],'settled'),invalid=await mod.readDurableJournal();
    const invalidSlim=await mod.readDurableHistoryReceipts();
    result.damage=refused.status==='unavailable'&&invalid.status==='unavailable'&&invalid.entries.length===0&&
      invalidSlim.status==='unavailable'&&invalidSlim.entries.length===0&&(await countRows())===count+2;
    // Even if the write commits, cancellation or an interrupted later page
    // cannot authorize a saved receipt. Do not claim zero writes.
    await resetDB();await mod.readDurableJournal();
    await putDirect(rows.slice(-65));
    const controller=new AbortController(),native=IDBObjectStore.prototype.getAll;
    let seen=0;
    IDBObjectStore.prototype.getAll=function(...args){
      const r=native.apply(this,args);
      if(this.transaction.db.name===dbName&&++seen===2)r.addEventListener('success',()=>controller.abort());
      return r;
    };
    let cancelled;
    try{cancelled=await mod.stageDurableResults([small],null,controller.signal)}finally{IDBObjectStore.prototype.getAll=native}
    const recovered=await mod.stageDurableResults([small],'later baseline');
    result.cancel=cancelled.status==='unavailable'&&seen===2&&recovered.status==='saved'&&recovered.entries[0].baseProfileRaw===null&&(await countRows())===66;
    const pageOriginal=IDBObjectStore.prototype.getAll;
    let interrupted=0;
    IDBObjectStore.prototype.getAll=function(...args){
      if(this.transaction.db.name===dbName&&++interrupted===2)throw Error('QA second page unavailable');
      return pageOriginal.apply(this,args);
    };
    let failed;
    try{failed=await mod.readDurableJournal()}finally{IDBObjectStore.prototype.getAll=pageOriginal}
    result.noPartial=failed.status==='unavailable'&&failed.entries.length===0&&interrupted===2&&(await mod.readDurableJournal()).entries.length===66;
    const controller2=new AbortController();
    let slimPages=0;
    IDBObjectStore.prototype.getAll=function(...args){
      const r=pageOriginal.apply(this,args);
      if(this.transaction.db.name===dbName&&++slimPages===2)r.addEventListener('success',()=>controller2.abort());
      return r;
    };
    let stoppedSlim;
    try{stoppedSlim=await mod.readDurableHistoryReceipts(controller2.signal)}finally{IDBObjectStore.prototype.getAll=pageOriginal}
    const marked=await mod.markDurableResults([small],'quarantined');
    const finalSlim=await mod.readDurableHistoryReceipts();
    result.slimCancel=stoppedSlim.status==='unavailable'&&stoppedSlim.entries.length===0&&slimPages===2;
    result.slimQuarantine=marked.status==='saved'&&finalSlim.status==='ready'&&finalSlim.entries.length===65&&
      finalSlim.entries.every(row=>row.state==='settled'&&row.key!==small.key)&&(await countRows())===66;
    await resetDB();await mod.readDurableJournal();
    return result;
  })()`);
  console.log('LARGE_JOURNAL_PAGES',JSON.stringify(largeHistory));
  for(const [flag,label] of [
    ['stage','large legacy journal acknowledges new result beyond candidate size and count limits'],
    ['pageBound','write readback scans all originals in pages of at most 32'],
    ['full','full history read restores every large legacy original exactly'],
    ['fullPages','full history also uses a consistent bounded page scan'],
    ['slim','activity receipt projection retains all settled records without checkpoint fields'],
    ['slimPages','receipt projection validates entire history with the same bounded pages'],
    ['slimCancel','cancelled receipt projection returns no partial trusted records'],
    ['slimQuarantine','receipt projection excludes quarantine while all physical originals remain'],
    ['retained','large history retains every physical record'],
    ['damage','damaged final page prevents trusted receipt and partial history'],
    ['cancel','cancelled later readback page cannot acknowledge and exact retry preserves baseline'],
    ['noPartial','failed second page never returns partial trusted history'],
  ])check(largeHistory[flag]===true,label);

  // Exercise the actual activity-history reader, including its profile lock,
  // against valid receipts in the isolated browser, not merely a codec fixture.
  const activityProjection=await js(`(async()=>{
    const progress=await import('/src/lib/progression.ts'), game=await import('/src/lib/game.ts');
    const journal=await import('/src/lib/workoutJournal.ts'), history=await import('/src/lib/activityHistory.ts');
    let profile={profileId:'qa-history-projection',xp:0,coins:0,creditedWorkoutIds:[],workouts:[],game:{...game.freshGame(),created:true}};
    const rows=[],base='recovery checkpoint '.repeat(1024);
    for(let i=0;i<65;i++){
      const sessionId='qa-projection-'+i,date=new Date(Date.UTC(2026,10,20,0,i));
      profile=progress.addCompletedWorkout(profile,32000,date,{sessionId,mode:'training'});
      const entry=journal.resultJournalEntry({schemaVersion:1,profileId:profile.profileId,sessionId,mode:'training',
        floor:null,durationMs:32000,finishedAt:date.toISOString(),repetitions:20});
      if(!entry)throw Error('invalid projection fixture');
      rows.push({schemaVersion:1,key:entry.key,raw:entry.raw,baseProfileRaw:base,state:'settled'});
    }
    await resetDB();await mod.readDurableJournal();
    const db=await openNative();
    try{await new Promise((resolve,reject)=>{
      const tx=db.transaction('results','readwrite',{durability:'strict'}),store=tx.objectStore('results');
      tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);rows.forEach(row=>store.add(row));
    })}finally{db.close()}
    const key=progress.STORAGE_KEY,raw=JSON.stringify(profile),prior=localStorage.getItem(key);
    localStorage.setItem(key,raw);
    const native=IDBDatabase.prototype.transaction;
    let writes=0;
    IDBDatabase.prototype.transaction=function(...args){
      if(this.name===dbName&&args[1]==='readwrite')writes++;
      return native.apply(this,args);
    };
    try{
      const loaded=progress.loadProfileState();
      if(loaded.status!=='ready')throw Error('profile fixture not ready');
      const signal=new AbortController().signal;
      const view=await history.readActivityHistory(loaded.profile,signal);
      const full=history.indexActivityHistory(raw,loaded.profile,await mod.readDurableJournal());
      const cancelled=await history.readActivityHistory(loaded.profile,AbortSignal.abort());
      return {complete:view.complete===true&&view.expectedCount===65&&view.restoredCount===5&&view.records.length===65,
        exact:JSON.stringify(view)===JSON.stringify(full),noWrites:writes===0&&localStorage.getItem(key)===raw,
        cancel:cancelled.complete===false&&cancelled.restoredCount===0&&cancelled.records.length===60};
    }finally{
      IDBDatabase.prototype.transaction=native;
      if(prior===null)localStorage.removeItem(key);else localStorage.setItem(key,prior);
      await resetDB();await mod.readDurableJournal();
    }
  })()`);
  console.log('ACTIVITY_RECEIPT_PROJECTION',JSON.stringify(activityProjection));
  for(const [flag,label] of [
    ['complete','actual activity reader restores every paid historical result'],
    ['exact','receipt-only activity reader agrees exactly with full original history'],
    ['noWrites','activity reader never writes journal or profile'],
    ['cancel','cancelled activity reader retains conservative visible history'],
  ])check(activityProjection[flag]===true,label);
  await test(`(async()=>{const result=await mod.stageDurableResults([entry],null);const db=await openNative(2);db.close();return result.status==='saved'})()`, 'module releases every handle so a later version upgrade is unblocked');

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
  })()`,'unrecognized native v2 layout blocks journal readers and writers without altering records');

  // Production facade recognizes only an explicitly prepared keyed v2 layout.
  // This harness owns a disposable browser profile; never run on owner data.
  const keyedV2=await js(`(async()=>{
    const v=await import('/src/lib/durableJournalV2.ts');
    const schema=await import('/src/lib/durableJournalSchema.ts');
    const result={},prefix='bodyforge:pilot:v1:result:v2-key-';
    const inputs=Array.from({length:4},(_,i)=>({key:prefix+i,raw:'exact-'+i}));
    const base='repeat checkpoint '.repeat(2400)+'\\ud800';
    await resetDB();
    result.absent=(await v.prepareVersionedJournal()).status==='invalid';
    await mod.readDurableJournal();
    if((await mod.stageDurableResults(inputs.slice(0,2),base)).status!=='saved'||
      (await mod.markDurableResults([inputs[0]],'settled')).status!=='saved')throw Error('legacy fixture failed');
    const before=await directRows(),blocker=await openNative();
    let blocked;
    try{blocked=await v.prepareVersionedJournal()}finally{blocker.close()}
    const unchanged=await openNative();
    result.blocked=blocked.status==='unavailable'&&unchanged.version===1;unchanged.close();
    result.before=JSON.stringify(await directRows())===JSON.stringify(before);
    const upgraded=await v.prepareVersionedJournal(),db=await openNative(2);
    const native=IDBDatabase.prototype.transaction,put=IDBObjectStore.prototype.put;
    const readPhysical=async()=>new Promise((resolve,reject)=>{
      const tx=native.call(db,['results',schema.DURABLE_META_STORE],'readonly');
      const rows=tx.objectStore('results').getAll(),meta=tx.objectStore(schema.DURABLE_META_STORE).get('state');
      tx.oncomplete=()=>resolve({rows:rows.result,revision:meta.result.revision});
      tx.onabort=()=>reject(tx.error);
    });
    try{
      const physical=await readPhysical(),read=await mod.readDurableJournal();
      result.prepare=upgraded.status==='prepared'&&upgraded.versionConfirmed===2&&physical.revision===0&&
        JSON.stringify(physical.rows)===JSON.stringify(before)&&read.status==='ready'&&read.entries.length===2;
      result.repeat=(await v.prepareVersionedJournal()).status==='already-prepared'&&(await readPhysical()).revision===0;
      let oldRejected=false;
      try{const old=await openNative(1);old.close()}catch(e){oldRejected=e.name==='VersionError'}
      result.fence=oldRejected;
      const maintenance=await v.maintainVersionedJournal(db,[inputs[0].key],'compact'),packed=await readPhysical();
      const exact=(await mod.readDurableJournal()).entries;
      result.compact=maintenance.status==='saved'&&maintenance.count===1&&packed.revision===1&&packed.rows.length===2&&
        packed.rows[0].key===inputs[0].key&&packed.rows[0].schemaVersion===2&&exact[0].baseProfileRaw===base&&exact[0].raw===inputs[0].raw;
      const again=await v.maintainVersionedJournal(db,[inputs[0].key],'compact');
      result.noRewrite=again.status==='unchanged'&&again.count===0&&(await readPhysical()).revision===1;
      const settled=await mod.markDurableResults([inputs[1]],'settled');
      result.settle=settled.status==='saved'&&settled.entries[0].baseProfileRaw===base&&
        (await readPhysical()).rows.every(row=>row.schemaVersion===2);
      const stage=await mod.stageDurableResults([inputs[2]],'new');
      const duplicate=await mod.stageDurableResults([inputs[0]],'ignored');
      result.stage=stage.status==='saved'&&stage.entries[0].state==='active'&&duplicate.status==='saved'&&
        duplicate.entries[0].baseProfileRaw===base&&duplicate.entries[0].state==='settled';
      const rev=(await readPhysical()).revision;
      const bad=await mod.stageDurableResults([inputs[3],{...inputs[0],raw:'different'}],null);
      result.conflict=bad.status==='invalid'&&(await readPhysical()).revision===rev&&(await readPhysical()).rows.length===3;
      IDBObjectStore.prototype.put=function(...args){
        const r=put.apply(this,args);
        if(this.name==='results'&&args[0]?.key===inputs[0].key)r.addEventListener('success',()=>this.transaction.abort(),{once:true});
        return r;
      };
      let aborted;
      try{aborted=await mod.markDurableResults([inputs[0]],'quarantined')}finally{IDBObjectStore.prototype.put=put}
      const rolled=await readPhysical();
      result.abort=aborted.status==='unavailable'&&rolled.revision===rev&&rolled.rows[0].schemaVersion===2;
      const quarantine=await mod.markDurableResults([inputs[0]],'quarantined'),after=await readPhysical();
      result.quarantine=quarantine.status==='saved'&&quarantine.entries[0].baseProfileRaw===base&&
        after.rows[0].schemaVersion===1&&after.rows[0].state==='quarantined'&&
        (await mod.markDurableResults([inputs[0]],'settled')).status==='invalid';
      const restored=await v.maintainVersionedJournal(db,[inputs[1].key],'restore');
      result.restore=restored.status==='saved'&&restored.count===1&&
        (await readPhysical()).rows[1].schemaVersion===1&&(await mod.readDurableJournal()).entries[1].baseProfileRaw===base;
      const slim=await mod.readDurableHistoryReceipts();
      result.projection=slim.status==='ready'&&slim.entries.length===1&&slim.entries[0].key===inputs[1].key&&
        !('baseProfileRaw' in slim.entries[0]);
      const prior=(await readPhysical()).revision;
      result.refuseMaintenance=(await v.maintainVersionedJournal(db,[inputs[1].key,inputs[2].key],'compact')).status==='invalid'&&
        (await readPhysical()).revision===prior;
      let committed=false,readFault=false;
      IDBDatabase.prototype.transaction=function(...args){
        if(this.name===dbName&&args[1]==='readonly'&&committed&&!readFault){readFault=true;throw Error('QA lost readback')}
        const tx=native.apply(this,args);
        if(this.name===dbName&&args[1]==='readwrite')tx.addEventListener('complete',()=>{committed=true},{once:true});
        return tx;
      };
      let lost;
      try{lost=await mod.stageDurableResults([inputs[3]],null)}finally{IDBDatabase.prototype.transaction=native}
      const recovered=await mod.stageDurableResults([inputs[3]],'different baseline');
      result.readback=lost.status==='unavailable'&&readFault&&recovered.status==='saved'&&recovered.entries[0].baseProfileRaw===null;
      const huge={key:prefix+'huge',raw:'large'},big='x'.repeat(2*1024*1024+7);
      const largeStage=await mod.stageDurableResults([huge],big),largeSettled=await mod.markDurableResults([huge],'settled');
      result.fallback=largeStage.status==='saved'&&largeSettled.status==='saved'&&largeSettled.entries[0].baseProfileRaw===big&&
        (await readPhysical()).rows.find(row=>row.key===huge.key)?.schemaVersion===1;
      // A cooperating writer changes an unrelated result and revision before
      // strict CAS. The original selection cannot be committed.
      let injected=false;
      IDBDatabase.prototype.transaction=function(...args){
        if(this.name===dbName&&args[1]==='readwrite'&&!injected){
          injected=true;
          const other=native.call(db,['results',schema.DURABLE_META_STORE],'readwrite',{durability:'strict'});
          const meta=other.objectStore(schema.DURABLE_META_STORE),r=meta.get('state');
          r.onsuccess=()=>{meta.put({...r.result,revision:r.result.revision+1});
            other.objectStore('results').add({schemaVersion:1,key:prefix+'concurrent',raw:'other',baseProfileRaw:null,state:'active'})};
        }
        return native.apply(this,args);
      };
      const race={key:prefix+'not-written',raw:'new'};
      let stale;
      try{stale=await mod.stageDurableResults([race],null)}finally{IDBDatabase.prototype.transaction=native}
      const post=await readPhysical();
      result.cas=injected&&stale.status==='unavailable'&&post.rows.some(row=>row.key===prefix+'concurrent')&&
        !post.rows.some(row=>row.key===race.key);
    }finally{IDBDatabase.prototype.transaction=native;IDBObjectStore.prototype.put=put;db.close()}
    await resetDB();await mod.readDurableJournal();
    await directPut({schemaVersion:99,key:prefix+'bad',raw:'bad',baseProfileRaw:null,state:'settled'});
    const refused=await v.prepareVersionedJournal(),old=await openNative();
    try{result.invalidUpgrade=refused.status==='invalid'&&old.version===1&&
      old.objectStoreNames.length===1&&(await directRows())[0].schemaVersion===99}finally{old.close()}
    await resetDB();await mod.readDurableJournal();
    return result;
  })()`);
  console.log('KEYED_V2_SAMPLE',JSON.stringify(keyedV2));
  for(const [flag,label] of [
    ['absent','explicit v2 preparation refuses absent database'],
    ['blocked','blocked version change cannot upgrade later without a new request'],
    ['before','blocked preparation leaves original records exact'],
    ['prepare','native v2 preparation preserves every v1 original and exposes compatible facade'],
    ['repeat','prepared schema is idempotent without revision mutation'],
    ['fence','native v1 opens remain fenced after recognized v2 preparation'],
    ['compact','bounded existing settlement compacts under the same original key'],
    ['noRewrite','repeated compaction never rewrites a compact original'],
    ['settle','normal v2 settlement compresses exact checkpoint'],
    ['stage','normal v2 stage and compact terminal retry retain original state and baseline'],
    ['conflict','conflicting v2 batch changes neither revision nor records'],
    ['abort','aborted v2 rewrite rolls back result and revision together'],
    ['quarantine','compact quarantine materializes original and cannot be revived'],
    ['restore','explicit v2 inverse restores original physical record'],
    ['projection','v2 activity projection excludes active and quarantined receipts'],
    ['refuseMaintenance','maintenance refuses mixed settled and active inputs atomically'],
    ['readback','lost v2 acknowledgement is unavailable and exact retry retains baseline'],
    ['fallback','oversized v2 checkpoint remains an exact uncompressed original'],
    ['cas','stale v2 revision refuses selected write without overwriting a competing result'],
    ['invalidUpgrade','invalid legacy record aborts schema change and retains original'],
  ])check(keyedV2[flag]===true,label);

  const keyedV2Large=await js(`(async()=>{
    const v=await import('/src/lib/durableJournalV2.ts'),schema=await import('/src/lib/durableJournalSchema.ts');
    const prefix='bodyforge:pilot:v1:result:v2-large-',count=4105,base='checkpoint-original '.repeat(1900);
    const rows=Array.from({length:count},(_,i)=>({schemaVersion:1,key:prefix+String(i).padStart(5,'0'),
      raw:'result-'+i,baseProfileRaw:i<520?base:null,state:'settled'}));
    const legacy=await openNative();
    try{await new Promise((resolve,reject)=>{const tx=legacy.transaction('results','readwrite',{durability:'strict'});
      rows.forEach(row=>tx.objectStore('results').add(row));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)})}finally{legacy.close()}
    if((await v.prepareVersionedJournal()).status!=='prepared')throw Error('large preparation failed');
    const db=await openNative(2),native=IDBDatabase.prototype.transaction,oldGet=IDBObjectStore.prototype.getAll,result={};
    try{
      const packed=await v.maintainVersionedJournal(db,rows.slice(0,8).map(row=>row.key),'compact');
      const newRow={key:prefix+'new',raw:'new result'};
      const stage=await mod.stageDurableResults([newRow],null);
      result.large=packed.status==='saved'&&packed.count===8&&stage.status==='saved'&&stage.entries.length===1;
      let pages=0,bounded=true;
      IDBObjectStore.prototype.getAll=function(...args){
        if(this.transaction.db.name===dbName&&this.name==='results'){pages++;if(args[1]!==32)bounded=false}
        return oldGet.apply(this,args);
      };
      let full,slim;
      try{full=await mod.readDurableJournal();slim=await mod.readDurableHistoryReceipts()}finally{IDBObjectStore.prototype.getAll=oldGet}
      result.full=full.status==='ready'&&full.entries.length===count+1&&full.entries.slice(0,count).every((row,i)=>
        row.key===rows[i].key&&row.raw===rows[i].raw&&row.baseProfileRaw===rows[i].baseProfileRaw&&row.state==='settled');
      result.pages=bounded&&pages===2*(Math.floor((count+1)/32)+1)&&slim.status==='ready'&&slim.entries.length===count&&
        slim.entries.every(row=>!('baseProfileRaw' in row));
      let readPages=0,injected=false;
      IDBObjectStore.prototype.getAll=function(...args){
        if(this.transaction.db.name===dbName&&this.name==='results'&&++readPages===2){
          injected=true;
          const competing=native.call(db,['results',schema.DURABLE_META_STORE],'readwrite',{durability:'strict'});
          const meta=competing.objectStore(schema.DURABLE_META_STORE),req=meta.get('state');
          req.onsuccess=()=>{meta.put({...req.result,revision:req.result.revision+1});
            competing.objectStore('results').add({schemaVersion:1,key:prefix+'race',raw:'competing',baseProfileRaw:null,state:'active'})};
        }
        return oldGet.apply(this,args);
      };
      let drift;
      try{drift=await mod.readDurableHistoryReceipts()}finally{IDBObjectStore.prototype.getAll=oldGet}
      const current=await mod.readDurableJournal();
      result.drift=injected&&drift.status==='unavailable'&&drift.entries.length===0&&current.status==='ready'&&
        current.entries.length===count+2;
      await new Promise((resolve,reject)=>{
        const tx=native.call(db,['results',schema.DURABLE_META_STORE],'readwrite',{durability:'strict'});
        const store=tx.objectStore('results'),r=store.get(rows[0].key),meta=tx.objectStore(schema.DURABLE_META_STORE),m=meta.get('state');
        r.onsuccess=()=>{const value=r.result;new Uint8Array(value.batch.checkpointData)[0]^=255;store.put(value)};
        m.onsuccess=()=>meta.put({...m.result,revision:m.result.revision+1});
        tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
      });
      const damaged=await mod.readDurableJournal(),damagedSlim=await mod.readDurableHistoryReceipts();
      result.corrupt=damaged.status==='unavailable'&&damaged.entries.length===0&&damagedSlim.status==='unavailable'&&damagedSlim.entries.length===0;
      return result;
    }finally{IDBDatabase.prototype.transaction=native;IDBObjectStore.prototype.getAll=oldGet;db.close();await resetDB()}
  })()`);
  console.log('KEYED_V2_LARGE_SAMPLE',JSON.stringify(keyedV2Large));
  for(const [flag,label] of [
    ['large','keyed v2 accepts new training beyond original candidate aggregate limits'],
    ['full','large v2 mixed history reconstructs every original exactly'],
    ['pages','large v2 reads remain paged and activity projection omits checkpoints'],
    ['drift','revision change between v2 pages refuses partial history'],
    ['corrupt','damaged compressed v2 checkpoint blocks all trusted history views'],
  ])check(keyedV2Large[flag]===true,label);

  // Activation is intentionally not exposed by the UI. Exercise its guarded
  // API on an isolated real database with a genuine paid workout and backup.
  const activation=await js(`(async()=>{
    const v=await import('/src/lib/durableJournalV2.ts'),p=await import('/src/lib/progression.ts');
    const {freshGame}=await import('/src/lib/game.ts');
    const {withProfileWriteLock}=await import('/src/lib/profileLock.ts');
    const {prepareProgressBackup}=await import('/src/lib/progressBackup.ts');
    const {prepareWorkoutSession}=await import('/src/lib/workoutJournal.ts');
    const {replayDurableWorkouts}=await import('/src/lib/durableWorkout.ts');
    const result={},epoch='bodyforge:pilot:v1:epoch',key='bodyforge:pilot:v1';
    const local=()=>JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]));
    async function fixture(){
      await resetDB();localStorage.clear();
      const saved=await withProfileWriteLock(async()=>{
        const profile=p.parseProfile({profileId:'activation-qa',xp:0,coins:0,creditedWorkoutIds:[],workouts:[],
          game:{...freshGame(),created:true,nickname:'ACTIVATION QA'}});
        const receipt=p.saveProfile(profile,{expectedRaw:null});
        if(receipt.status!=='saved')throw Error('activation profile fixture failed');
        const session=prepareWorkoutSession(receipt.revision,'training');
        if(session.status!=='ready')throw Error('activation session fixture failed');
        const completed={...session.session,durationMs:42000,finishedAt:'2026-11-25T10:00:00.000Z',repetitions:20};
        const replay=await replayDurableWorkouts(completed,{signal:new AbortController().signal,isCurrent:()=>true});
        if(replay.status!=='saved'||replay.state.profile.xp!==120||replay.state.profile.coins!==35)throw Error('activation paid result fixture failed');
      });
      if(saved.status!=='completed')throw Error('activation fixture lock failed');
      const backup=await prepareProgressBackup(p.loadProfileState().profile,null);
      const rows=await directRows();
      if(!backup.complete||rows.length!==1||rows[0].state!=='settled'||!rows[0].baseProfileRaw)throw Error('activation fixture backup incomplete');
      return {json:backup.json,rows,local:local()};
    }
    const f=await fixture(),prepare=()=>v.planJournalActivation(f.json);
    const initial=await prepare();
    result.preflight=initial.status==='ready'&&initial.plan.version===1&&initial.plan.records===1&&Object.isFrozen(initial.plan)&&
      JSON.stringify(await directRows())===JSON.stringify(f.rows)&&local()===f.local;
    if(initial.status!=='ready')throw Error('activation preflight fixture: '+JSON.stringify(initial));
    const fake={...initial.plan};
    result.fake=(await v.activateJournalFromBackup(fake,'activate')).status==='stale';
    result.cancel=(await v.activateJournalFromBackup(initial.plan,'cancel')).status==='cancelled'&&
      (await v.activateJournalFromBackup(initial.plan,'activate')).status==='stale';
    const bad=JSON.parse(f.json);bad.durableResults[0].baseProfileRaw+='changed';
    const changed=await v.planJournalActivation(JSON.stringify(bad));
    result.checkpoint=changed.status==='blocked'&&changed.reason==='stale';
    const incomplete=JSON.parse(f.json);incomplete.complete=false;
    const pending=JSON.parse(f.json);pending.pendingResult={invalid:true};
    result.invalid=(await v.planJournalActivation(JSON.stringify(incomplete))).status==='blocked'&&
      (await v.planJournalActivation(JSON.stringify(pending))).status==='blocked'&&
      (await v.planJournalActivation('{broken')).status==='blocked';
    const wrong=JSON.parse(f.json);wrong.storedProfileRaw=JSON.stringify({...JSON.parse(wrong.storedProfileRaw),coins:999});
    result.wallet=(await v.planJournalActivation(JSON.stringify(wrong))).status==='blocked';
    const pendingKey=key+':result:qa-block';
    localStorage.setItem(pendingKey,'opaque');
    result.pending=(await prepare()).status==='blocked';localStorage.removeItem(pendingKey);
    localStorage.setItem(key+':replace-pending:v1','opaque');
    result.replacement=(await prepare()).status==='blocked';localStorage.removeItem(key+':replace-pending:v1');
    const epochPlan=await prepare();
    if(epochPlan.status!=='ready')throw Error('epoch fixture failed');
    localStorage.setItem(epoch,'b5c62a24-a3f1-4ad0-91a6-f38b3bafc0de');
    result.epoch=(await v.activateJournalFromBackup(epochPlan.plan,'activate')).status==='stale';
    localStorage.removeItem(epoch);
    const stale=await prepare();
    if(stale.status!=='ready')throw Error('stale fixture failed');
    await directPut({...f.rows[0],baseProfileRaw:f.rows[0].baseProfileRaw+'changed'});
    result.drift=(await v.activateJournalFromBackup(stale.plan,'activate')).status==='stale'&&
      (await directRows())[0].baseProfileRaw.endsWith('changed');
    await directPut(f.rows[0]);
    const cursorPlan=await prepare();
    if(cursorPlan.status!=='ready')throw Error('cursor fixture failed');
    const cursor=IDBObjectStore.prototype.openCursor;
    let injected=false;
    IDBObjectStore.prototype.openCursor=function(...args){
      if(this.name==='results'&&this.transaction.mode==='versionchange'){
        injected=true;this.put({...f.rows[0],baseProfileRaw:'changed inside versionchange'});
      }
      return cursor.apply(this,args);
    };
    let conflict;
    try{conflict=await v.activateJournalFromBackup(cursorPlan.plan,'activate')}finally{IDBObjectStore.prototype.openCursor=cursor}
    result.transaction=injected&&conflict.status==='stale'&&JSON.stringify(await directRows())===JSON.stringify(f.rows)&&local()===f.local;
    const blockedPlan=await prepare();
    if(blockedPlan.status!=='ready')throw Error('blocked fixture failed');
    const held=await openNative();
    let blocked;
    try{blocked=await v.activateJournalFromBackup(blockedPlan.plan,'activate')}finally{held.close()}
    const still=await openNative();
    result.blocked=blocked.status==='unavailable'&&still.version===1;still.close();
    const abortedPlan=await prepare(),abort=new AbortController();
    if(abortedPlan.status!=='ready')throw Error('abort fixture failed');
    abort.abort();
    result.aborted=(await v.activateJournalFromBackup(abortedPlan.plan,'activate',abort.signal)).status==='cancelled';
    const plan=await prepare();
    if(plan.status!=='ready')throw Error('activation final fixture failed');
    const upgraded=await v.activateJournalFromBackup(plan.plan,'activate');
    const upgradedRows=await mod.readDurableJournal();
    const db=await openNative(2);
    try{
      const meta=await new Promise((resolve,reject)=>{
        const tx=db.transaction('journal-meta','readonly'),req=tx.objectStore('journal-meta').get('state');
        tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error);
      });
      result.activate=upgraded.status==='prepared'&&upgraded.versionConfirmed===2&&meta.revision===0&&
        JSON.stringify(upgradedRows.entries)===JSON.stringify(f.rows.map(({schemaVersion,...row})=>row))&&local()===f.local;
    }finally{db.close()}
    result.repeat=(await v.activateJournalFromBackup(plan.plan,'activate')).status==='stale'&&(await prepare()).status==='blocked';
    const second=await fixture(),readbackPlan=await v.planJournalActivation(second.json);
    if(readbackPlan.status!=='ready')throw Error('readback fixture failed');
    const tx=IDBDatabase.prototype.transaction;
    let fault=false;
    IDBDatabase.prototype.transaction=function(...args){
      if(this.name===dbName&&this.version===2&&args[1]==='readonly'){fault=true;throw Error('QA lost readback')}
      return tx.apply(this,args);
    };
    let unverified;
    try{unverified=await v.activateJournalFromBackup(readbackPlan.plan,'activate')}finally{IDBDatabase.prototype.transaction=tx}
    const confirmed=await openNative(2);confirmed.close();
    result.unverified=fault&&unverified.status==='unverified'&&unverified.versionConfirmed===null&&
      (await mod.readDurableJournal()).entries[0].baseProfileRaw===second.rows[0].baseProfileRaw&&local()===second.local;
    await resetDB();
    const absent=await v.planJournalActivation(second.json);
    result.absent=absent.status==='blocked'&&!(await indexedDB.databases()).some(db=>db.name===dbName)&&local()===second.local;
    localStorage.clear();return result;
  })()`);
  console.log('ACTIVATION_FENCE_SAMPLE',JSON.stringify(activation));
  for(const [flag,label] of [
    ['preflight','activation preflight is read-only and binds an immutable plan to exact paid originals'],
    ['fake','fabricated activation plan has no write authority'],
    ['cancel','explicit cancel consumes activation plan with no migration'],
    ['checkpoint','backup checkpoint byte mismatch blocks preparation'],
    ['invalid','incomplete pending and malformed backup files cannot authorize migration'],
    ['wallet','different backup wallet is refused'],
    ['pending','unresolved local workout blocks migration'],
    ['replacement','interrupted replacement blocks migration'],
    ['epoch','changed profile lineage invalidates confirmation'],
    ['drift','changed durable checkpoint invalidates confirmation without overwriting it'],
    ['transaction','drift inside native versionchange aborts upgrade and original bytes remain exact'],
    ['blocked','blocked upgrade cannot migrate after caller refusal'],
    ['aborted','pre-aborted activation cannot migrate'],
    ['activate','confirmed exact backup activates v2 metadata only and preserves wallet and original rows'],
    ['repeat','activation token cannot be replayed and v2 cannot issue a legacy plan'],
    ['unverified','lost post-upgrade readback reports unverified even when native version committed'],
    ['absent','read-only activation preflight never creates a missing journal'],
  ])check(activation[flag]===true,label);
  console.log('BODYFORGE_DURABLE_JOURNAL_PASS', JSON.stringify({ assertions, actualIndexedDB: true, strictReadwrite: true }));
} catch (error) {
  console.error('BODYFORGE_DURABLE_JOURNAL_FAIL', error.stack || String(error)); process.exitCode = 22;
} finally {
  socket?.close();
  for (const request of requests.values()) { clearTimeout(request.timer); request.reject(Error('Owned QA stopped')); }
  requests.clear();
  try { await cleanupOwnedChrome(ownedProfile, 'bf-durable-journal-', chrome, browser); }
  catch (error) { console.error('QA_OWNED_CLEANUP FAIL', String(error)); process.exitCode ||= 23; }
}
