// Real BODYFORGE UI and native cross-tab storage events in one disposable profile.
// Only this profile's JavaScript Date and CDP timezone are controlled; OS time,
// real timers, the owner's browser, camera and public routes are never touched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('QA requires a loopback HTTP origin');
const key = 'bodyforge:manual-steps:v1';
const selectedCase = process.argv.find((value) => value.startsWith('--case='))?.slice(7) || 'all';
if (!['all', 'future', 'timezone-day', 'localization'].includes(selectedCase)) throw Error('Unknown steps-day QA case');
const artifactDir = process.env.BODYFORGE_QA_ARTIFACT_DIR || 'docs/audits/BF_STEPS_WEB_DASHBOARD_20261124';
const beforeMidnight = Date.parse('2026-10-26T23:59:59.900+03:00');
const afterMidnight = beforeMidnight + 200;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-steps-day-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clients = new Set();
let port, assertions = 0;
let compactLayoutChecked = false, compactEditorChecked = false;
function check(value, label) {
  if (!value) throw Error('FAIL ' + label);
  assertions++;
  console.log('PASS', label);
}
async function waitFor(read, label, timeout = 25000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await read()) return; await sleep(70); }
  throw Error('TIMEOUT ' + label);
}
function clockSource(epoch) {
  return `(()=>{const NativeDate=Date;let epoch=${epoch};
    const ClockDate=new Proxy(NativeDate,{
      construct(target,args,newTarget){return Reflect.construct(target,args.length?args:[epoch],newTarget)},
      apply(){return new NativeDate(epoch).toString()},
      get(target,property,receiver){return property==='now'?()=>epoch:Reflect.get(target,property,receiver)}
    });window.Date=ClockDate;
    Object.defineProperty(window,'__bfClockSet',{value:value=>{if(!Number.isFinite(value))throw Error('Invalid QA clock');epoch=value}});
    Object.defineProperty(window,'__bfStorageEvents',{value:[]});
    window.addEventListener('storage',event=>{if(event.key===${JSON.stringify(key)}||event.key===null)window.__bfStorageEvents.push({key:event.key,newValue:event.newValue})});
    const nativeSetItem=Storage.prototype.setItem,localStore=window.localStorage;
    let stepSetItemCalls=0,profileSetItemCalls=0,localSetItemCalls=0;
    Storage.prototype.setItem=function(storageKey){
      if(this===localStore){
        localSetItemCalls++;
        if(storageKey===${JSON.stringify(key)})stepSetItemCalls++;
        if(typeof storageKey==='string'&&storageKey.startsWith('bodyforge:pilot:v1'))profileSetItemCalls++;
      }
      return Reflect.apply(nativeSetItem,this,arguments);
    };
    Object.defineProperty(window,'__bfStepSetItemCalls',{get:()=>stepSetItemCalls});
    Object.defineProperty(window,'__bfProfileSetItemCalls',{get:()=>profileSetItemCalls});
    Object.defineProperty(window,'__bfLocalSetItemCalls',{get:()=>localSetItemCalls});
  })()`;
}
class Client {
  constructor(target) {
    this.target = target; this.sequence = 0; this.requests = new Map(); this.errors = []; this.loads = 0;
    this.socket = new WebSocket(target.webSocketDebuggerUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data.toString());
      if (this.requests.has(message.id)) { this.requests.get(message.id)(message); this.requests.delete(message.id); }
      if (message.method === 'Page.loadEventFired') this.loads++;
      if (message.method === 'Runtime.exceptionThrown') this.errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    });
    clients.add(this);
  }
  async cdp(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timeout = setTimeout(() => { this.requests.delete(id); reject(Error(method + ' timeout')); }, 25000);
      this.requests.set(id, (message) => {
        clearTimeout(timeout);
        message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async js(expression) {
    const result = await this.cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async until(expression, label, timeout) { return waitFor(() => this.js(expression), label, timeout); }
  async input(value) {
    check(await this.js(`(()=>{const e=document.querySelector('#bf-steps-today');if(!e)return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});
      e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`), 'enter manual step draft ' + value);
    await this.until('document.querySelector("#bf-steps-today").value===' + JSON.stringify(value), 'controlled draft rendered');
  }
  async save() { await this.js('document.querySelector("#step-log button").click();true'); await sleep(100); }
  async clock(epoch, clickSave = false) {
    if (this.clockScript) await this.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: this.clockScript });
    this.clockScript = (await this.cdp('Page.addScriptToEvaluateOnNewDocument', { source: clockSource(epoch) })).identifier;
    // Clock change and click share one JS turn: no App interval/visibility update
    // can repair the stale rendered day before the real save handler runs.
    await this.js(`window.__bfClockSet(${epoch});${clickSave ? 'document.querySelector("#step-log button").click();' : ''}true`);
  }
  async snapshot() {
    return this.js(`({clock:new Date().toISOString(),localDay:[new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,'0'),String(new Date().getDate()).padStart(2,'0')].join('-'),
      count:document.querySelector('[data-manual-steps]')?.dataset.manualSteps,
      draft:document.querySelector('#bf-steps-today')?.value,
      status:document.querySelector('#step-log [role=status]')?.textContent||'',
      alert:document.querySelector('#step-log [role=alert]')?.textContent||'',
      readOnly:document.querySelector('#bf-steps-today')?.readOnly,
      disabled:document.querySelector('#step-log button')?.disabled,
      storageEvents:window.__bfStorageEvents.length,
      stepSetItemCalls:window.__bfStepSetItemCalls,
      profileSetItemCalls:window.__bfProfileSetItemCalls,
      localSetItemCalls:window.__bfLocalSetItemCalls,
      raw:localStorage.getItem(${JSON.stringify(key)})})`);
  }
  async visibleRefresh() {
    await this.cdp('Page.bringToFront');
    await this.js('document.dispatchEvent(new Event("visibilitychange"));true');
    await sleep(140);
  }
}
async function newTab(epoch, locale = 'ru-RU') {
  const target = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
  const tab = new Client(target);
  await tab.cdp('Runtime.enable'); await tab.cdp('Page.enable');
  await tab.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await tab.cdp('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Moscow' });
  await tab.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `Object.defineProperty(navigator, 'language', { value: ${JSON.stringify(locale)} })`,
  });
  tab.clockScript = (await tab.cdp('Page.addScriptToEvaluateOnNewDocument', { source: clockSource(epoch) })).identifier;
  return tab;
}
async function app(tab, reload = false) {
  const loads = tab.loads;
  await tab.cdp(reload ? 'Page.reload' : 'Page.navigate', reload ? { ignoreCache: true } : { url: origin + '/' });
  await waitFor(() => tab.loads > loads, 'fresh application document');
  await tab.until('!!document.querySelector(".app-shell")', 'actual BODYFORGE application');
  if (await tab.js('!!document.querySelector("#onboarding .forge-solid-button")')) {
    await tab.js('document.querySelector("#onboarding .forge-solid-button").click();true');
  }
  await tab.until('!!document.querySelector("#step-log summary")&&!document.querySelector("#onboarding")', 'steps panel mounted');
  await tab.js('document.querySelector(".mobile-nav button:nth-child(2)").click();true');
  await tab.until('document.querySelector(".app-shell")?.dataset.screen==="challenge" && document.querySelector("#step-log summary")?.getClientRects().length>0', 'Camera steps visible');
  await tab.until('!!localStorage.getItem("bodyforge:pilot:v1")', 'fighter persisted');
  const before = await tab.js('JSON.stringify(Object.entries(localStorage).sort(([a],[b])=>a.localeCompare(b)))');
  const summary = await tab.js(`(() => {
    const details = document.querySelector('#step-log details'), summary = details?.querySelector('summary');
    return { open: details?.open, height: summary?.getBoundingClientRect().height,
      inputRects: document.querySelector('#bf-steps-today')?.getClientRects().length,
      state: summary?.dataset.syncState, containsManualCount: !!summary?.querySelector('[data-manual-steps]') };
  })()`);
  check(summary.open === false && summary.height >= 44 && summary.inputRects === 0 &&
    summary.state === 'unavailable' && !summary.containsManualCount,
  'compact steps button defaults closed with honest unavailable sync status ' + JSON.stringify(summary));
  if (selectedCase !== 'localization' && !compactLayoutChecked) {
    compactLayoutChecked = true;
    for (const width of [320,360,390,428]) {
      await tab.cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
      await sleep(160);
      const layout=await tab.js('(()=>{const s=document.querySelector("#step-log summary"),r=s.getBoundingClientRect(),a=s.querySelector(".bf-steps-settings-icon")?.getBoundingClientRect(),v=[...s.querySelectorAll("[data-step-auto]")].map(n=>n.textContent);return {width:innerWidth,right:r.right,left:r.left,height:r.height,overflow:s.scrollWidth-s.clientWidth,iconW:a?.width,iconH:a?.height,values:v,source:s.querySelector(".bf-steps-source")?.textContent,old:!!document.querySelector("#step-log .bf-step-android,#step-log .bf-panel-heading")}})()');
      console.log('STEPS_LAYOUT',JSON.stringify(layout));
      check(layout.height>=44&&layout.left>=-1&&layout.right<=width+1&&layout.overflow<=1&&layout.iconW>=44&&layout.iconH>=44&&layout.values.join(',')==='—,—'&&layout.source==='Веб · нет синхронизации'&&!layout.old,'compact automatic-step dashboard '+width+'px, no fake readings or old diary');
    }
    await tab.cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await tab.js('document.querySelector("#step-log").scrollIntoView({block:"center",behavior:"instant"});true');
    await sleep(200);
    const shot=await tab.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.resolve(artifactDir, 'steps-closed-390.png'),Buffer.from(shot.data,'base64'));
  }
  await tab.js('document.querySelector("#step-log summary").click();true');
  await tab.until('document.querySelector("#step-log details")?.open&&document.querySelector("#bf-steps-today")?.getClientRects().length>0', 'manual fallback opens on Camera');
  check(await tab.js('JSON.stringify(Object.entries(localStorage).sort(([a],[b])=>a.localeCompare(b)))')===before, 'opening steps never writes or fabricates synced data');
  if (selectedCase !== 'localization' && !compactEditorChecked) {
    compactEditorChecked = true;
    const editor=await tab.js('(()=>{const e=document.querySelector("#step-log .bf-steps-compact-editor"),s=document.querySelector("#step-log");return {height:e?.getBoundingClientRect().height,old:!!s.querySelector(".bf-step-android,.bf-panel-heading"),label:s.querySelector("label[for=bf-steps-today]")?.textContent}})()');
    console.log('STEPS_EDITOR',JSON.stringify(editor));
    check(editor.height>0&&editor.height<=230&&!editor.old&&editor.label==='Ручная запись за сегодня','expanded manual fallback is compact and explicitly labeled');
    await tab.js('document.querySelector("#step-log").scrollIntoView({block:"center",behavior:"instant"});true');
    await sleep(180);
    const shot=await tab.cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.resolve(artifactDir, 'steps-open-390.png'),Buffer.from(shot.data,'base64'));
  }

}
async function gameBytes(tab) {
  return tab.js('JSON.stringify(Object.entries(localStorage).filter(([key])=>key.startsWith("bodyforge:pilot:v1")).sort(([a],[b])=>a.localeCompare(b)))');
}
async function stored(tab) { return tab.js('localStorage.getItem(' + JSON.stringify(key) + ')'); }
async function localization() {
  const tab = await newTab(afterMidnight, 'en-US');
  await app(tab);
  const originalGame = await gameBytes(tab);
  const initial = await tab.snapshot();
  check(await tab.js(`document.documentElement.lang === 'ru' &&
    document.querySelector('#step-log')?.lang === 'en' &&
    document.querySelector('#step-log')?.getAttribute('aria-label') === 'Steps and sync'`),
  'English region declares its own language inside the Russian document');
  check(await tab.js(`document.querySelector('[data-manual-steps]').textContent === '0 steps' &&
    document.querySelector('#bf-steps-today').labels[0].textContent === 'Manual entry for today' &&
    document.querySelector('#bf-steps-privacy').textContent.includes('earn no rewards')`),
  'English empty count, input name and storage guidance');

  await tab.cdp('Page.bringToFront');
  await tab.js(`document.querySelector('#step-log details').open = false;
    document.querySelector('#step-log summary').focus(); true`);
  async function press(key, code, virtualKey, text) {
    const params = { key, code, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey };
    await tab.cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...params, ...(text && { text, unmodifiedText: text }) });
    await tab.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  }
  await press('Enter', 'Enter', 13, '\r');
  check(await tab.js(`document.querySelector('#step-log details').open`), 'trusted Enter opens the focused disclosure');
  await press('Tab', 'Tab', 9);
  check(await tab.js(`document.activeElement === document.querySelector('#bf-steps-today')`), 'trusted Tab reaches the count field');
  await press('Tab', 'Tab', 9);
  check(await tab.js(`document.activeElement === document.querySelector('#step-log button')`), 'next Tab reaches Save');
  const { nodes } = await tab.cdp('Accessibility.getFullAXTree');
  check(nodes.some(node => node.role?.value === 'spinbutton' && node.name?.value === 'Manual entry for today') &&
    nodes.some(node => node.role?.value === 'button' && node.name?.value === 'SAVE'),
  'Chrome accessibility tree exposes localized input and action names');
  await tab.input('100001'); await tab.save();
  check((await tab.snapshot()).status === 'Enter a whole number from 0 to 100,000.' &&
    (await tab.snapshot()).stepSetItemCalls === initial.stepSetItemCalls, 'invalid count reports the localized limit and attempts no writes');
  await tab.input('1'); await tab.save();
  check(await tab.js(`document.querySelector('[data-manual-steps]').textContent === '1 step' &&
    document.querySelector('#step-log [role=status]').textContent === 'Manual entry saved in this browser.'`),
  'English singular and save confirmation reflect the actual saved count');
  await tab.input('100000'); await tab.save();
  const saved = await stored(tab);
  check(JSON.parse(saved).count === 100000 && (await tab.snapshot()).stepSetItemCalls === initial.stepSetItemCalls + 2,
    'localized rendering preserves the numeric data and one write per explicit valid save');
  for (const width of [320, 360, 390, 428]) {
    await tab.cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
    check(await tab.js(`(() => {
      const steps = document.querySelector('#step-log'), count = steps.querySelector('[data-manual-steps]');
      const editor = steps.querySelector('.bf-steps-compact-editor'), button = steps.querySelector('button');
      return innerWidth === ${width} && count.textContent === '100,000 steps' &&
        steps.getBoundingClientRect().right <= innerWidth && editor.scrollWidth <= editor.clientWidth &&
        button.getBoundingClientRect().height >= 44;
    })()`), `localized maximum and save action fit at ${width}px`);
  }
  await tab.clock(beforeMidnight); await tab.visibleRefresh();
  const conflict = await tab.snapshot();
  check(conflict.disabled && conflict.readOnly && conflict.alert.includes('October 27, 2026') &&
    await stored(tab) === saved, 'English conflict names the saved calendar date and preserves the record');
  await tab.clock(afterMidnight); await tab.visibleRefresh();
  const russian = await newTab(afterMidnight, 'ru-RU');
  await app(russian);
  check(await russian.js(`document.querySelector('#step-log')?.lang === 'ru' &&
    document.querySelector('[data-manual-steps]').textContent.replace(/\u00a0/g,' ') === '100 000 шагов'`),
  'Russian browser renders the same record with the correct unit');
  await russian.clock(beforeMidnight); await russian.visibleRefresh();
  check((await russian.snapshot()).alert.includes('27 октября 2026') && await stored(russian) === saved,
    'Russian conflict identifies the same saved calendar date');
  check(await gameBytes(tab) === originalGame && await gameBytes(russian) === originalGame &&
    (await tab.snapshot()).stepSetItemCalls === initial.stepSetItemCalls + 2 && (await russian.snapshot()).stepSetItemCalls === 0,
  'locale selection and date recovery produce no extra writes and preserve exact game bytes');
}
async function timezoneDay() {
  const epoch = Date.parse('2026-10-26T21:00:00.000Z');
  const tab = await newTab(epoch);
  await tab.cdp('Emulation.setTimezoneOverride', { timezoneId: 'UTC' });
  // A same-origin source document lets us prepare a production-normalized
  // fixture before App is mounted even once in this disposable profile.
  await tab.cdp('Page.navigate', { url: origin + '/src/lib/game.ts' });
  await tab.until('location.pathname==="/src/lib/game.ts"&&document.readyState==="complete"', 'same-origin fixture document');
  check(await tab.js('!document.querySelector(".app-shell")'), 'timezone fixture is seeded before the first App mount');
  const fixture = await tab.js(`(async()=>{
    const p=await import('/src/lib/progression.ts'),g=await import('/src/lib/game.ts');
    const base=p.parseProfile({profileId:'qa-timezone-day-profile',xp:0,coins:0,workouts:[],creditedWorkoutIds:[],
      game:{...g.freshGame(),created:true,nickname:'QA DAY',build:'solid'}});
    const profile=p.addCompletedWorkout(base,32000,new Date('2026-10-26T20:58:00.000Z'),{sessionId:'qa-timezone-day-workout',mode:'training'});
    const raw=JSON.stringify(profile);
    localStorage.setItem('bodyforge:pilot:v1',raw);localStorage.setItem('bodyforge:pilot:v1:backup',raw);
    return {profile,raw,workoutUtcDay:g.localDay(new Date(profile.workouts[0].finishedAt))};
  })()`);
  check(fixture.profile.workouts.length === 1 && fixture.profile.workouts[0].repetitions === 20 && fixture.workoutUtcDay === '2026-10-26', 'fixture contains one saved 20-rep workout on UTC day 26');
  await app(tab);
  const selectedDay = 'document.querySelector(".pulse-day-detail")?.dataset.selectedDay';
  const selectedSessions = 'document.querySelector("[data-selected-sessions]")?.dataset.selectedSessions';
  await tab.until(`${selectedDay} === '2026-10-26' && ${selectedSessions} === '1'`,
    'Camera activity shows the saved workout on UTC day 26');
  await tab.js(`(() => {
    const range = document.querySelector('#pulse-activity-range');
    range.value = '30';
    range.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  const selectedDateVisible = `(() => {
    const strip = document.querySelector('.pulse-date-strip');
    const active = strip?.querySelector('[aria-pressed="true"]');
    if (!active) return false;
    const rail = strip.getBoundingClientRect(), day = active.getBoundingClientRect();
    return day.left >= rail.left - 1 && day.right <= rail.right + 1;
  })()`;
  await tab.until(`document.querySelector('.pulse-date-strip')?.dataset.period === '30' && ${selectedDateVisible}`,
    '30-day activity strip starts with the selected date in view');
  await tab.js(`document.querySelector('.pulse-date-strip').scrollLeft = 0; true`);
  check(!await tab.js(selectedDateVisible), 'swiping to older dates can move the selected date out of view');
  const beforeGame = await gameBytes(tab);
  const before = await tab.snapshot();
  check(await tab.js('JSON.parse(localStorage.getItem("bodyforge:pilot:v1")).profileId==="qa-timezone-day-profile"'), 'actual dashboard loaded the pre-mounted fixture profile');
  check(before.localSetItemCalls === 0, 'initial App mount does not write localStorage');
  await tab.js('window.__bfObservedDateBeforeTimezone=new Date();window.__bfCapturedDayBeforeTimezone=[new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,"0"),String(new Date().getDate()).padStart(2,"0")].join("-");true');
  await tab.cdp('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Moscow' });
  const legacy = await tab.js(`(()=>{const previous=window.__bfObservedDateBeforeTimezone,now=new Date();return {
    epochUnchanged:previous.getTime()===now.getTime(),oldPredicateWouldSkip:previous.toDateString()===now.toDateString(),
    capturedDay:window.__bfCapturedDayBeforeTimezone,currentDay:[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-'),
    workoutDay:[new Date('2026-10-26T20:58:00.000Z').getFullYear(),String(new Date('2026-10-26T20:58:00.000Z').getMonth()+1).padStart(2,'0'),String(new Date('2026-10-26T20:58:00.000Z').getDate()).padStart(2,'0')].join('-'),
    selectedBeforeRefresh:${selectedDay}}})()`);
  console.log('TIMEZONE_LEGACY_PREDICATE', JSON.stringify(legacy));
  check(legacy.epochUnchanged && legacy.oldPredicateWouldSkip && legacy.capturedDay === '2026-10-26' && legacy.currentDay === '2026-10-27' && legacy.workoutDay === '2026-10-26', 'timezone changes the captured calendar day while the old Date comparison would skip refresh');
  check(legacy.selectedBeforeRefresh === '2026-10-26', 'activity calendar retains the previously observed day before visibility refresh');
  await tab.visibleRefresh();
  await tab.until(`${selectedDay} === '2026-10-27' && ${selectedSessions} === '0'`,
    'App day observation refreshes the Camera activity calendar independently of StepsBoard');
  await tab.until(selectedDateVisible, 'new selected date scrolls into view after day rollover', 3000);
  check(await tab.js(selectedDateVisible), 'active date is readable without a second swipe after day rollover');
  check(await tab.js('document.querySelector("[data-period-sessions]")?.dataset.periodSessions === "1"'),
    'moving the activity calendar to the next day keeps the previous workout in the selected period total');
  const after = await tab.snapshot();
  console.log('TIMEZONE_DAY_DOM', JSON.stringify({ selected: await tab.js(selectedDay), before, after }));
  check(after.localDay === '2026-10-27', 'refreshed dashboard is on Moscow day 27');
  check(after.stepSetItemCalls - before.stepSetItemCalls === 0 && after.profileSetItemCalls - before.profileSetItemCalls === 0 && after.localSetItemCalls - before.localSetItemCalls === 0, 'timezone visibility refresh makes zero localStorage setItem calls, including profile and steps');
  check(await gameBytes(tab) === beforeGame && await tab.js('localStorage.getItem("bodyforge:pilot:v1")') === fixture.raw, 'timezone refresh preserves exact fixture profile and all game-prefix bytes');

  await tab.cdp('Emulation.setDeviceMetricsOverride', { width: 740, height: 390, deviceScaleFactor: 1, mobile: true });
  await tab.until(`innerWidth === 740 && ${selectedDateVisible}`, 'selected date stays visible in landscape');
  await tab.cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 844, deviceScaleFactor: 1, mobile: true });
  await tab.until(`innerWidth === 320 && ${selectedDateVisible}`, 'selected date stays visible when returning to 320px portrait', 3000);
  check(await tab.js(`${selectedDay} === '2026-10-27' && ${selectedDateVisible}`),
    'orientation changes keep the same selected date fully within the strip');

  await tab.js(`document.querySelector('[data-pulse-date="2026-10-25"]').click(); true`);
  await tab.until(`${selectedDay} === '2026-10-25' && ${selectedDateVisible}`, 'an explicit historical date stays in view');
  await tab.js(`document.querySelector('.pulse-date-strip').scrollLeft = 0; true`);
  await tab.cdp('Emulation.setTimezoneOverride', { timezoneId: 'UTC' });
  await tab.visibleRefresh();
  await tab.until(`document.querySelector('.pulse-date-strip').lastElementChild?.dataset.pulseDate === '2026-10-26'`,
    'activity window rolls back to UTC day 26');
  check(await tab.js(`${selectedDay} === '2026-10-25' && ${selectedDateVisible}`),
    'calendar rollover keeps a still-valid explicit selection visible');
  check(await gameBytes(tab) === beforeGame && (await tab.snapshot()).localSetItemCalls === before.localSetItemCalls,
    'calendar selection and rollback make no profile or step writes');
}
try {
  check((await fetch(origin)).status === 200, 'existing loopback Vite responds HTTP 200');
  await waitFor(() => {
    // Windows Chrome can hand off to a new process and exit its launcher with code 0.
    // A fresh, isolated profile's CDP file remains the bounded readiness gate.
    if (chrome.exitCode !== null && chrome.exitCode !== 0) throw Error('Disposable Chrome exited before CDP');
    try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); return !!port; } catch { return false; }
  }, 'disposable Chrome CDP port');
  if (selectedCase === 'timezone-day') {
    await timezoneDay();
  } else if (selectedCase === 'localization') {
    await localization();
  } else {
  const a = await newTab(beforeMidnight);
  await app(a);
  const originalGame = await gameBytes(a);
  const initialStepWrites = (await a.snapshot()).stepSetItemCalls;
  await a.input('1000'); await a.save();
  const baseline = await stored(a);
  check(JSON.parse(baseline).day === '2026-10-26' && JSON.parse(baseline).count === 1000, 'baseline note belongs to local day 26');
  check((await a.snapshot()).stepSetItemCalls - initialStepWrites === 1, 'write observer counts the one explicit setup localStorage write');
  if (selectedCase !== 'future') {
  await a.input('7777');
  const midnightWritesBefore = (await a.snapshot()).stepSetItemCalls;
  console.log('MIDNIGHT_BEFORE', JSON.stringify(await a.snapshot()));
  await a.clock(afterMidnight, true);
  await sleep(140);
  console.log('MIDNIGHT_AFTER', JSON.stringify(await a.snapshot()));
  check(await stored(a) === baseline, 'midnight save refuses to relabel yesterday draft as today and leaves exact stored bytes');
  check((await a.snapshot()).stepSetItemCalls - midnightWritesBefore === 0, 'midnight stale save makes zero manual-step setItem calls, including same-value writes');
  await a.until('document.querySelector("#bf-steps-today").value==="0"&&document.querySelector("[data-manual-steps]").dataset.manualSteps==="0"', 'new day starts with zero rendered steps');
  check(!!(await a.snapshot()).status, 'day mismatch explains why previous draft was not saved');
  check(await gameBytes(a) === originalGame, 'midnight refusal preserves exact game storage bytes');
  if (!process.argv.includes('--red-only')) {
    const freshWritesBefore = (await a.snapshot()).stepSetItemCalls;
    await a.input('8888'); await a.save();
    const todayRaw = await stored(a);
    check(JSON.parse(todayRaw).day === '2026-10-27' && JSON.parse(todayRaw).count === 8888, 'explicit new-day input saves under day 27');
    check((await a.snapshot()).stepSetItemCalls - freshWritesBefore === 1, 'explicit new-day input performs one acknowledged localStorage write');
    await app(a, true);
    check((await a.snapshot()).count === '8888' && await stored(a) === todayRaw, 'reload restores new-day note without rewriting it');
    check(await gameBytes(a) === originalGame, 'new-day edit and reload preserve exact game storage bytes');
    // Going backward is also a different local day, even though a prior day
    // might otherwise look like an empty valid note in the presentation layer.
    await a.input('9999');
    const rollbackWritesBefore = (await a.snapshot()).stepSetItemCalls;
    await a.clock(beforeMidnight, true); await sleep(120);
    check(await stored(a) === todayRaw, 'backward clock cannot relabel a current-day draft or overwrite later note');
    check((await a.snapshot()).stepSetItemCalls - rollbackWritesBefore === 0, 'backward-clock stale save makes zero manual-step setItem calls');
    const back = await a.snapshot();
    check(back.readOnly && back.disabled && !!back.alert, 'later dated note produces a visible blocking date conflict');
    await a.clock(afterMidnight); await a.visibleRefresh();
    await a.until('document.querySelector("#bf-steps-today").value==="8888"&&!document.querySelector("#step-log button").disabled', 'restoring local day clears conflict and restores acknowledged note');

    // Timezone changes reinterpret an existing Date object. A refresh must
    // compare calendar-day strings captured at observation time, not derive
    // both dates under the newly selected timezone and miss the boundary.
    await a.cdp('Emulation.setTimezoneOverride', { timezoneId: 'UTC' });
    await a.visibleRefresh();
    await a.until('document.querySelector("#step-log button").disabled', 'timezone refresh notices move to previous local date');
    check(await stored(a) === todayRaw && !!(await a.snapshot()).alert, 'timezone conflict does not rewrite stored note');
    await a.cdp('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Moscow' });
    await a.visibleRefresh();
    await a.until('!document.querySelector("#step-log button").disabled&&document.querySelector("#bf-steps-today").value==="8888"', 'timezone restore recovers current note');
    check(await gameBytes(a) === originalGame, 'backward clock and timezone changes preserve exact game bytes');
  }
  }
  if (!process.argv.includes('--red-only') || selectedCase === 'future') {
    // B's editor exists before midnight. A's new-day save must cause a native
    // cross-tab event; there is no synthetic StorageEvent in this test.
    const tabBoundary = selectedCase === 'future' ? beforeMidnight : beforeMidnight + 86400000;
    await a.clock(tabBoundary); await app(a, true);
    const b = await newTab(tabBoundary); await app(b);
    check(a.target.id !== b.target.id, 'date-conflict scenario uses two actual same-origin tabs');
    await b.input('7777');
    if (selectedCase === 'future') {
      await a.clock(afterMidnight); await app(a, true);
      await a.input('8888'); await a.save();
    } else {
      // Both clocks agree on day 28, while B's editor still reflects day 27.
      await b.clock(tabBoundary + 200);
      await a.clock(tabBoundary + 200); await app(a, true);
      await a.input('6543'); await a.save();
    }
    await sleep(200);
    await b.until('window.__bfStorageEvents.length>0', 'actual cross-tab StorageEvent observed');
    check((await b.snapshot()).storageEvents > 0, 'second tab receives native storage event without synthetic dispatch');
    console.log('CROSS_TAB_DAY', JSON.stringify({ a: await a.snapshot(), b: await b.snapshot() }));
    const durable = await stored(a);
    if (selectedCase === 'future') {
      await b.until('!!document.querySelector("#step-log [role=status]")||!!document.querySelector("#step-log [role=alert]")', 'native cross-tab storage event handled');
      const stale = await b.snapshot();
      const futureWritesBefore = stale.stepSetItemCalls;
      await b.save();
      console.log('STALE_CLOCK_SAVE', JSON.stringify(await b.snapshot()));
      check(await stored(b) === durable, 'blocked stale-clock save preserves exact later-note bytes');
      check((await b.snapshot()).stepSetItemCalls - futureWritesBefore === 0, 'disabled future-conflict save makes zero manual-step setItem calls');
      check(stale.readOnly && stale.disabled && !!stale.alert, 'stale-clock tab blocks editing a later dated stored note and explains conflict');
      await b.clock(afterMidnight); await b.visibleRefresh();
    }
    await b.until('document.querySelector("#bf-steps-today").value===' + JSON.stringify(JSON.parse(durable).count.toString()), 'native storage/visibility refresh replaces previous-day draft with current note');
    check((await b.snapshot()).count === String(JSON.parse(durable).count), 'cross-tab saved count and input agree after day change');
    await app(b, true);
    check(await stored(b) === durable && (await b.snapshot()).count === String(JSON.parse(durable).count), 'second-tab reload preserves exact current-day note');
    check(await gameBytes(a) === originalGame && await gameBytes(b) === originalGame, 'two-tab date cases preserve exact game storage bytes');
  }
  }
  check([...clients].every((tab) => tab.errors.length === 0), 'no uncaught application exceptions');
  console.log('BODYFORGE_STEPS_DAY_PASS assertions=' + assertions);
} catch (error) {
  console.error('BODYFORGE_STEPS_DAY_FAIL', error.stack || String(error));
  process.exitCode = 21;
  for (const tab of clients) { try { console.log('FAILURE_STATE', JSON.stringify(await tab.snapshot())); } catch {} }
} finally {
  const active = [...clients].find(tab => tab.socket.readyState === WebSocket.OPEN);
  if (active) {
    try { active.socket.send(JSON.stringify({ id: 1000000, method: 'Browser.close' })); } catch {}
    await sleep(500);
  }
  for (const tab of clients) tab.socket.close();
  chrome.kill();
  await sleep(500);
  const resolved = path.resolve(profile), tempRoot = path.resolve(os.tmpdir()) + path.sep;
  if (resolved.startsWith(tempRoot) && path.basename(resolved).startsWith('bf-steps-day-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true }); } catch { console.log('QA_PROFILE_CLEANUP_INCOMPLETE', resolved); }
  }
}
