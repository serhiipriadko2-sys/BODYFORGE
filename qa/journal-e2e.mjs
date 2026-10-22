// Disposable Chrome only: real renderer crashes at the workout commit boundaries.
// Synthetic camera frames exercise App finish; no owner's profile, camera or Downloads.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('QA requires a loopback HTTP origin');
const ownedProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-journal-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + ownedProfile,
  'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const key = 'bodyforge:pilot:v1', prefix = key + ':result:';
const player = { profileId: 'qa-player-journal', xp: 0, coins: 0, workouts: [],
  game: { created: true, nickname: 'JOURNAL QA', build: 'lean', muscles: { arms: 0, core: 0, legs: 0, back: 0 },
    outfit: 'base', ownedOutfits: ['base'], lastLoginDay: null, lastQuestClaimDay: null,
    highestClearedFloor: 0, bestGhost: null } };
const envelope = (sessionId, changes = {}) => ({ schemaVersion: 1, profileId: player.profileId,
  sessionId, mode: 'tower', floor: 1, durationMs: 32000, finishedAt: '2026-10-22T12:00:00.000Z',
  repetitions: 20, ...changes });
const resultKey = (sessionId) => prefix + encodeURIComponent(sessionId);
const clients = new Set(), observations = {};
let port, observer, page, assertions = 0, crashes = 0;

