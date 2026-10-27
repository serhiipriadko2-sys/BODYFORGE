// End-to-end contract for original BODYFORGE planning UI.
// Isolated Chrome profile; no access to the owner's camera or saved profile.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

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
async function inspect(width) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(250);
  const result = await read("({width:innerWidth,scroll:document.documentElement.scrollWidth,sections:[...document.querySelectorAll('#daily-plan,#step-log')].filter(x=>getComputedStyle(x).display!=='none').length})");
  check(result.width === width && result.scroll <= width && result.sections === 2,
    'daily planner and step note have no horizontal overflow at ' + width + 'px');
}
try {
  let port;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (browser.exitCode !== null) throw Error('Chrome exited unexpectedly');
    try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); if (port) break; } catch {}
    await sleep(110);
  }
  if (!port) throw Error('Chrome debugging port missing');
  const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
  const page = tabs.find((tab) => tab.type === 'page');
  if (!page) throw Error('Page tab unavailable');
  socket = new WebSocket(page.webSocketDebuggerUrl);
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
  check(await js("!document.querySelector('#daily-plan')"), 'planner is hidden until a fighter exists');
  await click('#onboarding .forge-solid-button');
  await until("!!document.querySelector('#daily-plan') && !!document.querySelector('#step-log') && !document.querySelector('#onboarding')", 'dashboard planning sections');
  await until("!!localStorage.getItem('bodyforge:pilot:v1')", 'created fighter saved');
  const initial = await read("({goal:document.querySelector('[data-goal-target]')?.dataset.goalTarget,completed:document.querySelector('[data-goal-completed]')?.dataset.goalCompleted,steps:document.querySelector('[data-manual-steps]')?.dataset.manualSteps,xp:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')).xp,coins:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')).coins})");
  check(initial.goal === '20' && initial.completed === '0' && initial.steps === '0', 'new fighter has clear daily plan and manual steps defaults');
  const originalProfile = await js("localStorage.getItem('bodyforge:pilot:v1')");
  await click('#daily-plan .bf-small-action');
  await click('#daily-plan [aria-label="Увеличить цель на 20"]');
  await click('#daily-plan .bf-goal-save');
  check(await js("document.querySelector('[data-goal-target]')?.dataset.goalTarget==='40' && JSON.parse(localStorage.getItem('bodyforge:daily-plan:v1')).targetReps===40"), 'daily goal persists as a separate 40-rep preference');
  const editValue = "(()=>{const input=document.querySelector('#bf-steps-today');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,'4321');input.dispatchEvent(new Event('input',{bubbles:true}));return true})()";
  check(await js(editValue), 'user can type a step estimate');
  await click('#step-log .bf-step-input-row button');
  const steps = await read("({count:document.querySelector('[data-manual-steps]')?.dataset.manualSteps,record:JSON.parse(localStorage.getItem('bodyforge:manual-steps:v1')),xp:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')).xp,coins:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')).coins,notice:document.querySelector('#step-log')?.textContent})");
  check(steps.count === '4321' && steps.record.source === 'manual' && steps.record.count === 4321, 'saved steps explicitly say manual, not synced');
  check(steps.notice.includes('не дают XP, монет или ресурсов') && steps.notice.includes('ЕЩЁ НЕ ПОДКЛЮЧЁН'), 'Health Connect is not falsely presented as active');
  check(steps.xp === initial.xp && steps.coins === initial.coins && await js("localStorage.getItem('bodyforge:pilot:v1')") === originalProfile,
    'editing goals and steps never changes progression or saved profile');
  await inspect(390);
  await js("document.querySelector('#daily-plan').scrollIntoView({block:'start'});true");
  await sleep(350);
  const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const shot = path.join(os.tmpdir(), 'bf-training-experience-mobile.png');
  fs.writeFileSync(shot, Buffer.from(screenshot.data, 'base64'));
  console.log('SHOT', shot);
  await inspect(360);
  await js("window.__experienceBeforeReload = true; true");
  await cdp('Page.reload', { ignoreCache: true });
  await until("window.__experienceBeforeReload===undefined && !!document.querySelector('[data-goal-target]') && !!document.querySelector('[data-manual-steps]')", 'persisted plan reload');
  check(await js("document.querySelector('[data-goal-target]').dataset.goalTarget==='40' && document.querySelector('[data-manual-steps]').dataset.manualSteps==='4321'"), 'saved plan and manual note survive reload');
  await click('.mobile-nav button:nth-child(2)');
  await until("!!document.querySelector('#challenge .bf-catalog-trigger')", 'catalog');
  check(await js("document.querySelector('#challenge .bf-capability').dataset.recognition==='camera-tested'"), 'squat remains the default selected camera exercise');
  await click('.bf-catalog-trigger');
  check(await js("document.querySelectorAll('.bf-catalog-item').length===8"), 'all eight exercises have guides');
  await click('[data-exercise="pushup"]');
  check(await js("document.querySelector('.bf-guide[data-camera-guide=pushup]')?.textContent.includes('горизонтальный')===true"), 'push-up camera placement guide is exercise specific');
  await js("document.querySelector('.bf-guide').scrollIntoView({block:'start'});true");
  await sleep(250);
  const guideShot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const guidePath = path.join(os.tmpdir(), 'bf-training-camera-guide.png');
  fs.writeFileSync(guidePath, Buffer.from(guideShot.data, 'base64'));
  console.log('SHOT', guidePath);
  check(await js("document.querySelector('.bf-capability').dataset.recognition==='camera-experimental' && document.querySelector('#challenge .primary-button')?.textContent.includes('НАЧАТЬ ЗАКАЛКУ') && document.querySelector('.bf-guide-phone span')?.textContent==='16:9'"), 'pushup has an experimental camera counter and correct horizontal guide');
  check(await js("JSON.parse(localStorage.getItem('bodyforge:pilot:v1')).xp===0 && !document.querySelector('video.camera-visible')"), 'choosing pushup does not start camera or grant rewards');
  await click('[data-exercise="squat"]');
  check(await js("document.querySelector('.bf-capability').dataset.recognition==='camera-tested' && document.querySelector('#challenge .primary-button')?.textContent.includes('НАЧАТЬ ЗАКАЛКУ') && document.querySelector('.bf-guide-phone span')?.textContent==='9:16'"), 'squat mode can be selected again with its portrait guide');
  check(await js("JSON.parse(localStorage.getItem('bodyforge:pilot:v1')).xp===0 && !document.querySelector('video.camera-visible')"), 'catalog navigation alone cannot create rewards');
  console.log('BODYFORGE_TRAINING_EXPERIENCE_PASS checks=' + passed);
} catch (error) {
  console.error('BODYFORGE_TRAINING_EXPERIENCE_FAIL', error.stack || String(error));
  process.exitCode = 11;
} finally {
  socket?.close();
  browser.kill();
  await sleep(450);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
