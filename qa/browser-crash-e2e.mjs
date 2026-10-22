// Whole owned Chrome process tree crashes, then restarts with the SAME profile.
// This tests process-crash persistence, not OS/power loss or human-camera accuracy.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

if (process.platform !== 'win32') throw Error('This owned-process-tree QA currently requires Windows');
const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('QA requires a loopback HTTP origin');
const ownedProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-browser-crash-'));
const key = 'bodyforge:pilot:v1', prefix = key + ':result:';
const player = { profileId: 'qa-browser-crash-player', xp: 0, coins: 0, workouts: [],
  game: { created: true, nickname: 'BROWSER CRASH QA', build: 'lean', muscles: { arms: 0, core: 0, legs: 0, back: 0 },
    outfit: 'base', ownedOutfits: ['base'], lastLoginDay: null, lastQuestClaimDay: null,
    highestClearedFloor: 0, bestGhost: null } };
const clients = new Set(), observations = [], failures = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser, browserClient, port, observer, page, assertions = 0, crashes = 0;

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
    this.seq = 0; this.requests = new Map(); this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data.toString()), request = this.requests.get(message.id);
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
    for (const request of this.requests.values()) { clearTimeout(request.timer); request.reject(Error('Owned browser stopped')); }
    this.requests.clear(); this.socket.close(); clients.delete(this);
  }
}
function powershell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (result.error || result.status !== 0) throw Error('Owned process inspection failed: ' + (result.error?.message || result.stderr || result.status));
  return result.stdout.trim();
}
const psProfile = ownedProfile.replaceAll("'", "''");
function ownedProcesses() {
  const raw = powershell(`$owned='${psProfile}'; @(Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*chrome*' -and $_.CommandLine -and $_.CommandLine.Contains($owned) } | ForEach-Object { [PSCustomObject]@{pid=[int]$_.ProcessId; parent=[int]$_.ParentProcessId} }) | ConvertTo-Json -Compress`);
  const value = raw ? JSON.parse(raw) : [];
  return Array.isArray(value) ? value : [value];
}
function verifyOwnedBrowser() {
  if (!browser?.pid || browser.exitCode !== null) throw Error('Owned browser root is not running');
  const processes = ownedProcesses();
  check(processes.some((entry) => entry.pid === browser.pid), 'spawned Chrome root is verified against its disposable profile');
  return processes.map((entry) => entry.pid);
}
async function startBrowser() {
  if (browser && browser.exitCode === null) throw Error('Refusing a second browser on the same profile');
  const activeFile = path.join(ownedProfile, 'DevToolsActivePort');
  if (path.dirname(activeFile) !== ownedProfile) throw Error('Unexpected DevTools path');
  fs.rmSync(activeFile, { force: true });
  browser = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--no-first-run', '--no-default-browser-check', '--disable-session-crashed-bubble',
    '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--user-data-dir=' + ownedProfile, 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  port = undefined;
  for (let i = 0; i < 150; i++) {
    if (fs.existsSync(activeFile)) { port = Number(fs.readFileSync(activeFile, 'utf8').split('\n')[0]); break; }
    if (browser.exitCode !== null) throw Error('Owned Chrome exited ' + browser.exitCode);
    await sleep(100);
  }
  if (!port) throw Error('Owned DevTools unavailable');
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  browserClient = new Client({ id: 'browser', webSocketDebuggerUrl: version.webSocketDebuggerUrl });
  await browserClient.ready;
  observer = await newTab(true);
}
async function stopBrowser(hard = false, verifiedPids = []) {
  if (!browser || browser.exitCode !== null) return;
  const rootPid = browser.pid;
  if (hard) {
    if (!verifiedPids.includes(rootPid)) throw Error('Refusing to terminate an unverified process root');
    // Numeric PID from this script's spawn; never /IM or a discovered owner PID.
    const killed = spawnSync('taskkill.exe', ['/PID', String(rootPid), '/T', '/F'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    check(!killed.error && killed.status === 0, 'forced termination of the verified owned Chrome process tree succeeds');
    crashes++;
  } else {
    void browserClient.cdp('Browser.close', {}, 5000).catch(() => {});
  }
  await waitFor(() => browser.exitCode !== null || browser.signalCode !== null, 'owned Chrome root exit');
  for (const client of clients) client.dispose();
  await waitFor(() => ownedProcesses().length === 0, 'all profile-associated Chrome processes exited');
  if (hard) check(ownedProcesses().length === 0, 'browser, renderer and storage-service processes are all gone before restart');
  browser = null; observer = undefined; page = undefined;
}
async function newTab(observerOnly = false) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const tab = new Client(target);
  await tab.cdp('Runtime.enable'); await tab.cdp('Page.enable');
  await tab.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await tab.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (observerOnly) {
    await tab.cdp('Fetch.enable', { patterns: [{ urlPattern: origin + '/?browser-crash-observer=*', resourceType: 'Document', requestStage: 'Request' }] });
    tab.on('Fetch.requestPaused', ({ requestId }) => {
      void tab.cdp('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
        body: Buffer.from('<!doctype html><title>BODYFORGE owned crash observer</title>').toString('base64'),
      });
    });
  }
  await tab.cdp('Page.navigate', { url: origin + (observerOnly ? '/?browser-crash-observer=' + target.id : '/') });
  await tab.until('location.origin===' + JSON.stringify(origin), 'new same-origin document');
  if (!observerOnly) await tab.until("!!document.querySelector('.app-shell,[data-storage-status]')", 'App mounted');
  return tab;
}
async function storage() {
  return observer.js(`(()=>{const raw=localStorage.getItem(${JSON.stringify(key)});return{raw,profile:raw?JSON.parse(raw):null,
    journals:Object.keys(localStorage).filter(k=>k.startsWith(${JSON.stringify(prefix)})).map(k=>({key:k,raw:localStorage.getItem(k)}))}})()`);
}
async function click(selector) {
  check(await page.js('(()=>{const b=document.querySelector(' + JSON.stringify(selector) + ');if(!b||b.disabled)return false;b.click();return true})()'), 'action: ' + selector);
  await sleep(100);
}
async function startTower() {
  await page.js(`(async()=>{
    const source=await(await fetch('/src/App.tsx')).text(),start=source.indexOf('/node_modules/.vite/deps/@mediapipe_tasks-vision.js?v=');
    if(start<0)throw Error('MediaPipe module URL missing');
    const mp=await import(source.slice(start).split(String.fromCharCode(34))[0].split(String.fromCharCode(39))[0]);
    const rep=[170,170,170,158,144,132,125,120,119,124,138,151,165,170,172,173];
    const angles=[170,170,170,...Array.from({length:20},()=>rep).flat()];window.__poseCalls=0;
    mp.FilesetResolver.forVisionTasks=async()=>({});
    mp.PoseLandmarker.createFromOptions=async()=>({close(){},detectForVideo(video){
      const angle=angles[Math.min(window.__poseCalls++,angles.length-1)],r=(180-angle)*Math.PI/180;
      const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0}));
      p[23]={x:.5,y:.30,visibility:.98};p[25]={x:.5,y:.51,visibility:.98};
      p[27]={x:.5+.22*Math.sin(r)/(video.videoWidth/video.videoHeight),y:.51+.22*Math.cos(r),visibility:.98};
      p[11]={x:.46,y:.14,visibility:.98};p[12]={x:.54,y:.14,visibility:.98};return{landmarks:[p]};
    }});return true;
  })()`);
  await click('.mobile-nav button:nth-child(4)'); await click('#tower .forge-solid-button');
  await page.until("!!document.querySelector('.live-tag')", 'synthetic camera active');
}
async function armBoundary(kind) {
  await page.cdp('Debugger.enable'); page.paused = false;
  page.on('Debugger.paused', () => { page.paused = true; });
  page.on('Runtime.consoleAPICalled', (params) => {
    if (params.args?.[0]?.value === 'BODYFORGE_OWNED_BROWSER_BOUNDARY') page.boundary = JSON.parse(params.args[1].value);
  });
  await page.js(`(()=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;let armed=true,written=null;
    Storage.prototype.setItem=function(k,v){const out=set.call(this,k,v);if(k.startsWith(${JSON.stringify(prefix)}))written={key:k,raw:v};return out};
    const stop=(k,raw)=>{console.info('BODYFORGE_OWNED_BROWSER_BOUNDARY',JSON.stringify({kind:${JSON.stringify(kind)},key:k,journalRaw:raw,primaryRaw:get.call(localStorage,${JSON.stringify(key)}),poseCalls:window.__poseCalls}));debugger;};
    Storage.prototype.getItem=function(k){const raw=get.call(this,k);if(armed&&${JSON.stringify(kind)}==='journal'&&written?.key===k&&written.raw===raw){armed=false;stop(k,raw)}return raw};
    Storage.prototype.removeItem=function(k){if(armed&&${JSON.stringify(kind)}==='primary'&&k.startsWith(${JSON.stringify(prefix)})){armed=false;stop(k,get.call(this,k))}return remove.call(this,k)};return true})()`);
}
function oneTower(profile, sessionId) {
  return profile?.profileId === player.profileId && profile.xp === 185 && profile.coins === 65
    && profile.workouts.length === 1 && profile.game.highestClearedFloor === 1
    && profile.workouts[0].id === sessionId && profile.creditedWorkoutIds.filter((id) => id === sessionId).length === 1;
}
async function crashCase(kind) {
  // Fixture setup closes gracefully BEFORE the exercise so the old profile is a
  // known baseline. There is no flush, sleep or observer RPC at the crash boundary.
  await startBrowser();
  await observer.js(`localStorage.clear();localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(player))});true`);
  await stopBrowser(); await startBrowser();
  check((await storage()).profile?.xp === 0, kind + ': known baseline survives a complete setup restart');
  page = await newTab(); await armBoundary(kind); await startTower();
  const verifiedPids = verifyOwnedBrowser();
  await waitFor(() => page.paused && !!page.boundary, kind + ': complete App workout reaches commit cutpoint', 65000);
  const cutpoint = page.boundary, result = JSON.parse(cutpoint.journalRaw), primary = JSON.parse(cutpoint.primaryRaw);
  check(cutpoint.poseCalls >= 320 && result.repetitions === 20, kind + ': real App finish reaches the exact instrumented boundary');
  check(result.profileId === player.profileId && result.floor === 1 && !!result.sessionId, kind + ': journal retains frozen profile/session/floor');
  check(kind === 'journal' ? primary.xp === 0 && primary.workouts.length === 0 : oneTower(primary, result.sessionId),
    kind + ': observed primary matches the intended before-reward or after-credit cutpoint');
  const killedAt = Date.now();
  await stopBrowser(true, verifiedPids);
  const exitDelayMs = Date.now() - killedAt;
  await startBrowser();
  const beforeApp = await storage();
  const observation = { kind, sessionId: result.sessionId, cutpoint: { xp: primary.xp, coins: primary.coins },
    restartBeforeApp: beforeApp, stopAndVerificationMs: exitDelayMs };
  observations.push(observation);
  console.log('RESTART_READBACK', JSON.stringify(observation));
  page = await newTab();
  // App reconciliation is asynchronous. Wait for its actual write queue to settle,
  // but do not disguise absent disk data by injecting the captured RAM envelope.
  await sleep(1000);
  const afterApp = await storage(); observation.afterApp = afterApp;
  check(oneTower(afterApp.profile, result.sessionId) && afterApp.journals.length === 0,
    kind + ': whole browser crash/restart recovers exactly one reward and removes only verified journal');
  await page.js('window.__documentSentinel=true;true'); await page.cdp('Page.reload', { ignoreCache: true });
  await page.until('window.__documentSentinel===undefined && !!document.querySelector(".app-shell")', 'new reload document');
  await sleep(250);
  check(oneTower((await storage()).profile, result.sessionId), kind + ': later real reload never duplicates XP, coins or floor');
  await stopBrowser();
}