function check(condition, label) {
  if (!condition) throw Error('FAIL ' + label);
  assertions++; console.log('PASS', label);
}
async function waitFor(read, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await read()) return; await sleep(100); }
  throw Error('TIMEOUT ' + label);
}
class Client {
  constructor(target) {
    this.target = target; this.socket = new WebSocket(target.webSocketDebuggerUrl);
    this.seq = 0; this.requests = new Map(); this.listeners = new Map(); this.crashed = false;
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data.toString());
      if (message.method === 'Inspector.targetCrashed') this.crashed = true;
      const request = this.requests.get(message.id);
      if (request) {
        clearTimeout(request.timer); this.requests.delete(message.id);
        message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result);
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params);
    });
    clients.add(this);
  }
  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(listener);
  }
  async cdp(method, params = {}, timeout = 20000) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => { this.requests.delete(id); reject(Error(method + ' timeout')); }, timeout);
      this.requests.set(id, { timer, resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async js(expression) {
    const result = await this.cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async until(expression, label, timeout) { return waitFor(() => this.js(expression), label, timeout); }
  dispose() {
    for (const request of this.requests.values()) { clearTimeout(request.timer); request.reject(Error('Owned target closed')); }
    this.requests.clear(); this.socket.close(); clients.delete(this);
  }
  async close() {
    await fetch(`http://127.0.0.1:${port}/json/close/${this.target.id}`).catch(() => {});
    this.dispose();
  }
}
async function newPage(observerOnly = false, init, waitMounted = true) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const tab = new Client(target);
  await tab.cdp('Runtime.enable'); await tab.cdp('Page.enable');
  await tab.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await tab.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (observerOnly) {
    await tab.cdp('Fetch.enable', { patterns: [{ urlPattern: origin + '/?journal-observer=*', resourceType: 'Document', requestStage: 'Request' }] });
    tab.on('Fetch.requestPaused', ({ requestId }) => {
      void tab.cdp('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
        body: Buffer.from('<!doctype html><title>BODYFORGE isolated journal observer</title>').toString('base64'),
      });
    });
  }
  if (init) tab.initScript = (await tab.cdp('Page.addScriptToEvaluateOnNewDocument', { source: init })).identifier;
  await tab.cdp('Page.navigate', { url: origin + (observerOnly ? '/?journal-observer=' + target.id : '/') });
  await tab.until('location.origin===' + JSON.stringify(origin), 'new same-origin document');
  if (!observerOnly && waitMounted) await mounted(tab);
  return tab;
}
async function mounted(tab = page) {
  await tab.until("!!document.querySelector('.app-shell,[data-storage-status]')", 'new app or recovery document');
  await sleep(250);
}
async function reset(entries = [], value = player) {
  if (page) { await page.close(); page = undefined; }
  await observer.js(`(()=>{localStorage.clear();localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(value))});
    for(const [k,v] of ${JSON.stringify(entries)})localStorage.setItem(k,v);return true})()`);
}
async function readProfile() { return JSON.parse(await observer.js('localStorage.getItem(' + JSON.stringify(key) + ')')); }
async function journals() {
  return observer.js(`Object.keys(localStorage).filter(k=>k.startsWith(${JSON.stringify(prefix)})).map(k=>({key:k,raw:localStorage.getItem(k)}))`);
}
async function click(selector, tab = page) {
  check(await tab.js('(()=>{const b=document.querySelector(' + JSON.stringify(selector) + ');if(!b||b.disabled)return false;b.click();return true})()'), 'action: ' + selector);
  await sleep(100);
}
async function exportSession() {
  await page.js(`(()=>{const create=URL.createObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;URL.createObjectURL=function(blob){window.__exportedBlob=blob;return create(blob)};HTMLAnchorElement.prototype.click=function(){if(this.download==='bodyforge-local-progress.json'){window.__exportRequested=true;return}return click.call(this)};return true})()`);
  await click('[data-action=export-session]');
  return page.js('(async()=>JSON.parse(await window.__exportedBlob.text()))()');
}
async function reload(tab = page, removeInit = false) {
  if (removeInit && tab.initScript) { await tab.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: tab.initScript }); tab.initScript = undefined; }
  const before = await tab.js('window.__journalDocument=(window.__journalDocument||0)+1; window.__journalDocument');
  await tab.cdp('Page.reload', { ignoreCache: true });
  await tab.until('window.__journalDocument===undefined && location.origin===' + JSON.stringify(origin), 'new document after reload');
  await mounted(tab);
  return before;
}
async function waitAward(sessionId) {
  await waitFor(async () => { const profile = await readProfile(); return profile.creditedWorkoutIds?.includes(sessionId); }, 'durable credited result');
  await waitFor(async () => (await journals()).length === 0, 'journal removed after verified credit');
}
function isOneTower(profile, id) {
  return profile.xp === 185 && profile.coins === 65 && profile.workouts.length === 1 && profile.game.highestClearedFloor === 1
    && profile.workouts[0].id === id && profile.creditedWorkoutIds.filter((x) => x === id).length === 1;
}
async function startTower() {
  await page.js(`(async()=>{
    const source=await(await fetch('/src/App.tsx')).text();
    const start=source.indexOf('/node_modules/.vite/deps/@mediapipe_tasks-vision.js?v=');
    if(start<0)throw Error('MediaPipe module URL missing');
    const url=source.slice(start).split(String.fromCharCode(34))[0].split(String.fromCharCode(39))[0];
    const mp=await import(url),rep=[170,170,170,158,144,132,125,120,119,124,138,151,165,170,172,173];
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
      p[11]={x:.46,y:.14,visibility:.98};p[12]={x:.54,y:.14,visibility:.98};return{landmarks:[p]};
    }});return true;
  })()`);
  await click('.mobile-nav button:nth-child(4)');
  await click('#tower .forge-solid-button');
  await page.until("!!document.querySelector('.live-tag')", 'synthetic camera active');
}
async function armPause(kind, tab = page) {
  await tab.cdp('Debugger.enable');
  tab.paused = false; tab.on('Debugger.paused', (params) => { tab.paused = true; tab.pauseFrame = params.callFrames[0].callFrameId; });
  await tab.js(`(()=>{const get=Storage.prototype.getItem,remove=Storage.prototype.removeItem;let armed=true;
    Storage.prototype.getItem=function(k){const raw=get.call(this,k);if(armed&&${JSON.stringify(kind)}==='journal'&&k.startsWith(${JSON.stringify(prefix)})&&raw!==null){armed=false;window.__boundary={kind:'journal',key:k,raw,poseCalls:window.__poseCalls};debugger;}return raw};
    Storage.prototype.removeItem=function(k){if(armed&&${JSON.stringify(kind)}==='primary'&&k.startsWith(${JSON.stringify(prefix)})){armed=false;window.__boundary={kind:'primary',key:k,raw:get.call(this,k)};debugger;}return remove.call(this,k)};return true})()`);
}
async function crashPaused(tab = page) {
  check(tab.paused === true, 'writer paused exactly at requested persistence boundary');
  let crashed = false; tab.on('Inspector.targetCrashed', () => { crashed = true; });
  void tab.cdp('Page.crash', {}, 5000).catch(() => {});
  await waitFor(() => crashed, 'real owned renderer crash');
  crashes++; check(crashed, 'Chrome confirms actual renderer crash');
  await tab.close();
  // Chrome may place same-site disposable targets in one renderer process.
  if (observer.crashed) { await observer.close(); observer = await newPage(true); }
  page = await newPage();
}
const primaryQuota = `(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===${JSON.stringify(key)}&&JSON.parse(v).workouts.length>0)throw new DOMException('primary full','QuotaExceededError');return set.call(this,k,v)}})()`;

