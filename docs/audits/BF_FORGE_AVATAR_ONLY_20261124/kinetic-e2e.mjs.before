// Actual application UI in two independent tabs of one disposable Chrome profile.
// Only synthetic local game data is used. No camera, owner profile or public route.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('QA requires a loopback HTTP origin');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-kinetic-'));
const artifactDir = process.env.BODYFORGE_QA_ARTIFACT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'bf-kinetic-evidence-'));
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

// This is a layout and interaction contract, not a pixel snapshot of one palette.
// All game records belong to the disposable profile created above.
async function savedGame(tab) {
  return tab.js('JSON.stringify(Object.entries(localStorage).filter(([key])=>key.startsWith(' + JSON.stringify(gameKey) + ')).sort(([a],[b])=>a.localeCompare(b)))');
}
async function navigate(tab, index, screen, desktop = false) {
  await tab.click((desktop ? '.sidebar nav' : '.mobile-nav') + ' button:nth-child(' + index + ')');
  await tab.until('document.querySelector(".app-shell").dataset.screen===' + JSON.stringify(screen), screen + ' screen selected');
  await tab.js('scrollTo({top:0,behavior:"instant"});true');
  if (screen === 'dashboard' || screen === 'forge') {
    const avatar = screen === 'dashboard' ? '.character-card [data-avatar-source]' : '#forge [data-avatar-source]';
    await tab.until('document.querySelector(' + JSON.stringify(avatar) + ')?.dataset.avatarSource==="cc0"', screen + ' real human avatar ready before layout and screenshots', 25000);
  }
  await sleep(120);
}
async function bounds(tab, label, screen, desktop = false) {
  const result = await tab.js(`(()=>{
    const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,display:s.display,visibility:s.visibility}};
    const nav=document.querySelector(${JSON.stringify(desktop ? '.sidebar nav' : '.mobile-nav')});
    const content=document.querySelector('main.content');
    const cta=document.querySelector('.character-card .mobile-quickstart button');
    return {label:${JSON.stringify(label)},width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
      content:rect(content),nav:rect(nav),buttons:[...nav.querySelectorAll('button')].map(e=>({...rect(e),label:e.textContent.trim(),selected:e.getAttribute('aria-current'),disabled:e.disabled})),
      cta:rect(cta),appearance:rect(document.querySelector('.appearance-trigger')),
      overflow:[...content.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&(r.right>innerWidth+.5||r.left<-.5)}).slice(0,16).map(e=>({tag:e.tagName,class:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))};
  })()`);
  observations.layouts.push(result); console.log('KINETIC_LAYOUT', JSON.stringify(result));
  check(result.scrollWidth <= result.width, label + ' no horizontal page overflow');
  check(result.content.width > 200 && result.content.display !== 'none', label + ' actual content is rendered');
  check(result.buttons.length === 5 && result.buttons.filter(b => b.selected === 'page').length === 1, label + ' exactly one accessible selected screen among five');
  check(result.buttons.every(b => b.width >= 44 && b.height >= 44 && !b.disabled && b.label.length > 0), label + ' navigation retains labeled 44px targets');
  check(result.appearance.width >= 44 && result.appearance.height >= 44 && result.appearance.left >= 0 && result.appearance.right <= result.width, label + ' appearance remains an accessible 44px target');
  if (!desktop && screen === 'dashboard') check(result.cta && result.cta.width >= 44 && result.cta.height >= 44 && result.cta.top >= 0 && result.cta.bottom <= result.nav.top, label + ' training CTA is visible above navigation in the first viewport');
}
async function openAppearance(tab) {
  await tab.js('document.querySelector(".appearance-trigger").focus();true');
  await tab.click('.appearance-trigger');
  await tab.until('document.querySelector("dialog.appearance-dialog")?.open===true', 'native appearance dialog opened');
}
async function closeAppearance(tab) {
  await tab.click('.appearance-close');
  await tab.until('document.querySelector("dialog.appearance-dialog")?.open===false', 'native appearance dialog closed');
}
async function modalBounds(tab, label) {
  const data=await tab.js('(()=>{const d=document.querySelector("dialog.appearance-dialog"),r=d.getBoundingClientRect();return {width:innerWidth,height:innerHeight,left:r.left,right:r.right,top:r.top,bottom:r.bottom,client:d.clientWidth,scroll:d.scrollWidth,modal:d.matches(":modal"),focusInside:d.contains(document.activeElement)}})()');
  console.log('KINETIC_MODAL',label,JSON.stringify(data));
  check(data.modal && data.focusInside,label+' actual native modality and initial focus');
  check(data.left>=0 && data.right<=data.width && data.top>=0 && data.bottom<=data.height && data.scroll<=data.client,label+' dialog fits without horizontal overflow');
}
async function theme(tab, palette, highContrast = false) {
  await tab.until('document.documentElement.dataset.bfPalette==='+JSON.stringify(palette)+'&&document.documentElement.dataset.bfContrast==='+JSON.stringify(highContrast?'high':'standard'),'applied '+palette+' '+(highContrast?'high':'standard'));
}
async function presentation(tab) {
  await tab.js('document.fonts.ready.then(()=>true)');
  const data=await tab.js(`(()=>{
    const f=e=>e?getComputedStyle(e).fontFamily:null;
    return {body:f(document.body),heading:f(document.querySelector('.character-header h2')),faces:[...document.fonts].map(x=>({family:x.family,status:x.status})),resources:performance.getEntriesByType('resource').filter(x=>/\\.woff2?(?:$|\\?)/.test(x.name)).map(x=>({url:x.name,bytes:x.transferSize})),logo:[...document.querySelectorAll('.brand-symbol svg')].map(x=>({viewBox:x.getAttribute('viewBox'),paths:x.querySelectorAll('path,polygon,polyline,rect,circle').length}))};
  })()`);
  console.log('KINETIC_PRESENTATION',JSON.stringify(data));observations.presentation=data;
  check(data.logo.length>0 && data.logo.every(x=>x.viewBox&&x.paths>0),'brand is real vector geometry at mobile and desktop sizes');
  check(data.body.includes('BF Manrope') && data.heading?.includes('BF Unbounded'),'body and display elements use the new typography families');
  check(['BF Manrope','BF Unbounded'].every(family=>data.faces.some(x=>x.family.replaceAll('"','')===family&&x.status==='loaded')),'both actual bundled font families are loaded rather than only declared');
  check(data.resources.length>0 && data.resources.every(x=>x.url.startsWith(origin+'/')),'loaded font resources remain same-origin');
}
async function reducedPreferences(tab) {
  const media=[{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-reduced-transparency',value:'reduce'}];
  await tab.cdp('Emulation.setEmulatedMedia',{features:media});
  const data=await tab.js('(()=>{const animations=document.getAnimations().filter(x=>x.playState==="running").map(x=>({target:x.effect?.target?.className,duration:x.effect?.getTiming().duration,iterations:x.effect?.getTiming().iterations}));return {motion:matchMedia("(prefers-reduced-motion: reduce)").matches,transparency:matchMedia("(prefers-reduced-transparency: reduce)").matches,animations,materials:[".topbar",".mobile-nav","dialog.appearance-dialog"].map(s=>{const c=getComputedStyle(document.querySelector(s));return {selector:s,filter:c.backdropFilter,bg:c.backgroundColor}})}})()');
  console.log('KINETIC_REDUCED_PREFERENCES',JSON.stringify(data));observations.reducedPreferences=data;
  check(data.motion,'reduced motion is actually emulated');
  check(!data.animations.some(x=>x.iterations===Infinity&&Number(x.duration)>1),'reduced motion has no perpetual CSS animation');
  if(data.transparency)check(data.materials.every(x=>x.filter==='none'&&(!x.bg.startsWith('rgba')||x.bg.endsWith(', 1)'))),'system reduced transparency removes glass and uses opaque surfaces');
  else console.log('NOT_VERIFIED reduced transparency media query unsupported by current Chrome');
}

try {
  check((await fetch(origin+'/')).status===200,'existing local Vite returns HTTP 200');
  await waitFor(()=>{const f=path.join(profile,'DevToolsActivePort');if(fs.existsSync(f)){port=Number(fs.readFileSync(f,'utf8').split('\n')[0]);return port>0;}if(chrome.exitCode!==null)throw Error('Owned Chrome exited '+chrome.exitCode);return false;},'owned Chrome DevTools',10000);
  const tab=await newTab();await app(tab);
  check(await tab.js('localStorage.getItem('+JSON.stringify(key)+')')===null,'first render does not create appearance settings');
  await tab.js('(async()=>{const mod=await import("/src/lib/progression.ts"),game=await import("/src/lib/game.ts");const fixture=mod.parseProfile({profileId:"qa-kinetic-profile",xp:500,coins:245,workouts:[],game:{...game.freshGame(),created:true,nickname:"QA ATLAS",build:"solid"}});localStorage.setItem('+JSON.stringify(gameKey)+',JSON.stringify(fixture));localStorage.setItem('+JSON.stringify(gameKey+':backup')+',JSON.stringify({...fixture,coins:200}));return true})()');
  const initial=await savedGame(tab);await app(tab,true);
  await tab.until('document.querySelector(".dashboard-player")?.textContent.includes("QA ATLAS")','synthetic fighter is visible');
  await tab.until('document.querySelector(".character-card [data-avatar-source]")?.dataset.avatarSource==="cc0"','real human GLB ready',25000);
  await presentation(tab);
  const screens=[['dashboard',1],['challenge',2],['forge',3],['tower',4],['online',5]];
  for(const width of [390,360,320,1440]){
    const desktop=width===1440,height=desktop?1024:width===390?844:800;
    await tab.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:!desktop});await sleep(150);
    for(const [screen,index] of screens){await navigate(tab,index,screen,desktop);await bounds(tab,width+' '+screen,screen,desktop);if(width===390||desktop)await tab.screenshot(width+'-'+screen);}
    await navigate(tab,1,'dashboard',desktop);await openAppearance(tab);await modalBounds(tab,width+' appearance');if(width===390||desktop)await tab.screenshot(width+'-appearance');await closeAppearance(tab);
    check(await savedGame(tab)===initial,width+' navigation and preview do not modify game primary/backup');
  }
  await tab.viewport(390);await navigate(tab,1,'dashboard');
  for(const palette of ['mint','copper','violet','lime']){
    await openAppearance(tab);await tab.click('.appearance-palette [data-palette="'+palette+'"]');await theme(tab,palette);await closeAppearance(tab);await bounds(tab,palette+' dashboard','dashboard');await tab.screenshot('palette-'+palette+'-dashboard');
    await navigate(tab,2,'challenge');await bounds(tab,palette+' camera','challenge');await navigate(tab,1,'dashboard');
  }
  await openAppearance(tab);await tab.input('.appearance-hex input','#1842a5');await tab.click('[data-action="apply-custom"]');await theme(tab,'custom');await closeAppearance(tab);await bounds(tab,'custom dark dashboard','dashboard');await tab.screenshot('palette-custom-dashboard');
  await openAppearance(tab);await tab.click('input[name="highContrast"]');await theme(tab,'custom',true);await closeAppearance(tab);await bounds(tab,'custom high contrast dashboard','dashboard');await tab.screenshot('custom-high-contrast-dashboard');
  const surfaces=await tab.js('[".topbar",".mobile-nav","dialog.appearance-dialog"].map(s=>getComputedStyle(document.querySelector(s)).backdropFilter)');check(surfaces.every(x=>x==='none'),'high contrast disables glass filtering across navigation and dialog');
  await openAppearance(tab);await reducedPreferences(tab);await closeAppearance(tab);
  check(await savedGame(tab)===initial,'every visual preference and navigation scenario preserves exact game bytes');
  check([...clients].every(x=>x.errors.length===0),'no uncaught browser exceptions');
  fs.writeFileSync(path.join(artifactDir,'observations.json'),JSON.stringify(observations,null,2)+'\n');
  console.log('BODYFORGE_KINETIC_E2E_PASS assertions='+assertions);
}catch(error){console.error('BODYFORGE_KINETIC_E2E_FAIL',error.stack||String(error));process.exitCode=18;for(const tab of clients){try{console.log('FAILURE_STATE',await tab.js('JSON.stringify({screen:document.querySelector(".app-shell")?.dataset.screen,body:document.body.innerText.slice(0,700)})'));await tab.screenshot('failure-screen');}catch{}}}
finally{for(const client of clients)client.socket.close();chrome.kill();await sleep(500);const resolved=path.resolve(profile),root=path.resolve(os.tmpdir())+path.sep;if(resolved.startsWith(root)&&path.basename(resolved).startsWith('bf-kinetic-')){try{fs.rmSync(resolved,{recursive:true,force:true});}catch{console.log('OWNED_PROFILE_CLEANUP_INCOMPLETE',resolved);}}}
