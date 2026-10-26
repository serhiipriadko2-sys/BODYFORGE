// Actual application UI in two independent tabs of one disposable Chrome profile.
// Only synthetic local game data is used. No camera, owner profile or public route.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('QA requires a loopback HTTP origin');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-appearance-'));
const artifactDir = process.env.BODYFORGE_QA_ARTIFACT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'bf-appearance-evidence-'));
fs.mkdirSync(artifactDir, { recursive: true });
const key = 'bodyforge:appearance:v1', gameKey = 'bodyforge:pilot:v1';
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clients = new Set(), observations = { screenshots: [], colors: [], layouts: [], nativeFocus: [] };
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
let port, assertions = 0;
function check(condition, label) {
  if (!condition) throw Error('FAIL ' + label);
  assertions++;
  console.log('PASS', label);
}
async function waitFor(read, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await read()) return; await sleep(80); }
  throw Error('TIMEOUT ' + label);
}
class Client {
  constructor(target) {
    this.target = target;
    this.socket = new WebSocket(target.webSocketDebuggerUrl);
    this.seq = 0; this.requests = new Map(); this.errors = []; this.loads = 0;
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data.toString());
      if (this.requests.has(message.id)) {
        this.requests.get(message.id)(message); this.requests.delete(message.id);
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      }
      if (message.method === 'Page.loadEventFired') this.loads++;
    });
    clients.add(this);
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
    const result = await this.cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async until(expression, label, timeout) { return waitFor(() => this.js(expression), label, timeout); }
  async click(selector) {
    check(await this.js('(()=>{const e=document.querySelector(' + JSON.stringify(selector) + ');if(!e||e.disabled)return false;e.click();return true})()'), 'click ' + selector);
  }
  async input(selector, value) {
    check(await this.js('(()=>{const e=document.querySelector(' + JSON.stringify(selector) + ');if(!e)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,' + JSON.stringify(value) + ');e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));return true})()'), 'input ' + selector);
  }
  async keyboard(key, code, modifiers = 0) {
    await this.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers });
    await this.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers });
  }
  async viewport(width, height = width === 360 ? 800 : 844) {
    await this.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await sleep(180);
  }
  async screenshot(name) {
    await this.cdp('Page.bringToFront');
    const result = await this.cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(artifactDir, name + '.png');
    fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
    observations.screenshots.push({ file, bytes: fs.statSync(file).size });
    console.log('SHOT', file, fs.statSync(file).size);
  }
  async close() {
    try { await fetch('http://127.0.0.1:' + port + '/json/close/' + this.target.id); }
    finally { this.socket.close(); clients.delete(this); }
  }
}
async function newTab() {
  const target = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
  const tab = new Client(target);
  await tab.cdp('Runtime.enable'); await tab.cdp('Page.enable');
  await tab.viewport(390);
  await tab.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  return tab;
}
async function app(tab, reload = false) {
  const loads = tab.loads;
  if (reload) await tab.cdp('Page.reload', { ignoreCache: true });
  else await tab.cdp('Page.navigate', { url: origin + '/' });
  await waitFor(async () => tab.loads > loads, 'fresh application document loaded');
  await tab.until('!!document.querySelector(".app-shell")&&!!' + query('button[aria-label="Внешний вид"]'), 'actual application and appearance control');
  await tab.until('document.documentElement.dataset.bfPalette!==undefined', 'appearance applied to document');
}
async function open(tab) {
  await tab.cdp('Page.bringToFront');
  await tab.js(query('button[aria-label="Внешний вид"]') + '.focus();true');
  await tab.click('button[aria-label="Внешний вид"]');
  await tab.until('document.querySelector("dialog.appearance-dialog")?.open===true', 'native appearance dialog opened');
}
async function close(tab) {
  await tab.click('button[aria-label="Закрыть внешний вид"]');
  await tab.until('document.querySelector("dialog.appearance-dialog")?.open===false', 'appearance dialog closed');
}
async function stored(tab) { return tab.js('localStorage.getItem(' + JSON.stringify(key) + ')'); }
async function gameBytes(tab) {
  return tab.js('JSON.stringify(Object.entries(localStorage).filter(([key])=>key.startsWith(' + JSON.stringify(gameKey) + ')).sort(([a],[b])=>a.localeCompare(b)))');
}
async function settings(tab, palette, material = 'glass', contrast = 'standard') {
  await tab.until('document.documentElement.dataset.bfPalette===' + JSON.stringify(palette) +
    '&&document.documentElement.dataset.bfMaterial===' + JSON.stringify(material) +
    '&&document.documentElement.dataset.bfContrast===' + JSON.stringify(contrast), 'theme ' + [palette, material, contrast].join('/'));
}
async function savedSettings(tab, palette, material = 'glass', highContrast = false) {
  await settings(tab, palette, material, highContrast ? 'high' : 'standard');
  await tab.until('(()=>{try{const s=JSON.parse(localStorage.getItem(' + JSON.stringify(key) + '));return s?.version===1&&s.palette===' + JSON.stringify(palette) + '&&s.material===' + JSON.stringify(material) + '&&s.highContrast===' + highContrast + '}catch{return false}})()', 'appearance acknowledged in localStorage');
}
async function layout(tab, label, dialog = false) {
  if (!dialog) await tab.until('!!document.querySelector(".character-card .avatar-3d-drag")', 'avatar ready before measuring overlay geometry', 25000);
  const result = await tab.js('(()=>{const d=document.querySelector("dialog.appearance-dialog"),r=d.getBoundingClientRect(),trigger=' + query('button[aria-label="Внешний вид"]') + '.getBoundingClientRect(),cta=document.querySelector(".character-card .mobile-quickstart button")?.getBoundingClientRect(),nav=document.querySelector(".mobile-nav")?.getBoundingClientRect(),hint=document.querySelector(".character-card .avatar-3d-drag")?.getBoundingClientRect(),power=document.querySelector(".character-card .power-label")?.getBoundingClientRect();return {label:' + JSON.stringify(label) + ',width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,trigger:{width:trigger.width,height:trigger.height,left:trigger.left,right:trigger.right},dialog:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:d.clientWidth,scrollWidth:d.scrollWidth,height:d.clientHeight,scrollHeight:d.scrollHeight},hint:hint?{left:hint.left,right:hint.right,top:hint.top,bottom:hint.bottom}:null,power:power?{left:power.left,right:power.right,top:power.top,bottom:power.bottom}:null,cta:!!cta&&!!nav&&cta.top>=0&&cta.bottom<=nav.top}})()');
  observations.layouts.push(result);
  console.log('MOBILE_LAYOUT', JSON.stringify(result));
  if (dialog && result.dialog.scrollWidth > result.dialog.width) {
    const children = await tab.js('(()=>{const d=document.querySelector("dialog.appearance-dialog"),r=d.getBoundingClientRect(),s=getComputedStyle(d),edge=r.right-parseFloat(s.paddingRight)-parseFloat(s.borderRightWidth);return [...d.querySelectorAll("*")].map(e=>{const b=e.getBoundingClientRect();return {tag:e.tagName,class:e.className,text:e.textContent?.trim().slice(0,55),client:e.clientWidth,scroll:e.scrollWidth,left:b.left,right:b.right,contentRight:edge}}).filter(e=>(e.client>0&&e.scroll>e.client)||e.right>edge+.5)})()');
    console.log('DIALOG_OVERFLOW_CHILDREN', JSON.stringify(children));
  }
  check(result.scrollWidth <= result.width, label + ' has no horizontal page overflow');
  check(result.trigger.width >= 44 && result.trigger.height >= 44 && result.trigger.left >= 0 && result.trigger.right <= result.width, label + ' appearance control is a visible 44px touch target');
  if (dialog) {
    check(result.dialog.left >= 0 && result.dialog.right <= result.width && result.dialog.top >= 0 && result.dialog.bottom <= result.height, label + ' dialog stays within mobile viewport');
    check(result.dialog.scrollWidth <= result.dialog.width, label + ' dialog content has no horizontal overflow');
  } else {
    check(result.cta, label + ' training CTA remains above bottom navigation');
    const h = result.hint, p = result.power;
    check(h && p && (h.right <= p.left || p.right <= h.left || h.bottom <= p.top || p.bottom <= h.top), label + ' avatar gesture hint and muscle badge do not overlap');
  }
}
function measuredContrast(first, second) {
  const luminance = (css) => {
    const channels = css.match(/[0-9.]+/g).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
    });
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
async function hoverContrast(tab) {
  await close(tab);
  await tab.cdp('DOM.enable'); await tab.cdp('CSS.enable');
  const document = await tab.cdp('DOM.getDocument');
  const node = await tab.cdp('DOM.querySelector', { nodeId: document.root.nodeId, selector: '.character-card .mobile-quickstart button' });
  await tab.cdp('CSS.forcePseudoState', { nodeId: node.nodeId, forcedPseudoClasses: ['hover'] });
  try {
    const hover = await tab.js('(()=>{const s=getComputedStyle(document.querySelector(".character-card .mobile-quickstart button"));return {foreground:s.color,background:s.backgroundColor,filter:s.filter}})()');
    observations.hover = { ...hover, ratio: measuredContrast(hover.foreground, hover.background) };
    console.log('CUSTOM_BOUNDARY_HOVER', JSON.stringify(observations.hover));
    check(hover.filter === 'none', 'custom #747474 CTA hover does not apply a brightness filter');
    check(observations.hover.ratio >= 4.5, 'actual custom #747474 hovered CTA text contrast remains >=4.5');
  } finally { await tab.cdp('CSS.forcePseudoState', { nodeId: node.nodeId, forcedPseudoClasses: [] }); }
  await open(tab);
}
async function reducedTransparency(tab) {
  await tab.cdp('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-reduced-transparency', value: 'reduce' },
  ] });
  const matches = await tab.js('matchMedia("(prefers-reduced-transparency: reduce)").matches');
  if (matches) {
    const materials = await tab.js('[document.querySelector(".topbar"),document.querySelector(".mobile-nav"),document.querySelector("dialog.appearance-dialog")].map(e=>{const s=getComputedStyle(e);return {filter:s.backdropFilter,background:s.backgroundColor}})');
    observations.reducedTransparency = { status: 'OBSERVED', matches, materials };
    console.log('SYSTEM_REDUCED_TRANSPARENCY', JSON.stringify(observations.reducedTransparency));
    check(materials.every((s) => s.filter === 'none'), 'emulated system reduced transparency removes every glass filter');
    check(materials.every((s) => {
      const channels = s.background.match(/[0-9.]+/g).map(Number);
      return channels.length === 3 || channels[3] === 1;
    }), 'emulated system reduced transparency makes navigation and dialog opaque');
    observations.reducedTransparency.status = 'PASS';
  } else {
    observations.reducedTransparency = { status: 'NOT_VERIFIED', matches, reason: 'Current Chrome did not expose the emulated media query.' };
    console.log('NOT_VERIFIED system reduced transparency: current Chrome media-query emulation did not match');
  }
  await tab.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
}
async function colors(tab, label) {
  const result = await tab.js('(()=>{const probe=document.createElement("span");probe.style.position="absolute";probe.style.visibility="hidden";probe.style.setProperty("transition","none","important");document.body.append(probe);const read=(name)=>{probe.style.color="var("+name+")";return getComputedStyle(probe).color};const values=Object.fromEntries(["--bf-accent","--bf-accent-ink","--bf-accent-copy","--bf-copy","--bf-muted","--bf-surface-solid"].map(name=>[name,read(name)]));probe.remove();const glass=getComputedStyle(document.querySelector(".topbar")).backgroundColor.match(/[0-9.]+/g).map(Number),alpha=glass[3]??1;values.glassOnWhite="rgb("+glass.slice(0,3).map(v=>Math.round(v*alpha+255*(1-alpha))).join(",")+")";const luminance=(rgb)=>{const channels=rgb.match(/[0-9.]+/g).slice(0,3).map(Number).map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722};const ratio=(a,b)=>{a=luminance(values[a]);b=luminance(values[b]);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};return {label:' + JSON.stringify(label) + ',values,ratios:{button:ratio("--bf-accent-ink","--bf-accent"),accentCopy:ratio("--bf-accent-copy","--bf-surface-solid"),copy:ratio("--bf-copy","--bf-surface-solid"),muted:ratio("--bf-muted","--bf-surface-solid"),glassCopy:ratio("--bf-copy","glassOnWhite"),glassMuted:ratio("--bf-muted","glassOnWhite")}}})()');
  observations.colors.push(result);
  console.log('OPAQUE_TOKEN_CONTRAST', JSON.stringify(result));
  for (const [pair, ratio] of Object.entries(result.ratios)) check(ratio >= 4.5, label + ' opaque/composited token contrast ' + pair + ' >=4.5 (' + ratio.toFixed(2) + ')');
}
async function palette(tab, value) {
  await tab.click('.appearance-palette button[data-palette="' + value + '"]');
  await savedSettings(tab, value);
  check(await tab.js(query('.appearance-palette [data-palette="' + value + '"]') + '.getAttribute("aria-pressed")==="true"'), value + ' selected state exposed to assistive technology');
  await colors(tab, value);
}

