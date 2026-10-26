// Contract: original neon redesign, saved workout chart and free avatar look.
// Real UI in disposable headless Chrome, no user's browser, camera or account.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('Use isolated loopback origin');
const dir = process.env.BODYFORGE_QA_ARTIFACT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'bf-pulse-shots-'));
fs.mkdirSync(dir, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-pulse-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, 'about:blank',
], { stdio: 'ignore' });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let socket, seq = 0, checks = 0;
const pending = new Map(), errors = [], shots = [];
function assert(value, label) {
  if (!value) throw Error('FAIL ' + label);
  checks++;
  console.log('PASS', label);
}
async function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timeout = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 24000);
    pending.set(id, (m) => {
      clearTimeout(timeout);
      m.error ? reject(Error(JSON.stringify(m.error))) : resolve(m.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function js(expression) {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function until(expression, label, maxMs = 24000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await js(expression)) return;
    await wait(110);
  }
  throw Error('TIMEOUT ' + label);
}
async function click(selector) {
  assert(await js('(()=>{const e=document.querySelector(' + JSON.stringify(selector) +
    ');if(!e||e.disabled)return false;e.click();return true})()'), 'click ' + selector);
}
async function viewport(width, checkLayout = true) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
  await wait(200);
  const sizes = await js('({width:innerWidth,scroll:document.documentElement.scrollWidth,app:!!document.querySelector(".app-shell")})');
  if (checkLayout) assert(sizes.width === width && sizes.scroll <= width, 'page no horizontal overflow at ' + width);
}
async function screenshot(name, selector) {
  if (selector) await js('(()=>{document.querySelector(' + JSON.stringify(selector) +
    ').scrollIntoView({block:"start"});return true})()');
  await wait(450);
  const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(dir, name + '.png');
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  shots.push({ path: file, bytes: fs.statSync(file).size });
  console.log('SHOT', file, fs.statSync(file).size);
}
try {
  let port;
  for (let tries = 0; tries < 90; tries++) {
    if (chrome.exitCode !== null) throw Error('Chrome exited');
    try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); if (port) break; }
    catch { /* chrome is starting */ }
    await wait(120);
  }
  if (!port) throw Error('Chrome debug port unavailable');
  const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
  const tab = tabs.find((t) => t.type === 'page');
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const m = JSON.parse(event.data.toString());
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await viewport(390, false);
  await cdp('Page.navigate', { url: origin + '/' });
  await until('!!document.querySelector("#onboarding .forge-solid-button")', 'onboarding visible');
  assert(!await js('!!document.querySelector("#pulse-progress")'), 'empty fighter has no fake XP history');
  await click('#onboarding .forge-solid-button');
  await until('!!document.querySelector("#pulse-progress .pulse-gauge")', 'pulse dashboard');
  assert(await js('document.querySelector("[data-pulse-percent]")?.dataset.pulsePercent==="0"'), 'new fighter starts XP ring at 0%, not invented');
  assert(await js('document.querySelectorAll(".pulse-linechart svg circle").length===7'), 'seven real local calendar day buckets shown');
  assert(await js('Array.from(document.querySelectorAll(".pulse-muscle")).filter(x=>x.dataset.muscleLevel==="0").length===4'), 'new fighter muscle meters show zero upgrades');
  assert(await js('document.querySelectorAll("[data-quick-action]").length===4'), 'four functional destination cards displayed');
  assert(await js('document.querySelector("[data-weekly-sessions]")?.dataset.weeklySessions==="0"'), 'zero workouts means zero plotted sessions');
  await screenshot('bodyforge-pulse-dashboard', '#pulse-progress');
  const progressionBeforeRange = await js('localStorage.getItem("bodyforge:pilot:v1")');
  assert(await js('document.querySelector("#pulse-activity-range")?.value==="7"'), 'seven-day analytics selected by default');
  assert(await js('document.querySelectorAll(".pulse-date-button").length===7'), 'every weekly day has an accessible selection control');
  await js('(()=>{const x=document.querySelector("#pulse-activity-range");x.value="30";x.dispatchEvent(new Event("change",{bubbles:true}));return true})()');
  await until('document.querySelector("#pulse-activity-range")?.value==="30"&&document.querySelector(".pulse-linechart")?.dataset.chartPoints==="30"', 'thirty-day calendar chart');
  assert(await js('document.querySelectorAll(".pulse-date-button").length===30'), 'thirty individual calendar days can be inspected');
  await until('(()=>{const rail=document.querySelector(".pulse-date-strip")?.getBoundingClientRect(),active=document.querySelector(".pulse-date-button.is-selected")?.getBoundingClientRect();return !!rail&&!!active&&active.left>=rail.left-2&&active.right<=rail.right+2})()', 'most recent day is visible in the horizontal 30-day list');
  assert(await js('document.querySelector("#pulse-activity-range")?.getBoundingClientRect().height>=44'), 'period selector stays a 44px touch target');
  assert(await js('document.querySelector("[data-period-sessions]")?.dataset.periodSessions==="0"'), 'thirty-day chart preserves honest zero when no workouts exist');
  await screenshot('bodyforge-pulse-30days', '#pulse-progress');
  await click('.pulse-date-button:first-child');
  assert(await js('document.querySelector(".pulse-day-detail")?.dataset.selectedDay===document.querySelector(".pulse-date-button:first-child")?.dataset.pulseDate'), 'day inspection changes the selected date and detail');
  assert(await js('document.querySelectorAll(".pulse-date-button[aria-pressed=true]").length===1'), 'exactly one selected day is exposed to screen readers');
  assert(await js('document.querySelector("[data-selected-sessions]")?.dataset.selectedSessions==="0"'), 'selected day never invents a workout');
  await viewport(320);
  await viewport(360);
  await viewport(390);
  await js('(()=>{const x=document.querySelector("#pulse-activity-range");x.value="7";x.dispatchEvent(new Event("change",{bubbles:true}));return true})()');
  await until('document.querySelector(".pulse-linechart")?.dataset.chartPoints==="7"', 'seven-day view restored');
  assert(await js('document.querySelectorAll(".pulse-date-button").length===7'), 'range change resets the visible date controls');
  assert(await js('localStorage.getItem("bodyforge:pilot:v1")')===progressionBeforeRange, 'analytics range and date selection do not rewrite the game');
  await screenshot('bodyforge-neon-actions', '#forge-quick-deck');
  await screenshot('bodyforge-profile-header', '.dashboard-player');
  await viewport(360);
  await viewport(320);
  await viewport(428);
  await viewport(390);
  await click('[data-quick-action="hero"]');
  await until('!!document.querySelector("#avatar-lab")', 'avatar editor');
  const profileBefore = await js('localStorage.getItem("bodyforge:pilot:v1")');
  assert(profileBefore !== null, 'fighter progression exists before customization');
  await until('!!document.querySelector(".studio-preview [data-3d-status=active]")', '3D renderer live');
  await until('!!document.querySelector(".studio-preview [data-avatar-source=cc0]")', 'real CC0 GLB rendered', 30000);
  assert(await js('document.querySelector(".armory-swatch-grid")!==null'), 'editor shows real choices');
  assert(await js('document.querySelectorAll("[data-hair-style]").length===3'), 'three haircuts available without changing rewards');
  await screenshot('bodyforge-avatar-full', '#forge .studio-preview');
  await click('[data-avatar-view="portrait"]');
  await until('document.querySelector(".studio-preview canvas")?.dataset.avatarView==="portrait"', 'camera zoom to portrait');
  await screenshot('bodyforge-avatar-face', '#forge .studio-preview');
  await click('[data-hair-style="buzz"]');
  await until('document.querySelector(".studio-preview [data-look-hair-style]")?.dataset.lookHairStyle==="buzz"', 'second 3D haircut switches to buzz');
  await screenshot('bodyforge-avatar-buzz', '#forge .studio-preview');
  await click('[data-hair-style="swept"]');
  await until('document.querySelector(".studio-preview [data-look-hair-style]")?.dataset.lookHairStyle==="swept"', 'third 3D haircut switches to swept');
  await click('[data-skin="deep"]');
  await click('[data-hair="silver"]');
  await click('[data-trim="pulse"]');
  await click('[data-visor="off"]');
  await until('document.querySelector(".studio-preview [data-look-skin]")?.dataset.lookSkin==="deep"', 'skin material render prop');
  await until('document.querySelector(".studio-preview [data-look-hair]")?.dataset.lookHair==="silver"', 'hair material render prop');
  assert(await js('document.querySelector(".studio-preview [data-look-trim]")?.dataset.lookTrim==="pulse"'), 'outfit neon trim updates without gear purchase');
  assert(await js('document.querySelector(".studio-preview [data-look-visor]")?.dataset.lookVisor==="on"'), 'optional visor updates on 3D');
  const look = await js('JSON.parse(localStorage.getItem("bodyforge:avatar-look:v1"))');
  assert(look.version === 1 && look.skin === 'deep' && look.hair === 'silver' &&
    look.trim === 'pulse' && look.visor === true && look.hairStyle === 'swept', 'chosen cosmetics and haircut verified in localStorage read-back');
  assert(await js('localStorage.getItem("bodyforge:pilot:v1")') === profileBefore, 'free cosmetics do not mutate paid gear, XP or profile');
  await screenshot('bodyforge-avatar-customized', '#forge .studio-preview');
  await screenshot('bodyforge-avatar-controls', '#avatar-lab');
  await viewport(360);
  await viewport(320);
  await viewport(428);
  await viewport(390);
  await click('[data-avatar-view="full"]');
  // The GLB unmounts outside its viewport to save battery. Scroll it back
  // before expecting an active canvas to receive the new full-body camera.
  await js('(()=>{document.querySelector("#forge .studio-preview").scrollIntoView({block:"start"});return true})()');
  await until('document.querySelector(".studio-preview canvas")?.dataset.avatarView==="full"', 'return to full-body 3D');
  await click('[aria-label="Повернуть бойца вправо"]');
  assert(await js('document.querySelector(".studio-preview [data-3d-status=active]")!==null'), '3D stays active during orbit change');
  const beforeDrag = await js('Number(document.querySelector("#forge .studio-preview canvas")?.dataset.avatarYaw)');
  const point = await js('(()=>{const r=document.querySelector("#forge .studio-preview canvas").getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()');
  assert(Number.isFinite(beforeDrag) && Number.isFinite(point.x) && Number.isFinite(point.y), 'camera exposes finite orbit for gesture testing');
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x+42, y: point.y, button: 'left', buttons: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x+42, y: point.y, button: 'left', clickCount: 1 });
  await until('Number(document.querySelector("#forge .studio-preview canvas")?.dataset.avatarYaw) > '+(beforeDrag+.25), 'actual pointer gesture changes yaw');
  const afterDrag = await js('Number(document.querySelector("#forge .studio-preview canvas")?.dataset.avatarYaw)');
  await click('[aria-label="Повернуть бойца вправо"]');
  await until('Number(document.querySelector("#forge .studio-preview canvas")?.dataset.avatarYaw) > '+(afterDrag+.15), 'button continues from gesture instead of snapping back');
  await js('window.__pulseBeforeReload = true; true');
  await cdp('Page.reload', { ignoreCache: true });
  // Page.reload starts navigation but its CDP reply may arrive before the old
  // document disappears. Require a NEW document, not a stale unlocked nav.
  await until('window.__pulseBeforeReload === undefined && document.readyState === "complete" && document.querySelector(".mobile-nav button:nth-child(3)")?.disabled === false', 'new document, navigation and saved profile ready after reload');
  // Normal navigation returns to Dashboard on reload; visit Hero again.
  await click('.mobile-nav button:nth-child(3)');
  await until('!!document.querySelector("#avatar-lab")', 'avatar editor restored after navigation');
  await js('(()=>{document.querySelector("#forge .studio-preview").scrollIntoView({block:"start"});return true})()');
  await until('document.querySelector(".studio-preview [data-look-skin]")?.dataset.lookSkin==="deep"', 'persisted material restored after reload');
  const reloadLook = await js('({button:document.querySelector("#avatar-lab [data-visor]")?.getAttribute("data-visor"),pressed:document.querySelector("#avatar-lab [data-visor]")?.getAttribute("aria-pressed"),saved:JSON.parse(localStorage.getItem("bodyforge:avatar-look:v1"))?.visor,preview:document.querySelector(".studio-preview [data-look-visor]")?.dataset.lookVisor})');
  console.log('RELOAD_LOOK_READBACK', JSON.stringify(reloadLook));
  assert(reloadLook.button === 'on' && reloadLook.pressed === 'true' && reloadLook.saved === true && reloadLook.preview === 'on', 'visor control reflects reloaded saved look');
  assert(await js('document.querySelector("[data-hair-style=swept]")?.getAttribute("aria-pressed")==="true"'), 'haircut restored and selected in editor after reload');
  assert(await js('localStorage.getItem("bodyforge:pilot:v1")') === profileBefore, 'reload did not rewrite fighter data');
  assert(errors.length === 0, 'no uncaught browser JavaScript errors');
  console.log('BODYFORGE_PULSE_ARMORY_PASS', JSON.stringify({ checks, screenshots: shots, browserErrors: errors }));
} catch (error) {
  console.error('BODYFORGE_PULSE_ARMORY_FAIL', error.stack || String(error));
  console.error('BROWSER_ERRORS', JSON.stringify(errors));
  process.exitCode = 19;
} finally {
  socket?.close();
  chrome.kill();
  await wait(250);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* disposable Chrome */ }
}
