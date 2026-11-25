// Actual IndexedDB, disposable Chrome profile. No App, camera, owner data or network writes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('Loopback QA origin required');
const ownedProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-durable-journal-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + ownedProfile, 'about:blank',
], { stdio: 'ignore', windowsHide: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket, sequence = 0, assertions = 0, browserSocket;
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
  let port;
  for (let i = 0; i < 150; i++) {
    const file = path.join(ownedProfile, 'DevToolsActivePort');
    if (fs.existsSync(file)) { port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]); break; }
    if (chrome.exitCode !== null) throw Error('Owned Chrome exited ' + chrome.exitCode);
    await sleep(100);
  }
  if (!port) throw Error('Owned DevTools unavailable');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(targets.find((entry) => entry.type === 'page').webSocketDebuggerUrl);
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
  await test("(async()=>{const r=await mod.stageDurableResults([{...entry,raw:'different'}],null);return r.status==='invalid'&&(await mod.readDurableJournal()).entries[0].raw===entry.raw})()", 'same key cannot replace immutable raw bytes');
  await test("(async()=>{const r=await mod.stageDurableResults([extra,{...entry,raw:'different'}],null);return r.status==='invalid'&&(await mod.readDurableJournal()).entries.length===1})()", 'conflicting batch aborts atomically before creating another row');
  await test("(async()=>{const r=await mod.stageDurableResults([extra,{...extra,raw:'different'}],null);return r.status==='invalid'&&(await mod.readDurableJournal()).entries.length===1})()", 'conflicting duplicate inside a batch writes nothing');
  await test("(async()=>{return(await mod.stageDurableResults([{key:'wrong-prefix',raw:'x'}],null)).status==='invalid'&&(await mod.stageDurableResults([extra],17)).status==='invalid'})()", 'invalid key and baseline types fail closed');
  await test("(async()=>{return(await mod.markDurableResults([entry],'settled')).status==='saved'&&(await mod.readDurableJournal()).entries[0].state==='settled'})()", 'settlement retains the durable record');
  await test("(async()=>{return(await mod.stageDurableResults([entry],'changed')).status==='saved'&&(await mod.readDurableJournal()).entries[0].state==='settled'})()", 'staging never reactivates settled rows');
  await test("(async()=>{return(await mod.markDurableResults([entry],'quarantined')).status==='saved'&&(await mod.readDurableJournal()).entries[0].state==='quarantined'})()", 'quarantine is durable and retains original bytes');
  await test("(async()=>{return(await mod.stageDurableResults([entry],null)).status==='saved'&&(await mod.readDurableJournal()).entries[0].state==='quarantined'})()", 'staging never reactivates quarantine');
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
  await js("await resetDB(); await mod.readDurableJournal(); true");
  await test(`(async()=>{const held=await openNative();let unblocked;const deleted=new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(dbName);r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>unblocked=true});while(!unblocked)await new Promise(r=>setTimeout(r,10));const start=performance.now(),read=await mod.readDurableJournal(),elapsed=performance.now()-start;held.close();await deleted;await new Promise(r=>setTimeout(r,100));const next=await mod.readDurableJournal();return read.status==='unavailable'&&elapsed>=4500&&elapsed<7000&&next.status==='ready'&&next.entries.length===0})()`, 'blocked opening times out, closes late handles and permits clean recovery');
  await test(`(async()=>{const held=await openNative();let blocked=false;const deleted=new Promise(resolve=>{const r=indexedDB.deleteDatabase(dbName);r.onsuccess=resolve;r.onblocked=()=>blocked=true});while(!blocked)await new Promise(r=>setTimeout(r,10));const c=new AbortController();setTimeout(()=>c.abort(),50);const start=performance.now(),result=await mod.stageDurableResults([extra],null,c.signal),elapsed=performance.now()-start;held.close();await deleted;await new Promise(r=>setTimeout(r,100));const rows=await mod.readDurableJournal();return result.status==='unavailable'&&elapsed<1000&&rows.status==='ready'&&rows.entries.length===0})()`, 'cancelled blocked open never performs a delayed hidden write');
  await test(`(async()=>{const result=await mod.stageDurableResults([entry],null);const db=await openNative(2);db.close();return result.status==='saved'})()`, 'module releases every handle so a later version upgrade is unblocked');
  console.log('BODYFORGE_DURABLE_JOURNAL_PASS', JSON.stringify({ assertions, actualIndexedDB: true, strictReadwrite: true }));
} catch (error) {
  console.error('BODYFORGE_DURABLE_JOURNAL_FAIL', error.stack || String(error)); process.exitCode = 22;
} finally {
  if (socket?.readyState === WebSocket.OPEN) void cdp('Browser.close').catch(() => {});
  const end = Date.now() + 5000;
  while (chrome.exitCode === null && Date.now() < end) await sleep(100);
  socket?.close(); browserSocket?.close();
  for (const request of requests.values()) { clearTimeout(request.timer); request.reject(Error('Owned QA stopped')); }
  if (chrome.exitCode === null) { chrome.kill(); await sleep(500); }
  if (path.dirname(ownedProfile) !== os.tmpdir() || !path.basename(ownedProfile).startsWith('bf-durable-journal-')) throw Error('Unexpected cleanup target');
  try { fs.rmSync(ownedProfile, { recursive: true, force: true }); }
  catch { console.error('TEMP_CLEANUP_BLOCKED', ownedProfile); process.exitCode ||= 23; }
}
