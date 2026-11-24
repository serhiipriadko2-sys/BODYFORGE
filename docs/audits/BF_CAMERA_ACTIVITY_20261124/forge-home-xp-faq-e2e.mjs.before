import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5230';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
  throw new Error('Only isolated localhost preview origins are allowed');
}
const chromium = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-home-xp-faq-'));
const output = process.env.BODYFORGE_QA_ARTIFACT_DIR ||
  path.resolve('docs/audits/BF_FORGE_HOME_XP_FAQ_20261110');
fs.mkdirSync(output, { recursive: true });
const browser = spawn(chromium, [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;
let seq = 0;
const callbacks = new Map();
let browserErrors = [];
function assert(value, label) {
  if (!value) throw Error('FAIL ' + label);
  console.log('PASS ' + label);
}
async function endpoint() {
  for (let i = 0; i < 90; i++) {
    try {
      const port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
      const target = tabs.find((tab) => tab.type === 'page');
      if (target) return target.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw Error('Isolated Chrome CDP endpoint did not become available');
}
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      callbacks.delete(id);
      reject(Error('CDP timeout: ' + method));
    }, 18000);
    callbacks.set(id, (msg) => {
      clearTimeout(timer);
      msg.error ? reject(Error(JSON.stringify(msg.error))) : resolve(msg.result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function js(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
  return r.result.value;
}
async function until(expression, label, ms = 30000) {
  const expires = Date.now() + ms;
  while (Date.now() < expires) {
    if (await js(expression)) return;
    await sleep(140);
  }
  throw Error('TIMEOUT ' + label);
}
async function click(selector) {
  const found = await js('(()=>{const b=document.querySelector(' +
    JSON.stringify(selector) + ');if(!b)return false;b.click();return true})()');
  assert(found, 'click ' + selector);
  await sleep(140);
}
async function viewport(width) {
  await cdp('Emulation.setDeviceMetricsOverride', {
    width, height: 800, deviceScaleFactor: 1, mobile: true,
  });
  await sleep(220);
}
async function snapshot(name) {
  const r = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const target = path.join(output, name);
  fs.writeFileSync(target, Buffer.from(r.data, 'base64'));
  console.log('SCREENSHOT', target, fs.statSync(target).size);
}
async function state() {
  return JSON.parse(await js('JSON.stringify((()=>{const visible=s=>{const e=document.querySelector(s);return !!e&&e.getClientRects().length>0};const r=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,width:b.width}};return {screen:document.querySelector(".app-shell")?.dataset.screen,width:innerWidth,scroll:document.documentElement.scrollWidth,home:visible(".dashboard-player"),xp:visible(".dashboard-player .pulse-xp-card"),forgeGuide:visible(".lower-grid .tips-card"),guide:visible("#settings .tips-card"),camera:visible("#challenge"),daily:visible("#daily-plan"),quests:visible("#quests"),steps:visible("#step-log"),settings:visible("#settings"),backup:visible("#progress-backup"),homeCard:r(".dashboard-player"),steel:r(".character-card"),navWidths:[...document.querySelectorAll(".mobile-nav button")].map(e=>e.getBoundingClientRect().width)};})())'));
}
try {
  ws = new WebSocket(await endpoint());
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    const m = JSON.parse(event.data.toString());
    if (m.id && callbacks.has(m.id)) {
      callbacks.get(m.id)(m);
      callbacks.delete(m.id);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      browserErrors.push(m.params?.exceptionDetails?.exception?.description ||
        m.params?.exceptionDetails?.text || 'Unknown exception');
    }
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await viewport(360);
  await cdp('Page.navigate', { url: origin });
  await until('!!document.querySelector(".mobile-nav")', 'navigation ready');
  assert(await js('!!document.querySelector("#onboarding")'), 'fresh temporary profile offers fighter creation');
  await click('.build-options button:nth-child(2)');
  await click('#onboarding .forge-solid-button');
  await until('!!document.querySelector(".dashboard-player .pulse-xp-card")',
    'fighter level banner ready');
  await until('(()=>{const a=document.querySelector(".dashboard-player")?.getBoundingClientRect();const b=document.querySelector(".character-card")?.getBoundingClientRect();return !!a&&!!b&&b.top-a.bottom>=0&&b.top-a.bottom<=32})()',
    'fighter and 01 / Твоя сталь settled directly adjacent');
  await until('document.querySelector("#pulse-progress .pulse-trend-card [data-period-reps]")?.getClientRects().length>0',
    'training activity counters visibly mounted on Forge');
  const storedBeforePeriod = await js('localStorage.getItem("bodyforge:pilot:v1")');
  const weeklyStats = JSON.parse(await js('JSON.stringify((()=>{const root=document.querySelector("#pulse-progress .pulse-trend-card");return {range:document.querySelector("#pulse-activity-range")?.value,period:root?.querySelector("[data-activity-period]")?.dataset.activityPeriod,active:root?.querySelector("[data-period-active-days]")?.dataset.periodActiveDays,reps:root?.querySelector("[data-period-reps]")?.dataset.periodReps,denom:root?.querySelector("[data-active-days]")?.textContent?.trim(),chart:root?.querySelector(".pulse-linechart")?.dataset.chartPoints}})())'));
  console.log('FORGE_WEEKLY_ACTIVITY', JSON.stringify(weeklyStats));
  assert(weeklyStats.range === '7' && weeklyStats.period === '7' &&
    weeklyStats.active === '0' && weeklyStats.reps === '0' &&
    weeklyStats.denom === '0/7' && weeklyStats.chart === '7',
    'empty Forge activity shows 0/7 active days and 0 repetitions for 7 days');
  await js('(()=>{const e=document.querySelector("#pulse-activity-range");e.value="30";e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await until('document.querySelector("#pulse-progress .pulse-metric-grid")?.dataset.activityPeriod==="30"',
    'period changed to 30 days');
  const monthlyStats = JSON.parse(await js('JSON.stringify((()=>{const root=document.querySelector("#pulse-progress .pulse-trend-card");return {range:document.querySelector("#pulse-activity-range")?.value,active:root?.querySelector("[data-period-active-days]")?.dataset.periodActiveDays,reps:root?.querySelector("[data-period-reps]")?.dataset.periodReps,denom:root?.querySelector("[data-active-days]")?.textContent?.trim(),chart:root?.querySelector(".pulse-linechart")?.dataset.chartPoints}})())'));
  console.log('FORGE_MONTHLY_ACTIVITY', JSON.stringify(monthlyStats));
  assert(monthlyStats.range === '30' && monthlyStats.active === '0' &&
    monthlyStats.reps === '0' && monthlyStats.denom === '0/30' &&
    monthlyStats.chart === '30',
    'empty Forge activity shows 0/30 active days and 0 repetitions for 30 days');
  await js('document.querySelector("#pulse-progress .pulse-trend-card")?.scrollIntoView({block:"start",behavior:"auto"})');
  await sleep(200);
  await snapshot('forge-activity-30days-360.png');
  await js('(()=>{const e=document.querySelector("#pulse-activity-range");e.value="7";e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await until('document.querySelector("#pulse-progress .pulse-metric-grid")?.dataset.activityPeriod==="7"',
    'seven-day period restored');
  assert(await js('localStorage.getItem("bodyforge:pilot:v1")') === storedBeforePeriod,
    'changing 7/30 day statistics does not rewrite progress or rewards');
  await js('window.scrollTo(0,0)');
  const initial = await state();
  console.log('HOME_XP_360', JSON.stringify(initial));
  assert(initial.home && initial.xp, 'level and XP are embedded inside fighter card');
  assert(!initial.forgeGuide, 'pre-workout camera guide is removed from Forge');
  assert(await js('document.querySelectorAll(".pulse-xp-card").length') === 1,
    'level card is not duplicated in progress statistics');
  assert(await js('document.querySelectorAll(".dashboard-player .bf-catalog").length') === 0,
    'incorrect exercise catalog is not inside fighter card');
  assert(await js('document.querySelector(".dashboard-player .pulse-xp-heading")?.textContent?.includes("Опыт: 0 / 250 XP")'),
    'new fighter XP is accurate instead of invented');
  assert(initial.steel.top >= initial.homeCard.bottom,
    '01 / Твоя сталь follows the combined fighter and XP card');
  assert(initial.scroll <= initial.width + 1, 'home 360 px has no sideways scroll');
  await snapshot('home-360-fighter-xp.png');

  await viewport(320);
  const compact = await state();
  console.log('HOME_XP_320', JSON.stringify(compact));
  assert(compact.xp && compact.scroll <= compact.width + 1,
    'level panel fits home at 320 CSS px without horizontal scroll');
  assert(compact.navWidths.length === 6 && compact.navWidths.every((n) => n >= 44),
    'six navigation targets remain at least 44 CSS px wide');
  await snapshot('home-320-fighter-xp.png');

  await viewport(390);
  const cta = await js('JSON.stringify({label:document.querySelector(".dashboard-player .profile-training-cta")?.getAttribute("aria-label"),quick:document.querySelector(".mobile-quickstart strong")?.textContent})');
  console.log('FORGE_SQUAT_CTA', cta);
  const action = JSON.parse(cta);
  assert(/присед/i.test(action.label) && /20 ПРИСЕДАНИЙ/i.test(action.quick),
    'Forge quick starts still explicitly request squats');
  await click('.mobile-nav button:nth-child(2)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="challenge"', 'camera screen ready');
  await until('!!document.querySelector("#step-log") && !!document.querySelector("#quests")',
    'missions and steps mounted on Camera');
  const camera = await state();
  console.log('CAMERA_390', JSON.stringify(camera));
  assert(camera.camera && !camera.daily && camera.quests && camera.steps,
    'camera shows missions and steps but no personal daily plan card');
  assert(await js('document.querySelector("#daily-plan") === null'),
    'removed daily-plan card is absent from DOM, not merely hidden');
  assert(!camera.home && !camera.settings && !camera.forgeGuide,
    'fighter XP and pre-workout FAQ are not on Camera');
  await until('!!document.querySelector("#challenge .bf-catalog-trigger")',
    'lazy exercise picker loaded on Camera');
  assert(await js('!!document.querySelector("#challenge .bf-catalog-trigger")'),
    'exercise picker remains on Camera');
  assert(camera.scroll <= camera.width + 1, 'camera has no sideways scroll');
  await snapshot('camera-390.png');

  await click('.mobile-nav button:nth-child(6)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="settings" && !!document.querySelector("#progress-backup") && !!document.querySelector("#settings .tips-card")',
    'FAQ, camera guide and progress backup ready');
  const settings = await state();
  console.log('FAQ_390', JSON.stringify(settings));
  assert(settings.settings && settings.backup && settings.guide &&
    !settings.camera && !settings.daily && !settings.quests && !settings.steps,
    'FAQ contains the complete guide and backup, excluding Forge and Camera panels');
  assert(await js('document.querySelector("#settings .tips-card")?.textContent?.includes("ПЕРЕД УДАРОМ")'),
    'screenshot camera guide header appears in FAQ');
  assert(await js('document.querySelectorAll("#settings .tips-card .tip-row").length') === 3,
    'all three steps of the camera guide were moved');
  assert(await js('document.querySelectorAll(".bf-faq-item").length') >= 4,
    'FAQ keeps the existing questions');
  await snapshot('settings-390-faq-overview.png');
  await js('document.querySelector("#settings .tips-card")?.scrollIntoView({block:"start",behavior:"auto"})');
  await sleep(220);
  await snapshot('settings-390-camera-preparation-visible.png');
  assert(settings.scroll <= settings.width + 1, 'settings has no sideways scroll');

  await click('.mobile-nav button:nth-child(1)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="dashboard"', 'return Forge');
  const returned = await state();
  assert(returned.home && returned.xp && !returned.guide &&
    !returned.daily && !returned.quests && !returned.steps,
    'Forge retains XP banner but does not show the moved FAQ or daily panels');
  await until('!!document.querySelector("[data-quick-action=daily]")',
    'Forge mission shortcut ready');
  assert(await js('document.querySelector("[data-quick-action=daily]")?.textContent?.includes("Миссии")'),
    'Forge shortcut correctly says Миссии rather than deleted personal plan');
  await click('[data-quick-action=daily]');
  await until('document.querySelector(".app-shell")?.dataset.screen==="challenge" && document.querySelector("#quests")?.getClientRects().length>0',
    'Forge shortcut opens Camera missions');
  assert(await js('document.querySelector("#daily-plan") === null'),
    'daily-plan remains absent after mission shortcut navigation');
  assert(browserErrors.length === 0, 'no uncaught exceptions while switching screens');
  console.log('BODYFORGE_FORGE_XP_FAQ_E2E_PASS');
} catch (error) {
  console.error('BODYFORGE_FORGE_XP_FAQ_E2E_FAIL', error?.stack || String(error));
  console.error('BROWSER_EXCEPTIONS', JSON.stringify(browserErrors.slice(-4)));
  process.exitCode = 1;
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    try { await cdp('Browser.close'); } catch {}
  }
  ws?.close();
  browser.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