async function queuedCompletion() {
  await reset(); page = await newPage(); await startTower();
  // Session preparation already completed. Block only its eventual finish write.
  await observer.js(`window.__holding=false;window.__held=new Promise(resolve=>window.__release=resolve);void navigator.locks.request(${JSON.stringify(key + ':write')},async()=>{window.__holding=true;await window.__held});true`);
  await observer.until('window.__holding===true', 'observer holds finish-write lock');
  await page.until("!!document.querySelector('.completion-stage')", '20th rep queues its journal write', 65000);
  check(await page.js('window.__poseCalls>=320'), 'queued completion follows the complete synthetic 20-rep workout');
  check(await page.js("document.querySelector('.completion-stage [role=status]')?.textContent.includes('СОХРАНЯЕМ РЕЗУЛЬТАТ')"),
    'accessible completion status announces the unconfirmed save');
  check((await readProfile()).xp === 0 && (await journals()).length === 0, 'held lock leaves result pending in RAM without a fake durable acknowledgement');
  await click('#challenge .primary-button');
  check(await page.js('window.__tracks.length===1 && window.__tracks.every(t=>t.readyState===\'ended\')'),
    'starting another workout cannot launch a second stream while the result waits');
  await click('.mobile-nav button:nth-child(1)');
  await click('#quests .quest-button');
  await observer.js('window.__release();true');
  await waitFor(async () => { const value = await readProfile(); return value.xp !== 0 || value.coins !== 0; }, 'queued completion or competing action settles');
  const completed = await readProfile(), sessionId = completed.workouts[0]?.id;
  observations.queue = { xp: completed.xp, coins: completed.coins, workouts: completed.workouts.length, sessionId };
  check(isOneTower(completed, sessionId), 'normal UI mutation never cancels the queued journal or credits its own stale snapshot');
  await waitFor(async () => (await journals()).length === 0, 'queued result cleanup');
  await reload();
  check(isOneTower(await readProfile(), sessionId), 'queued finish survives reload with one stable workout identity and one reward');
}

