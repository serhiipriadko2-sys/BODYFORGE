import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5240';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('QA accepts localhost only');
const dir = process.env.BODYFORGE_QA_ARTIFACT_DIR || 'docs/audits/BF_PULSE_DAYS_TOUCH_20261110';
if (fs.existsSync(dir)) throw Error('QA artifact folder exists, refusing overwrite');
fs.mkdirSync(dir, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-pulse-days-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  'about:blank',
], { stdio: 'ignore' });
const pending = new Map(), browserErrors = [];
let socket, seq = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function assert(ok, label) {
  if (!ok) throw Error('FAIL ' + label);
  console.log('PASS ' + label);
}
async function endpoint() {
  for (let i = 0; i < 90; i++) {
    try {
      const port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
      const page = tabs.find(p => p.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw Error('Chrome CDP endpoint unavailable');
}
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timeout = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 18000);
    pending.set(id, msg => {
      clearTimeout(timeout);
      msg.error ? reject(Error(JSON.stringify(msg.error))) : resolve(msg.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function js(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression, label, duration = 23000) {
  const deadline = Date.now() + duration;
  while (Date.now() < deadline) {
    if (await js(expression)) return;
    await sleep(150);
  }
  throw Error('TIMEOUT ' + label);
}
async function viewport(width) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height: 920, mobile: true, deviceScaleFactor: 1 });
  await sleep(170);
}
async function click(selector) {
  const worked = await js('(()=>{const e=document.querySelector(' + JSON.stringify(selector) + ');if(!e||e.disabled)return false;e.click();return true})()');
  assert(worked, 'Click ' + selector);
}
async function setRange(range) {
  await js('(()=>{const e=document.querySelector("#pulse-activity-range");e.value=' + JSON.stringify(String(range)) + ';e.dispatchEvent(new Event("change",{bubbles:true}));return true})()');
  await until('document.querySelector(".pulse-date-strip")?.dataset.period===' + JSON.stringify(String(range)) +
    ' && document.querySelectorAll(".pulse-date-button").length===' + range, 'range ' + range + ' mounted');
  await sleep(240);
}
function inspect() {
  const rail = document.querySelector('.pulse-date-strip');
  const buttons = [...rail.querySelectorAll('.pulse-date-button')];
  const rect = rail.getBoundingClientRect();
  const active = buttons.find(x => x.getAttribute('aria-pressed') === 'true');
  const a = active?.getBoundingClientRect();
  const detail = document.querySelector('.pulse-day-detail');
  return {
    pageWidth: document.documentElement.scrollWidth,
    viewport: innerWidth,
    range: Number(rail.dataset.period),
    width: rail.clientWidth, scrollWidth: rail.scrollWidth, scrollLeft: rail.scrollLeft,
    maxScrollLeft: rail.scrollWidth - rail.clientWidth,
    overflowX: getComputedStyle(rail).overflowX,
    snap: getComputedStyle(rail).scrollSnapType,
    buttons: buttons.map(x => ({ date: x.dataset.pulseDate, width: x.getBoundingClientRect().width,
      height: x.getBoundingClientRect().height, pressed: x.getAttribute('aria-pressed') })),
    activeDate: active?.dataset.pulseDate,
    activeVisible: !!a && a.left >= rect.left - 2 && a.right <= rect.right + 2,
    detail: detail?.dataset.selectedDay,
    activeCount: buttons.filter(x => x.getAttribute('aria-pressed') === 'true').length,
    regionFocus: rail.tabIndex >= 0,
  };
}
async function metrics() {
  return JSON.parse(await js('JSON.stringify((' + inspect.toString() + ')())'));
}
async function shot(filename) {
  await js('document.querySelector(".pulse-date-strip")?.scrollIntoView({block:"center",behavior:"instant"})');
  await sleep(100);
  const data = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(dir, filename), Buffer.from(data.data, 'base64'));
  console.log('SCREENSHOT ' + filename + ' ' + fs.statSync(path.join(dir, filename)).size + ' bytes');
}
try {
  socket = new WebSocket(await endpoint());
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data.toString());
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params?.exceptionDetails?.text || 'exception');
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await viewport(320);
  await cdp('Page.navigate', { url: origin });
  await until('!!document.querySelector("#onboarding .forge-solid-button")', 'onboarding');
  await click('.build-options button:nth-child(2)');
  await click('#onboarding .forge-solid-button');
  await until('document.querySelector(".app-shell")?.dataset.screen==="dashboard" && document.querySelectorAll(".pulse-date-button").length===7',
    'Forge chart mounted');
  const before = await js('localStorage.getItem("bodyforge:pilot:v1")');
  for (const width of [320, 360, 390, 428]) {
    await viewport(width);
    await setRange(30);
    await setRange(7); // trigger both the range reset and scroll-to-latest logic
    let data = await metrics();
    console.log('PULSE_WEEK_' + width, JSON.stringify(data));
    await shot('pulse-week-' + width + '.png');
    assert(data.buttons.length === 7 && data.activeCount === 1 && data.activeDate === data.buttons.at(-1).date,
      'exactly seven days and a single newest selected date at ' + width);
    assert(data.buttons.every(x => x.width >= 44 && x.height >= 44),
      'every weekly day touch target >=44x44 at ' + width);
    assert(data.activeVisible, 'selected most recent weekly day visible at ' + width);
    assert(data.pageWidth <= width + 1, 'no document horizontal overflow at ' + width);
    assert(data.overflowX === 'auto' && data.snap.includes('x'), 'horizontal day list scroll snap at ' + width);
    assert(data.regionFocus, 'day list can receive keyboard focus at ' + width);
    if (width <= 390) assert(data.maxScrollLeft > 0, 'narrow weekly dates scroll instead of shrinking at ' + width);
    await js('document.querySelector(".pulse-date-strip").scrollLeft=0');
    await click('.pulse-date-button:first-child');
    data = await metrics();
    assert(data.activeDate === data.buttons[0].date && data.detail === data.activeDate && data.activeCount === 1,
      'first weekly day can be inspected at ' + width);
    await setRange(30);
    data = await metrics();
    console.log('PULSE_MONTH_' + width, JSON.stringify({
      count: data.buttons.length, minWidth: Math.min(...data.buttons.map(x => x.width)),
      activeVisible: data.activeVisible, scroll: data.maxScrollLeft,
    }));
    await shot('pulse-month-' + width + '.png');
    assert(data.buttons.length === 30 && data.buttons.every(x => x.width >= 44 && x.height >= 44),
      'all 30 month days have full touch targets at ' + width);
    assert(data.activeVisible && data.activeDate === data.buttons.at(-1).date,
      'most recent 30-day entry is visible at ' + width);
    assert(data.pageWidth <= width + 1, '30-day rail does not overflow the page at ' + width);
    await js('document.querySelector(".pulse-date-strip").scrollLeft=0');
    await click('.pulse-date-button:first-child');
    data = await metrics();
    assert(data.activeDate === data.buttons[0].date && data.detail === data.activeDate && data.activeCount === 1,
      'oldest monthly day selects matching detail at ' + width);
    assert(await js('localStorage.getItem("bodyforge:pilot:v1")') === before,
      'range and date selection never rewrite the saved fighter at ' + width);
  }
  await viewport(360);
  await setRange(7);
  const firstDate = (await metrics()).buttons[0].date;
  const focused = await js('(()=>{const e=document.querySelector(".pulse-date-button:first-child");e.focus();return document.activeElement===e})()');
  assert(focused, 'first date is keyboard focusable');
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await cdp('Input.dispatchKeyEvent', { type: 'char', text: '\r', unmodifiedText: '\r', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await until('document.querySelector(".pulse-day-detail")?.dataset.selectedDay===' + JSON.stringify(firstDate),
    'Enter selects the first date');
  assert((await metrics()).activeVisible, 'keyboard focus scrolls the first date into view');
  assert(browserErrors.length === 0, 'no uncaught browser errors');
  fs.writeFileSync(path.join(dir, 'pulse-days-qa.json'), JSON.stringify({ origin, complete: true, browserErrors }, null, 2));
  console.log('BODYFORGE_PULSE_DAY_TOUCH_E2E_PASS');
} catch (error) {
  console.error('BODYFORGE_PULSE_DAY_TOUCH_E2E_FAIL', error?.stack || String(error));
  console.error('BROWSER_ERRORS', JSON.stringify(browserErrors.slice(-4)));
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) try { await cdp('Browser.close'); } catch {}
  socket?.close();
  chrome.kill();
  await sleep(180);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
