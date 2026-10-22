// E2E: media runtime must be loaded only on user intent. Chrome runs with a
// disposable profile and fake webcam; the owner's camera/storage are untouched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-pose-on-demand-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pending = new Map(), urls = [];
let socket, seq = 0, checks = 0, pausedImport = null;
function check(ok, message) {
  if (!ok) throw Error('FAIL ' + message);
  checks++;
  console.log('PASS ' + message);
}
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timeout = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 25000);
    pending.set(id, (message) => {
      clearTimeout(timeout);
      message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function js(expression) {
  const data = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (data.exceptionDetails) throw Error(data.exceptionDetails.exception?.description || data.exceptionDetails.text);
  return data.result.value;
}
async function read(expression) { return JSON.parse(await js('JSON.stringify(' + expression + ')')); }
async function until(expression, label, durationMs = 20000) {
  const untilAt = Date.now() + durationMs;
  while (Date.now() < untilAt) {
    if (await js(expression)) return;
    await sleep(150);
  }
  throw Error('TIMEOUT ' + label);
}
async function click(selector) {
  check(await js('(()=>{const el=document.querySelector(' + JSON.stringify(selector) +
    ');if(!el||el.disabled)return false;el.click();return true})()'), 'click ' + selector);
}
const observeTracks = "(()=>{window.__qaTracks=[];const media=navigator.mediaDevices;const real=media.getUserMedia.bind(media);media.getUserMedia=async c=>{const s=await real(c);window.__qaTracks.push(...s.getTracks());return s;};return true})()";

try {
  let port;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (chrome.exitCode !== null) throw Error('Chrome exited: ' + chrome.exitCode);
    try {
      port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      if (port) break;
    } catch {}
    await sleep(120);
  }
  if (!port) throw Error('Chrome debugging port unavailable');
  const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
  const page = tabs.find((tab) => tab.type === 'page');
  if (!page) throw Error('Chrome page unavailable');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data.toString());
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    if (message.method === 'Network.requestWillBeSent') urls.push(message.params.request.url);
    if (message.method === 'Fetch.requestPaused' && /mediapipe_tasks-vision\.js/.test(message.params.request.url)) {
      pausedImport = message.params.requestId;
    }
  });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.navigate', { url: origin + '/' });
  await until("!!document.querySelector('#onboarding')", 'initial fighter screen');
  await sleep(1000);
  const moduleRequests = () => urls.filter((url) => /mediapipe.tasks.vision|mediapipe_tasks-vision|vision_bundle/i.test(url));
  check(moduleRequests().length === 0, 'home and onboarding never download the pose JavaScript');
  check(await js("!!document.querySelector('.app-shell')"), 'app renders without pose code');
  await click('#onboarding .forge-solid-button');
  await until("!document.querySelector('#onboarding')", 'fighter created');
  await click('.mobile-nav button:nth-child(2)');
  check(moduleRequests().length === 0, 'camera tab preview alone does not download pose JavaScript');
  check(await js(observeTracks), 'QA intercepts its own fake camera tracks');

  // Simulate a deleted or offline JavaScript chunk after the user starts.
  await cdp('Network.setBlockedURLs', { urls: ['*mediapipe_tasks-vision.js*', '*vision_bundle-*.js*'] });
  await click('#challenge .primary-button');
  await until("!!document.querySelector('.camera-error')", 'failed pose chunk handled', 45000);
  const failed = await read("({message:document.querySelector('.camera-error')?.textContent||'',reload:document.querySelector('#challenge .primary-button')?.textContent||'',videoCleared:document.querySelector('video.camera-feed')?.srcObject===null,tracks:(window.__qaTracks||[]).map(t=>t.readyState),xp:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')).xp,screen:document.querySelector('.app-shell')?.dataset.screen})");
  console.log('FAILED_IMPORT_RECOVERY', JSON.stringify(failed));
  check(failed.message.includes('не загрузился'), 'network error explains the failed camera runtime');
  check(failed.reload.includes('ОБНОВИТЬ'), 'failed chunk offers reload instead of a broken retry');
  check(failed.videoCleared && failed.tracks.length > 0 &&
    failed.tracks.every((state) => state === 'ended'), 'fake camera tracks are released on module failure');
  check(failed.xp === 0 && failed.screen === 'challenge', 'failed import awards no XP and retains camera navigation');

  await cdp('Network.setBlockedURLs', { urls: [] });
  await js("window.__qaBeforeReload=true;true");
  await cdp('Page.reload', { ignoreCache: true });
  await until("window.__qaBeforeReload===undefined && document.readyState==='complete' && !!document.querySelector('.mobile-nav button:nth-child(2)') && !!document.querySelector('.app-shell') && !document.querySelector('#onboarding')", 'reload retains created fighter', 45000);
  await sleep(500);
  check(await js(observeTracks), 'QA wraps recovered camera after reload');
  await click('.mobile-nav button:nth-child(2)');
  await click('#challenge .primary-button');
  await until("!!document.querySelector('.live-tag') && !!document.querySelector('video.camera-visible') && !document.querySelector('.loading-overlay')", 'live pose capture', 90000);
  check(moduleRequests().length >= 2, 'pose JavaScript requests occur after workout starts');
  const during = await read("({tracks:(window.__qaTracks||[]).map(t=>t.readyState),visible:!!document.querySelector('video.camera-visible')})");
  check(during.visible && during.tracks.includes('live'), 'camera and pose tracking recover after a full reload');
  await click('#challenge .secondary-button');
  await until("!document.querySelector('video.camera-visible')", 'manual camera stop');
  const stopped = await read("({tracks:(window.__qaTracks||[]).map(t=>t.readyState),xp:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')).xp})");
  check(stopped.tracks.length > 0 && stopped.tracks.every((state) => state === 'ended') &&
    stopped.xp === 0, 'manual stop releases stream without rewards');

  // A user may cancel while the dynamic module request is still pending.
  // When its response finally arrives, it must not resurrect a dead camera.
  await cdp('Network.setCacheDisabled', { cacheDisabled: true });
  await js("window.__qaBeforeReload=true;true");
  await cdp('Page.reload', { ignoreCache: true });
  await until("window.__qaBeforeReload===undefined && document.readyState==='complete' && !!document.querySelector('.mobile-nav button:nth-child(2)') && !!document.querySelector('.app-shell') && !document.querySelector('#onboarding')", 'fresh cancellation page', 45000);
  check(await js(observeTracks), 'QA instruments tracks for delayed import');
  await click('.mobile-nav button:nth-child(2)');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*mediapipe_tasks-vision.js*', requestStage: 'Request' }] });
  await click('#challenge .primary-button');
  const pausedUntil = Date.now() + 18000;
  while (!pausedImport && Date.now() < pausedUntil) await sleep(100);
  check(Boolean(pausedImport), 'pose module request can be held before its response');
  check(await js("!!document.querySelector('.loading-overlay')"), 'pending dynamic import keeps the workout loading');
  await click('#challenge .secondary-button');
  const cancelled = await read("({tracks:(window.__qaTracks||[]).map(t=>t.readyState),visible:!!document.querySelector('video.camera-visible'),xp:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')).xp})");
  check(cancelled.tracks.length > 0 && cancelled.tracks.every((state) => state === 'ended') &&
    !cancelled.visible && cancelled.xp === 0, 'cancellation immediately releases camera while JS import is pending');
  await cdp('Fetch.continueRequest', { requestId: pausedImport });
  await cdp('Fetch.disable');
  await sleep(1900);
  check(await js("!document.querySelector('video.camera-visible') && !document.querySelector('.live-tag') && JSON.parse(localStorage.getItem('bodyforge:pilot:v1')).xp===0"),
    'late module response never restarts a cancelled workout');
  console.log('BODYFORGE_ON_DEMAND_CAMERA_PASS', JSON.stringify({ checks, requests: moduleRequests().length }));
} catch (error) {
  console.error('BODYFORGE_ON_DEMAND_CAMERA_FAIL', error.stack || String(error));
  if (socket?.readyState === 1) try {
    console.error('FAILURE_READBACK', await js("JSON.stringify({url:location.href,ready:document.readyState,screen:document.querySelector('.app-shell')?.dataset.screen,nav:!!document.querySelector('.mobile-nav'),recovery:!!document.querySelector('.storage-recovery'),body:document.body?.textContent?.slice(0,140)})"));
  } catch {}
  process.exitCode = 12;
} finally {
  socket?.close();
  chrome.kill();
  await sleep(450);
  try { fs.rmSync(profile, { recursive: true, force: true }); }
  catch { console.error('Temporary Chrome cleanup failed:', profile); process.exitCode ||= 13; }
}
