// Failure-path E2E. Every scenario uses a throwaway Chrome profile and synthetic
// camera data. Never reads or changes the owner's real browser save or webcam.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
const port = 9742;
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-resilience-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profileDir, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
let socket, seq = 0, initScript = null;
const pending = new Map();
let assertions = 0;
const check = (condition, message) => { if (!condition) throw Error('FAIL ' + message); assertions++; console.log('PASS ' + message); };
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 20000);
    pending.set(id, (m) => { clearTimeout(timer); m.error ? reject(Error(JSON.stringify(m.error))) : resolve(m.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function js(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function until(expression, label, milliseconds = 16000) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) { if (await js(expression)) return; await sleep(180); }
  throw Error('TIMEOUT ' + label);
}
async function click(selector) {
  check(await js('(()=>{const b=document.querySelector(' + JSON.stringify(selector) + ');if(!b||b.disabled)return false;b.click();return true})()'), 'enabled action: ' + selector);
  await sleep(100);
}
const key = 'bodyforge:pilot:v1', backupKey = key + ':backup';
const fighter = {
  xp: 360, coins: 70, workouts: [],
  game: { created: true, nickname: 'QA ONLY', build: 'solid', muscles: { arms: 1, core: 0, legs: 2, back: 0 }, outfit: 'ember', ownedOutfits: ['base', 'ember'], lastLoginDay: null, lastQuestClaimDay: null, highestClearedFloor: 0, bestGhost: null },
};
async function boot(primary = JSON.stringify(fighter), backup = JSON.stringify({ ...fighter, xp: 240, coins: 35 }), hook = '', blocked = []) {
  await cdp('Page.navigate', { url: 'about:blank' });
  if (initScript) await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScript });
  const seed = '(()=>{if(location.origin!==' + JSON.stringify(origin) + ')return;localStorage.clear();const p=' + JSON.stringify(primary) + ',b=' + JSON.stringify(backup) + ';if(p!==null)localStorage.setItem(' + JSON.stringify(key) + ',p);if(b!==null)localStorage.setItem(' + JSON.stringify(backupKey) + ',b);' + hook + '})()';
  const added = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: seed });
  initScript = added.identifier;
  await cdp('Network.setBlockedURLs', { urls: blocked });
  await cdp('Page.navigate', { url: origin + '/' });
  await until("!!document.querySelector('.app-shell,.storage-recovery')", 'app mounts');
  await sleep(300);
}
async function current() { return JSON.parse(await js('localStorage.getItem(' + JSON.stringify(key) + ')')); }
async function reloadSavedProfile() {
  // boot() seeds fixtures on each new document. Remove that hook to test a real
  // reload of the progress the application just saved, rather than reseeding it.
  if (initScript) {
    await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScript });
    initScript = null;
  }
  await js('window.__bfQaOldDocument=true');
  await cdp('Page.reload', { ignoreCache: true });
  await until("!window.__bfQaOldDocument && !!document.querySelector('.app-shell')", 'new document reloads durable progress');
  await sleep(300);
}
async function shot(name) {
  const data = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(os.tmpdir(), name);
  fs.writeFileSync(file, Buffer.from(data.data, 'base64'));
  console.log('SCREENSHOT ' + file);
}
async function prepareFixedPose() {
  await js("(async()=>{\n const source=await(await fetch('/src/App.tsx')).text();\n const marker='/node_modules/.vite/deps/@mediapipe_tasks-vision.js?v=';\n const start=source.indexOf(marker);\n if(start<0)throw Error('MediaPipe import not found');\n const url=source.slice(start).split(String.fromCharCode(34))[0].split(String.fromCharCode(39))[0];\n const mp=await import(url);\n window.__poseCalls=0;\n mp.PoseLandmarker.prototype.detectForVideo=function(video){\n   window.__poseCalls++;\n   const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0}));\n   const r=10*Math.PI/180;\n   p[23]={x:.5,y:.3,visibility:.98};\n   p[25]={x:.5,y:.5,visibility:.98};\n   p[27]={x:.5+.15*Math.sin(r)/(video.videoWidth/video.videoHeight),y:.5+.15*Math.cos(r),visibility:.98};\n   p[11]={x:.46,y:.15,visibility:.98};p[12]={x:.54,y:.15,visibility:.98};\n   return {landmarks:[p]};\n };\n return true;\n})()");
}

