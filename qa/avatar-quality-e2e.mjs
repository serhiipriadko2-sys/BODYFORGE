// Actual 3D avatar in one disposable Chrome profile, including asset failures.
// Only synthetic local game data is used. No camera, owner profile or public route.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('QA requires a loopback HTTP origin');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-athlete-quality-'));
const artifactDir = process.env.BODYFORGE_QA_ARTIFACT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'bf-athlete-quality-shots-'));
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
    this.seq = 0; this.requests = new Map(); this.errors = []; this.loads = 0; this.blockedFailures = 0;
    this.networkRequests = new Map(); this.failedUrls = []; this.finishedRequests = new Set(); this.pausedResponses = [];
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
      if (message.method === 'Network.loadingFailed' && message.params.blockedReason) this.blockedFailures++;
      if (message.method === 'Network.requestWillBeSent') this.networkRequests.set(message.params.requestId, message.params.request.url);
      if (message.method === 'Network.loadingFailed') this.failedUrls.push(this.networkRequests.get(message.params.requestId));
      if (message.method === 'Network.loadingFinished') this.finishedRequests.add(message.params.requestId);
      if (message.method === 'Fetch.requestPaused') this.pausedResponses.push(message.params);
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
    return result.data;
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
  await tab.cdp('Network.enable');
  await tab.cdp('Network.setCacheDisabled', { cacheDisabled: true });
  // Test-owned GPU observation: inspect programs that actually draw hair, not
  // just React's readiness attributes. No production hooks or camera access.
  await tab.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__hairQa = { draws: new WeakMap(), programs: new WeakMap() };
    const seenPrograms = new WeakMap();
    for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!type) continue;
      for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const original = type.prototype[name];
        if (!original) continue;
        type.prototype[name] = function(...args) {
          const result = original.apply(this, args);
          window.__hairQa.draws.set(this.canvas, (window.__hairQa.draws.get(this.canvas) || 0) + 1);
          const program = this.getParameter(this.CURRENT_PROGRAM);
          if (program && !seenPrograms.has(program)) {
            const sources = (this.getAttachedShaders(program) || []).map(shader => this.getShaderSource(shader) || '').join('\\n');
            const enabled = name => new RegExp('^#define ' + name + '(?:\\\\s|$)', 'm').test(sources);
            seenPrograms.set(program, enabled('USE_ANISOTROPY') ? {
              albedo: enabled('USE_MAP'), normal: enabled('USE_NORMALMAP'), alphaTest: enabled('USE_ALPHATEST'),
              doubleSided: enabled('DOUBLE_SIDED'),
            } : null);
          }
          const hair = program && seenPrograms.get(program);
          if (hair) window.__hairQa.programs.set(this.canvas, { ...hair, depthWrite: this.getParameter(this.DEPTH_WRITEMASK) });
          return result;
        };
      }
    }
  ` });
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

try {
  check((await fetch(origin + '/')).status === 200, 'existing Vite HTTP 200');
  await waitFor(() => { const f=path.join(profile,'DevToolsActivePort'); if(fs.existsSync(f)){port=Number(fs.readFileSync(f,'utf8').split('\n')[0]);return port>0;} if(chrome.exitCode!==null)throw Error('Owned Chrome exited '+chrome.exitCode); return false; }, 'owned Chrome CDP', 10000);
  const tab=await newTab(); await app(tab);
  await tab.click('#onboarding .forge-solid-button');
  await tab.until('!!document.querySelector(".dashboard-player")','synthetic fighter created');
  await tab.until('JSON.parse(localStorage.getItem('+JSON.stringify(gameKey)+')||"null")?.game?.created===true','fighter creation acknowledged in storage');
  const gameBefore=await tab.js('localStorage.getItem('+JSON.stringify(gameKey)+')');
  await tab.click('.mobile-nav button:nth-child(3)');
  await tab.until('document.querySelector(".studio-preview [data-avatar-source]")?.dataset.avatarSource==="cc0"','anatomical GLB rendered',35000);
  check(await tab.js('document.querySelector(".studio-preview [data-avatar-asset]")?.dataset.avatarAsset==="athlete"'),'derived Blender athlete is the actual rendered asset');
  check(await tab.js('document.querySelector(".studio-preview [data-outfit-fit]")?.dataset.outfitFit==="skinned-garment"'),'real skinned garments selected');
  await tab.until('document.querySelector(".studio-preview [data-avatar-revision]")?.dataset.avatarRevision==="detail-v2"','detailed Blender revision rendered');
  const chosenAsset = await tab.js("performance.getEntriesByType('resource').filter(e=>/bodyforge-athlete-(efficient|detail)\\.glb/.test(e.name)).map(e=>e.name.split('/').at(-1))");
  check(chosenAsset.includes('bodyforge-athlete-efficient.glb') && !chosenAsset.includes('bodyforge-athlete-detail.glb'),
    'new compact GLB renders directly rather than silently falling back to the old 6MB original');
  await tab.until('document.querySelector(".studio-preview [data-hair-maps]")?.dataset.hairMaps==="2"','CC0 hair alpha atlas and fibre normal loaded');
  await tab.until('document.querySelector(".studio-preview [data-detail-maps]")?.dataset.detailMaps==="3"','normal, ORM and eye maps loaded');
  await tab.until('document.querySelector(".studio-preview [data-skin-map]")?.dataset.skinMap==="ready"','local skin albedo applied');
  await sleep(500); await tab.screenshot('athlete-full');
  await tab.click('[data-avatar-view="portrait"]');
  await tab.until('document.querySelector(".studio-preview canvas")?.dataset.avatarView==="portrait"','portrait view');
  await sleep(300); const inkPortrait=await tab.screenshot('athlete-portrait');
  for(const style of ['buzz','swept','crop']) {
    await tab.click('[data-hair-style="'+style+'"]');
    await tab.until('document.querySelector(".studio-preview [data-look-hair-style]")?.dataset.lookHairStyle==='+JSON.stringify(style),'hair '+style);
    await sleep(200); await tab.screenshot('athlete-'+style);
  }
  for(const [width,height] of [[320,740],[360,800],[390,844]]) {
    await tab.viewport(width,height);
    check(await tab.js('document.documentElement.scrollWidth<=innerWidth+1'), 'avatar screen no overflow '+width);
  }
  await tab.viewport(390);
  await tab.click('[data-skin="deep"]'); await tab.click('[data-hair="silver"]');
  await tab.until('document.querySelector(".studio-preview [data-look-skin]")?.dataset.lookSkin==="deep"','skin material refreshed');
  await sleep(200); const silverPortrait=await tab.screenshot('athlete-custom');
  // This 390px portrait fixture has a fixed camera and framing. Sample only
  // the central hair, above the forehead; UI dataset changes alone do not prove
  // that the shader rendered the requested dye. Decode actual CDP screenshots.
  const dye=await tab.js('(async()=>{async function mean(data){const blob=await(await fetch("data:image/png;base64,"+data)).blob();const bitmap=await createImageBitmap(blob);const c=new OffscreenCanvas(bitmap.width,bitmap.height);const ctx=c.getContext("2d");ctx.drawImage(bitmap,0,0);bitmap.close();const p=ctx.getImageData(176,332,40,10).data;let sum=0;for(let i=0;i<p.length;i+=4)sum+=(p[i]+p[i+1]+p[i+2])/3;return sum/(p.length/4)}return {ink:await mean('+JSON.stringify(inkPortrait)+'),silver:await mean('+JSON.stringify(silverPortrait)+')}})()');
  check(dye.silver>dye.ink+20,'silver hair changes the actual rendered pixels');
  observations.hairDyePixels=dye;
  check(await tab.js('localStorage.getItem('+JSON.stringify(gameKey)+')')===gameBefore,'all cosmetic changes preserve game bytes');
  await app(tab,true); await tab.click('.mobile-nav button:nth-child(3)');
  await tab.until('document.querySelector(".studio-preview [data-avatar-source]")?.dataset.avatarSource==="cc0"','GLB returns after reload',35000);
  check(await tab.js('document.querySelector(".studio-preview [data-look-skin]")?.dataset.lookSkin==="deep"'),'saved skin survives reload');
  check(await tab.js('localStorage.getItem('+JSON.stringify(gameKey)+')')===gameBefore,'reload preserves game bytes');
  await tab.cdp('Network.enable');
  await tab.cdp('Network.setBlockedURLs',{urls:['*bodyforge-athlete-efficient.glb*']});
  await app(tab,true); await tab.click('.mobile-nav button:nth-child(3)');
  await tab.until('document.querySelector(".studio-preview [data-avatar-revision]")?.dataset.avatarRevision==="detail-v2"','original full-precision GLB survives loss of compact model',35000);
  check(await tab.js('localStorage.getItem('+JSON.stringify(gameKey)+')')===gameBefore,'compact model failure cannot change game bytes');
  await tab.cdp('Network.setBlockedURLs',{urls:['*bodyforge-athlete-efficient.glb*','*bodyforge-athlete-detail.glb*']});
  await app(tab,true); await tab.click('.mobile-nav button:nth-child(3)');
  await tab.until('document.querySelector(".studio-preview [data-avatar-revision]")?.dataset.avatarRevision==="realistic-v1"','previous refined model survives missing compact and detailed assets',35000);
  check(await tab.js('localStorage.getItem('+JSON.stringify(gameKey)+')')===gameBefore,'refined fallback preserves game bytes');
  await tab.cdp('Network.setBlockedURLs',{urls:['*bodyforge-athlete-efficient.glb*','*bodyforge-athlete-detail.glb*','*bodyforge-athlete-realistic.glb*']});
  await app(tab,true); await tab.click('.mobile-nav button:nth-child(3)');
  await tab.until('document.querySelector(".studio-preview [data-avatar-revision]")?.dataset.avatarRevision==="base" && document.querySelector(".studio-preview [data-avatar-asset]")?.dataset.avatarAsset==="athlete"','previous clothed athlete is retained when refined asset is missing',35000);
  check(await tab.js('document.querySelector(".studio-preview [data-outfit-fit]")?.dataset.outfitFit==="skinned-garment"'),'previous athlete fallback keeps its real garments');
  check(await tab.js('localStorage.getItem('+JSON.stringify(gameKey)+')')===gameBefore,'previous athlete fallback preserves game bytes');
  await tab.cdp('Network.setBlockedURLs',{urls:['*bodyforge-athlete*.glb*']});
  await app(tab,true); await tab.click('.mobile-nav button:nth-child(3)');
  await tab.until('document.querySelector(".studio-preview [data-avatar-asset]")?.dataset.avatarAsset==="legacy"','legacy GLB renders when derived asset is unavailable',35000);
  check(await tab.js('document.querySelector(".studio-preview [data-outfit-fit]")?.dataset.outfitFit==="skinned-surface"'),'legacy fallback keeps fitted surface outfit');
  await tab.cdp('Network.setBlockedURLs',{urls:[]});
  await app(tab,true); await tab.click('.mobile-nav button:nth-child(3)');
  await tab.until('document.querySelector(".studio-preview [data-avatar-asset]")?.dataset.avatarAsset==="athlete"','derived GLB returns after network recovery',35000);
  const blockedBefore = tab.blockedFailures;
  await tab.cdp('Network.setBlockedURLs',{urls:['*athlete-skin*.jpg*']});
  await app(tab,true); await tab.click('.mobile-nav button:nth-child(3)');
  await tab.until('document.querySelector(".studio-preview [data-avatar-asset]")?.dataset.avatarAsset==="athlete"','3D geometry survives a missing albedo',35000);
  await waitFor(()=>tab.blockedFailures>blockedBefore,'skin texture failure observed by browser');
  check(await tab.js('document.querySelector(".studio-preview [data-skin-map]")?.dataset.skinMap==="basic"'),'missing skin texture retains a usable basic material');
  check(await tab.js('localStorage.getItem('+JSON.stringify(gameKey)+')')===gameBefore,'network fallback paths preserve game bytes');
  const detailsBlockedBefore=tab.blockedFailures;
  await tab.cdp('Network.setBlockedURLs',{urls:['*athlete-normal.png*','*athlete-orm.png*','*athlete-eyes.jpg*']});
  await app(tab,true); await tab.click('.mobile-nav button:nth-child(3)');
  await tab.until('document.querySelector(".studio-preview [data-avatar-revision]")?.dataset.avatarRevision==="detail-v2" && document.querySelector(".studio-preview [data-skin-map]")?.dataset.skinMap==="ready"','refined geometry survives missing optional detail maps',35000);
  await waitFor(()=>tab.blockedFailures>=detailsBlockedBefore+3,'all optional detail-map failures observed');
  check(await tab.js('document.querySelector(".studio-preview [data-detail-maps]")?.dataset.detailMaps==="0"'),'missing detail maps retain the usable base materials');
  check(await tab.js('localStorage.getItem('+JSON.stringify(gameKey)+')')===gameBefore,'missing optional maps preserve game bytes');
  observations.hairFallbacks = [];
  for (const scenario of [
    { name: 'albedo-only', blocked: ['athlete-hair.png'], ready: 1, albedo: false, normal: true },
    { name: 'normal-only', blocked: ['athlete-hair-normal.png'], ready: 1, albedo: true, normal: false },
    { name: 'both', blocked: ['athlete-hair.png', 'athlete-hair-normal.png'], ready: 0, albedo: false, normal: false },
  ]) {
    const failedBefore = tab.failedUrls.length;
    await tab.cdp('Network.setBlockedURLs', { urls: scenario.blocked.map(file => '*/assets/' + file + '*') });
    await app(tab, true); await tab.click('.mobile-nav button:nth-child(3)');
    await tab.until('document.querySelector(".studio-preview [data-avatar-revision]")?.dataset.avatarRevision==="detail-v2" && document.querySelector(".studio-preview [data-skin-map]")?.dataset.skinMap==="ready"',
      scenario.name + ' hair failure keeps the detailed scene', 35000);
    await waitFor(() => scenario.blocked.every(file => tab.failedUrls.slice(failedBefore).some(url => url?.endsWith('/' + file))),
      scenario.name + ' exact hair failures observed');
    await tab.until('document.querySelector(".studio-preview [data-hair-maps]")?.dataset.hairMaps===' + JSON.stringify(String(scenario.ready)),
      scenario.name + ' successful companion map applied');
    await tab.click('[data-hair-style="crop"]'); await tab.click('[data-avatar-view="portrait"]');
    await tab.until('!!window.__hairQa.programs.get(document.querySelector(".studio-preview canvas"))', scenario.name + ' hair shader drawn');
    const gpu = await tab.js('(()=>{const c=document.querySelector(".studio-preview canvas");return {draws:window.__hairQa.draws.get(c),...window.__hairQa.programs.get(c)}})()');
    check(gpu.draws > 0 && gpu.albedo === scenario.albedo && gpu.normal === scenario.normal,
      scenario.name + ' draws the actual surviving hair maps');
    check(gpu.alphaTest === scenario.albedo && gpu.doubleSided === scenario.albedo && gpu.depthWrite === true,
      scenario.name + ' uses clipped cards only with albedo, otherwise opaque depth-writing fallback');
    check(await tab.js('localStorage.getItem(' + JSON.stringify(gameKey) + ')') === gameBefore, scenario.name + ' hair failure preserves game bytes');
    check(tab.errors.length === 0, scenario.name + ' hair failure has no uncaught browser errors');
    await tab.screenshot('athlete-hair-missing-' + scenario.name);
    observations.hairFallbacks.push({ scenario: scenario.name, ...gpu });
  }
  // Hold the real image responses until GameAvatar has disposed its old scene.
  // Releasing them must neither redraw that canvas nor contaminate a remount.
  await tab.cdp('Network.setBlockedURLs', { urls: [] });
  tab.pausedResponses = [];
  await tab.cdp('Fetch.enable', { patterns: [{ urlPattern: '*/assets/athlete-hair*.png*', requestStage: 'Response' }] });
  try {
    await app(tab, true); await tab.click('.mobile-nav button:nth-child(3)');
    await waitFor(() => ['athlete-hair.png', 'athlete-hair-normal.png'].every(file =>
      tab.pausedResponses.some(response => response.request.url.endsWith('/' + file) && response.responseStatusCode === 200)),
      'both real hair responses held before image callbacks', 35000);
    await tab.until('document.querySelector(".studio-preview [data-hair-maps]")?.dataset.hairMaps==="0"', 'held hair responses have not been applied');
    await tab.js('window.__oldHairCanvas=document.querySelector(".studio-preview canvas");true');
    await tab.click('.mobile-nav button:first-child');
    await tab.until('!document.querySelector(".studio-preview canvas")', 'leaving the studio unmounts its WebGL scene');
    const draws = await tab.js('window.__hairQa.draws.get(window.__oldHairCanvas)||0');
    const held = tab.pausedResponses.splice(0);
    for (const response of held) await tab.cdp('Fetch.continueRequest', { requestId: response.requestId });
    await tab.cdp('Fetch.disable');
    await waitFor(() => held.every(response => response.networkId && tab.finishedRequests.has(response.networkId)),
      'late hair responses actually finish after scene disposal');
    await tab.js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    check(await tab.js('window.__hairQa.draws.get(window.__oldHairCanvas)||0') === draws, 'late hair callbacks never draw the disposed canvas');
    check(tab.errors.length === 0, 'late hair callbacks produce no uncaught browser errors');
    await tab.click('.mobile-nav button:nth-child(3)');
    await tab.until('document.querySelector(".studio-preview [data-hair-maps]")?.dataset.hairMaps==="2"', 'fresh scene applies both hair maps after late response cleanup', 35000);
    check(await tab.js('localStorage.getItem(' + JSON.stringify(gameKey) + ')') === gameBefore, 'late hair cleanup and remount preserve game bytes');
  } finally {
    await tab.cdp('Fetch.disable');
  }
  // This profile belongs only to this test. Maximum cosmetic growth must be
  // inspected on the real rig as well as in the mathematical unit regression.
  await tab.cdp('Network.setBlockedURLs',{urls:[]});
  await tab.click('[data-skin="sand"]'); await tab.click('[data-hair="ink"]');
  const maximum=JSON.parse(gameBefore);
  maximum.game.muscles={arms:5,core:5,legs:5,back:5};
  const maxRaw=JSON.stringify(maximum);
  await tab.js('localStorage.setItem('+JSON.stringify(gameKey)+','+JSON.stringify(maxRaw)+');true');
  await app(tab,true); await tab.click('.mobile-nav button:nth-child(3)');
  await tab.until('document.querySelector(".studio-preview [data-skin-map]")?.dataset.skinMap==="ready"','max-growth synthetic rig with skin map',35000);
  await tab.until('document.querySelector(".studio-preview [data-hair-maps]")?.dataset.hairMaps==="2"','max-growth hair detail loaded',35000);
  await tab.click('[data-avatar-view="portrait"]');
  await sleep(250); await tab.screenshot('athlete-max-portrait');
  await tab.click('.armory-yaw-controls button:last-child');
  await tab.click('.armory-yaw-controls button:last-child');
  await sleep(200); await tab.screenshot('athlete-max-three-quarter');
  await tab.click('[data-avatar-view="full"]');
  await sleep(200); await tab.screenshot('athlete-max-full');
  check(await tab.js('localStorage.getItem('+JSON.stringify(gameKey)+')')===maxRaw,'max-growth rendering preserves synthetic fixture bytes');
  await tab.js('localStorage.setItem('+JSON.stringify(gameKey)+','+JSON.stringify(gameBefore)+');true');
  await app(tab,true); await tab.click('.mobile-nav button:nth-child(3)');
  await tab.until('document.querySelector(".studio-preview [data-skin-map]")?.dataset.skinMap==="ready"','zero-growth rig restored',35000);
  check(await tab.js('localStorage.getItem('+JSON.stringify(gameKey)+')')===gameBefore,'zero-growth restoration preserves original synthetic save');
  await tab.js('document.querySelector(".studio-preview canvas").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext();true');
  await tab.until('!!document.querySelector(".studio-preview [data-3d-status=fallback]")','lost GPU context shows fallback');
  check(tab.errors.length===0,'no uncaught browser errors');
  console.log('ATHLETE_QUALITY_PASS',JSON.stringify({assertions,...observations}));
} catch(error){console.error('ATHLETE_QUALITY_FAIL',error.stack||String(error));process.exitCode=18;}
finally {for(const client of clients)client.socket.close();chrome.kill();await sleep(500);const resolved=path.resolve(profile),root=path.resolve(os.tmpdir())+path.sep;if(resolved.startsWith(root)&&path.basename(resolved).startsWith('bf-athlete-quality-')){try{fs.rmSync(resolved,{recursive:true,force:true});}catch{console.log('OWNED_PROFILE_CLEANUP_INCOMPLETE',resolved);}}}
