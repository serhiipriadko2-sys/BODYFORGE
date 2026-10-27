// Synthetic 20-rep finish + storage failures. Own Chrome, no owner's save/video.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-finish-save-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const key = 'bodyforge:pilot:v1';
const player = {
  xp: 0, coins: 0, workouts: [],
  game: { created: true, nickname: 'SAVE QA', build: 'lean', muscles: { arms: 0, core: 0, legs: 0, back: 0 },
    outfit: 'base', ownedOutfits: ['base'], lastLoginDay: null, lastQuestClaimDay: null,
    highestClearedFloor: 0, bestGhost: null },
};
const external = { ...player, xp: 500, coins: 900,
  game: { ...player.game, nickname: 'OTHER TAB', highestClearedFloor: 1 } };
let socket, seq = 0, initScript, assertions = 0;
const requests = new Map(), observations = {};
function check(condition, label) {
  if (!condition) throw Error('FAIL ' + label);
  assertions++;
  console.log('PASS', label);
}
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { requests.delete(id); reject(Error(method + ' timeout')); }, 20000);
    requests.set(id, (message) => {
      clearTimeout(timer);
      message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function js(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await js(expression)) return; await sleep(100); }
  throw Error('TIMEOUT ' + label);
}
async function click(selector) {
  check(await js('(()=>{const b=document.querySelector(' + JSON.stringify(selector) + ');if(!b||b.disabled)return false;b.click();return true})()'), 'action: ' + selector);
  await sleep(150);
}
async function boot(value = player) {
  await cdp('Page.navigate', { url: 'about:blank' });
  if (initScript) await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScript });
  const result = await cdp('Page.addScriptToEvaluateOnNewDocument', { source:
    `if(location.origin===${JSON.stringify(origin)}){localStorage.clear();localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(value))});}` });
  initScript = result.identifier;
  await cdp('Page.navigate', { url: origin + '/' });
  await until("!!document.querySelector('.app-shell')", 'app mounted');
  await sleep(300);
}
async function reloadSaved() {
  await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScript });
  initScript = undefined;
  await cdp('Page.reload', { ignoreCache: true });
  await until("!!document.querySelector('.app-shell')", 'real saved profile reload');
  await sleep(300);
}
async function readProfile() { return JSON.parse(await js('localStorage.getItem(' + JSON.stringify(key) + ')')); }

async function startTower() {
  await js(`(async()=>{
    const source=await(await fetch('/src/App.tsx')).text();
    const marker=source.indexOf('@mediapipe_tasks-vision.js?v=');
    if(marker<0)throw Error('MediaPipe module URL missing');
    const prefix=source.slice(0,marker);
    const start=Math.max(prefix.lastIndexOf(String.fromCharCode(34)),prefix.lastIndexOf(String.fromCharCode(39)))+1;
    const url=source.slice(start).split(String.fromCharCode(34))[0].split(String.fromCharCode(39))[0];
    const mp=await import(url);
    const rep=[170,170,170,158,144,132,125,120,119,124,138,151,165,170,172,173];
    const angles=[170,170,170,...Array.from({length:20},()=>rep).flat()];
    window.__poseCalls=0;window.__modelsClosed=0;window.__tracks=[];
    const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await native(...args);window.__tracks.push(...stream.getTracks());return stream};
    mp.FilesetResolver.forVisionTasks=async()=>({});
    mp.PoseLandmarker.createFromOptions=async()=>({close(){window.__modelsClosed++},detectForVideo(video){
      const angle=angles[Math.min(window.__poseCalls++,angles.length-1)],r=(180-angle)*Math.PI/180;
      const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0}));
      p[23]={x:.5,y:.30,visibility:.98};p[25]={x:.5,y:.51,visibility:.98};
      p[27]={x:.5+.22*Math.sin(r)/(video.videoWidth/video.videoHeight),y:.51+.22*Math.cos(r),visibility:.98};
      p[11]={x:.46,y:.14,visibility:.98};p[12]={x:.54,y:.14,visibility:.98};return {landmarks:[p]};
    }});
    return true;
  })()`);
  await click('.mobile-nav button:nth-child(4)');
  await click('#tower .forge-solid-button');
  await until("!!document.querySelector('.live-tag')", 'synthetic camera active');
}
async function waitFinishFailure(status) {
  await until("document.querySelector('[data-storage-status]')?.dataset.storageStatus===" + JSON.stringify(status), '20-rep ' + status, 60000);
  check(await js('window.__poseCalls>=320'), 'failure occurs after the complete synthetic 20-rep sequence');
  check(await js("window.__tracks.length>0 && window.__tracks.every(t=>t.readyState==='ended') && window.__modelsClosed===1"), 'finish releases fake camera tracks and pose runtime');
}