try {
  for (let i = 0; i < 100; i++) {
    const file = path.join(ownedProfile, 'DevToolsActivePort');
    if (fs.existsSync(file)) { port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]); break; }
    if (chrome.exitCode !== null) throw Error('Owned Chrome exited ' + chrome.exitCode);
    await sleep(100);
  }
  if (!port) throw Error('Owned DevTools unavailable');
  observer = await newPage(true);

  await queuedCompletion();
  if (!process.argv.includes('--queue-only')) {

  // A real App finish reaches journal read-back, then the renderer is killed.
  await reset(); page = await newPage();
  await armPause('journal'); await startTower();
  await waitFor(() => page.paused, '20-rep journal boundary', 65000);
  const first = await journals(), beforeAward = await readProfile();
  const boundary = await page.cdp('Debugger.evaluateOnCallFrame', { callFrameId: page.pauseFrame, expression: 'window.__boundary', returnByValue: true });
  check(boundary.result.value.poseCalls >= 320, 'first crash follows the complete synthetic 20-rep App sequence');
  check(first.length === 1, 'complete App result is durably journaled before profile reward');
  const firstResult = JSON.parse(first[0].raw);
  check(firstResult.profileId === player.profileId && firstResult.floor === 1 && firstResult.repetitions === 20 && !!firstResult.sessionId,
    'journal freezes profile, session and original floor identity');
  check(beforeAward.xp === 0 && beforeAward.coins === 0 && beforeAward.workouts.length === 0, 'first crash boundary precedes all reward writes');
  await crashPaused(); await waitAward(firstResult.sessionId);
  check(isOneTower(await readProfile(), firstResult.sessionId), 'journal-before-primary crash recovers one workout and one floor bonus');
  await reload();
  check(isOneTower(await readProfile(), firstResult.sessionId) && (await journals()).length === 0, 'second real reload does not duplicate recovered rewards');
  observations.beforePrimary = { sessionId: firstResult.sessionId, repetitions: firstResult.repetitions };

  // A seeded valid result reaches primary read-back, but deletion never runs.
  const second = envelope('qa-journal-after-primary');
  await reset([[resultKey(second.sessionId), JSON.stringify(second)]]);
  // Hold the common lock so App boot cannot reconcile until the fault is armed.
  await observer.js(`window.__holding=false;window.__held=new Promise(resolve=>window.__release=resolve);void navigator.locks.request(${JSON.stringify(key + ':write')},async()=>{window.__holding=true;await window.__held});true`);
  await observer.until('window.__holding===true', 'observer holds shared write lock');
  page = await newPage(false, undefined, false); await armPause('primary');
  await observer.js('window.__release();true');
  await waitFor(() => page.paused, 'primary-before-delete boundary');
  check(isOneTower(await readProfile(), second.sessionId) && (await journals()).length === 1, 'primary is credited and verified while its journal still exists');
  await crashPaused(); await waitAward(second.sessionId);
  check(isOneTower(await readProfile(), second.sessionId), 'primary-before-delete crash cleans residue without a second reward or next floor');

  // Primary quota persists over a real new document, then recovery credits once.
  const quota = envelope('qa-journal-primary-quota');
  await reset([[resultKey(quota.sessionId), JSON.stringify(quota)]]); page = await newPage(false, primaryQuota);
  await page.until("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='unavailable'", 'primary quota UI');
  check((await readProfile()).xp === 0 && (await journals()).length === 1, 'primary quota leaves durable journal and uncredited profile');
  await reload();
  check((await readProfile()).xp === 0 && (await journals()).length === 1, 'quota-blocked real reload preserves pending result without fake reward');
  await reload(page, true); await waitAward(quota.sessionId);
  check(isOneTower(await readProfile(), quota.sessionId), 'capacity restored after reload credits durable pending result exactly once');

  // If journal itself cannot be written, the actual App keeps an exportable RAM result.
  await reset(); page = await newPage();
  await page.js(`(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith(${JSON.stringify(prefix)}))throw new DOMException('journal full','QuotaExceededError');return set.call(this,k,v)};return true})()`);
  await startTower();
  await page.until("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='unavailable'", 'journal quota after 20 reps', 65000);
  check(await page.js('window.__poseCalls>=320'), 'journal quota is exercised by a complete synthetic App workout');
  check((await readProfile()).xp === 0 && (await journals()).length === 0, 'journal quota awards nothing and claims no durable pending result');
  const exported = await exportSession();
  check(exported.pendingResult?.repetitions === 20 && exported.pendingResult.profileId === player.profileId && exported.pendingResult.floor === 1,
    'journal quota exports the honest RAM-only result with its frozen identities');
  check(exported.xp === 0 && await page.js('window.__exportRequested===true'), 'RAM-only export does not misrepresent credited XP or write owner Downloads');
  await reload();
  check((await readProfile()).xp === 0 && (await journals()).length === 0, 'reload after unpersisted journal failure never invents a reward');

  for (const item of [
    { name: 'foreign-profile', profile: { ...player, profileId: 'qa-other-player', xp: 500, coins: 900 }, value: envelope('qa-journal-foreign') },
    { name: 'stale-floor', profile: { ...player, game: { ...player.game, highestClearedFloor: 1 } }, value: envelope('qa-journal-stale') },
    { name: 'invalid-json', profile: player, raw: '{broken journal', sessionId: 'qa-journal-invalid' },
    { name: 'unknown-version', profile: player, value: envelope('qa-journal-future', { schemaVersion: 2 }) },
  ]) {
    const sessionId = item.value?.sessionId || item.sessionId, raw = item.raw || JSON.stringify(item.value);
    await reset([[resultKey(sessionId), raw]], item.profile); page = await newPage();
    await page.until("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='pending-result'", item.name + ' explicit pending recovery');
    check((await observer.js('localStorage.getItem(' + JSON.stringify(key) + ')')) === JSON.stringify(item.profile), item.name + ' never mutates or resets the valid primary');
    check((await journals())[0]?.raw === raw, item.name + ' retains exact unresolved journal for recovery');
    if (item.name === 'foreign-profile' || item.name === 'unknown-version') {
      const archive = await exportSession();
      check(archive.pendingResults?.some((entry) => item.name === 'unknown-version'
        ? entry.raw === raw : entry.profileId === item.value.profileId && entry.sessionId === sessionId && entry.floor === item.value.floor),
      item.name + ' export preserves the unresolved result or unknown original bytes');
    }
    await reload();
    check((await journals())[0]?.raw === raw && (await readProfile()).xp === item.profile.xp, item.name + ' stays preserved through real reload');
  }
  }

  console.log('BODYFORGE_JOURNAL_PASS', JSON.stringify({ assertions, crashes, queueOnly: process.argv.includes('--queue-only'), observations }));
} catch (error) {
  console.error('BODYFORGE_JOURNAL_FAIL', error.stack || String(error));
  console.log('READBACK', JSON.stringify({ assertions, crashes, observations }));
  if (observer) console.log('STORAGE', JSON.stringify({ profile: await readProfile().catch(() => null), journals: await journals().catch(() => null) }));
  process.exitCode = 16;
} finally {
  for (const client of clients) client.dispose();
  chrome.kill(); await sleep(500);
  // The only recursive deletion is this script's verified mkdtemp directory.
  if (path.dirname(ownedProfile) !== os.tmpdir() || !path.basename(ownedProfile).startsWith('bf-journal-')) throw Error('Unexpected temp cleanup target');
  try { fs.rmSync(ownedProfile, { recursive: true, force: true }); }
  catch { console.error('TEMP_CLEANUP_BLOCKED', ownedProfile); process.exitCode ||= 17; }
}
