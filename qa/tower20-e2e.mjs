// Synthetic tower/reward E2E. Own loopback origin and disposable Chrome only.
// Production preview requires the independently measured entry SHA-256.
// This proves the game/save path, NOT human pose accuracy or real model startup.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createTowerSquatFixture } from './tower-squat-fixture.mjs';
import { waitForOwnedBrowser, newOwnedPage, cleanupOwnedChrome } from './owned-chrome.mjs';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
class InfrastructureError extends Error {}
const infra = message => new InfrastructureError(message);
let profile, chrome, browserIdentity, ws, seq = 0, pageLoads = 0, assertions = 0;
const requests = new Map(), browserErrors = [];
const storageKey = 'bodyforge:pilot:v1';
const journalV2 = process.argv.includes('--journal-v2');
const finalFloor = journalV2 || process.env.BODYFORGE_QA_TOWER_FINAL === '1';

async function get(url) {
  let response;
  try { response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) }); }
  catch (error) { throw infra('HTTP unavailable: ' + url + ': ' + error.message); }
  if (!response.ok) throw infra('HTTP ' + response.status + ': ' + url);
  return response;
}
async function resolveBuild() {
  if (!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(origin) || Number(new URL(origin).port) > 65535)
    throw infra('QA origin must be explicit loopback HTTP');
  const html = await (await get(origin + '/')).text();
  const entries = [...html.matchAll(/<script\b[^>]*\bsrc=["'](\/assets\/index-[\w-]+\.js)["']/g)];
  if (entries.length === 1) {
    const entry = entries[0][1];
    const bytes = Buffer.from(await (await get(origin + entry)).arrayBuffer());
    const actual = sha(bytes);
    const expected = process.env.BODYFORGE_QA_EXPECT_ENTRY_SHA256?.toLowerCase();
    if (!expected || !/^[0-9a-f]{64}$/.test(expected) || actual !== expected)
      throw infra('Production entry identity missing or mismatched: ' + actual);
    const modules = [...new Set([...bytes.toString('utf8').matchAll(/import\(\s*["'\x60](\.\/vision_bundle-[\w-]+\.js)["'\x60]\s*\)/g)].map(m => m[1]))];
    if (modules.length !== 1) throw infra('Expected exactly one lazy production pose module');
    const pose = new URL(modules[0], origin + entry).pathname;
    const poseBytes = Buffer.from(await (await get(origin + pose)).arrayBuffer());
    console.log('QA_BUILD', JSON.stringify({mode:'preview',origin,entry,entrySha256:actual,pose,poseSha256:sha(poseBytes)}));
    return { entry, entrySha256: actual, pose };
  }
  if (entries.length || !html.includes('/@vite/client') || process.env.BODYFORGE_QA_EXPECT_ENTRY_SHA256)
    throw infra('Unknown build mode or expected preview served dev HTML');
  const source = await (await get(origin + '/src/App.tsx')).text();
  const modules = [...new Set([...source.matchAll(/["'](\/node_modules\/\.vite\/deps\/@mediapipe_tasks-vision\.js\?v=[^"']+)["']/g)].map(m => m[1]))];
  if (modules.length !== 1) throw infra('Dev MediaPipe module URL missing or ambiguous');
  await get(origin + modules[0]);
  console.log('QA_BUILD', JSON.stringify({mode:'dev',origin,pose:modules[0],sourceSha256:sha(source)}));
  return { entry: null, pose: modules[0] };
}
async function connect(url) {
  const socket = new WebSocket(url);
  try {
    await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(infra('CDP connection timeout')), 3000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, {once:true});
      socket.addEventListener('error', () => { clearTimeout(timer); reject(infra('CDP connection failed')); }, {once:true});
    });
    return socket;
  } catch (error) { socket.close(); throw error; }
}
async function ownChrome() {
  profile = fs.mkdtempSync(path.join(os.tmpdir(),'bf-tower20-'));
  chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new',
    // Avatar WebGL has separate visual and lifecycle QA.
    '--disable-webgl',
    '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
    '--no-first-run','--no-default-browser-check','--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
  ],{stdio:'ignore'});
  try {
    browserIdentity=await waitForOwnedBrowser(profile,chrome);
    const tab=await newOwnedPage(browserIdentity);
    return await connect(tab.webSocketDebuggerUrl);
  }catch(error){throw infra('Owned DevTools unavailable: '+error.message);}
}

function cmd(method,params={}) {
  if (!ws || ws.readyState!==WebSocket.OPEN) return Promise.reject(infra('CDP disconnected: '+method));
  return new Promise((resolve,reject)=>{
    const id=++seq, timer=setTimeout(()=>{requests.delete(id);reject(infra('CDP timeout: '+method));},20000);
    requests.set(id,{resolve:message=>{clearTimeout(timer);message.error?reject(infra(JSON.stringify(message.error))):resolve(message.result);},reject:error=>{clearTimeout(timer);reject(error);}});
    try { ws.send(JSON.stringify({id,method,params})); }
    catch(error){requests.get(id)?.reject(infra(error.message));requests.delete(id);}
  });
}
async function ev(expression) {
  const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result.value;
}
const obj=async expression=>JSON.parse(await ev('JSON.stringify('+expression+')'));
async function until(expression,label,timeoutMs=15000) {
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){if(await ev(expression))return;await sleep(120);}
  throw Error('TIMEOUT '+label);
}
function assert(ok,label){if(!ok)throw Error('FAIL '+label);assertions++;console.log('PASS',label);}
async function click(selector) {
  await until('!!document.querySelector('+JSON.stringify(selector)+')?.getClientRects().length',selector);
  assert(await ev("(()=>{const x=document.querySelector("+JSON.stringify(selector)+");if(!x||x.disabled)return false;x.click();return true;})()"),'click '+selector);
}
async function shot() {
  if (!process.env.BODYFORGE_QA_ARTIFACT_DIR) return;
  const dir=path.resolve(process.env.BODYFORGE_QA_ARTIFACT_DIR);
  fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'bf-qa-tower-victory.png');
  const r=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(file,Buffer.from(r.data,'base64'),{flag:'wx'});
  console.log('SHOT',file,fs.statSync(file).size);
}
const readProfile=()=>obj("JSON.parse(localStorage.getItem("+JSON.stringify(storageKey)+")||'{}')");
async function installFixture(pose) {
  // Replace only model creation in this disposable page. The real counter,
  // video frame gate, App, IndexedDB journal and rewards still execute.
  return ev("(async()=>{const mp=await import("+JSON.stringify(pose)+");"+
    "const fixtureFactory=("+createTowerSquatFixture.toString()+");"+
    "window.__bfPose={used:0,closed:0,tracks:[]};"+
    "const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);"+
    "navigator.mediaDevices.getUserMedia=async(...args)=>{const s=await native(...args);window.__bfPose.tracks.push(...s.getTracks());return s};"+
    "mp.FilesetResolver.forVisionTasks=async()=>({});"+
    "mp.PoseLandmarker.createFromOptions=async()=>{const fixture=fixtureFactory();window.__bfPose.fixture=fixture;return {close(){window.__bfPose.closed++},detectForVideo(video,time){"+
    "window.__bfPose.used++;const angle=fixture.sample(time),r=(180-angle)*Math.PI/180;"+
    "const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0}));"+
    "p[23]={x:.5,y:.30,visibility:.98};p[25]={x:.5,y:.51,visibility:.98};"+
    "p[27]={x:.5+.22*Math.sin(r)/(video.videoWidth/video.videoHeight),y:.51+.22*Math.cos(r),visibility:.98};"+
    "p[11]={x:.46,y:.14,visibility:.98};p[12]={x:.54,y:.14,visibility:.98};return {landmarks:[p]};}}};return true;})()");
}
async function awaitCompletion(label) {
  const failedFixture = "!!window.__bfPose?.fixture?.diagnostics().failure";
  try {
    await until("document.querySelector('.completion-stage')?.dataset.resultPersistence==='credited' || !!document.querySelector('.camera-error') || "+failedFixture,label,90000);
  } catch(error) {
    console.error('TRACKING',JSON.stringify(await obj("({used:window.__bfPose?.used,progress:document.querySelector('.counter-number')?.textContent,phase:document.querySelector('.completion-stage')?.dataset.resultPersistence,error:document.querySelector('.camera-error')?.textContent,fixture:window.__bfPose?.fixture?.diagnostics()})")));
    throw error;
  }
  const timing=await obj('window.__bfPose.fixture.diagnostics()');
  console.log('QA_FIXTURE_TIMING',JSON.stringify(timing));
  if(timing.failure)throw infra('Pose fixture timing invalid: '+timing.failure);
  assert(timing.cycles >= 19 && timing.cycles <= 20, 'credit follows the finite timestamp-paced pose sequence');
}

// The production bundle cannot expose a test-only activation command. This
// fixture prepares an empty v1 database in the owned browser before training.
// Actual prepareVersionedJournal is exercised separately by native QA.
async function prepareQaV2() {
  const name='bodyforge:durable-results:v1', key='bodyforge:pilot:v1';
  return navigator.locks.request(key+':write',()=>navigator.locks.request(key+':durable-write',{mode:'exclusive'},()=>new Promise((resolve,reject)=>{
    let done=false;
    const finish=(ok,message)=>{
      if(done)return;
      done=true;clearTimeout(timer);ok?resolve(true):reject(Error(message));
    };
    const timer=setTimeout(()=>finish(false,'QA v2 preparation timed out'),5000);
    const request=indexedDB.open(name,2);
    request.onblocked=()=>finish(false,'QA v2 preparation blocked');
    request.onerror=()=>finish(false,'QA v2 preparation failed');
    request.onupgradeneeded=event=>{
      const db=request.result,tx=request.transaction;
      if(done||event.oldVersion!==1||db.objectStoreNames.length!==1||!db.objectStoreNames.contains('results')){
        tx.abort();return;
      }
      const store=tx.objectStore('results');
      if(store.keyPath!=='key'||store.autoIncrement||store.indexNames.length){tx.abort();return;}
      const count=store.count();
      count.onsuccess=()=>{
        if(done||count.result!==0){tx.abort();return;}
        db.createObjectStore('journal-meta',{keyPath:'key'}).add({key:'state',format:'bodyforge-keyed-journal',version:2,revision:0});
      };
    };
    request.onsuccess=()=>{
      const db=request.result;
      const valid=db.version===2&&db.objectStoreNames.length===2&&db.objectStoreNames.contains('journal-meta');
      db.close();finish(valid,'QA unexpected prepared layout');
    };
  })));
}
async function physicalV2() {
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('bodyforge:durable-results:v1');
    request.onupgradeneeded=()=>request.transaction.abort();
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  try {
    if(db.version!==2||db.objectStoreNames.length!==2)throw Error('QA expected keyed v2');
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(['results','journal-meta'],'readonly');
      const rows=tx.objectStore('results').getAll(),meta=tx.objectStore('journal-meta');
      const marker=meta.get('state'),count=meta.count();
      tx.oncomplete=()=>{
        if(count.result!==1||marker.result?.format!=='bodyforge-keyed-journal'||marker.result.version!==2||
          !Number.isSafeInteger(marker.result.revision)){reject(Error('QA invalid revision'));return;}
        resolve({marker:marker.result,rows:rows.result.map(row=>row.schemaVersion===2?
          {...row,batch:{...row.batch,checkpointData:Array.from(new Uint8Array(row.batch.checkpointData))}}:row)});
      };
      tx.onabort=tx.onerror=()=>reject(tx.error||Error('QA physical read failed'));
    });
  } finally {db.close();}
}
const readPhysicalV2=()=>ev('('+physicalV2.toString()+')()');
const readPair=()=>obj("({primary:localStorage.getItem('bodyforge:pilot:v1'),backup:localStorage.getItem('bodyforge:pilot:v1:backup')})");
function logicalV2(physical) {
  return physical.rows.map(row=>{
    if(row.schemaVersion===1) return {key:row.key,raw:row.raw,baseProfileRaw:row.baseProfileRaw,state:row.state};
    if(row.schemaVersion!==2)throw Error('QA unknown physical record');
    const b=row.batch,bytes=Buffer.from(b.checkpointData);
    const decoded=b.encoding==='gzip-json'?gunzipSync(bytes,{maxOutputLength:2*1024*1024}):
      b.encoding==='utf8-json'?bytes:null;
    if(!decoded||decoded.length!==b.decodedBytes||b.rows.length!==1||b.rows[0].key!==row.key)throw Error('QA invalid packed row');
    const pool=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded)),ref=b.rows[0];
    const original={key:row.key,raw:ref.raw,baseProfileRaw:ref.checkpoint===null?null:pool[ref.checkpoint],state:'settled'};
    if(typeof original.baseProfileRaw!=='string'&&original.baseProfileRaw!==null)throw Error('QA invalid original checkpoint');
    if(sha(Buffer.from(JSON.stringify([original])))!==b.digest||
       Buffer.byteLength(JSON.stringify([original]))!==b.logicalBytes)throw Error('QA logical digest mismatch');
    return original;
  });
}
async function reloadV2(label) {
  const before=pageLoads;
  await cmd('Page.reload',{ignoreCache:true});
  const deadline=Date.now()+30000;
  while(pageLoads<=before){if(Date.now()>deadline)throw infra('QA reload did not complete: '+label);await sleep(100);}
}
async function replayAfterWalletRollback(before,next) {
  const savedPair=await readPair(),physical=await readPhysicalV2(),rows=logicalV2(physical);
  const recent=next.workouts[0],key=storageKey+':result:'+encodeURIComponent(recent.id);
  const original=rows.find(row=>row.key===key),packed=physical.rows.find(row=>row.key===key);
  assert(rows.length===2&&rows.every(row=>row.state==='settled')&&packed?.schemaVersion===2,
    'normal completion writes a real packed settled checkpoint in production v2');
  assert(original?.baseProfileRaw===before.primary&&JSON.parse(original.raw).sessionId===recent.id,
    'packed ordinary workout retains its exact pre-workout checkpoint and identity');
  assert(rows.every(row=>next.creditedWorkoutIds.includes(JSON.parse(row.raw).sessionId)),
    'every durable result has its paid identity');
  assert(savedPair.primary!==before.primary,'fixture has a real completed wallet change');
  const injection=await cmd('Page.addScriptToEvaluateOnNewDocument',{source:
    'if(location.origin==='+JSON.stringify(origin)+'){const pair='+JSON.stringify(before)+';'+
    'for(const [k,v] of [["bodyforge:pilot:v1",pair.primary],["bodyforge:pilot:v1:backup",pair.backup]])'+
    '{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}window.__bfV2Rollback=true;}'});
  try {
    await reloadV2('wallet rollback');
    await until("window.__bfV2Rollback===true && !!document.querySelector('.app-shell')",'rollback fixture loaded',30000);
  } finally {await cmd('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});}
  await until("(()=>{const p=JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}');return p.xp===305&&p.coins===100&&p.workouts?.length===2&&!document.querySelector('[data-storage-status]')})()",'automatic durable replay after rollback',30000);
  assert(JSON.stringify(await readPair())===JSON.stringify(savedPair),'automatic replay restores exact primary and backup bytes once');
  assert(JSON.stringify(await readPhysicalV2())===JSON.stringify(physical),'replay never rewrites settled packed bytes or revision');
  assert(await ev("!Object.keys(localStorage).some(k=>k.startsWith('bodyforge:pilot:v1:result:'))"),'replay removes only acknowledged pending local results');
  return physical;
}
async function openBackupV2() {
  await click('.mobile-nav button:nth-child(6)');
  await until("!!document.querySelector('#progress-backup [data-action=inspect-progress-file]')",'backup UI mounted',30000);
  await ev("document.querySelector('.progress-backup-file-checker').open=true;true");
}
async function selectV2File(json,gzip) {
  const input=document.querySelector('[data-action=inspect-progress-file]');
  const data=gzip?await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob():json;
  const file=new File([data],gzip?'keyed-v2.json.gz':'keyed-v2.json',{type:gzip?'application/gzip':'application/json'});
  const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
}
async function chooseV2File(json,gzip=false) {
  await ev('('+selectV2File.toString()+')('+JSON.stringify(json)+','+JSON.stringify(gzip)+')');
  await until("document.querySelector('[data-import-preview]')?.dataset.importPreview==='preview-ready'",'v2 backup preview ready',30000);
}
async function verifyV2BackupAndRestore() {
  const physical=await readPhysicalV2(),originals=logicalV2(physical),before=await readPair();
  assert(physical.rows.some(row=>row.schemaVersion===2)&&originals.length===2,'backup uses mixed journal with a compact result');
  await openBackupV2();
  // Capture the real second-click Blob, never download into owner Downloads.
  await ev("(function(){const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;window.__bfV2Blobs=new Map();window.__bfV2RestoreHooks=()=>{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click};URL.createObjectURL=function(b){const u=create.call(URL,b);if(b.type.includes('application/json'))__bfV2Blobs.set(u,b);return u};HTMLAnchorElement.prototype.click=function(){if(this.download.startsWith('bodyforge-backup-')){window.__bfV2Export=__bfV2Blobs.get(this.href);return}return click.call(this)};return true})()");
  let payload;
  try {
    await click('[data-action=prepare-progress]');
    await until("document.querySelector('#progress-backup')?.dataset.backupStage==='ready'",'complete backup assembled',30000);
    await click('[data-action=download-progress]');
    const json=await ev('window.__bfV2Export.text()');
    payload=JSON.parse(json);
    assert(payload.complete===true&&payload.exportSchemaVersion===1&&payload.durableReadStatus==='ready',
      'v2 exports the supported complete logical v1 backup envelope');
    assert(payload.storedProfileRaw===before.primary&&payload.storedBackupRaw===before.backup&&
      JSON.stringify(payload.durableResults)===JSON.stringify(originals),
      'actual downloaded backup contains exact logical originals, independently decoded from physical records');
    await chooseV2File(json);
    await click('[data-action=cancel-import-preview]');
    await until("document.querySelector('[data-inspection-state]')?.dataset.inspectionState==='idle'",'export preview cancelled');
  } finally {await ev("window.__bfV2RestoreHooks?.();delete window.__bfV2RestoreHooks;delete window.__bfV2Blobs;delete window.__bfV2Export;true");}
  assert(JSON.stringify(await readPair())===JSON.stringify(before)&&JSON.stringify(await readPhysicalV2())===JSON.stringify(physical),
    'backup and file preview do not alter wallet or packed journal');
  // Same paid identity and complete history, different display nickname.
  // This is a local synthetic replacement, never an externally granted reward.
  const profile=JSON.parse(payload.storedProfileRaw);
  profile.game.nickname='QA V2';
  const candidate={...payload,storedProfileRaw:JSON.stringify(profile)},json=JSON.stringify(candidate);
  assert(candidate.storedProfileRaw!==before.primary,'replacement fixture differs only in the saved nickname');
  async function stage(gzip) {
    await chooseV2File(json,gzip);
    await until("!!document.querySelector('[data-action=request-file-replacement]:enabled')",'replacement eligible',30000);
    await click('[data-action=request-file-replacement]');
    await click('[data-action=confirm-file-replacement]');
    await until("document.querySelector('[data-replacement-recovery]')?.dataset.replacementRecovery==='applied'",'verified replacement recovery',30000);
    assert(JSON.stringify(await readPair())===JSON.stringify({primary:candidate.storedProfileRaw,backup:candidate.storedBackupRaw})&&
      await ev("localStorage.getItem('bodyforge:pilot:v1:replace-pending:v1')!==null"),
      'explicit replacement stages exact imported pair and recovery marker');
    assert(JSON.stringify(await readPhysicalV2())===JSON.stringify(physical),'profile replacement leaves all packed physical records exact');
  }
  async function decide(action) {
    await until("!!document.querySelector('[data-action=request-replacement-"+action+"]:enabled')",'recovery decision '+action,30000);
    await click('[data-action=request-replacement-'+action+']');
    await click('[data-action=confirm-replacement-'+action+']');
    await until("!!document.querySelector('[data-action=open-restored-profile]')",'verified recovery decision',30000);
    await click('[data-action=open-restored-profile]');
    await until("document.querySelector('.app-shell')?.dataset.fighterCreated==='true' && !document.querySelector('[data-storage-status]')",'recovered app hydrated',30000);
    await reloadV2(action);
    await until("document.querySelector('.app-shell')?.dataset.fighterCreated==='true' && !document.querySelector('[data-storage-status]')",'recovered app reloaded',30000);
  }
  await stage(false);
  await reloadV2('pending replacement');
  await decide('rollback');
  assert(JSON.stringify(await readPair())===JSON.stringify(before)&&JSON.stringify(await readPhysicalV2())===JSON.stringify(physical)&&
    await ev("localStorage.getItem('bodyforge:pilot:v1:replace-pending:v1')===null"),
    'restart and explicit rollback restore exact original pair and journal');
  await openBackupV2();
  await stage(true);
  await decide('keep');
  const adopted=await readProfile();
  assert(JSON.stringify(await readPair())===JSON.stringify({primary:candidate.storedProfileRaw,backup:candidate.storedBackupRaw})&&
    adopted.xp===360&&adopted.coins===120&&adopted.workouts.length===2&&adopted.creditedWorkoutIds.length===2,
    'confirmed gzip replacement survives reload without extra rewards');
  assert(JSON.stringify(await readPhysicalV2())===JSON.stringify(physical)&&
    await ev("localStorage.getItem('bodyforge:pilot:v1:replace-pending:v1')===null && typeof localStorage.getItem('bodyforge:pilot:v1:epoch')==='string'"),
    'finalized replacement preserves packed journal and activates only the confirmed profile epoch');
  console.log('BODYFORGE_KEYED_V2_GAME_FLOW_PASS',JSON.stringify({rows:originals.length,packed:physical.rows.filter(row=>row.schemaVersion===2).length,
    revision:physical.marker.revision,xp:adopted.xp,coins:adopted.coins,workouts:adopted.workouts.length}));
}

async function closeOwned() {
  ws?.close();
  if(!profile){console.log('QA_OWNED_CLEANUP NOT_NEEDED');return;}
  if(!chrome)throw infra('Disposable launcher unavailable for cleanup');
  await cleanupOwnedChrome(profile,'bf-tower20-',chrome,browserIdentity);
}

try {
  const build=await resolveBuild();
  if(journalV2&&!build.entry)throw infra('Keyed v2 game flow requires a pinned production preview');
  ws=await ownChrome();
  ws.addEventListener('close',()=>{for(const req of requests.values())req.reject(infra('CDP disconnected'));requests.clear();});
  ws.addEventListener('error',()=>{for(const req of requests.values())req.reject(infra('CDP socket error'));requests.clear();});
  ws.addEventListener('message',e=>{
    const m=JSON.parse(e.data);
    if(m.id&&requests.has(m.id)){requests.get(m.id).resolve(m);requests.delete(m.id);}
    if(m.method==='Page.loadEventFired')pageLoads++;
    if(m.method==='Runtime.exceptionThrown'){browserErrors.push(m.params?.exceptionDetails?.exception?.description||m.params?.exceptionDetails?.text||'unknown');console.error('BROWSER_EXCEPTION',browserErrors.at(-1));}
  });
  await cmd('Page.enable');await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cmd('Page.navigate',{url:origin+'/'});
  await until("!!document.querySelector('#onboarding .forge-solid-button')",'fresh disposable onboarding',30000);
  assert(await ev('location.origin')===origin,'browser on requested loopback origin');
  if(build.entry){
    await until('performance.getEntriesByType("resource").some(e=>new URL(e.name).pathname==='+JSON.stringify(build.entry)+')','served production entry loaded');
    const loadedHash=await ev("(async()=>{const r=await fetch("+JSON.stringify(build.entry)+");const bytes=await r.arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')})()");
    assert(loadedHash===build.entrySha256,'browser production entry matches pinned hash');
  }
  await click('#onboarding .forge-solid-button');
  await until("JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').game?.created===true",'fighter saved');
  const initial=await readProfile();
  assert(initial.xp===0&&initial.coins===0&&initial.workouts.length===0,'disposable profile has no pre-existing rewards');
  if (finalFloor) {
    // Seed only this newly created disposable QA profile at the final floor.
    await ev("(()=>{const p=JSON.parse(localStorage.getItem('bodyforge:pilot:v1'));p.game.highestClearedFloor=4;localStorage.setItem('bodyforge:pilot:v1',JSON.stringify(p));return true})()");
    const beforeLoad=pageLoads;
    await cmd('Page.reload',{ignoreCache:true});
    const reloadDeadline=Date.now()+30000;
    while(pageLoads<=beforeLoad){if(Date.now()>reloadDeadline)throw infra('Final-floor fixture reload did not complete');await sleep(100);}
    await until("document.querySelector('.app-shell')?.dataset.fighterCreated==='true'",'final-floor fixture hydrated',30000);
    assert((await readProfile()).game.highestClearedFloor===4,'disposable final-floor fixture starts at four');
  }
  if(journalV2) {
    await until("!document.querySelector('[data-storage-status]')",'clean profile before QA preparation',30000);
    assert(await ev('('+prepareQaV2.toString()+')()'),'owned empty v1 database prepared with keyed v2 layout');
    const prepared=await readPhysicalV2();
    assert(prepared.marker.revision===0&&prepared.rows.length===0,'v2 fixture starts without fabricated workout evidence');
  }
  assert(await installFixture(build.pose),'synthetic pose stream installed in actual lazy module');
  await click('.mobile-nav button:nth-child(4)');
  await click('#tower .forge-solid-button');
  await until("window.__bfPose?.used>0 && !!document.querySelector('.live-tag')",'synthetic camera processes frames',45000);
  await awaitCompletion('20-rep acknowledged completion');
  assert(await ev("document.querySelector('.completion-stage')?.dataset.resultPersistence==='credited' && !document.querySelector('.camera-visible') && !document.querySelector('.camera-error')"),'camera auto-stops and reward is acknowledged');
  await until("window.__bfPose.closed>0 && window.__bfPose.tracks.length>0 && window.__bfPose.tracks.every(t=>t.readyState==='ended')",'model and tracks released');
  const saved=await readProfile();
  assert(saved.xp===185&&saved.coins===65,'tower gives workout and victory bonus exactly once');
  assert(saved.game.highestClearedFloor===(finalFloor?5:1),'one tower floor unlocked');
  assert(saved.workouts.length===1&&saved.workouts[0].repetitions===20,'single workout credited');
  assert(saved.creditedWorkoutIds?.length===1&&saved.creditedWorkoutIds[0]===saved.workouts[0].id,'exactly one reward identity persisted');
  const receipt=saved.workouts[0].receipt;
  assert(receipt?.schemaVersion===1 && receipt.workoutId===saved.workouts[0].id &&
    receipt.goal?.unit==='repetitions' && receipt.goal.target===20 &&
    JSON.stringify(receipt.grants?.map(g=>[g.rewardId,g.xpDelta,g.coinDelta]))===JSON.stringify([
      ['workout-base:'+receipt.workoutId,120,35],['tower-first-clear:'+receipt.workoutId,65,30],
    ]),'persisted receipt records the exact two distinct tower awards');
  assert(saved.game.bestGhost?.splitsMs?.length===20,'ghost records twenty split times');
  assert(await ev("document.querySelector('.completion-stage [role=status]')?.textContent")==='\u0032\u0030 \u0417\u0410\u0421\u0427\u0418\u0422\u0410\u041d\u041d\u042b\u0425 \u041f\u041e\u0412\u0422\u041e\u0420\u0415\u041d\u0418\u0419','completion confirms saved result');
  assert(await ev("document.querySelector('#challenge .challenge-type')?.textContent?.trim()")==='\u0411\u0410\u0428\u041d\u042f \u00b7 \u042d\u0422\u0410\u0416 '+(finalFloor?5:1),'completed heading retains original floor');
  await shot();
  if (finalFloor) {
    const restart='#challenge [data-action=restart-workout]';
    await until("document.querySelector("+JSON.stringify(restart)+")?.disabled===false",'restart is available after durable credit');
    assert(await ev("document.querySelector("+JSON.stringify(restart)+")?.textContent?.trim()")==='\u041e\u0411\u042b\u0427\u041d\u0410\u042f \u0422\u0420\u0415\u041d\u0418\u0420\u041e\u0412\u041a\u0410','final tower offers normal training');
    const afterWin=await ev("localStorage.getItem('bodyforge:pilot:v1')");
    await ev('window.__bfPose.used=0');
    await click(restart);
    await until("window.__bfPose?.used>=20 && !!document.querySelector('.live-tag')",'normal training starts after final victory',45000);
    const partial=await obj("({count:Number(document.querySelector('.counter-number')?.textContent),timing:window.__bfPose.fixture?.diagnostics()})");
    console.log('QA_PARTIAL_TIMING',JSON.stringify(partial));
    if(partial.timing?.failure)throw infra('Partial fixture timing invalid: '+partial.timing.failure);
    assert(partial.count>0&&partial.count<20,'partial workout contains counted reps before cancellation');
    assert(await ev("!document.querySelector('#challenge .challenge-type')?.textContent.includes('\u0411\u0410\u0428\u041d\u042f')"),'next attempt is not tower');
    await click('#challenge button.secondary-button');
    await until("!document.querySelector('.live-tag') && window.__bfPose.tracks.every(t=>t.readyState==='ended')",'partial workout stopped and camera released');
    assert(await ev("localStorage.getItem('bodyforge:pilot:v1')")===afterWin,'stopped partial workout changes no profile bytes');
    assert(await ev("!Object.keys(localStorage).some(k=>k.startsWith('bodyforge:pilot:v1:result:'))"),'stopped partial workout creates no pending local result');
    const beforeSecond=journalV2?await readPair():null;
    await ev('window.__bfPose.used=0');
    await click('#challenge button.primary-button');
    await awaitCompletion('ordinary training after tower');
    assert(await ev("document.querySelector('.completion-stage')?.dataset.resultPersistence==='credited' && !document.querySelector('.camera-error')"),'ordinary workout is credited after final floor');
    const next=await readProfile();
    assert(next.xp===305&&next.coins===100&&next.game.highestClearedFloor===5,'ordinary workout pays base reward only');
    assert(next.workouts.length===2&&next.workouts[0].mode==='training'&&next.creditedWorkoutIds?.length===2,'exactly two workouts and two reward identities');
    const trainingGrants=next.workouts[0].receipt?.grants;
    assert(trainingGrants?.length===1 && trainingGrants[0].sourceType==='workout-base' &&
      trainingGrants[0].xpDelta===120 && trainingGrants[0].coinDelta===35,
    'ordinary retry records only the award it actually paid');
    if(journalV2)await replayAfterWalletRollback(beforeSecond,next);
  }
  await click('.mobile-nav button:nth-child(4)');
  if(finalFloor)assert(await ev("document.querySelector('#tower .forge-solid-button')?.disabled===true"),'completed tower cannot start another floor');
  await until("document.querySelector('.ghost-panel button')?.disabled===false",'ghost race unlocks');
  await click('.mobile-nav button:nth-child(1)');
  const quest='#quests .quest-card:nth-child(2) button';
  await until('document.querySelector('+JSON.stringify(quest)+')?.getClientRects().length>0','current Forge mission visible');
  assert(await ev("document.querySelector('#daily-plan')===null"),'removed daily plan remains absent');
  assert(await ev('document.querySelector('+JSON.stringify(quest)+')?.textContent?.trim()')==='\u0417\u0410\u0411\u0420\u0410\u0422\u042c','daily quest earned after saved squat workout');
  await click(quest);
  await until("JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').xp==="+(finalFloor?360:240),'daily quest acknowledged on disk');
  const claimed=await readProfile();
  assert(claimed.xp===(finalFloor?360:240)&&claimed.coins===(finalFloor?120:85)&&claimed.workouts.length===(finalFloor?2:1),'daily quest paid once without an extra workout');
  await until('document.querySelector('+JSON.stringify(quest)+')?.disabled===true','claimed quest disabled');
  const raw=await ev("localStorage.getItem('bodyforge:pilot:v1')");
  const previous=pageLoads;
  await cmd('Page.reload',{ignoreCache:true});
  const deadline=Date.now()+30000;
  while(pageLoads<=previous){if(Date.now()>deadline)throw infra('Reload did not complete');await sleep(100);}
  await until("document.querySelector('.app-shell')?.dataset.fighterCreated==='true'",'saved fighter hydrated after reload',30000);
  await click('.mobile-nav button:nth-child(1)');
  await until('document.querySelector('+JSON.stringify(quest)+')?.disabled===true','claim stays disabled after reload');
  assert(await ev("localStorage.getItem('bodyforge:pilot:v1')")===raw,'reload preserves exact wallet, reward ID and history');
  if(journalV2)await verifyV2BackupAndRestore();
  assert(browserErrors.length===0,'no uncaught browser exceptions');
  console.log('BODYFORGE_TOWER_20REPS_E2E_PASS assertions='+assertions);
} catch(error) {
  const infrastructure=error instanceof InfrastructureError;
  console.error(infrastructure?'BODYFORGE_TOWER_QA_INFRA_BLOCKED':'BODYFORGE_TOWER_20REPS_E2E_FAIL',error.stack||String(error));
  process.exitCode=infrastructure?14:13;
} finally {
  try{await closeOwned();}catch(error){console.error('QA_CLEANUP_ERROR',error.message);process.exitCode ||= 15;}
}
