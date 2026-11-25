import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { requirePreviewOrigin, waitForOwnedBrowser, newOwnedPage, cleanupOwnedChrome } from './owned-chrome.mjs';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5230';
const chromium = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profilePrefix = 'bf-home-xp-faq-';
const output = process.env.BODYFORGE_QA_ARTIFACT_DIR ||
  path.resolve('docs/audits/BF_FORGE_HOME_XP_FAQ_20261110');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws, browserIdentity, profile, browser, appReady = false;
let seq = 0;
const callbacks = new Map();
let browserErrors = [];
function assert(value, label) {
  if (!value) throw Error('FAIL ' + label);
  console.log('PASS ' + label);
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
  const build = await requirePreviewOrigin(origin, process.env.BODYFORGE_QA_EXPECT_ENTRY_SHA256);
  console.log('QA_BUILD', JSON.stringify({ origin, ...build }));
  fs.mkdirSync(output, { recursive: true });
  profile = fs.mkdtempSync(path.join(os.tmpdir(), profilePrefix));
  browser = spawn(chromium, [
    '--headless=new', '--no-first-run', '--no-default-browser-check',
    '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    'about:blank',
  ], { stdio: 'ignore' });
  browserIdentity = await waitForOwnedBrowser(profile, browser);
  const target = await newOwnedPage(browserIdentity);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Owned CDP connection timeout')), 3000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(Error('Owned CDP connection failed')); }, { once: true });
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
  const navigation = await cdp('Page.navigate', { url: origin });
  if (navigation.errorText) throw Error('Preview navigation failed: ' + navigation.errorText);
  await until('location.origin===' + JSON.stringify(origin) + ' && document.readyState==="complete"',
    'verified preview document loaded');
  const loaded = await js(`(async () => {
    const entry = ${JSON.stringify(build.entry)};
    if (!document.querySelector('script[src="' + entry + '"]')) return null;
    const response = await fetch(entry, { redirect: 'error', signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  })()`);
  if (loaded !== build.sha256) throw Error('Browser did not receive the measured entry');
  appReady = true;
  assert(loaded === build.sha256, 'browser entry matches preflight SHA-256');
  await until('!!document.querySelector(".mobile-nav")', 'navigation ready');
  assert(await js('!!document.querySelector("#onboarding")'), 'fresh temporary profile offers fighter creation');
  await click('.build-options button:nth-child(2)');
  await click('#onboarding .forge-solid-button');
  await until('!!document.querySelector(".dashboard-player .pulse-xp-card")',
    'fighter level banner ready');
  await until('(()=>{const a=document.querySelector(".dashboard-player")?.getBoundingClientRect();const b=document.querySelector(".character-card")?.getBoundingClientRect();return !!a&&!!b&&b.top-a.bottom>=0&&b.top-a.bottom<=32})()',
    'fighter and 01 / Твоя сталь settled directly adjacent');
  assert(await js('document.querySelectorAll(".character-card .kinetic-axis,.character-card .mobile-quickstart,.character-card .character-footer").length===0'),
    'created fighter card contains none of the three removed sections');
  assert(await js('document.querySelector(".character-card .avatar-stage")?.getClientRects().length>0'),
    'avatar stage remains visible');
  await until('!!document.querySelector("#pulse-progress .pulse-trend-card")', 'progress board mounted');
  assert(await js('document.querySelector("#quests")?.getClientRects().length>0 && document.querySelectorAll("#quests").length===1'), 'one missions panel visible on Forge');
  assert(await js('document.querySelector("#pulse-progress .pulse-ring-card")?.getClientRects().length>0'),
    'fighter development stays on Forge');
  assert(await js('document.querySelector("#pulse-progress .pulse-trend-card")?.getClientRects().length===0'),
    'training activity is absent from visible Forge');
  await click('.mobile-nav button:nth-child(2)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="challenge" && document.querySelector("#pulse-progress .pulse-trend-card [data-period-reps]")?.getClientRects().length>0',
    'training activity counters visibly mounted on Camera');
  assert(await js('document.querySelector("#pulse-progress .pulse-ring-card")?.getClientRects().length===0'),
    'fighter development is not duplicated on Camera');
  assert(await js('document.querySelectorAll(".pulse-trend-card").length===1'),
    'one activity card only');
  assert(await js('document.querySelector("#pulse-progress").getBoundingClientRect().top>document.querySelector("#challenge").getBoundingClientRect().bottom'),
    'activity follows the existing Camera controls');
  const storedBeforePeriod = await js('localStorage.getItem("bodyforge:pilot:v1")');
  const weeklyStats = JSON.parse(await js('JSON.stringify((()=>{const root=document.querySelector("#pulse-progress .pulse-trend-card");return {range:document.querySelector("#pulse-activity-range")?.value,period:root?.querySelector("[data-activity-period]")?.dataset.activityPeriod,active:root?.querySelector("[data-period-active-days]")?.dataset.periodActiveDays,reps:root?.querySelector("[data-period-reps]")?.dataset.periodReps,denom:root?.querySelector("[data-active-days]")?.textContent?.trim(),chart:root?.querySelector(".pulse-linechart")?.dataset.chartPoints}})())'));
  console.log('CAMERA_WEEKLY_ACTIVITY', JSON.stringify(weeklyStats));
  assert(weeklyStats.range === '7' && weeklyStats.period === '7' &&
    weeklyStats.active === '0' && weeklyStats.reps === '0' &&
    weeklyStats.denom === '0/7' && weeklyStats.chart === '7',
    'empty Camera activity shows 0/7 active days and 0 repetitions for 7 days');
  await js('(()=>{const e=document.querySelector("#pulse-activity-range");e.value="30";e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await until('document.querySelector("#pulse-progress .pulse-metric-grid")?.dataset.activityPeriod==="30"',
    'period changed to 30 days');
  const monthlyStats = JSON.parse(await js('JSON.stringify((()=>{const root=document.querySelector("#pulse-progress .pulse-trend-card");return {range:document.querySelector("#pulse-activity-range")?.value,active:root?.querySelector("[data-period-active-days]")?.dataset.periodActiveDays,reps:root?.querySelector("[data-period-reps]")?.dataset.periodReps,denom:root?.querySelector("[data-active-days]")?.textContent?.trim(),chart:root?.querySelector(".pulse-linechart")?.dataset.chartPoints}})())'));
  console.log('CAMERA_MONTHLY_ACTIVITY', JSON.stringify(monthlyStats));
  assert(monthlyStats.range === '30' && monthlyStats.active === '0' &&
    monthlyStats.reps === '0' && monthlyStats.denom === '0/30' &&
    monthlyStats.chart === '30',
    'empty Camera activity shows 0/30 active days and 0 repetitions for 30 days');
  await js('document.querySelector("#pulse-progress .pulse-trend-card")?.scrollIntoView({block:"start",behavior:"auto"})');
  await sleep(200);
  await snapshot('camera-activity-30days-360.png');
  await click('.mobile-nav button:nth-child(1)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="dashboard"', 'Forge return from activity');
  assert(await js('document.querySelector(".pulse-trend-card")?.getClientRects().length===0'), 'activity stays hidden on Forge');
  await click('.mobile-nav button:nth-child(2)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="challenge" && document.querySelector(".pulse-trend-card")?.getClientRects().length>0', 'Camera return');
  assert(await js('document.querySelector("#pulse-activity-range")?.value==="30"'), 'selected period preserved across tabs');
  await js('(()=>{const e=document.querySelector("#pulse-activity-range");e.value="7";e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await until('document.querySelector("#pulse-progress .pulse-metric-grid")?.dataset.activityPeriod==="7"',
    'seven-day period restored');
  assert(await js('localStorage.getItem("bodyforge:pilot:v1")') === storedBeforePeriod,
    'changing 7/30 day statistics does not rewrite progress or rewards');
  await click('.mobile-nav button:nth-child(1)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="dashboard"', 'Forge ready after activity checks');
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
  for (const width of [320,360,390,428]) {
    await viewport(width);
    const avatar = await js('(()=>{const card=document.querySelector(".character-card"),stage=card.querySelector(".avatar-stage"),c=card.getBoundingClientRect(),s=stage.getBoundingClientRect();return {removed:!card.querySelector(".kinetic-axis,.mobile-quickstart,.character-footer"),width:innerWidth,scroll:document.documentElement.scrollWidth,stageH:s.height,bottomGap:c.bottom-s.bottom}})()');
    // Preserve the existing appearance.css mobile avatar height: clamp(270px,75vw,315px).
    const expectedStage = Math.max(270,Math.min(315,width*.75));
    console.log("AVATAR_ONLY_LAYOUT", JSON.stringify({...avatar,expectedStage}));
    assert(avatar.removed && avatar.stageH>=expectedStage-1 && avatar.bottomGap>=0 && avatar.bottomGap<=24 && avatar.scroll<=avatar.width+1,
      'compact avatar fits '+width+'px without removed zones or empty footer');
  }
  await viewport(390);
  await js('document.querySelector(".character-card .avatar-stage").scrollIntoView({block:"center",behavior:"instant"})');
  await until('document.querySelector(".character-card [data-avatar-source]")?.dataset.avatarSource==="cc0"', 'real 3D fighter is visible', 30000);
  assert(await js('!!document.querySelector(".character-card .avatar-3d-drag")'), 'avatar rotation hint retained');
  await snapshot('forge-avatar-only-390.png');

  await viewport(390);
  const cta = await js('JSON.stringify({label:document.querySelector(".dashboard-player .profile-training-cta")?.getAttribute("aria-label"),quick:document.querySelector(".character-card .mobile-quickstart")!==null})');
  console.log('FORGE_SQUAT_CTA', cta);
  const action = JSON.parse(cta);
  assert(/присед/i.test(action.label) && !action.quick,
    'above-card Forge start still requests squats; redundant avatar CTA removed');
  await click('.mobile-nav button:nth-child(2)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="challenge"', 'camera screen ready');
  await until('!!document.querySelector("#step-log") && !!document.querySelector("#quests")',
    'steps and single shared mission component mounted');
  const camera = await state();
  console.log('CAMERA_390', JSON.stringify(camera));
  assert(await js('document.querySelector(".pulse-trend-card")?.getClientRects().length>0'),
    'activity remains visible on Camera at 390 px');
  assert(camera.camera && !camera.daily && !camera.quests && camera.steps,
    'Camera shows steps but not missions or the retired plan');
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
  assert(await js('document.querySelector(".pulse-trend-card")?.getClientRects().length===0'),
    'activity is not visible on FAQ');
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
    !returned.daily && returned.quests && !returned.steps,
    'Forge retains XP and missions but not FAQ or steps');
  await until('!!document.querySelector("[data-quick-action=daily]")',
    'Forge mission shortcut ready');
  assert(await js('document.querySelector("[data-quick-action=daily]")?.textContent?.includes("Миссии")'),
    'Forge shortcut correctly says Миссии rather than deleted personal plan');
  await click('[data-quick-action=daily]');
  await until('document.querySelector(".app-shell")?.dataset.screen==="dashboard" && document.querySelector("#quests")?.getClientRects().length>0',
    'Forge shortcut stays on Forge missions');
  assert(await js('document.querySelector("[data-quick-action=daily]")?.getAttribute("aria-label")?.includes("Горн")'), 'mission shortcut names correct screen');
  for (const width of [320,360,390,428]) {
    await viewport(width);
    const layout = await js('(()=>{const q=document.querySelector("#quests"),r=q.getBoundingClientRect(),b=document.querySelector("#forge-quick-deck").getBoundingClientRect(),h=document.querySelector("#progress").getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,left:r.left,right:r.right,top:r.top,bottom:r.bottom,deckBottom:b.bottom,historyTop:h.top}})()');
    assert(layout.left>=-1&&layout.right<=width+1&&layout.scroll<=width+1&&layout.top>=layout.deckBottom&&layout.bottom<=layout.historyTop, 'missions fit after quick actions and before chronicle at '+width+'px');
  }
  await viewport(390);
  await js('document.querySelector("#quests").scrollIntoView({block:"start",behavior:"instant"})');
  await snapshot('forge-missions-390.png');
  const beforeLogin = JSON.parse(await js('localStorage.getItem("bodyforge:pilot:v1")'));
  await click('#quests .quest-button');
  await until('JSON.parse(localStorage.getItem("bodyforge:pilot:v1")).coins==='+(beforeLogin.coins+10),'login reward acknowledged on disk');
  assert(await js('document.querySelector("#quests .quest-button").disabled'), 'claimed login reward disabled');
  const claimedRaw = await js('localStorage.getItem("bodyforge:pilot:v1")');
  await click('.mobile-nav button:nth-child(2)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="challenge"', 'Camera after reward');
  assert(await js('document.querySelector("#quests").getClientRects().length===0'), 'claimed mission hidden on Camera');
  await click('.mobile-nav button:nth-child(1)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="dashboard"', 'return to claimed missions');
  assert(await js('document.querySelector("#quests .quest-button").disabled'), 'claimed status survives tab switch');
  assert(await js('localStorage.getItem("bodyforge:pilot:v1")')===claimedRaw, 'tab switch never rewrites or duplicates reward');
  assert(await js('document.querySelector("#daily-plan") === null'),
    'daily-plan remains absent after mission shortcut navigation');
  // Populate only the disposable profile. The hidden five workouts have no known dates.
  const limitedRaw = await js(`(()=>{
    const key='bodyforge:pilot:v1',profile=JSON.parse(localStorage.getItem(key));
    const today=new Date(),stamp=new Date(today.getFullYear(),today.getMonth(),today.getDate(),12).toISOString();
    profile.workouts=Array.from({length:60},(_,index)=>({id:'present-'+index,finishedAt:stamp,durationMs:65000,repetitions:20,xp:120}));
    profile.creditedWorkoutIds=[...profile.workouts.map(workout=>workout.id),
      ...Array.from({length:5},(_,index)=>'hidden-'+index)];
    profile.totals={workouts:65,repetitions:1300,bestDurationMs:65000};
    const raw=JSON.stringify(profile);
    localStorage.setItem(key,raw);
    return raw;
  })()`);
  await cdp('Page.reload', { ignoreCache: true });
  await until('!!document.querySelector(".app-shell[data-fighter-created=true] .mobile-nav")', 'limited history profile hydrated');
  await click('.mobile-nav button:nth-child(2)');
  await until('!!document.querySelector(".pulse-trend-card[data-history-limited=true][aria-label]:not([hidden])")', 'limited activity visible');
  for (const days of [7, 30]) {
    await js(`(()=>{const select=document.querySelector('#pulse-activity-range');
      select.value='${days}';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await until('document.querySelector("[data-activity-period]")?.dataset.activityPeriod==="' + days + '"', 'date range ' + days);
    assert(await js(`(()=>{
      const root=document.querySelector('.pulse-trend-card');
      return root.querySelectorAll('.pulse-linechart circle').length===1 &&
        !root.querySelector('.pulse-linechart path') &&
        root.querySelector('[data-period-reps]')?.textContent.trim()==='≥1200' &&
        root.querySelector('[data-active-days]')?.textContent.trim()==='≥1/${days}' &&
        root.querySelector('[data-pulse-delta]')?.dataset.pulseDelta==='unavailable';
    })()`),'truncated history plots only observed dates and marks partial totals for '+days+' days');
    await click('.pulse-date-strip .pulse-date-button:first-child');
    await until('document.querySelector(".pulse-day-values")?.textContent.includes("Нет данных за день")', 'unknown day detail');
    assert(await js('!document.querySelector(".pulse-day-values [data-selected-sessions]")'),
      'unknown date carries no zero workout count for '+days+' days');
  }
  assert(await js('localStorage.getItem("bodyforge:pilot:v1")')===limitedRaw,
    'partial history inspection preserves the whole wallet, ledger and profile');
  await js('document.querySelector(".pulse-trend-card").scrollIntoView({block:"start",behavior:"instant"})');
  await snapshot('pulse-incomplete-history-390.png');
  assert(browserErrors.length === 0, 'no uncaught exceptions while switching screens');
  console.log('BODYFORGE_FORGE_XP_FAQ_E2E_PASS');
} catch (error) {
  console.error(appReady ? 'BODYFORGE_FORGE_XP_FAQ_E2E_FAIL' : 'QA_INFRA_BLOCKED', error?.stack || String(error));
  console.error('BROWSER_EXCEPTIONS', JSON.stringify(browserErrors.slice(-4)));
  process.exitCode = appReady ? 1 : 14;
} finally {
  ws?.close();
  try {
    if (browser) await cleanupOwnedChrome(profile, profilePrefix, browser, browserIdentity);
  } catch (error) {
    console.error('QA_INFRA_BLOCKED cleanup', String(error));
    if (!process.exitCode) process.exitCode = 14;
  }
}