// This function is serialized into the browser; all measurements come from
// the actual styled application elements, not from the theme implementation.
function integrationStyleSnapshot(specs) {
  const probe = document.createElement('span');
  probe.style.setProperty('transition', 'none', 'important');
  probe.style.visibility = 'hidden';
  document.body.append(probe);
  const token = (name) => {
    probe.style.color = 'var(' + name + ')';
    return getComputedStyle(probe).color;
  };
  const effectiveBackground = (element) => {
    for (let node = element; node; node = node.parentElement) {
      const value = getComputedStyle(node).backgroundColor;
      const channels = value.match(/[0-9.]+/g)?.map(Number) ?? [];
      if (channels.length === 3 || channels[3] === 1) return value;
      // A content panel should be opaque; partial alpha remains explicit and
      // fails the solid-surface contract rather than being guessed here.
      if (channels[3] > 0) return value;
    }
    return 'transparent';
  };
  const records = specs.map(({ selector, property, expected, pseudo }) => {
    const element = document.querySelector(selector);
    if (!element) return { selector, property, missing: true };
    const style = getComputedStyle(element, pseudo);
    return { selector, property, pseudo: pseudo ?? null,
      actual: property === 'effectiveBackground' ? effectiveBackground(element) : style[property],
      expected: token(expected), opacity: style.opacity, filter: style.backdropFilter,
      background: property === 'color' ? effectiveBackground(element) : style.backgroundColor,
      visible: !!element.getClientRects().length,
    };
  });
  probe.remove();
  return records;
}
async function integrationRecords(tab, specs) {
  return tab.js('(' + integrationStyleSnapshot.toString() + ')(' + JSON.stringify(specs) + ')');
}
async function integrationBounds(tab, selectors, label) {
  const bounds = await tab.js('(()=>{const selectors=' + JSON.stringify(selectors) + ';return {width:innerWidth,scroll:document.documentElement.scrollWidth,panels:selectors.map(selector=>{const e=document.querySelector(selector),r=e?.getBoundingClientRect();return {selector,present:!!e,client:e?.clientWidth,scroll:e?.scrollWidth,left:r?.left,right:r?.right,visible:!!e?.getClientRects().length}})}})()');
  observations.integrationBounds ??= [];
  observations.integrationBounds.push({ label, ...bounds });
  console.log('INTEGRATION_BOUNDS', JSON.stringify({ label, ...bounds }));
  check(bounds.scroll <= bounds.width, label + ' page has no horizontal overflow');
  for (const panel of bounds.panels) {
    check(panel.present && panel.visible && panel.left >= 0 && panel.right <= bounds.width && panel.scroll <= panel.client, label + ' new panel content stays within its mobile bounds ' + panel.selector);
  }
}
async function preferenceDraftRaces(a, initialGame) {
  const b = await newTab();
  try {
    await app(b);
    const baseline = await a.js('Number(document.querySelector("[data-goal-target]").dataset.goalTarget)');
    check(baseline <= 120, 'synthetic goal has room for independent tab edits');
    if (!await a.js('!!document.querySelector("#daily-plan .bf-goal-editor")')) await a.click('#daily-plan .bf-small-action');
    await a.click('#daily-plan button[aria-label="Увеличить цель на 20"]');
    const wanted = baseline + 20, remote = baseline + 40;
    await a.until('parseInt(document.querySelector("#daily-plan output")?.textContent)===' + wanted, 'first tab has its own unsaved daily-goal draft');
    await b.click('#daily-plan .bf-small-action');
    await b.click('#daily-plan button[aria-label="Увеличить цель на 20"]');
    await b.click('#daily-plan button[aria-label="Увеличить цель на 20"]');
    await b.click('#daily-plan .bf-goal-save');
    await a.until('Number(document.querySelector("[data-goal-target]").dataset.goalTarget)===' + remote, 'first tab receives actual newer goal from the second tab');
    const goal = await a.js('({saved:Number(document.querySelector("[data-goal-target]").dataset.goalTarget),draft:parseInt(document.querySelector("#daily-plan output")?.textContent),warning:[...document.querySelectorAll("#daily-plan [role=status]")].some(e=>/черновик/i.test(e.innerText))})');
    await a.click('#daily-plan .bf-goal-cancel');
    await a.click('#daily-plan .bf-small-action');
    goal.cancelledDraft = await a.js('parseInt(document.querySelector("#daily-plan output")?.textContent)');
    await a.click('#daily-plan .bf-goal-cancel');
    // Hiding an editor is not explicit cancellation of its unsaved contents.
    await a.click('#daily-plan .bf-small-action');
    await a.click('#daily-plan button[aria-label="Увеличить цель на 20"]');
    const hiddenWanted = remote + 20, hiddenRemote = remote + 40;
    await a.until('parseInt(document.querySelector("#daily-plan output")?.textContent)===' + hiddenWanted, 'first tab edits a second daily-goal draft before hiding');
    await a.click('#daily-plan .bf-small-action');
    check(!await a.js('!!document.querySelector("#daily-plan .bf-goal-editor")'), 'hide editor collapses controls without explicit cancellation');
    await b.click('#daily-plan .bf-small-action');
    await b.click('#daily-plan button[aria-label="Увеличить цель на 20"]');
    await b.click('#daily-plan button[aria-label="Увеличить цель на 20"]');
    await b.click('#daily-plan .bf-goal-save');
    await a.until('Number(document.querySelector("[data-goal-target]").dataset.goalTarget)===' + hiddenRemote, 'first tab receives newer goal while its dirty editor is hidden');
    const hiddenGoal = await a.js('({saved:Number(document.querySelector("[data-goal-target]").dataset.goalTarget),warningBeforeReopen:[...document.querySelectorAll("#daily-plan [role=status]")].some(e=>/черновик/i.test(e.innerText))})');
    await a.click('#daily-plan .bf-small-action');
    hiddenGoal.draft = await a.js('parseInt(document.querySelector("#daily-plan output")?.textContent)');
    hiddenGoal.warningAfterReopen = await a.js('[...document.querySelectorAll("#daily-plan [role=status]")].some(e=>/черновик/i.test(e.innerText))');
    await a.click('#daily-plan .bf-goal-cancel');
    await a.click('#daily-plan .bf-small-action');
    hiddenGoal.cancelledDraft = await a.js('parseInt(document.querySelector("#daily-plan output")?.textContent)');
    await a.click('#daily-plan .bf-goal-cancel');
    await a.input('#bf-steps-today', '7777');
    await b.input('#bf-steps-today', '8888');
    await b.click('#step-log .bf-step-input-row button');
    await a.until('document.querySelector("[data-manual-steps]")?.dataset.manualSteps==="8888"', 'first tab receives actual newer saved manual steps');
    const steps = await a.js('({saved:Number(document.querySelector("[data-manual-steps]").dataset.manualSteps),draft:document.querySelector("#bf-steps-today").value,warning:[...document.querySelectorAll("#step-log [role=status]")].some(e=>/ввод/i.test(e.innerText)),durable:JSON.parse(localStorage.getItem("bodyforge:manual-steps:v1"))?.count})');
    check(await gameBytes(a) === initialGame, 'two-tab goal and manual-step edits preserve every game storage byte');
    await app(a, true);
    steps.afterReload = await a.js('({saved:Number(document.querySelector("[data-manual-steps]").dataset.manualSteps),input:document.querySelector("#bf-steps-today").value})');
    observations.preferenceDrafts = { baseline, wanted, remote, goal, hiddenWanted, hiddenRemote, hiddenGoal, steps };
    console.log('PREFERENCE_DRAFT_OBSERVATIONS', JSON.stringify(observations.preferenceDrafts));
    check(goal.saved === remote && goal.draft === wanted, 'cross-tab saved goal updates while first-tab unsaved draft remains intact');
    check(goal.warning, 'cross-tab goal update visibly explains the preserved draft');
    check(goal.cancelledDraft === remote, 'cancelling daily-goal draft returns to latest saved goal');
    check(hiddenGoal.saved === hiddenRemote && hiddenGoal.draft === hiddenWanted, 'hidden unsaved daily-goal draft survives another tab save and reopening');
    check(hiddenGoal.warningBeforeReopen && hiddenGoal.warningAfterReopen, 'cross-tab conflict warning remains visible when dirty goal editor is reopened');
    check(hiddenGoal.cancelledDraft === hiddenRemote, 'explicit cancellation of hidden-and-reopened goal loads latest saved goal');
    check(steps.saved === 8888 && steps.draft === '7777' && steps.durable === 8888, 'cross-tab saved manual steps update without replacing unsaved input');
    check(steps.warning, 'cross-tab manual-step update visibly explains the preserved input');
    check(steps.afterReload.saved === 8888 && steps.afterReload.input === '8888', 'reload restores durable manual steps rather than the abandoned draft');
    check(await gameBytes(a) === initialGame, 'two-tab preference races and reload leave game progress byte-identical');
  } finally { await b.close(); }
}
async function integrationExperience(tab, initialGame) {
  const goalKey = 'bodyforge:daily-plan:v1', stepsKey = 'bodyforge:manual-steps:v1';
  const appearanceBefore = await stored(tab);
  await tab.until('!!document.querySelector("#daily-plan")&&!!document.querySelector("#step-log")', 'new daily plan and manual steps panels mounted');
  await tab.click('#daily-plan .bf-small-action');
  await tab.click('#daily-plan button[aria-label="Увеличить цель на 20"]');
  await tab.click('#daily-plan .bf-goal-save');
  await tab.until('document.querySelector("[data-goal-target]")?.dataset.goalTarget==="40"', 'new daily goal acknowledged in actual panel');
  check(await tab.js('JSON.parse(localStorage.getItem(' + JSON.stringify(goalKey) + '))?.targetReps===40'), 'daily goal saved in its separate preference key');
  check(await gameBytes(tab) === initialGame, 'changing daily goal preserves exact game primary, backup and result bytes');
  check(await stored(tab) === appearanceBefore, 'changing daily goal does not rewrite appearance settings');
  await tab.input('#bf-steps-today', '4321');
  await tab.click('#step-log .bf-step-input-row button');
  await tab.until('document.querySelector("[data-manual-steps]")?.dataset.manualSteps==="4321"', 'manual steps acknowledged in actual panel');
  check(await tab.js('(()=>{const s=JSON.parse(localStorage.getItem(' + JSON.stringify(stepsKey) + '));return s?.count===4321&&s.source==="manual"})()'), 'manual steps saved with explicit manual provenance in separate key');
  check(await gameBytes(tab) === initialGame, 'manual steps award no XP or coins and preserve exact game bytes');
  check(await stored(tab) === appearanceBefore, 'manual steps do not rewrite appearance settings');
  await app(tab, true);
  check(await tab.js('document.querySelector("[data-goal-target]")?.dataset.goalTarget==="40"&&document.querySelector("[data-manual-steps]")?.dataset.manualSteps==="4321"'), 'daily goal and manual steps survive actual application reload');
  check(await gameBytes(tab) === initialGame, 'reloading goal and steps leaves game primary and backup byte-identical');

  const homeSpecs = [
    ['#daily-plan', 'effectiveBackground', '--bf-surface-solid'],
    ['#step-log', 'effectiveBackground', '--bf-surface-solid'],
    ['#daily-plan .bf-panel-heading strong', 'color', '--bf-copy'],
    ['#step-log .bf-panel-heading strong', 'color', '--bf-copy'],
    ['#daily-plan .bf-panel-description', 'color', '--bf-muted'],
    ['#step-log .bf-panel-description', 'color', '--bf-muted'],
    ['#daily-plan .bf-panel-heading>span', 'color', '--bf-accent-copy'],
    ['#step-log .bf-panel-heading>span', 'color', '--bf-accent-copy'],
    ['#daily-plan .bf-goal-overview strong', 'color', '--bf-accent-copy'],
    ['#daily-plan .bf-goal-editor output', 'color', '--bf-accent-copy'],
    ['#daily-plan .bf-goal-editor button[aria-label="Увеличить цель на 20"]', 'color', '--bf-accent-copy'],
    ['#step-log .bf-step-summary strong', 'color', '--bf-accent-copy'],
    ['#daily-plan .bf-gold-action', 'backgroundColor', '--bf-accent'],
    ['#daily-plan .bf-gold-action', 'color', '--bf-accent-ink'],
    ['#daily-plan .bf-goal-save', 'backgroundColor', '--bf-accent'],
    ['#daily-plan .bf-goal-save', 'color', '--bf-accent-ink'],
    ['#step-log .bf-step-input-row button', 'backgroundColor', '--bf-accent'],
    ['#step-log .bf-step-input-row button', 'color', '--bf-accent-ink'],
  ].map(([selector, property, expected]) => ({ selector, property, expected }));
  const cameraSpecs = [
    ['.bf-catalog', 'effectiveBackground', '--bf-surface-solid'],
    ['.bf-guide', 'effectiveBackground', '--bf-surface-solid'],
    ['.bf-catalog-trigger strong', 'color', '--bf-copy'],
    ['.bf-catalog-trigger small', 'color', '--bf-muted'],
    ['.bf-catalog-trigger-icon', 'color', '--bf-accent-copy'],
    ['.bf-catalog-expand', 'color', '--bf-accent-copy'],
    ['.bf-catalog-item.selected', 'borderTopColor', '--bf-accent-copy'],
    ['.bf-catalog-item.selected', 'color', '--bf-accent-copy'],
    ['.bf-guide-phone', 'color', '--bf-accent-copy'],
    ['.bf-guide-pose strong', 'color', '--bf-copy'],
    ['.bf-guide-steps li', 'color', '--bf-copy'],
    ['.bf-guide-privacy', 'color', '--bf-muted'],
  ].map(([selector, property, expected]) => ({ selector, property, expected }));
  cameraSpecs.push({ selector: '.bf-guide-steps li', pseudo: '::before', property: 'backgroundColor', expected: '--bf-accent' });
  cameraSpecs.push({ selector: '.bf-guide-steps li', pseudo: '::before', property: 'color', expected: '--bf-accent-ink' });
  observations.integration = [];
  for (const variant of ['mint', 'violet', 'custom-dark', 'high-contrast']) {
    await open(tab);
    if (variant === 'custom-dark') {
      await tab.input('input[aria-label="HEX акцента"]', '#1842a5');
      await tab.click('[data-action="apply-custom"]'); await savedSettings(tab, 'custom');
    } else if (variant === 'high-contrast') {
      await tab.click('input[name="highContrast"]'); await savedSettings(tab, 'custom', 'glass', true);
    } else {
      await tab.click('.appearance-palette [data-palette="' + variant + '"]'); await savedSettings(tab, variant);
    }
    await close(tab);
    await tab.click('.mobile-nav button:nth-child(1)');
    if (!await tab.js('!!document.querySelector("#daily-plan .bf-goal-editor")')) await tab.click('#daily-plan .bf-small-action');
    const home = await integrationRecords(tab, homeSpecs);
    await tab.click('.mobile-nav button:nth-child(2)');
    if (!await tab.js('!!document.querySelector(".bf-catalog-grid")')) await tab.click('.bf-catalog-trigger');
    if (!await tab.js('!!document.querySelector(".bf-guide")')) await tab.click('.bf-guide-trigger');
    const camera = await integrationRecords(tab, cameraSpecs);
    const records = [...home, ...camera];
    const state = { variant, records };
    observations.integration.push(state);
    console.log('INTEGRATION_THEME', JSON.stringify(state));
    for (const record of records) {
      check(!record.missing && record.visible, variant + ' actual new control is rendered ' + record.selector);
      check(record.actual === record.expected, variant + ' new control follows theme token ' + record.selector + (record.pseudo ?? '') + ' ' + record.property);
      if (record.property === 'color' && !record.pseudo) {
        check(measuredContrast(record.actual, record.background) >= 4.5, variant + ' new text/button has actual contrast >=4.5 ' + record.selector);
      }
      if (variant === 'high-contrast' && record.property === 'effectiveBackground') {
        check(record.opacity === '1' && record.filter === 'none' && !record.actual.startsWith('rgba'), 'high contrast new content is opaque without blur ' + record.selector);
      }
    }
    check(await gameBytes(tab) === initialGame, variant + ' new panel theme changes preserve exact game bytes');
    check(await tab.js('JSON.parse(localStorage.getItem(' + JSON.stringify(goalKey) + '))?.targetReps===40&&JSON.parse(localStorage.getItem(' + JSON.stringify(stepsKey) + '))?.count===4321'), variant + ' theme changes preserve saved daily goal and manual steps');
    for (const width of [390, 360, 320]) {
      await tab.viewport(width, width === 390 ? 844 : 800);
      await tab.click('.mobile-nav button:nth-child(1)');
      await integrationBounds(tab, ['#daily-plan', '#step-log', '.bf-goal-editor', '.bf-step-input-row'], variant + ' ' + width + ' home');
      if (width === 390) {
        await tab.js('document.querySelector("#daily-plan").scrollIntoView({block:"start",behavior:"instant"});true');
        await tab.screenshot('integration-' + variant + '-daily-plan');
        await tab.js('document.querySelector("#step-log").scrollIntoView({block:"start",behavior:"instant"});true');
        await tab.screenshot('integration-' + variant + '-manual-steps');
      }
      await tab.click('.mobile-nav button:nth-child(2)');
      await integrationBounds(tab, ['.bf-catalog', '.bf-catalog-grid', '.bf-guide', '.bf-guide-visual'], variant + ' ' + width + ' camera guide');
      if (width === 390) {
        await tab.js('document.querySelector(".bf-catalog").scrollIntoView({block:"start",behavior:"instant"});true');
        await tab.screenshot('integration-' + variant + '-catalog-guide');
      }
    }
    await tab.viewport(390);
  }
  await open(tab); await tab.click('[data-action="reset-appearance"]'); await savedSettings(tab, 'mint'); await close(tab);
  await tab.click('.mobile-nav button:nth-child(1)');
  await tab.js('scrollTo({top:0,behavior:"instant"});true');
  check(await gameBytes(tab) === initialGame, 'integrated appearance, goal and steps workflow never rewrites game progression');
}