try {
  for (const kind of ['journal', 'primary']) {
    try { await crashCase(kind); }
    catch (error) {
      failures.push({ kind, error: error.stack || String(error) });
      console.error('CASE_FAIL', JSON.stringify(failures.at(-1)));
      if (browser?.exitCode === null) {
        // Dispose only this known owned profile before proceeding to the other case.
        await stopBrowser(true, verifyOwnedBrowser());
      }
    }
  }
  console.log(failures.length ? 'BODYFORGE_BROWSER_CRASH_FAIL' : 'BODYFORGE_BROWSER_CRASH_PASS',
    JSON.stringify({ assertions, crashes, observations, failures, limit: 'whole Chrome process crash, not power loss' }));
  if (failures.length) process.exitCode = 18;
} catch (error) {
  console.error('BODYFORGE_BROWSER_CRASH_BLOCKED', error.stack || String(error)); process.exitCode = 19;
} finally {
  if (browser?.exitCode === null) {
    try { await stopBrowser(true, verifyOwnedBrowser()); }
    catch (error) { console.error('OWNED_BROWSER_CLEANUP_BLOCKED', error.message); process.exitCode ||= 20; }
  }
  for (const client of clients) client.dispose();
  if (path.dirname(ownedProfile) !== os.tmpdir() || !path.basename(ownedProfile).startsWith('bf-browser-crash-')) throw Error('Unexpected temp cleanup target');
  if (!browser || browser.exitCode !== null) {
    try { fs.rmSync(ownedProfile, { recursive: true, force: true }); }
    catch { console.error('TEMP_CLEANUP_BLOCKED', ownedProfile); process.exitCode ||= 21; }
  }
}
