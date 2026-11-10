// Local production/dev regression: a missing optional chunk must not erase the game.
// An owned temporary Chrome profile supplies all data; no physical camera is used.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = new URL(process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173');
if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) {
  throw Error('Settings QA requires an explicit local HTTP origin');
}
const shots = path.resolve(process.env.BODYFORGE_QA_ARTIFACT_DIR || os.tmpdir());
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-settings-recovery-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map(), requests = [], exceptions = [];
let socket, seq = 0, checks = 0, paused = null, loads = 0;
function check(ok, label) { if (!ok) throw Error('FAIL ' + label); checks++; console.log('PASS', label); }
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 20000);
    pending.set(id, message => { clearTimeout(timer); message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result); });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function js(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(predicate, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await sleep(120); }
  throw Error('TIMEOUT ' + label);
}
const until = (expression, label) => waitFor(() => js(expression), label);
async function shot(name) {
  const image = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(shots, { recursive: true });
  const file = path.join(shots, 'settings-' + name + '.png');
  fs.writeFileSync(file, Buffer.from(image.data, 'base64'));
  console.log('SHOT', file);
}
async function tap(selector) {
  const point = await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;
    e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();
    const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);
    return r.width>0&&r.height>0&&hit&&(hit===e||e.contains(hit))?{x,y}:null})()`);
  check(point, 'visible, unobstructed touch control ' + selector);
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const settingsTab = '.mobile-nav [aria-label="Настройки и FAQ"]';
const primary = () => js("localStorage.getItem('bodyforge:pilot:v1')");
async function reload(recovery = false) {
  const before = loads;
  if (recovery) await tap('[data-action="reload-settings"]');
  else await cdp('Page.reload', { ignoreCache: true });
  await waitFor(() => loads > before, 'new document');
  await until("!!document.querySelector('.app-shell .mobile-nav')", 'hydrated app after reload');
}

try {
  let endpoint;
  await waitFor(async () => {
    try {
      const port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      const tabs = await (await fetch('http://127.0.0.1:' + port + '/json', { signal: AbortSignal.timeout(1200) })).json();
      endpoint = tabs.find(tab => tab.type === 'page')?.webSocketDebuggerUrl;
      return !!endpoint;
    } catch { return false; }
  }, 'owned Chrome CDP endpoint');
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data.toString());
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    if (message.method === 'Fetch.requestPaused') paused = message.params;
    if (message.method === 'Page.loadEventFired') loads++;
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
  });
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__qaCameraStarts=0;
    const media=navigator.mediaDevices; if(media){const original=media.getUserMedia.bind(media);
    media.getUserMedia=(...args)=>{window.__qaCameraStarts++;return original(...args)}}` });
  await cdp('Page.navigate', { url: origin.href });
  await until("!!document.querySelector('#onboarding .forge-solid-button')", 'onboarding');
  await tap('#onboarding .forge-solid-button');
  await until("JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').game?.created===true", 'created profile saved');
  const saved = await primary();
  check(!requests.some(url => /(?:SettingsFaq|ProgressBackupPanel)(?:-|\.tsx)/.test(url)), 'home does not download settings or backup');

  for (const moduleName of ['SettingsFaq', 'ProgressBackupPanel']) {
    if (moduleName !== 'SettingsFaq') await reload();
    paused = null;
    await cdp('Fetch.enable', { patterns: [{ urlPattern: '*' + moduleName + '*', resourceType: 'Script', requestStage: 'Request' }] });
    await tap(settingsTab);
    await waitFor(() => !!paused, moduleName + ' download intercepted');
    check(paused.request.url.includes(moduleName), 'the intended optional chunk is held: ' + moduleName);
    check(await js("(()=>{const e=document.querySelector('#settings [role=status]');return !!e&&e.getBoundingClientRect().height>0})()"), 'loading feedback remains visible');
    await cdp('Fetch.failRequest', { requestId: paused.requestId, errorReason: 'Failed' });
    await cdp('Fetch.disable');
    await until("!!document.querySelector('#settings [role=alert]')||!document.querySelector('.app-shell')", 'failure rendered');
    await shot(moduleName + '-failure');
    const failure = await js("({app:!!document.querySelector('.app-shell'),alert:!!document.querySelector('#settings [role=alert]'),cameraStarts:window.__qaCameraStarts})");
    console.log('OPTIONAL_CHUNK_FAILURE', JSON.stringify({ moduleName, ...failure }));
    check(failure.app && failure.alert, moduleName + ' failure stays inside settings and preserves navigation');
    check((await primary()) === saved, 'failed import preserves exact primary save');
    check(failure.cameraStarts === 0, 'opening settings does not start a camera');
    const target = await js("(()=>{const e=document.querySelector('[data-action=reload-settings]');const r=e.getBoundingClientRect(),n=document.querySelector('.mobile-nav').getBoundingClientRect();return {width:r.width,height:r.height,top:r.top,bottom:r.bottom,nav:n.top}})()");
    check(target.width >= 44 && target.height >= 44 && target.top >= 0 && target.bottom <= target.nav, 'recovery target is at least 44px and above navigation');
    await tap('.mobile-nav button:first-child');
    await until("document.querySelector('.app-shell')?.dataset.screen==='dashboard'", 'home survives error');
    await tap(settingsTab);
    await until("!!document.querySelector('#settings [role=alert]')", 'failed chunk remains recoverable after navigation');
    await reload(true);
    await tap(settingsTab);
    await until("!!document.querySelector('#progress-backup [data-action=prepare-progress]:not(:disabled)')", 'settings and backup recover after actual reload touch');
    check((await primary()) === saved, 'reload recovery preserves profile and credits no reward');
    check(await js("document.querySelectorAll('#settings .bf-faq-item').length>=4"), 'real FAQ renders after recovery');
  }
  for (const width of [320, 360, 390, 428]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
    await js('window.scrollTo(0,0)'); await sleep(180);
    const layout = await js("({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('.mobile-nav button')].map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height}})})");
    check(layout.scroll <= width && layout.buttons.length === 6 && layout.buttons.every(r => r.w >= 44 && r.h >= 44), width + 'px settings: no horizontal overflow, six usable touch targets');
    await shot('recovered-' + width);
  }
  check(exceptions.length === 0, 'no uncaught browser exceptions');
  check(!requests.some(url => /vision_bundle|mediapipe_tasks-vision/.test(url)), 'settings never downloads pose runtime');
  check((await primary()) === saved, 'all settings recovery and layout checks leave exact primary bytes intact');
  console.log('BODYFORGE_SETTINGS_RECOVERY_PASS', JSON.stringify({ checks, cases: 2, widths: [320, 360, 390, 428], origin: origin.origin }));
} catch (error) {
  console.error('BODYFORGE_SETTINGS_RECOVERY_FAIL', String(error));
  process.exitCode = 12;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: ++seq, method: 'Browser.close' }));
    await sleep(700); socket.close();
  }
  chrome.kill(); await sleep(500);
  if (path.dirname(profile) !== path.resolve(os.tmpdir()) || !path.basename(profile).startsWith('bf-settings-recovery-')) throw Error('Unexpected cleanup target');
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 }); }
  catch (error) { console.error('QA_PROFILE_CLEANUP_FAIL', String(error)); process.exitCode = 12; }
}