async function cameraReady() {
  await click('.mobile-nav button:nth-child(2)');
  await click('#challenge .primary-button');
  await until("!!document.querySelector('.live-tag') && !document.querySelector('.loading-overlay')", 'pose model', 60000);
  await until("document.querySelector('.pose-hud-angle strong')?.textContent.includes('°')", 'live angle', 5000);
}
try {
  let endpoint;
  for (let i = 0; i < 70; i++) {
    try { const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); endpoint = tabs.find((t) => t.type === 'page')?.webSocketDebuggerUrl; if (endpoint) break; } catch {}
    await sleep(200);
  }
  if (!endpoint) throw Error('Chrome unavailable');
  socket = new WebSocket(endpoint);
  await new Promise((ok, no) => { socket.addEventListener('open', ok, { once: true }); socket.addEventListener('error', no, { once: true }); });
  socket.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  await boot('{broken original', JSON.stringify(fighter));
  check(await js("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='recovery-required' && !document.querySelector('#onboarding')"), 'damaged save blocks misleading new-fighter onboarding');
  check(await js('localStorage.getItem(' + JSON.stringify(key) + ')==="{broken original"'), 'damaged original untouched on load');
  await shot('bf-audit-recovery.png');
  await click('[data-action=restore-backup]');
  await until("!!document.querySelector('.app-shell')", 'backup restored');
  check((await current()).xp === 360 && (await current()).game.nickname === 'QA ONLY', 'backup restores actual fighter and XP');
  check(await js('localStorage.getItem(' + JSON.stringify(key + ':quarantine:0') + ')==="{broken original"'), 'damaged original quarantined before replacement');

  await boot('{irrecoverable', null);
  await click('[data-action=request-fresh]');
  check(await js('localStorage.getItem(' + JSON.stringify(key) + ')==="{irrecoverable"'), 'fresh start needs explicit second confirmation');
  await click('[data-action=confirm-fresh]');
  await until("!!document.querySelector('#onboarding')", 'explicit fresh start');
  check((await current()).xp === 0, 'fresh start works without automatic data loss');

  await boot(null, null, "const get=Storage.prototype.getItem;Storage.prototype.getItem=function(){throw new DOMException('denied','SecurityError')};window.__restoreStorage=()=>{Storage.prototype.getItem=get};");
  check(await js("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='unavailable'"), 'denied storage shows actionable warning');
  await js('window.__restoreStorage();true');
  await click('[data-action=retry-save]');
  await until("!!document.querySelector('#onboarding')", 'storage permission recovered');

  await boot(undefined, undefined, "const set=Storage.prototype.setItem;window.__failWrite=false;Storage.prototype.setItem=function(k,v){if(window.__failWrite)throw new DOMException('full','QuotaExceededError');return set.call(this,k,v)};");
  const beforeQuota = await js('localStorage.getItem(' + JSON.stringify(key) + ')');
  await js('window.__failWrite=true');
  await click('#quests .quest-button');
  await until("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='unavailable'", 'quota error surfaced');
  check(await js('localStorage.getItem(' + JSON.stringify(key) + ')===' + JSON.stringify(beforeQuota)), 'failed write preserves previous durable progress');
  await js('window.__failWrite=false');
  await click('[data-action=retry-save]');
  await until("!!document.querySelector('.app-shell')", 'retry saves pending reward');
  check((await current()).coins === 80, 'retry saves pending login exactly once');

  await boot();
  await click('#quests .quest-button');
  check(await js("document.querySelector('#quests .quest-button').disabled"), 'daily reward locked after claim');
  await js("(()=>{const Native=Date;const delta=86400000;window.__restoreClock=()=>{window.Date=Native};window.Date=class extends Native {constructor(...args){if(args.length)super(...args);else super(Native.now()+delta)}static now(){return Native.now()+delta}};document.dispatchEvent(new Event('visibilitychange'));return true})()");
  await until("!document.querySelector('#quests .quest-button').disabled", 'daily reward unlocked after midnight');
  await click('#quests .quest-button');
  await until('JSON.parse(localStorage.getItem(' + JSON.stringify(key) + ')).coins===90', 'second daily reward acknowledged on disk');
  check((await current()).coins === 90, 'one new daily reward after date change without reload');
  await js("window.__restoreClock();document.dispatchEvent(new Event('visibilitychange'));true");
  await until("document.querySelector('#quests .quest-button').disabled", 'old claimed day remains locked after clock rollback');
  check((await current()).coins === 90, 'A to B to A pays two daily login rewards, not three');
  await reloadSavedProfile();
  check(await js("document.querySelector('#quests .quest-button').disabled && document.querySelector('#quests .quest-button').textContent.includes('ПОЛУЧЕНО')"), 'reload shows the actual already-claimed daily login state');
  check((await current()).coins === 90, 'daily reward history survives real reload');

  await boot();
  await js(`(async()=>{
    const {addCompletedWorkout,loadProfile}=await import('/src/lib/progression.ts');
    const {claimDailyQuest}=await import('/src/lib/game.ts');
    const a=new Date(),b=new Date(Date.now()+86400000);
    let p=addCompletedWorkout(loadProfile(),65000,a,{sessionId:'quest-A'});
    p=claimDailyQuest(p,a);
    p=addCompletedWorkout(p,65000,b,{sessionId:'quest-B'});
    p=claimDailyQuest(p,b);
    localStorage.setItem(${JSON.stringify(key)},JSON.stringify(p));return true;
  })()`);
  await reloadSavedProfile();
  check(await js("document.querySelector('#quests .quest-card:nth-child(2) button').disabled && document.querySelector('#quests .quest-card:nth-child(2) button').textContent.includes('ГОТОВО')"), 'quest UI preserves claimed status after a later day and reload');
  check((await current()).xp === 710 && (await current()).coins === 180, 'two daily quests preserve exact XP and coin rewards');

  await boot();
  await js(`(async()=>{
    const {addCompletedWorkout,loadProfile}=await import('/src/lib/progression.ts');
    let p=loadProfile();
    for(let i=0;i<65;i++)p=addCompletedWorkout(p,65000,new Date(),{sessionId:'durable-'+i,mode:i===0?'tower':'training'});
    localStorage.setItem(${JSON.stringify(key)},JSON.stringify(p));return true;
  })()`);
  await reloadSavedProfile();
  const mature = await current();
  check(mature.workouts.length === 60 && mature.totals.workouts === 65 && mature.creditedWorkoutIds.length === 65,
    '65 credited workout identities survive reload independently of the last-60 history');
  const replay = await js(`(async()=>{
    const {addCompletedWorkout,loadProfile}=await import('/src/lib/progression.ts');
    const p=loadProfile(),next=addCompletedWorkout(p,1000,new Date(),{sessionId:'durable-0',mode:'tower'});
    return {same:next===p,xp:next.xp,coins:next.coins,floor:next.game.highestClearedFloor,total:next.totals.workouts};
  })()`);
  check(replay.same && replay.xp === mature.xp && replay.coins === mature.coins && replay.floor === 1 && replay.total === 65,
    'old tower replay after history rotation changes neither reward, floor, record nor workout total');
  check(await js('document.documentElement.scrollWidth<=390'), 'mature profile balances and lifetime totals fit a 390px phone');

  await boot(undefined, undefined, "Object.defineProperty(window,'isSecureContext',{value:false});Object.defineProperty(crypto,'randomUUID',{value:undefined});");
  await click('.mobile-nav button:nth-child(2)');
  await click('#challenge .primary-button');
  await until("document.querySelector('.camera-error')?.textContent.includes('HTTPS')", 'HTTP camera preflight without randomUUID');
  check(await js("!document.querySelector('.camera-visible')"), 'HTTP start fails safely, no uncaught crypto error');

  await boot();
  const external = JSON.stringify({ ...fighter, xp: 480, coins: 105 });
  await js('(()=>{const k=' + JSON.stringify(key) + ',raw=' + JSON.stringify(external) + ';localStorage.setItem(k,raw);dispatchEvent(new StorageEvent("storage",{key:k,newValue:raw,storageArea:localStorage}));return true})()');
  await until("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='conflict'", 'external save conflict');
  check((await current()).coins === 105, 'stale UI never overwrites simulated other-tab progress');
  await click('[data-action=load-latest]');
  await until("!!document.querySelector('.app-shell')", 'explicit latest-save reload');

  await boot();
  await prepareFixedPose();
  await cameraReady();
  await js("(()=>{const v=document.querySelector('video');window.__track=v.srcObject.getVideoTracks()[0];const t=v.currentTime;Object.defineProperty(v,'currentTime',{configurable:true,get:()=>t});return true})()");
  await until("document.querySelector('.camera-control-help')?.textContent.includes('завис')", 'frozen camera watchdog', 4000);
  check(await js("document.querySelector('.pose-hud-angle strong')?.textContent==='—' && document.querySelector('.counter-number')?.textContent==='0'"), 'frozen frame clears obsolete pose without fake repetitions');
  check(await js("document.querySelector('[data-guidance=camera-stalled]')?.textContent.includes('не ошибка твоей позы')"), 'freeze explanation does not blame player framing');
  await shot('bf-audit-frozen-camera.png');
  await js("delete document.querySelector('video').currentTime;true");
  await until("document.querySelector('.pose-hud-angle strong')?.textContent.includes('°')", 'video stream resumes');
  await click('#challenge .secondary-button');
  check(await js("window.__track.readyState==='ended'"), 'cancel actually stops physical stream track');
  check((await current()).xp === 360, 'cancelled attempt pays no workout XP');

  await boot(undefined, undefined, "navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('denied','NotAllowedError'));");
  await click('.mobile-nav button:nth-child(2)');
  await click('#challenge .primary-button');
  await until("!!document.querySelector('.camera-error')", 'denied camera message');
  check(await js("document.querySelector('.app-shell').dataset.screen==='challenge' && !document.querySelector('.camera-visible')"), 'permission denial remains on camera screen without streaming');
  check((await current()).xp === 360, 'permission denial grants no XP');

  await boot(undefined, undefined, "const real=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(...args)=>new Promise((resolve,reject)=>{window.__releaseCamera=()=>real(...args).then(s=>{window.__lateStream=s;resolve(s)},reject)});");
  await click('.mobile-nav button:nth-child(2)');
  await click('#challenge .primary-button');
  await until("!!document.querySelector('.loading-overlay')", 'pending camera request');
  await click('#challenge .secondary-button');
  await js('window.__releaseCamera();true');
  await until("window.__lateStream?.getTracks().every(t=>t.readyState==='ended')", 'late camera disposed', 8000);
  check(await js("!document.querySelector('.camera-visible')"), 'cancelled permission request cannot resurrect the camera');

  await boot(undefined, undefined, "const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);\nwindow.__zoomResolvers=[];\nnavigator.mediaDevices.getUserMedia=async(...args)=>{\n const stream=await get(...args),track=stream.getVideoTracks()[0];\n const settings=track.getSettings.bind(track),caps=track.getCapabilities.bind(track);\n let zoom=1;\n track.getSettings=()=>({...settings(),zoom});\n track.getCapabilities=()=>({...caps(),zoom:{min:1,max:4,step:.1}});\n track.applyConstraints=(c)=>new Promise(resolve=>{window.__zoomResolvers.push(()=>{zoom=c.advanced[0].zoom;resolve()})});\n return stream;\n};");
  await prepareFixedPose();
  await cameraReady();
  check(await js("!!document.querySelector('.camera-zoom-control input')"), 'zoom control appears only for advertised track capability');
  await js("(()=>{const slider=document.querySelector('.camera-zoom-control input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(slider,'2');slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
  await until("window.__zoomResolvers.length===1 && !!document.querySelector('.camera-switch-overlay')", 'zoom change in progress');
  const beforeZoomCalls=await js('window.__poseCalls');
  await sleep(500);
  check(await js('window.__poseCalls')===beforeZoomCalls, 'zoom transition cannot be counted as exercise');
  await click('#challenge .secondary-button');
  await cameraReady();
  await js('window.__zoomResolvers[0]();true');
  await sleep(450);
  check(await js("!!document.querySelector('.live-tag') && !document.querySelector('.camera-error') && !document.querySelector('.camera-switch-overlay')"), 'late zoom result from cancelled attempt cannot mutate the next workout');
  check((await current()).xp===360,'cancelled zoom attempt does not pay XP');
  // Browser pagehide is an explicit signal that the current attempt is no longer observed.
  await js("window.__hiddenTrack=document.querySelector('video').srcObject.getVideoTracks()[0];dispatchEvent(new Event('pagehide'));true");
  await until("!!document.querySelector('.camera-error')", 'background event stops workout');
  check(await js("window.__hiddenTrack.readyState==='ended' && !document.querySelector('.camera-visible')"), 'pagehide releases the stream and cannot finish an unseen squat');

  await boot(undefined, undefined, "const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{const s=await get(...args);window.__modelFailureStream=s;return s}");
  await js("(async()=>{const source=await(await fetch('/src/App.tsx')).text();const marker='/node_modules/.vite/deps/@mediapipe_tasks-vision.js?v=';const i=source.indexOf(marker);if(i<0)throw Error('module missing');const url=source.slice(i).split(String.fromCharCode(34))[0].split(String.fromCharCode(39))[0];const mp=await import(url);mp.FilesetResolver.forVisionTasks=()=>Promise.reject(new Error('QA: model runtime offline'));return true})()");
  await click('.mobile-nav button:nth-child(2)');
  await click('#challenge .primary-button');
  await until("!!document.querySelector('.camera-error')", 'model download failure is visible');
  check(await js("window.__modelFailureStream.getTracks().every(t=>t.readyState==='ended') && !document.querySelector('.loading-overlay')"), 'model load failure releases camera instead of leaving loading forever');
  check((await current()).xp===360, 'failed model initialization grants no XP');

  await boot(undefined, undefined, '', ['*/src/components/Avatar3D.tsx*']);
  await until("!!document.querySelector('[data-3d-status=fallback]')", 'lazy 3D failure fallback', 10000);
  check(await js("document.querySelectorAll('.mobile-nav button').length===5"), 'missing 3D module cannot crash navigation');
  await js("document.querySelector('.avatar-stage').scrollIntoView({block:'center',behavior:'instant'});true");
  await sleep(300);
  await shot('bf-audit-3d-fallback.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 1, mobile: true });
  check(await js('document.documentElement.scrollWidth<=360'), 'fallback fits 360px phone');
  console.log('BODYFORGE_RESILIENCE_E2E_PASS assertions=' + assertions);
} catch (error) {
  console.error('BODYFORGE_RESILIENCE_E2E_FAIL', error.stack || error);
  try { console.error('FAILURE_STATE', JSON.stringify(await js("({status:document.querySelector('[data-storage-status]')?.dataset.storageStatus,profile:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'null')})"))); } catch {}
  process.exitCode = 12;
} finally {
  socket?.close(); chrome.kill(); await sleep(400);
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
}
