// End-to-end contract for training guidance and manual steps.
// Isolated Chrome profile; no access to the owner's camera or saved profile.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { requirePreviewOrigin } from './owned-chrome.mjs';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-training-experience-'));
const browser = spawn(chromePath, [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0', '--user-data-dir=' + profile,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const callbacks = new Map();
let socket, sequence = 0, passed = 0;
function check(value, message) {
  if (!value) throw Error('FAIL ' + message);
  console.log('PASS ' + message);
  passed++;
}
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { callbacks.delete(id); reject(Error(method + ' timed out')); }, 25000);
    callbacks.set(id, (message) => {
      clearTimeout(timeout);
      message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function js(expression) {
  const data = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (data.exceptionDetails) throw Error(data.exceptionDetails.text);
  return data.result.value;
}
async function read(expression) {
  return JSON.parse(await js('JSON.stringify(' + expression + ')'));
}
async function until(expression, name, maxMs = 30000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await js(expression)) return;
    await sleep(140);
  }
  throw Error('TIMEOUT ' + name);
}
async function click(selector) {
  check(await js('(()=>{const b=document.querySelector(' + JSON.stringify(selector) + ');if(!b||b.disabled)return false;b.click();return true})()'), 'click ' + selector);
}
const savedProgress = "JSON.stringify(Object.entries(localStorage).filter(([key]) => key.startsWith('bodyforge:pilot:v1')).sort())";
async function inspect(width, height = 844) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  await until(`matchMedia('(width: ${width}px) and (height: ${height}px)').matches`, 'viewport applied');
  const result = await read(`(() => {
    const steps = document.querySelector('#step-log');
    const guide = document.querySelector('#challenge .bf-guide');
    return {
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      stepsVisible: steps?.getClientRects().length > 0,
      guideFits: !guide || guide.scrollWidth <= guide.clientWidth,
    };
  })()`);
  check(result.width === width && result.scroll <= width && result.stepsVisible && result.guideFits,
    'camera content fits ' + width + ' x ' + height + ' CSS px');
}
try {
  if (process.env.BODYFORGE_QA_EXPECT_ENTRY_SHA256) {
    await requirePreviewOrigin(origin, process.env.BODYFORGE_QA_EXPECT_ENTRY_SHA256);
  }
  let endpoint;
  for (let attempt = 0; attempt < 90; attempt++) {
    // A Windows Chrome launcher can exit 0 while its disposable headless
    // browser continues starting. Establish a real CDP page before proceeding.
    try {
      const port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      if (Number.isSafeInteger(port) && port > 0) {
        const response = await fetch('http://127.0.0.1:' + port + '/json', { signal: AbortSignal.timeout(1500) });
        if (response.ok) {
          const tabs = await response.json();
          endpoint = tabs.find((tab) => tab.type === 'page')?.webSocketDebuggerUrl;
          if (endpoint) { console.log('CDP_READY', port); break; }
        }
      }
    } catch { /* Browser still starting. */ }
    await sleep(150);
  }
  if (!endpoint) throw Error('Chrome debugging endpoint missing; launcher exit=' + String(browser.exitCode));
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data.toString());
    if (callbacks.has(message.id)) { callbacks.get(message.id)(message); callbacks.delete(message.id); }
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.navigate', { url: origin + '/' });
  await until("!!document.querySelector('#onboarding .forge-solid-button')", 'fighter creation');
  check(await js("!document.querySelector('#daily-plan')"), 'retired daily planner is absent on onboarding');
  await click('#onboarding .forge-solid-button');
  await until("!document.querySelector('#onboarding') && JSON.parse(localStorage.getItem('bodyforge:pilot:v1') || '{}').game?.created === true", 'created fighter saved');
  check(await js("document.querySelector('#quests')?.getClientRects().length > 0 && !document.querySelector('#daily-plan')"),
    'Forge offers missions without the retired planner');
  const originalProfile = await js(savedProgress);
  await click('.mobile-nav button:nth-child(2)');
  await until("document.querySelector('.app-shell')?.dataset.screen === 'challenge' && document.querySelector('#step-log summary')?.getClientRects().length > 0", 'camera steps');
  check(await js(`(() => {
    const steps = document.querySelector('#step-log');
    const metrics = [...steps.querySelectorAll('[data-step-auto]')];
    return !steps.querySelector('details').open && steps.querySelector('summary').dataset.syncState === 'unavailable' &&
      metrics.length === 2 && metrics.every(metric => metric.textContent === '—');
  })()`), 'web step card is collapsed and both automatic readings are explicitly unavailable');
  await js("document.querySelector('#step-log summary').click()");
  await until("document.querySelector('#bf-steps-today')?.getClientRects().length > 0", 'manual step editor');
  check(await js("document.querySelector('[data-manual-steps]')?.dataset.manualSteps === '0' && localStorage.getItem('bodyforge:manual-steps:v1') === null"), 'empty manual step note creates no record');
  const editValue = "(()=>{const input=document.querySelector('#bf-steps-today');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,'4321');input.dispatchEvent(new Event('input',{bubbles:true}));return true})()";
  check(await js(editValue), 'user can type a step estimate');
  await click('#step-log .bf-step-input-row button');
  await until("document.querySelector('[data-manual-steps]')?.dataset.manualSteps === '4321'", 'manual steps saved');
  const steps = await read("JSON.parse(localStorage.getItem('bodyforge:manual-steps:v1'))");
  check(steps.source === 'manual' && steps.count === 4321, 'saved steps explicitly say manual');
  check(await js("document.querySelector('#bf-steps-privacy')?.textContent.includes('не даёт наград') && document.querySelector('#step-log summary')?.dataset.syncState === 'unavailable'"),
    'manual steps stay separate from device sync and never award progress');
  check(await js(savedProgress) === originalProfile, 'editing steps preserves player and backup bytes');
  for (const width of [320, 360, 390, 428]) await inspect(width);
  await js("window.__experienceBeforeReload = true; true");
  await cdp('Page.reload', { ignoreCache: true });
  await until("window.__experienceBeforeReload === undefined && document.querySelector('.app-shell')?.dataset.fighterCreated === 'true'", 'saved fighter after reload');
  await click('.mobile-nav button:nth-child(2)');
  await until("document.querySelector('.app-shell')?.dataset.screen === 'challenge' && document.querySelector('#step-log summary')?.getClientRects().length > 0", 'camera steps after reload');
  await js("document.querySelector('#step-log summary').click()");
  check(await js("document.querySelector('[data-manual-steps]')?.dataset.manualSteps === '4321' && document.querySelector('#bf-steps-today')?.value === '4321'"),
    'manual step note survives reload and navigation');
  await until("!!document.querySelector('#challenge .bf-catalog-trigger')", 'catalog');
  check(await js("document.querySelector('#challenge .bf-capability').dataset.recognition==='camera-tested'"), 'squat remains the default selected camera exercise');
  await click('.bf-catalog-trigger');
  check(await js("document.querySelectorAll('.bf-catalog-item').length===8"), 'all eight exercises have guides');
  await click('[data-exercise="pushup"]');
  await until("!!document.querySelector('.bf-guide[data-camera-guide=pushup]')", 'push-up guide visible');
  check(await js("document.querySelector('.bf-guide[data-camera-guide=pushup]')?.textContent.toLowerCase().includes('горизонталь') === true"), 'push-up camera placement guide is exercise specific');
  await inspect(740, 390);
  await js("document.querySelector('.bf-guide').scrollIntoView({block:'start'});true");
  await sleep(250);
  const guideShot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const dir = process.env.BODYFORGE_QA_ARTIFACT_DIR || os.tmpdir();
  fs.mkdirSync(dir, { recursive: true });
  const guidePath = path.join(dir, 'bf-training-camera-guide.png');
  fs.writeFileSync(guidePath, Buffer.from(guideShot.data, 'base64'));
  console.log('SHOT', guidePath);
  check(await js("document.querySelector('.bf-capability').dataset.recognition==='camera-experimental' && document.querySelector('#challenge .primary-button')?.textContent.includes('НАЧАТЬ ЗАКАЛКУ') && document.querySelector('.bf-guide-phone span')?.textContent==='16:9'"), 'pushup has an experimental camera counter and correct horizontal guide');
  check(await js("JSON.parse(localStorage.getItem('bodyforge:pilot:v1')).xp===0 && !document.querySelector('video.camera-visible')"), 'choosing pushup does not start camera or grant rewards');
  await click('[data-exercise="squat"]');
  check(await js("document.querySelector('.bf-capability').dataset.recognition==='camera-tested' && document.querySelector('#challenge .primary-button')?.textContent.includes('НАЧАТЬ ЗАКАЛКУ') && document.querySelector('.bf-guide-phone span')?.textContent==='9:16'"), 'squat mode can be selected again with its portrait guide');
  check(await js(savedProgress) === originalProfile && await js("!document.querySelector('video.camera-visible')"),
    'catalog navigation leaves player bytes unchanged and never starts capture');
  console.log('BODYFORGE_TRAINING_EXPERIENCE_PASS checks=' + passed);
} catch (error) {
  console.error('BODYFORGE_TRAINING_EXPERIENCE_FAIL', error.stack || String(error));
  process.exitCode = 11;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { socket.send(JSON.stringify({ id: ++sequence, method: 'Browser.close' })); }
    catch { /* Headless Chrome may already be closing. */ }
  }
  await sleep(450);
  socket?.close();
  if (browser.exitCode === null) browser.kill();
  let removed = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    try { fs.rmSync(profile, { recursive: true, force: true }); removed = true; break; }
    catch { await sleep(250); }
  }
  if (!removed) { console.error('Temporary Chrome cleanup failed:', profile); process.exitCode ||= 13; }
}
