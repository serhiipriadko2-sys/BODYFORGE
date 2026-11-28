// BF-604: actual generated worker code against a disposable synthetic shell.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {offlineManifestForFiles,renderOfflineWorker,OFFLINE_WORKER_FILE} from './offline-worker-build.mjs';
import {waitForOwnedBrowser,newOwnedPage,closeOwnedPage,cleanupOwnedChrome} from './owned-chrome.mjs';

const root=path.resolve(import.meta.dirname,'..');
const prefix='bf-offline-shell-';
const workerPath='/'+OFFLINE_WORKER_FILE;
const entryPath='/assets/index-Abcd_123.js';
const saveKey='bodyforge:qa:offline-worker';
const saveValue=JSON.stringify({xp:375,coins:140,zones:{biceps:3},fixture:true});
const script='document.body.dataset.ready="yes";';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let checks=0,stage='inputs',server,chrome,profile,identity,ws,secondSocket,origin,seq=0,cleanup=false;
let selected=0,online=true,corrupt=false,workerOverride=null;
const pending=new Map(),requests=[],offlineRequests=[],servedByWorker=new Set();
function check(ok,label){assert.ok(ok,label);checks++;console.log('PASS',label);}
function fixture(version){
  const files=new Map([
    ['/index.html',{type:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="connect-src \'self\'"><link rel="icon" href="/favicon.svg"><link rel="manifest" href="/manifest.webmanifest"></head><body data-version="'+version+'"><script src="'+entryPath+'"></script></body></html>'}],
    [entryPath,{type:'text/javascript; charset=utf-8',body:script}],
    ['/manifest.webmanifest',{type:'application/manifest+json',body:'{"name":"BODYFORGE QA","start_url":"/"}'}],
    ['/third-party-notices.txt',{type:'text/plain; charset=utf-8',body:'BODYFORGE / THIRD-PARTY NOTICES\nsynthetic fixture'}],
    ['/favicon.svg',{type:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#222"/></svg>'}],
  ]);
  const manifest=offlineManifestForFiles([...files].map(([key,f])=>({path:key.slice(1),bytes:Buffer.byteLength(f.body),sha256:sha(f.body)})),'shell');
  return {files,manifest};
}
function cdp(method,params={},timeout=15000,socket=ws){
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},timeout);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function js(expression,timeout=15000,socket=ws){
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},timeout,socket);
  if(r.exceptionDetails)throw Error('page evaluation failed');
  return r.result.value;
}
async function until(expression,label,timeout=30000,socket=ws){
  const end=Date.now()+timeout;
  while(Date.now()<end){try{if(await js(expression,15000,socket))return;}catch{}await pause(150);}
  throw Error('timeout '+label);
}
async function status(active=false){
  return js('(async()=>{const worker='+ (active?'(await navigator.serviceWorker.getRegistration())?.active':'navigator.serviceWorker.controller')+
    ';if(!worker)return null;return await new Promise(resolve=>{const c=new MessageChannel();const timer=setTimeout(()=>{c.port1.close();resolve(null)},6000);c.port1.onmessage=e=>{clearTimeout(timer);c.port1.close();resolve(e.data)};worker.postMessage("BODYFORGE_OFFLINE_STATUS_V1",[c.port2])})})()',10000);
}
async function update(expected){
  return js('(async()=>{const r=await navigator.serviceWorker.getRegistration();let states=[];const found=()=>{const w=r.installing;if(w){states.push(w.state);w.addEventListener("statechange",()=>states.push(w.state))}};r.addEventListener("updatefound",found);try{await r.update();const end=Date.now()+25000;while(Date.now()<end){if(states.includes('+JSON.stringify(expected)+')||('+JSON.stringify(expected)+'==="installed"&&r.waiting))return {states,waiting:!!r.waiting,active:r.active?.state};await new Promise(r=>setTimeout(r,100))}return {states,timeout:true}}finally{r.removeEventListener("updatefound",found)}})()',35000);
}
try{
  const variants=['one','two','three'].map(fixture);
  for(const v of variants)v.worker=await renderOfflineWorker(root,v.manifest);
  check(new Set(variants.map(v=>v.manifest.version)).size===3,'distinct manifests');
  stage='server';
  server=http.createServer((req,res)=>{
    const url=req.url;
    if(!online){
      offlineRequests.push({path:url,update:req.method==='GET'&&url===workerPath&&
        (req.headers['service-worker']==='script'||req.headers['sec-fetch-dest']==='serviceworker')});
      res.writeHead(503,{'Cache-Control':'no-store'});res.end('offline fixture');return;
    }
    requests.push({path:url,method:req.method});
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    if(url===workerPath){
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(variants[workerOverride??selected].worker);return;
    }
    const file=variants[selected].files.get(url==='/'?'/index.html':url);
    if(!file){res.writeHead(404,{'Cache-Control':'no-store'});res.end();return;}
    const body=corrupt&&url==='/index.html'?variants[0].files.get('/index.html').body:file.body;
    res.writeHead(200,{'Content-Type':file.type,'Cache-Control':'no-store','Content-Length':Buffer.byteLength(body),'X-Content-Type-Options':'nosniff'});
    res.end(body);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  origin='http://127.0.0.1:'+server.address().port;
  stage='browser';
  profile=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),prefix));
  const executable=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  chrome=spawn(executable,[
    '--headless=new','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--no-proxy-server',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore',windowsHide:true});
  identity=await waitForOwnedBrowser(profile,chrome);
  const target=await newOwnedPage(identity);ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP open timeout')),5000);
    ws.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP open failed'))},{once:true});
  });
  const onMessage=e=>{
    const m=JSON.parse(e.data),q=pending.get(m.id);
    if(q){pending.delete(m.id);clearTimeout(q.timer);m.error?q.reject(Error('CDP command failed')):q.resolve(m.result);return;}
    if(m.method==='Network.responseReceived'&&m.params.response.fromServiceWorker)servedByWorker.add(m.params.response.url);
  };
  ws.addEventListener('message',onMessage);
  await cdp('Page.enable');await cdp('Network.enable');await cdp('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp('Page.navigate',{url:origin+'/'});
  await until('document.body?.dataset.ready==="yes"&&document.body?.dataset.version==="one"','initial shell');
  check(await js('!navigator.serviceWorker.controller'),'no automatic registration');
  await js('localStorage.setItem('+JSON.stringify(saveKey)+','+JSON.stringify(saveValue)+')');
  stage='install';
  await js('navigator.serviceWorker.register('+JSON.stringify(workerPath)+',{scope:"/",updateViaCache:"none"}).then(()=>true)');
  await until('(async()=>{const r=await navigator.serviceWorker.getRegistration();return r?.active?.state==="activated"})()','worker activated');
  const first=await status(true);
  check(first?.schema===1&&first.state==='ready'&&first.kind==='shell'&&first.version===variants[0].manifest.version&&first.count===5,'verified status from active worker before reload');
  check(await js('!navigator.serviceWorker.controller'),'no forced claim');
  await cdp('Page.reload',{ignoreCache:false});
  await until('navigator.serviceWorker.controller&&document.body?.dataset.ready==="yes"','controlled shell');
  check(servedByWorker.has(origin+'/')&&servedByWorker.has(origin+entryPath),'root and entry served by worker');
  const readSave=()=>js('localStorage.getItem('+JSON.stringify(saveKey)+')');
  check(await readSave()===saveValue,'installation preserved save');
  const cacheName='bodyforge-offline-v1-'+variants[0].manifest.version;
  stage='repair';
  await js('(async()=>{const c=await caches.open('+JSON.stringify(cacheName)+');await c.put('+JSON.stringify(origin+entryPath)+',new Response("corrupt"));return true})()');
  check((await status())?.state==='corrupt','corrupt cached asset detected');
  const before=requests.filter(r=>r.path===entryPath).length;
  check(await js('fetch('+JSON.stringify(entryPath)+',{cache:"no-store"}).then(r=>r.text())')===script,'exact online repair');
  check(requests.filter(r=>r.path===entryPath).length===before+1&&(await status())?.state==='ready','repair stored verified bytes');
  stage='second-controlled-tab';
  const secondTarget=await newOwnedPage(identity);secondSocket=new WebSocket(secondTarget.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('second CDP open timeout')),5000);
    secondSocket.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});secondSocket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('second CDP open failed'))},{once:true});});
  secondSocket.addEventListener('message',onMessage);
  await cdp('Page.navigate',{url:origin+'/'},15000,secondSocket);
  await until('!!navigator.serviceWorker.controller&&document.body?.dataset.version==="one"&&document.body?.dataset.ready==="yes"','second tab controlled by old worker',30000,secondSocket);
  check(await js('localStorage.getItem('+JSON.stringify(saveKey)+')',15000,secondSocket)===saveValue,'second controlled tab observes same synthetic save');
  stage='bad-update';selected=1;corrupt=true;
  const bad=await update('redundant');
  check(!bad.timeout&&bad.states.includes('redundant')&&!bad.waiting,'corrupt update rejected');
  check((await status())?.version===variants[0].manifest.version,'previous worker remains active');
  check(await js('caches.has('+JSON.stringify(cacheName)+')'),'previous cache retained');
  check(!await js('caches.has('+JSON.stringify('bodyforge-offline-v1-'+variants[1].manifest.version)+')'),'failed staging removed');
  check(await readSave()===saveValue,'failed update preserved save');
  stage='capacity-block';selected=2;corrupt=false;
  const blockedName='bodyforge-offline-v1-'+'f'.repeat(64);
  await js('caches.open('+JSON.stringify(blockedName)+').then(()=>true)');
  const blockedDownloads=requests.filter(r=>r.path!=='/bodyforge-offline.js').length;
  const blocked=await update('redundant');
  check(!blocked.timeout&&blocked.states.includes('redundant'),'third version rejected before staging');
  check(requests.filter(r=>r.path!=='/bodyforge-offline.js').length===blockedDownloads,'capacity block downloads no app assets');
  check((await status())?.version===variants[0].manifest.version&&await js('caches.has('+JSON.stringify(cacheName)+')'),'blocked update preserves active version');
  check(await js('caches.has('+JSON.stringify(blockedName)+')'),'unknown version cache is not deleted by install');
  check(await js('caches.delete('+JSON.stringify(blockedName)+')'),'remove only synthetic cap fixture');
  stage='good-update';
  const good=await update('installed');
  check(!good.timeout&&good.waiting&&(await status())?.version===variants[0].manifest.version,'valid update waits for old page');
  check(await readSave()===saveValue,'waiting update preserved save');
  check(await js('caches.has('+JSON.stringify(cacheName)+')'),'old cache retained while previous tab controls app');
  const foreignName='bodyforge-offline-v1-lookalike';
  await js('caches.open('+JSON.stringify(foreignName)+').then(c=>c.put("/foreign",new Response("keep")))');
  await js('caches.open('+JSON.stringify(blockedName)+').then(()=>true)');
  await cdp('Page.navigate',{url:'about:blank'});await pause(1700);
  check(await js('(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting&&!!navigator.serviceWorker.controller&&await caches.has('+JSON.stringify(cacheName)+'))()',15000,secondSocket),'second controlled tab prevents activation and old cache deletion');
  check(await js('document.body.dataset.version==="one"&&localStorage.getItem('+JSON.stringify(saveKey)+')==='+JSON.stringify(saveValue),15000,secondSocket),'old second tab stays playable with unchanged save');
  await closeOwnedPage(identity,secondTarget);secondSocket.close();secondSocket=undefined;await pause(1700);
  await cdp('Page.navigate',{url:origin+'/'});
  await until('navigator.serviceWorker.controller&&document.body?.dataset.ready==="yes"&&document.body?.dataset.version==="three"','new version');
  check((await status())?.version===variants[2].manifest.version,'new worker active');
  check(!await js('caches.has('+JSON.stringify(cacheName)+')'),'retired committed version pruned only after safe activation');
  check(await js('caches.has('+JSON.stringify(blockedName)+')'),'unknown exact-prefix version preserved at activation');
  check(await js('(async()=>{const c=await caches.open('+JSON.stringify(foreignName)+');return (await c.match("/foreign")).text()})()')==='keep','lookalike cache untouched');
  check(await readSave()===saveValue,'activation preserved save');
  stage='explicit-maintenance';
  const retired='bodyforge-offline-v1-'+variants[0].manifest.version;
  // Restore exact synthetic bytes of a retired fixture; never access player data.
  const retiredEntries=[...variants[0].files].map(([key,f])=>[origin+key,f.body]);
  retiredEntries.push([origin+'/__bodyforge_offline/commit/'+variants[0].manifest.version,JSON.stringify({schema:1,version:variants[0].manifest.version,kind:'shell',count:variants[0].manifest.entries.length})]);
  await js('(async()=>{const c=await caches.open('+JSON.stringify(retired)+');for(const [k,v] of '+JSON.stringify(retiredEntries)+')await c.put(k,new Response(v));return true})()');
  const askPrune='(async()=>{const w=navigator.serviceWorker.controller;return new Promise(resolve=>{const c=new MessageChannel();const t=setTimeout(()=>{c.port1.close();resolve(null)},30000);c.port1.onmessage=e=>{clearTimeout(t);c.port1.close();resolve(e.data)};w.postMessage("BODYFORGE_OFFLINE_PRUNE_V1",[c.port2])})})()';
  const extra=await newOwnedPage(identity);secondSocket=new WebSocket(extra.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('maintenance second CDP open timeout')),5000);secondSocket.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});secondSocket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('maintenance CDP open failed'))},{once:true});});
  secondSocket.addEventListener('message',onMessage);await cdp('Page.navigate',{url:origin+'/'},15000,secondSocket);
  await until('!!navigator.serviceWorker.controller&&document.body?.dataset.version==="three"','maintenance other tab',30000,secondSocket);
  check((await js(askPrune,35000))?.state==='blocked'&&await js('caches.has('+JSON.stringify(retired)+')'),'maintenance blocks with another controlled tab');
  await closeOwnedPage(identity,extra);secondSocket.close();secondSocket=undefined;await pause(1500);
  await js('(async()=>{const c=await caches.open('+JSON.stringify(retired)+');await c.put('+JSON.stringify(origin+'/index.html')+',new Response("forged"));return true})()');
  const forged=await js(askPrune,35000);check(forged?.state==='partial'&&forged.removed===0&&await js('caches.has('+JSON.stringify(retired)+')'),'plausible marker cannot authorize corrupted old bytes');
  await js('(async()=>{const c=await caches.open('+JSON.stringify(retired)+');for(const [k,v] of '+JSON.stringify(retiredEntries)+')await c.put(k,new Response(v));return true})()');
  const pruned=await js(askPrune,35000);check(pruned?.state==='partial'&&pruned.removed===1&&pruned.remaining===1&&!await js('caches.has('+JSON.stringify(retired)+')'),'confirmed maintenance removes only exact retired manifest');
  check(await js('caches.has('+JSON.stringify(blockedName)+')')&&await readSave()===saveValue,'unknown cache and save preserved');
  stage='offline';online=false;servedByWorker.clear();
  await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await cdp('Page.reload',{ignoreCache:false});
  await until('navigator.onLine===false&&navigator.serviceWorker.controller&&document.body?.dataset.ready==="yes"&&document.body?.dataset.version==="three"','offline reload');
  check((await status())?.state==='ready','offline status verified');
  check(servedByWorker.has(origin+'/')&&servedByWorker.has(origin+entryPath),'offline root and entry from cache');
  check(await readSave()===saveValue,'offline reload preserved save');
  check(await js('fetch("/third-party-notices.txt").then(r=>r.text())')==='BODYFORGE / THIRD-PARTY NOTICES\nsynthetic fixture','pinned notices readable offline');
  check(offlineRequests.every(r=>r.update),'no application asset request reached offline server');
  stage='eviction';
  const newName='bodyforge-offline-v1-'+variants[2].manifest.version;
  check(await js('caches.delete('+JSON.stringify(newName)+')'),'synthetic eviction');
  check((await status())?.state==='missing','eviction not reported as ready');
  check(await js('fetch('+JSON.stringify(entryPath)+').then(r=>r.status)')===503,'missing cache fails closed');
  check(!await js('caches.has('+JSON.stringify(newName)+')'),'read did not recreate missing cache');
  check(await readSave()===saveValue,'eviction preserved save');
  stage='recovery-offline';
  await cdp('Page.reload',{ignoreCache:false});
  await until('document.body?.dataset.offlineRecovery==="1"&&document.body?.dataset.recoveryState==="offline"','standalone recovery without cache');
  check(await js('document.querySelector("#recovery-repair").disabled'),'offline repair not allowed before reconnect');
  check(await js('document.querySelector("#recovery-reopen").hidden'),'no false ready action');
  check(!await js('caches.has('+JSON.stringify(newName)+')'),'recovery page does not create cache');
  check(await readSave()===saveValue,'recovery page preserves save');
  stage='recovery-online';online=true;
  await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await until('navigator.onLine&&!document.querySelector("#recovery-repair")?.disabled','repair enabled after reconnect');
  check(!await js('caches.has('+JSON.stringify(newName)+')'),'reconnect does not start a download');
  await js('document.querySelector("#recovery-repair").click()');
  await until('document.body?.dataset.recoveryState==="ready"','explicit verified repair',30000);
  check((await status())?.state==='ready','whole cache repaired');
  check(await js('document.body.dataset.offlineRecovery==="1"&&!document.querySelector("#recovery-reopen").hidden'),'no automatic reload after repair');
  check(await readSave()===saveValue,'repair preserved save');
  await js('document.querySelector("#recovery-reopen").click()');
  await until('document.body?.dataset.version==="three"&&document.body?.dataset.ready==="yes"','explicit reopen');
  check(await readSave()===saveValue,'reopen preserved save');
  stage='recovery-partial';
  check(await js('(async()=>{const c=await caches.open('+JSON.stringify(newName)+');return c.delete('+JSON.stringify(origin+entryPath)+')})()'),'missing critical chunk fixture');
  const previousDownloads=requests.filter(r=>r.path===entryPath).length;
  await cdp('Page.reload',{ignoreCache:false});
  await until('document.body?.dataset.offlineRecovery==="1"&&document.body?.dataset.recoveryState==="waiting"','partial cache recovery instead of blank page');
  check(requests.filter(r=>r.path===entryPath).length===previousDownloads,'navigation did not silently download missing chunk');
  await js('document.querySelector("#recovery-repair").click()');
  await until('document.body?.dataset.recoveryState==="ready"','partial repair');
  check(requests.filter(r=>r.path===entryPath).length===previousDownloads+1,'partial repair downloads only missing chunk');
  await js('document.querySelector("#recovery-reopen").click()');
  await until('document.body?.dataset.version==="three"&&document.body?.dataset.ready==="yes"','reopen repaired partial cache');
  check(await readSave()===saveValue,'partial repair preserved save');
  stage='recovery-stale-version';selected=0;workerOverride=2;
  check(await js('caches.delete('+JSON.stringify(newName)+')'),'evict while newer server bytes are incompatible');
  await cdp('Page.reload',{ignoreCache:false});
  await until('document.body?.dataset.offlineRecovery==="1"&&document.body?.dataset.recoveryState==="waiting"','old worker recovery');
  await js('document.querySelector("#recovery-repair").click()');
  await until('document.body?.dataset.recoveryState==="failed"','wrong-version repair refused');
  check(!await js('caches.has('+JSON.stringify(newName)+')'),'wrong-version staging removed');
  check(await js('caches.has('+JSON.stringify(blockedName)+')'),'unknown version preserved during failed repair');
  check(await readSave()===saveValue,'failed recovery preserved save');
  stage='recovery-exit';
  await js('document.querySelector("#recovery-leave").click()');
  check(await js('document.body.dataset.recoveryState==="confirm"&&!document.querySelector("#recovery-confirm-leave").hidden'),'exit requires separate confirmation');
  await js('document.querySelector("#recovery-cancel-leave").click()');
  check(await js('(async()=>!!(await navigator.serviceWorker.getRegistration()))()'),'cancel keeps registration');
  await js('document.querySelector("#recovery-leave").click()');
  await js('document.querySelector("#recovery-confirm-leave").click()');
  await until('document.body?.dataset.recoveryState==="released"','explicit unregistration request');
  check(await js('(async()=>await caches.has('+JSON.stringify(blockedName)+')&&await caches.has('+JSON.stringify(foreignName)+'))()'),'exit never clears other caches');
  check(await readSave()===saveValue,'exit never clears save');
  await cdp('Page.navigate',{url:'about:blank'});await pause(1700);
  await cdp('Page.navigate',{url:origin+'/'});
  await until('!navigator.serviceWorker.controller&&document.body?.dataset.version==="one"&&document.body?.dataset.ready==="yes"','normal network app after closing controlled page');
  check(await js('(async()=>!(await navigator.serviceWorker.getRegistration()))()'),'registration gone after controlled clients close');
  check(await readSave()===saveValue,'normal network app preserved save');
  stage='done';
}catch(error){
  console.error('BF604_WORKER_SHELL_FAIL',stage,String(error.message).slice(0,200));
  process.exitCode=16;
}finally{
  secondSocket?.close();ws?.close();for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('CDP closed'))}pending.clear();
  if(chrome&&profile){try{const r=await cleanupOwnedChrome(profile,prefix,chrome,identity);cleanup=r.profileRemoved&&r.portClosed&&r.remaining===0;}catch{console.error('BF604_WORKER_CLEANUP_UNVERIFIED');process.exitCode=17;}}
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
if(stage==='done'&&cleanup&&!process.exitCode)console.log('BF604_WORKER_SHELL_PASS',JSON.stringify({checks,offlineRequests,cleanup,scope:'generated worker, disposable synthetic shell; no model, real save or product-origin registration'}));
else process.exitCode||=16;
