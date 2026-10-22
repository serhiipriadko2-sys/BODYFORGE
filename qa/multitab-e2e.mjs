// Real independent Chrome pages, one disposable profile and one local origin.
// --red deliberately exercises the synchronous pre-lock API for RED evidence.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('QA requires a loopback HTTP origin');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-multitab-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const key = 'bodyforge:pilot:v1', backupKey = key + ':backup';
const legacy = process.argv.includes('--red');
const clients = new Set(), observations = {};
let port, assertions = 0;

function check(condition, label) {
  if (!condition) throw Error('FAIL ' + label);
  assertions++;
  console.log('PASS', label);
}
async function waitFor(read, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await read()) return; await sleep(50); }
  throw Error('TIMEOUT ' + label);
}
class Client {
  constructor(target) {
    this.target = target;
    this.socket = new WebSocket(target.webSocketDebuggerUrl);
    this.seq = 0; this.requests = new Map(); this.listeners = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data.toString());
      if (this.requests.has(message.id)) {
        this.requests.get(message.id)(message); this.requests.delete(message.id);
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params);
    });
    clients.add(this);
  }
  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(listener);
    return () => this.listeners.get(method).delete(listener);
  }
  async cdp(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => { this.requests.delete(id); reject(Error(method + ' timeout')); }, 20000);
      this.requests.set(id, (message) => {
        clearTimeout(timer);
        message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async js(expression) {
    const value = await this.cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
    return value.result.value;
  }
  async until(expression, label, timeout) { return waitFor(() => this.js(expression), label, timeout); }
  async close() {
    await fetch(`http://127.0.0.1:${port}/json/close/${this.target.id}`);
    this.socket.close(); clients.delete(this);
  }
}

// CDP fulfills only the document, with no application UI. Imports below still
// execute the actual Vite-served product module in each same-origin tab.
async function newTab() {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const tab = new Client(target);
  await tab.cdp('Runtime.enable'); await tab.cdp('Page.enable');
  await tab.cdp('Fetch.enable', { patterns: [{ urlPattern: origin + '/?multitab-qa=*', resourceType: 'Document', requestStage: 'Request' }] });
  tab.on('Fetch.requestPaused', ({ requestId }) => {
    void tab.cdp('Fetch.fulfillRequest', { requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
      body: Buffer.from('<!doctype html><title>BODYFORGE disposable two-tab QA</title>').toString('base64'),
    });
  });
  await tab.cdp('Page.navigate', { url: origin + '/?multitab-qa=' + target.id });
  await tab.until('location.origin===' + JSON.stringify(origin), 'same-origin test document');
  await tab.js('(async()=>{window.mod=await import("/src/lib/progression.ts");window.gameMod=await import("/src/lib/game.ts");return true})()');
  if (legacy) {
    await tab.js('window.persist=(profile,options)=>mod.saveProfile(profile,options);true');
  } else {
    await tab.js('(async()=>{window.lockMod=await import("/src/lib/profileLock.ts");window.persist=(profile,options)=>lockMod.withProfileWriteLock(()=>mod.saveProfile(profile,{expectedRaw:options.expectedRaw}),options).then(result=>result.status==="completed"?result.value:result);return true})()');
  }
  return tab;
}
async function seed(tab) {
  await tab.js(`(()=>{
    window.base=mod.parseProfile({xp:0,coins:100,workouts:[],game:{...gameMod.freshGame(),created:true,nickname:'TWO TAB QA'}});
    localStorage.clear();window.raw=JSON.stringify(base);localStorage.setItem(${JSON.stringify(key)},raw);
    localStorage.setItem(${JSON.stringify(backupKey)},JSON.stringify({...base,coins:80}));return true;
  })()`);
}
async function prepare(tab, coins) {
  await tab.js(`(()=>{window.raw=localStorage.getItem(${JSON.stringify(key)});window.next={...mod.parseProfile(JSON.parse(raw)),coins:${coins}};window.result=null;window.started=false;return true})()`);
}
async function startSave(tab) {
  await tab.js('(()=>{window.started=true;Promise.resolve(persist(next,{expectedRaw:raw})).then(value=>{window.result=value},error=>{window.result={thrown:String(error)}});return true})()');
}
async function storage(tab) {
  return tab.js(`({primary:localStorage.getItem(${JSON.stringify(key)}),backup:localStorage.getItem(${JSON.stringify(backupKey)})})`);
}
async function actualApp(tab, reload = false) {
  await tab.cdp('Fetch.disable');
  await tab.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await tab.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  let loaded = false;
  const remove = tab.on('Page.loadEventFired', () => { loaded = true; });
  try {
    if (reload) await tab.cdp('Page.reload', { ignoreCache: true });
    else await tab.cdp('Page.navigate', { url: origin + '/' });
    await waitFor(async () => loaded, 'fresh application document loaded');
  } finally { remove(); }
  await tab.until('!!document.querySelector(".app-shell")', 'actual application hook mounted');
  await tab.js('(async()=>{window.mod=await import("/src/lib/progression.ts");window.gameMod=await import("/src/lib/game.ts");return true})()');
  await sleep(200);
}
async function hold(tab, lockName, operation = '') {
  await tab.js(`(()=>{window.holding=false;navigator.locks.request(${JSON.stringify(lockName)},async()=>{
    window.holding=true;${operation}await new Promise(resolve=>window.release=resolve);
  });return true})()`);
  await tab.until('holding', 'actual browser lock held for UI scheduling');
}

try {
  await waitFor(() => {
    const file = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(file)) { port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]); return port > 0; }
    if (chrome.exitCode !== null) throw Error('Owned Chrome exited ' + chrome.exitCode);
    return false;
  }, 'owned Chrome DevTools', 10000);
  let a = await newTab(), b = await newTab();
  check(a.target.id !== b.target.id, 'independent page targets share one disposable Chrome profile');
  check(await a.js('!!navigator.locks?.request') && await b.js('!!navigator.locks?.request'), 'Web Locks available in both actual loopback tabs');
  check(await b.js('typeof mod.saveProfile==="function"'), 'actual product persistence API loaded in the second tab');
  await seed(a); await prepare(a, 110); await prepare(b, 900);
  const initial = await storage(b);
  check(await a.js('raw') === await b.js('raw'), 'both writers start with the same actual localStorage revision');

  // Pause the first tab after its last compare and immediately before its primary
  // setItem. The second tab performs a real product save while A is paused.
  await a.cdp('Debugger.enable');
  let paused = false;
  a.on('Debugger.paused', () => { paused = true; });
  await a.js(`(()=>{const native=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===${JSON.stringify(key)}&&!window.__pausedOnce){window.__pausedOnce=true;debugger;}return native.call(this,k,v)};return true})()`);
  const runningA = startSave(a);
  await waitFor(async () => paused, 'first tab paused at its real primary write');
  let bBeforeRelease, lockSnapshot;
  try {
    await startSave(b);
    await sleep(250);
    bBeforeRelease = await b.js('({started,result})');
    lockSnapshot = await b.js('(async()=>await navigator.locks.query())()');
  } finally {
    await a.cdp('Debugger.resume'); await runningA;
  }
  await a.until('result!==null', 'first writer result');
  await b.until('result!==null', 'second writer result');
  const afterRace = await storage(b);
  const resultA = await a.js('result'), resultB = await b.js('result');
  observations.criticalSection = { bBeforeRelease, lockSnapshot, resultA, resultB,
    finalCoins: JSON.parse(afterRace.primary).coins, backupCoins: JSON.parse(afterRace.backup).coins };
  console.log('READBACK criticalSection', JSON.stringify(observations.criticalSection));
  check(bBeforeRelease.started && bBeforeRelease.result === null, 'second tab waits while the first holds the write lock');
  check(lockSnapshot.held.length === 1 && lockSnapshot.pending.length === 1, 'browser observes one held exclusive lock and one queued request');
  check(resultA.status === 'saved' && resultB.status === 'conflict', 'first save succeeds and the queued stale writer conflicts');
  check(JSON.parse(afterRace.primary).coins === 110 && afterRace.backup === initial.primary, 'stale queued save changes neither primary nor validated backup');
  const lockName = lockSnapshot.held[0].name;
  check(await b.js('localStorage.getItem(' + JSON.stringify(key) + ')') === resultA.revision, 'other tab reads exactly the acknowledged winning revision');
  await a.cdp('Debugger.disable');

  // An abort signal cancels an actual queued lock request before any storage IO.
  await seed(a); await prepare(b, 700);
  await a.js(`(()=>{window.holding=false;window.holder=navigator.locks.request(${JSON.stringify(lockName)},async()=>{window.holding=true;await new Promise(resolve=>window.release=resolve)});return true})()`);
  await a.until('holding', 'explicit disposable lock holder');
  await b.js('(()=>{window.controller=new AbortController();window.result=null;persist(next,{expectedRaw:raw,signal:controller.signal}).then(value=>window.result=value,error=>window.result={thrown:String(error)});return true})()');
  await b.until('(async()=> (await navigator.locks.query()).pending.length===1)()', 'actual queued save before abort');
  const beforeAbort = await storage(b);
  await b.js('controller.abort();true');
  await b.until('result!==null', 'aborted save acknowledges cancellation');
  const abortResult = await b.js('result');
  check(abortResult.status === 'cancelled', 'aborted queued product save reports cancelled');
  check(JSON.stringify(await storage(b)) === JSON.stringify(beforeAbort), 'aborted save leaves primary and backup byte-identical');
  await a.js('release();true');
  await b.until('(async()=> (await navigator.locks.query()).held.length===0)()', 'holder release after abort');

  // Closing a holder must release its real Web Lock and let a live peer save.
  await seed(a); await prepare(b, 600);
  await a.js(`(()=>{window.holding=false;navigator.locks.request(${JSON.stringify(lockName)},async()=>{window.holding=true;await new Promise(()=>{})});return true})()`);
  await a.until('holding', 'holder before page close');
  await startSave(b);
  await b.until('(async()=> (await navigator.locks.query()).pending.length===1)()', 'queued peer before holder close');
  await a.close();
  await b.until('result!==null', 'peer proceeds after holder tab closes');
  check((await b.js('result')).status === 'saved' && JSON.parse((await storage(b)).primary).coins === 600, 'closing the holder releases its lock and the queued live peer saves');
  check(await b.js('(async()=>{const s=await navigator.locks.query();return !s.held.length&&!s.pending.length})()'), 'no abandoned browser locks remain after holder close');

  // A direct module caller owns its lifecycle signal: Chrome may keep the old
  // document in BFCache rather than destroy it. Actual-hook tests below verify
  // that the production pagehide handler supplies that cancellation itself.
  a = await newTab(); await seed(a); await prepare(b, 300);
  await a.js(`(()=>{window.holding=false;navigator.locks.request(${JSON.stringify(lockName)},async()=>{window.holding=true;await new Promise(resolve=>window.release=resolve)});return true})()`);
  await a.until('holding', 'holder before queued page navigation');
  await b.js('(()=>{const controller=new AbortController();window.addEventListener("pagehide",()=>controller.abort(),{once:true});persist(next,{expectedRaw:raw,signal:controller.signal}).then(value=>window.result=value);return true})()');
  await b.until('(async()=> (await navigator.locks.query()).pending.length===1)()', 'queued page before navigation');
  const beforeNavigation = await storage(a);
  await b.cdp('Page.navigate', { url: 'about:blank' });
  await a.until('(async()=> (await navigator.locks.query()).pending.length===0)()', 'caller pagehide signal cancels the queued request');
  await a.js('release();true');
  await a.until('(async()=> (await navigator.locks.query()).held.length===0)()', 'holder released after navigation');
  check(JSON.stringify(await storage(a)) === JSON.stringify(beforeNavigation), 'pagehide-cancelled direct caller never writes its obsolete primary or backup');

  // Missing lock support cannot silently enable an unprotected write fallback.
  b = await newTab(); await prepare(b, 400);
  const beforeUnsupported = await storage(b);
  await b.js('Object.defineProperty(navigator,"locks",{value:undefined,configurable:true});true');
  await startSave(b); await b.until('result!==null', 'missing lock result');
  check((await b.js('result')).status === 'unavailable', 'missing Web Locks reports unavailable');
  check(JSON.stringify(await storage(b)) === JSON.stringify(beforeUnsupported), 'missing Web Locks makes zero primary or backup writes');
  observations.lifecycle = { abortResult, navigationPreserved: true, unsupportedPreserved: true };

  // Real app hooks and real storage events, with no synthetic StorageEvent.
  await b.close(); b = await newTab();
  await seed(a);
  for (const tab of [a, b]) await actualApp(tab);
  check(await a.js('localStorage.getItem(' + JSON.stringify(key) + ')') === await b.js('localStorage.getItem(' + JSON.stringify(key) + ')'), 'actual app tabs agree on their starting disk save');
  await a.js('document.querySelector("#quests .quest-button").click();true');
  await a.until('JSON.parse(localStorage.getItem(' + JSON.stringify(key) + ')).coins===110', 'first tab login reward durable');
  await b.until('document.querySelector("[data-storage-status]")?.dataset.storageStatus==="conflict"', 'real cross-tab storage event blocks stale app');
  const afterLogin = await storage(a);
  check(JSON.parse(afterLogin.primary).coins === 110, 'login from the first real UI tab pays exactly once');
  check(await b.js('!!document.querySelector("[data-action=load-latest]")'), 'stale real UI offers an explicit latest-save action');
  await b.js('document.querySelector("[data-action=load-latest]").click();true');
  await b.until('!!document.querySelector(".app-shell")&&!document.querySelector("[data-storage-status]")', 'second app loads latest revision');
  await b.js('document.querySelector("#quests .quest-button").click();true');
  await sleep(250);
  check(JSON.stringify(await storage(b)) === JSON.stringify(afterLogin), 'loading latest then revisiting the login claim does not duplicate or rewrite its reward');

  // The actual hook must cancel a queued mutation when the user chooses latest.
  // Tab A writes only inside its acquired lock, then keeps holding it so B has
  // time to inspect the real event and explicitly discard its obsolete profile.
  await seed(a); for (const tab of [a, b]) await actualApp(tab);
  await hold(a, lockName, `await new Promise(resolve=>window.writeNow=resolve);
    window.heldResult=mod.saveProfile({...mod.parseProfile(JSON.parse(localStorage.getItem(${JSON.stringify(key)}))),coins:900},{expectedRaw:localStorage.getItem(${JSON.stringify(key)})});`);
  await b.js('document.querySelector("#quests .quest-button").click();true');
  await a.until('(async()=> (await navigator.locks.query()).pending.length===1)()', 'actual hook queues its login write');
  await a.js('writeNow();true');
  await a.until('heldResult?.status==="saved"', 'holder publishes its actual competing save');
  await b.until('document.querySelector("[data-storage-status]")?.dataset.storageStatus==="conflict"', 'queued hook detects the real competing write');
  const beforeLatest = await storage(a);
  await b.js('document.querySelector("[data-action=load-latest]").click();true');
  await b.until('!!document.querySelector(".app-shell")&&!document.querySelector("[data-storage-status]")', 'explicit latest replaces pending in-memory state');
  await a.until('(async()=> (await navigator.locks.query()).pending.length===0)()', 'explicit latest cancels the obsolete queued hook write');
  await a.js('release();true');
  await a.until('(async()=> (await navigator.locks.query()).held.length===0)()', 'holder exits after explicit latest');
  check(JSON.stringify(await storage(a)) === JSON.stringify(beforeLatest) && JSON.parse(beforeLatest.primary).coins === 900,
    'actual hook reload action prevents its queued stale login from changing primary or backup');

  // A real page reload destroys the queued operation; mounting the unchanged
  // profile must not enqueue an automatic stale replacement or pay the reward.
  await seed(a); for (const tab of [a, b]) await actualApp(tab);
  await hold(a, lockName);
  await b.js('document.querySelector("#quests .quest-button").click();true');
  await a.until('(async()=> (await navigator.locks.query()).pending.length===1)()', 'hook write queued before real page reload');
  const beforeReload = await storage(a);
  await actualApp(b, true);
  await a.until('(async()=> (await navigator.locks.query()).pending.length===0)()', 'page reload drops the obsolete write and does not enqueue unchanged profile');
  await a.js('release();true');
  await a.until('(async()=> (await navigator.locks.query()).held.length===0)()', 'holder exits after page reload');
  check(JSON.stringify(await storage(a)) === JSON.stringify(beforeReload), 'actual page reload never commits the abandoned login or rewrites backup');

  await hold(a, lockName);
  await b.js('document.querySelector("#quests .quest-button").click();true');
  await a.until('(async()=> (await navigator.locks.query()).pending.length===1)()', 'hook write queued before closing its page');
  const beforeClose = await storage(a);
  await b.close();
  await a.until('(async()=> (await navigator.locks.query()).pending.length===0)()', 'closing the queued UI page removes its request');
  await a.js('release();true');
  await a.until('(async()=> (await navigator.locks.query()).held.length===0)()', 'holder exits after queued UI closes');
  check(JSON.stringify(await storage(a)) === JSON.stringify(beforeClose), 'closing an actual app page never commits its queued obsolete profile');

  // Two actions in the same live tab supersede its queued snapshot, preserving
  // both earned and spent coins rather than submitting an outdated first save.
  b = await newTab(); await seed(a);
  for (const tab of [a, b]) await actualApp(tab);
  await hold(a, lockName);
  await b.js('document.querySelector("#quests .quest-button").click();true');
  await a.until('(async()=> (await navigator.locks.query()).pending.length===1)()', 'first same-tab action queued');
  await b.js('document.querySelector(".mobile-nav button:nth-child(3)").click();true');
  await b.until('!!document.querySelector("#forge .muscle-card button")', 'actual upgrade action available');
  check(await b.js('(()=>{const button=document.querySelector("#forge .muscle-card button");if(button.disabled)return false;button.click();return true})()'), 'same tab performs its real upgrade while the login save waits');
  await b.until('document.querySelector("#forge .muscle-pips")?.getAttribute("aria-label")==="Уровень 1 из 5"', 'pending in-memory upgrade reflected');
  await sleep(100);
  check(await a.js('(async()=> (await navigator.locks.query()).pending.length===1)()'), 'superseding the queued snapshot leaves exactly one live write request');
  await a.js('release();true');
  await b.until('(()=>{const value=JSON.parse(localStorage.getItem(' + JSON.stringify(key) + '));return value.coins===85&&value.game.muscles.arms===1})()', 'combined login and upgrade durable');
  const combined = await storage(b);
  await actualApp(b, true);
  check(JSON.stringify(await storage(b)) === JSON.stringify(combined), 'combined earned and spent coins plus muscle upgrade survive reload without replay');

  // Explicit recovery uses the same lock as routine saves. It may not quarantine
  // or replace anything until the competing protected operation has released it.
  await seed(a);
  await a.js('localStorage.setItem(' + JSON.stringify(key) + ',"{broken");true');
  await b.close(); b = await newTab(); await b.cdp('Fetch.disable');
  await b.cdp('Page.navigate', { url: origin + '/' });
  await b.until('document.querySelector("[data-storage-status]")?.dataset.storageStatus==="recovery-required"', 'real recovery UI for disposable damaged fixture');
  await hold(a, lockName);
  const beforeRecovery = await storage(a);
  await b.js('document.querySelector("[data-action=restore-backup]").click();true');
  await a.until('(async()=> (await navigator.locks.query()).pending.length===1)()', 'explicit recovery queues behind a live write lock');
  check(JSON.stringify(await storage(a)) === JSON.stringify(beforeRecovery)
    && await a.js('!Object.keys(localStorage).some(key=>key.includes(":quarantine:"))'),
  'queued recovery preserves exact damaged primary, backup, and quarantine until lock grant');
  await a.js('release();true');
  await b.until('!!document.querySelector(".app-shell")', 'recovery completes after lock grant');
  check(JSON.parse((await storage(a)).primary).coins === 80
    && await a.js('Object.keys(localStorage).some(key=>key.includes(":quarantine:")&&localStorage.getItem(key)==="{broken")'),
  'protected recovery restores the valid backup and quarantines the exact damaged original');

  // The supported browser normally has Web Locks; remove that property only in
  // this disposable page to verify the actual app's refusal and recovery copy.
  await seed(a); await actualApp(b);
  const beforeUnsupportedUI = await storage(b);
  await b.js('Object.defineProperty(navigator,"locks",{value:undefined,configurable:true});document.querySelector("#quests .quest-button").click();true');
  await b.until('document.querySelector("[data-storage-status]")?.dataset.storageStatus==="unavailable"', 'actual app fails closed without Web Locks');
  check(JSON.stringify(await storage(b)) === JSON.stringify(beforeUnsupportedUI), 'unsupported actual app mutation makes zero durable writes');
  check(await b.js('/HTTPS/.test(document.querySelector("[data-storage-status]").textContent)'), 'unsupported browser UI explains the secure-context or browser requirement');
  observations.ui = { durableCoins: JSON.parse(afterLogin.primary).coins, realStorageEvent: true,
    queuedLatestCancelled: true, queuedPageReloadCancelled: true, queuedPageCloseCancelled: true,
    supersededSnapshotPreserved: true, recoveryProtected: true, unsupportedMutationRefused: true };
  console.log('BODYFORGE_MULTITAB_PASS', JSON.stringify({ assertions, observations }));
} catch (error) {
  console.error('BODYFORGE_MULTITAB_FAIL', error.stack || String(error));
  console.log('READBACK', JSON.stringify({ assertions, observations, legacy }));
  process.exitCode = 16;
} finally {
  for (const tab of clients) tab.socket.close();
  chrome.kill(); await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); }
  catch { console.error('TEMP_CLEANUP_BLOCKED', profile); process.exitCode ||= 17; }
}