try {
  await waitFor(() => {
    const file = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(file)) { port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]); return port > 0; }
    if (chrome.exitCode !== null) throw Error('Owned Chrome exited ' + chrome.exitCode);
    return false;
  }, 'owned Chrome DevTools', 10000);
  const a = await newTab();
  await app(a);
  await settings(a, 'mint');
  check(await stored(a) === null, 'first view does not write optional appearance preferences');
  await a.js('(async()=>{const mod=await import("/src/lib/progression.ts"),game=await import("/src/lib/game.ts");const fixture=mod.parseProfile({profileId:"qa-appearance-profile",xp:500,coins:245,workouts:[],game:{...game.freshGame(),created:true,nickname:"QA ATLAS",build:"solid"}});localStorage.setItem(' + JSON.stringify(gameKey) + ',JSON.stringify(fixture));localStorage.setItem(' + JSON.stringify(gameKey + ':backup') + ',JSON.stringify({...fixture,coins:200}));return true})()');
  const initialGame = await gameBytes(a);
  await app(a, true);
  await a.until('document.querySelector(".dashboard-player")?.textContent.includes("QA ATLAS")', 'synthetic saved fighter displayed');
  await a.until('document.querySelector(".character-card [data-avatar-source]")?.dataset.avatarSource==="cc0"', 'real human avatar loaded for screenshots', 25000);
  check(await gameBytes(a) === initialGame, 'loading preferences preserves exact primary and backup game bytes');
  if (process.argv.includes('--preferences-only')) {
    await preferenceDraftRaces(a, initialGame);
    console.log('BODYFORGE_PREFERENCE_DRAFT_E2E_PASS assertions=' + assertions);
  } else {
  await integrationExperience(a, initialGame);
  await preferenceDraftRaces(a, initialGame);
  if (process.argv.includes('--inspect-320')) {
    await a.viewport(320, 800); await open(a); await layout(a, '320 isolated inspection', true);
    await close(a); await a.viewport(390);
  }
  await layout(a, '390 mint dashboard'); await colors(a, 'mint');
  await a.screenshot('appearance-390-mint-dashboard');
  await open(a);
  await layout(a, '390 mint dialog', true);
  check(await a.js('document.querySelector("dialog.appearance-dialog").contains(document.activeElement)'), 'native dialog moves keyboard focus inside');
  await a.screenshot('appearance-390-mint-dialog');
  const escaped = await a.js('document.querySelector("dialog.appearance-dialog").matches(":modal")');
  check(escaped, 'appearance uses native modal top layer');
  for (let i = 0; i < 18; i++) {
    await a.keyboard('Tab', 9);
    const focus = await a.js('({inside:document.querySelector("dialog.appearance-dialog").contains(document.activeElement),activeTag:document.activeElement.tagName,activeFocused:document.activeElement.matches(":focus"),documentFocused:document.hasFocus(),focusedSelector:document.querySelector(":focus")?.outerHTML.slice(0,160)??null})');
    observations.nativeFocus.push(focus);
    console.log('NATIVE_MODAL_FOCUS', i + 1, JSON.stringify(focus));
    // Headless native focus traversal can have no focused DOM node between
    // the last and first controls. activeElement then reports BODY, while
    // BODY does not match :focus. No background control may receive focus.
    check(focus.inside || (focus.activeTag === 'BODY' && !focus.activeFocused && focus.focusedSelector === null), 'Tab never focuses background controls behind native modal ' + (i + 1));
  }
  check(await a.js('(()=>{document.querySelector(".mobile-nav button").focus();const d=document.querySelector("dialog.appearance-dialog");return d.contains(document.activeElement)||(document.activeElement===document.body&&!document.body.matches(":focus"))})()'), 'native modality rejects programmatic focus on background navigation');
  await a.js('document.querySelector(".appearance-close").focus();true');
  await a.keyboard('Escape', 27);
  await a.until('!document.querySelector("dialog.appearance-dialog").open', 'Escape closes native modal');
  check(await a.js('document.activeElement===' + query('button[aria-label="Внешний вид"]')), 'Escape returns focus to appearance opener');
  await open(a);
  for (const value of ['copper', 'violet', 'lime']) {
    await palette(a, value);
    if (value !== 'lime') { await close(a); await a.screenshot('appearance-390-' + value + '-dashboard'); await open(a); }
  }
  const beforeInvalid = await stored(a);
  await a.input('input[aria-label="HEX акцента"]', '#zzzzzz');
  check(await a.js(query('input[aria-label="HEX акцента"]') + '.getAttribute("aria-invalid")==="true"&&document.querySelector("[data-action=apply-custom]").disabled'), 'invalid HEX draft is identified and cannot be applied');
  check(await stored(a) === beforeInvalid, 'invalid HEX draft never overwrites saved preferences');
  for (const value of ['#000000', '#ffffff', '#1842a5', '#747474']) {
    await a.input('input[aria-label="HEX акцента"]', value);
    await a.click('[data-action="apply-custom"]');
    await savedSettings(a, 'custom');
    check(JSON.parse(await stored(a)).customAccent === value, 'custom color ' + value + ' is saved exactly');
    await colors(a, 'custom ' + value);
  }
  await hoverContrast(a);
  await a.input('input[type="color"][aria-label="Свой акцент"]', '#ea65c9');
  await savedSettings(a, 'custom');
  await a.until('JSON.parse(localStorage.getItem(' + JSON.stringify(key) + ')).customAccent==="#ea65c9"', 'native color control persists its real value');
  await colors(a, 'native custom #ea65c9');
  await a.click('input[name="material"][value="solid"]');
  await savedSettings(a, 'custom', 'solid');
  check(await a.js('[document.querySelector(".topbar"),document.querySelector(".mobile-nav"),document.querySelector("dialog.appearance-dialog")].every(e=>{const s=getComputedStyle(e);return s.backdropFilter==="none"&&s.webkitBackdropFilter!=="blur(18px)"})'), 'solid material removes backdrop filtering from navigation and dialog');
  await a.click('input[name="material"][value="glass"]');
  await savedSettings(a, 'custom');
  await reducedTransparency(a);
  await a.click('input[name="highContrast"]');
  await savedSettings(a, 'custom', 'glass', true);
  check(await a.js('[document.querySelector(".topbar"),document.querySelector(".mobile-nav"),document.querySelector("dialog.appearance-dialog")].every(e=>getComputedStyle(e).backdropFilter==="none")'), 'high contrast removes glass backdrop filtering');
  await colors(a, 'custom high contrast');
  await a.click('input[name="highContrast"]');
  await savedSettings(a, 'custom');
  const beforeReload = await stored(a);
  await app(a, true);
  await settings(a, 'custom');
  check(await stored(a) === beforeReload, 'reload restores exact acknowledged appearance without rewriting it');
  check(await gameBytes(a) === initialGame, 'all single-tab appearance changes preserve exact primary and backup game bytes');

  const b = await newTab();
  await app(b);
  check(a.target.id !== b.target.id, 'cross-tab test uses separate actual application page targets');
  await settings(b, 'custom');
  await open(b); await palette(b, 'violet');
  await settings(a, 'violet');
  check(await gameBytes(b) === initialGame, 'second-tab appearance update preserves game storage bytes');
  await close(b);
  await open(a);
  check(await a.js('document.querySelector(".appearance-palette [data-palette=violet]").getAttribute("aria-pressed")==="true"'), 'storage event updates actual first-tab settings controls');

  const beforeBlocked = await stored(a);
  await a.js('(()=>{window.__appearanceNativeSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===' + JSON.stringify(key) + ')throw new DOMException("Appearance QA storage denied","QuotaExceededError");return window.__appearanceNativeSet.call(this,k,v)};return true})()');
  await a.click('.appearance-palette [data-palette="copper"]');
  await settings(a, 'copper');
  check(await stored(a) === beforeBlocked, 'blocked appearance write does not claim a durable preference');
  check(await a.js('document.querySelector(".appearance-dialog [role=status]")?.textContent.includes("не подтвердил сохранение")===true'), 'blocked preference write has an explicit visible persistence warning');
  check(await gameBytes(a) === initialGame, 'appearance quota failure leaves game primary and backup untouched');
  await a.js('Storage.prototype.setItem=window.__appearanceNativeSet;true');
  await close(a); await app(a, true); await settings(a, 'violet');
  check(await stored(a) === beforeBlocked, 'reload after denied write restores last durable style');
  const denyRead = await a.cdp('Page.addScriptToEvaluateOnNewDocument', { source: '(()=>{const native=Storage.prototype.getItem;Storage.prototype.getItem=function(k){if(k===' + JSON.stringify(key) + ')throw new DOMException("Appearance QA blocked read","SecurityError");return native.call(this,k)}})()' });
  await app(a, true); await settings(a, 'mint');
  await open(a);
  check(await a.js('document.querySelector(".appearance-dialog [role=status]")?.textContent.includes("Хранилище недоступно")===true'), 'blocked optional appearance read falls back and reports the limitation');
  check(await gameBytes(a) === initialGame, 'blocked optional appearance read does not block or rewrite game saves');
  await a.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: denyRead.identifier });
  await app(a, true); await settings(a, 'violet');
  await open(a);
  await a.click('[data-action="reset-appearance"]');
  await savedSettings(a, 'mint'); await settings(b, 'mint');
  check(await gameBytes(a) === initialGame, 'reset appearance preserves every game storage byte');
  await close(a); await a.viewport(360);
  await layout(a, '360 mint dashboard');
  await a.screenshot('appearance-360-mint-dashboard');
  await open(a); await layout(a, '360 mint dialog', true);
  await a.screenshot('appearance-360-mint-dialog');
  await close(a);
  await a.viewport(320, 800);
  await layout(a, '320 mint dashboard');
  await a.screenshot('appearance-320-mint-dashboard');
  await open(a); await layout(a, '320 mint dialog', true);
  await a.screenshot('appearance-320-mint-dialog');
  await close(a);

  // Unknown future or malformed preference documents stay recoverable in storage.
  for (const raw of ['{broken-json', JSON.stringify({ version: 99, palette: 'future' })]) {
    await a.js('localStorage.setItem(' + JSON.stringify(key) + ',' + JSON.stringify(raw) + ');true');
    await app(a, true); await settings(a, 'mint');
    check(await stored(a) === raw, 'invalid or future preference is not silently overwritten');
    await open(a);
    check(await a.js('document.querySelector(".appearance-dialog [role=status]")?.textContent.includes("исходная запись не изменена")===true'), 'invalid preference fallback is explained honestly');
    await close(a);
  }
  check(await gameBytes(a) === initialGame, 'all scenarios preserve exact game primary, backup and result-key state');
  check([...clients].every((tab) => tab.errors.length === 0), 'no uncaught browser exceptions in either application tab');
  console.log('APPEARANCE_OBSERVATIONS', JSON.stringify(observations));
  console.log('BODYFORGE_APPEARANCE_E2E_PASS assertions=' + assertions);
  }
} catch (error) {
  console.error('BODYFORGE_APPEARANCE_E2E_FAIL', error.stack || String(error));
  process.exitCode = 18;
  for (const client of clients) {
    try { console.log('FAILURE_STATE', await client.js('JSON.stringify({url:location.href,screen:document.querySelector(".app-shell")?.dataset.screen,theme:document.documentElement.dataset,dialog:document.querySelector("dialog.appearance-dialog")?.open,focus:{tag:document.activeElement.tagName,focused:document.hasFocus()},body:document.body.innerText.slice(0,400)})')); } catch {}
  }
} finally {
  for (const client of clients) client.socket.close();
  chrome.kill();
  await sleep(500);
  const resolved = path.resolve(profile), tempRoot = path.resolve(os.tmpdir()) + path.sep;
  if (resolved.startsWith(tempRoot) && path.basename(resolved).startsWith('bf-appearance-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true }); } catch { console.log('QA_PROFILE_CLEANUP_INCOMPLETE', resolved); }
  }
}