try {
  let port;
  for (let i = 0; i < 100; i++) {
    const file = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(file)) { port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]); break; }
    if (chrome.exitCode !== null) throw Error('Owned Chrome exited ' + chrome.exitCode);
    await sleep(100);
  }
  if (!port) throw Error('Owned DevTools unavailable');
  const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
  socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data.toString());
    if (requests.has(message.id)) { requests.get(message.id)(message); requests.delete(message.id); }
  });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  // Another tab writes immediately after our successful primary read-back, before
  // the hook performs its later load. Delay storage events to exercise the CAS boundary.
  await boot({ ...player, coins: 100 });
  await js(`(()=>{
    const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
    window.__injectAfterRead=true;let awaiting=false;
    Storage.prototype.setItem=function(k,v){const result=set.call(this,k,v);if(k===${JSON.stringify(key)}&&window.__injectAfterRead)awaiting=true;return result};
    Storage.prototype.getItem=function(k){const raw=get.call(this,k);if(k===${JSON.stringify(key)}&&awaiting){awaiting=false;window.__injectAfterRead=false;set.call(this,k,${JSON.stringify(JSON.stringify(external))});window.__raceInjected=true;}return raw};
    return true;
  })()`);
  await click('#quests .quest-button');
  await until('window.__raceInjected===true', 'injected write after the asynchronous save read-back', 10000);
  check(await js('window.__raceInjected===true'), 'foreign write injected after the successful primary read-back');
  await click('.mobile-nav button:nth-child(3)');
  await click('#forge .muscle-card button');
  observations.race = { profile: await readProfile(), status: await js("document.querySelector('[data-storage-status]')?.dataset.storageStatus") };
  check(await js('localStorage.getItem(' + JSON.stringify(key) + ')===' + JSON.stringify(JSON.stringify(external))), 'a different read-back revision never authorizes overwriting the other writer');
  await until("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='conflict'", 'race refused');
  await click('[data-action=load-latest]');
  await until("!!document.querySelector('.app-shell')", 'explicit latest profile');
  check((await readProfile()).coins === 900, 'explicit reload keeps the other tab balance');

  if (!process.argv.includes('--race-only')) {
    await boot();
    await js(`(()=>{const set=Storage.prototype.setItem;window.__quota=true;Storage.prototype.setItem=function(k,v){if(k===${JSON.stringify(key)}&&window.__quota&&JSON.parse(v).workouts.length>0)throw new DOMException('full','QuotaExceededError');return set.call(this,k,v)};return true})()`);
    await startTower();
    await waitFinishFailure('unavailable');
    check((await readProfile()).xp === 0 && (await readProfile()).workouts.length === 0, 'quota failure preserves the durable pre-workout save');
    await click('[data-action=retry-save]');
    check(await js("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='unavailable'"), 'retry while full stays honest and does not invent a durable reward');
    await js('window.__quota=false');
    await click('[data-action=retry-save]');
    await until("!!document.querySelector('.completion-stage')", 'saved completed result');
    const completed = await readProfile();
    observations.quota = { xp: completed.xp, coins: completed.coins, workouts: completed.workouts.length, id: completed.workouts[0]?.id };
    check(completed.xp === 185 && completed.coins === 65 && completed.game.highestClearedFloor === 1 && completed.workouts.length === 1, 'retry pays one workout and one floor bonus');
    await reloadSaved();
    const reloaded = await readProfile();
    check(reloaded.xp === 185 && reloaded.workouts.length === 1 && reloaded.workouts[0].id === completed.workouts[0].id, 'saved reward and stable session ID survive real reload');

    await boot();
    await js(`(()=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem;window.__atFinish=true;
      Storage.prototype.getItem=function(k){if(k===${JSON.stringify(key)}&&window.__atFinish&&document.querySelector('.completion-stage')){window.__atFinish=false;window.__completedBeforeConflict=true;set.call(this,k,${JSON.stringify(JSON.stringify(external))});}return get.call(this,k)};return true})()`);
    await startTower();
    await waitFinishFailure('pending-result');
    check(await js('window.__completedBeforeConflict===true'), 'conflict is injected at the completed result, not during an unfinished workout');
    check(await js('localStorage.getItem(' + JSON.stringify(key) + ')===' + JSON.stringify(JSON.stringify(external))), 'finish conflict leaves the other tab save intact');
    await js(`(()=>{const create=URL.createObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;
      URL.createObjectURL=function(blob){window.__exportedBlob=blob;return create(blob)};
      HTMLAnchorElement.prototype.click=function(){if(this.download==='bodyforge-local-progress.json'){window.__exportRequested=true;return;}return click.call(this)};return true})()`);
    await click('[data-action=export-session]');
    const exported = await js('(async()=>JSON.parse(await window.__exportedBlob.text()))()');
    check(exported.xp === 500 && exported.coins === 900 && exported.workouts.length === 0 &&
      exported.pendingResults.length === 1 && exported.pendingResults[0].repetitions === 20 &&
      exported.pendingResults[0].floor === 1 && exported.pendingResults[0].sessionId === exported.pendingResult.sessionId,
      'local export retains the original completed result without replacing the newer profile balance');
    check(await js('window.__exportRequested===true'), 'export is exercised without downloading to the owner Downloads folder');
    observations.conflict = { exportedResults: exported.pendingResults.length, durableCoins: (await readProfile()).coins };
    await click('[data-action=open-current-profile]');
    await until("!!document.querySelector('.app-shell')", 'latest after export');
    check((await readProfile()).coins === 900 && (await readProfile()).game.highestClearedFloor === 1, 'latest save is loaded without applying a stale tower result to the next floor');
  }
  console.log('BODYFORGE_FINISH_SAVE_PASS', JSON.stringify({ assertions, observations }));
} catch (error) {
  console.error('BODYFORGE_FINISH_SAVE_FAIL', error.stack || String(error));
  console.log('READBACK', JSON.stringify({ assertions, observations }));
  process.exitCode = 14;
} finally {
  socket?.close(); chrome.kill(); await sleep(400);
  try { fs.rmSync(profile, { recursive: true, force: true }); }
  catch { console.error('TEMP_CLEANUP_BLOCKED', profile); process.exitCode ||= 15; }
}
