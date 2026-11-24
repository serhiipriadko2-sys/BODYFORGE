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
    const ocularPrograms = new WeakSet();
    window.__ocularDraws = new WeakSet();
    window.__dermalDraws = new WeakSet();
    const dermalPrograms = new WeakSet();
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
            if (enabled('USE_CLEARCOATMAP') && enabled('USE_CLEARCOAT_ROUGHNESSMAP')) ocularPrograms.add(program);
            if (sources.includes('BODYFORGE_DERMAL_WRAP_V1') && this.getProgramParameter(program, this.LINK_STATUS)) dermalPrograms.add(program);
            seenPrograms.set(program, enabled('USE_ANISOTROPY') ? {
              albedo: enabled('USE_MAP'), normal: enabled('USE_NORMALMAP'), alphaTest: enabled('USE_ALPHATEST'),
              doubleSided: enabled('DOUBLE_SIDED'),
            } : null);
          }
          if (program && ocularPrograms.has(program)) window.__ocularDraws.add(this.canvas);
          if (program && dermalPrograms.has(program)) window.__dermalDraws.add(this.canvas);
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

// App preview and Chrome helper prefix come from qa/avatar-quality-e2e.mjs.
// The control only zeroes the facial profile in a single intercepted local JS
// response. The production files and everything else in the tab stay intact.
function neutralProfile(source) {
  const profile = source.indexOf('bodyforge-facial-planes-v1');
  if (profile < 0 || source.indexOf('bodyforge-facial-planes-v1', profile + 1) >= 0) throw Error('Expected a unique face profile');
  const begin = source.indexOf('zones:[', profile) + 'zones:'.length;
  if (begin < profile || source[begin] !== '[') throw Error('Face profile zones not found');
  let remaining = 1, end = begin + 1;
  while (remaining && end < source.length) {
    const char = source[end++];
    if (char === '[') remaining++;
    if (char === ']') remaining--;
  }
  const zones = source.slice(begin, end);
  if (!zones.includes('brow-ridge') || !zones.includes('cheekbone') || !zones.includes('jaw-plane') || remaining) {
    throw Error('Unexpected face profile input');
  }
  return source.slice(0, begin) + '[]' + source.slice(end);
}

const appUrl = new URL(origin);
if (appUrl.hostname !== '127.0.0.1' || appUrl.protocol !== 'http:') throw Error('Local preview only');
try {
  await waitFor(() => {
    const f = path.join(profile, 'DevToolsActivePort');
    if (!fs.existsSync(f)) return false;
    port = Number(fs.readFileSync(f, 'utf8').split('\n')[0]);
    return port > 0;
  }, 'owned Chrome CDP');
  const tab = await newTab();
  let patched = 0;
  let interception = Promise.resolve();
  tab.socket.addEventListener('message', event => {
    const message = JSON.parse(event.data.toString());
    if (message.method !== 'Fetch.requestPaused') return;
    const { requestId, responseStatusCode } = message.params;
    interception = (async () => {
      const body = await tab.cdp('Fetch.getResponseBody', { requestId });
      if (responseStatusCode !== 200 || patched !== 0) throw Error('Wrong intercepted response');
      const source = body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body;
      const result = Buffer.from(neutralProfile(source));
      await tab.cdp('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: result.toString('base64') });
      patched++;
    })();
    interception.catch(error => console.error('INTERCEPT_FAILURE', String(error)));
  });
  const chunkName = process.env.BODYFORGE_FACE_STUDY_CHUNK;
  if (!/^Avatar3D-[\w-]+\.js$/.test(chunkName)) throw Error('Expected the sealed Avatar3D chunk name');
  await tab.cdp('Fetch.enable', { patterns: [{ urlPattern: origin + '/assets/' + chunkName, requestStage: 'Response' }] });
  await app(tab);
  await tab.click('#onboarding .forge-solid-button');
  await tab.until('!!document.querySelector(".dashboard-player")', 'fighter created and home ready');
  await tab.until(`JSON.parse(localStorage.getItem(${JSON.stringify(gameKey)})||'{}').game?.created===true`, 'fighter saved');
  const game = await tab.js(`localStorage.getItem(${JSON.stringify(gameKey)})`);
  if (!JSON.parse(game)?.game?.created) throw Error('Test profile was not committed');

  const capture = async label => {
    await tab.click('.mobile-nav button:nth-child(3)');
    await tab.until('document.querySelector(".app-shell")?.dataset.screen==="forge"', 'hero tab');
    await tab.js('window.scrollTo({top:0,behavior:"instant"});true');
    await tab.until(`(()=>{const c=document.querySelector('.studio-preview canvas');return c?.dataset.groomGeometry==='strands' && c?.dataset.ocularDetail==='fitted-pbr' && !!document.querySelector('.studio-preview [data-skin-map="ready"][data-detail-maps="3"]')})()`, 'matched face materials', 30000);
    await tab.click('[data-avatar-view="portrait"]');
    await tab.until('document.querySelector(".studio-preview canvas")?.dataset.avatarView==="portrait"', 'portrait ready');
    const captureAt = async (yaw, shot) => {
      await tab.until('Number(document.querySelector(".studio-preview canvas")?.dataset.avatarYaw)===' + yaw, 'same yaw ' + yaw);
      const bounds = await tab.js('document.querySelector(".studio-preview canvas").getBoundingClientRect().toJSON()');
      await sleep(300);
      return { image: await tab.screenshot(label + '-' + shot), bounds };
    };
    const front = await captureAt(-.21, 'near-front');
    for (let step = 0; step < 3; step++) await tab.click('.armory-yaw-controls button:last-child');
    const turn = await captureAt(.69, 'turned');
    return { front, turn };
  };
  const before = await capture('control');
  await interception;
  check(patched === 1, 'exact compiled response changed once for control');
  await tab.cdp('Fetch.disable');
  await app(tab, true);
  const after = await capture('sculpted');
  check(patched === 1, 'final face loaded through unchanged production response');
  const metrics = {};
  async function measure(first, second) {
    async function decode(data) {
      const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + data)).blob());
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return ctx.getImageData(149, 347, 110, 119).data;
    }
    const [a, b] = await Promise.all([decode(first), decode(second)]);
    let changed = 0, total = 0;
    for (let i = 0; i < a.length; i += 4) {
      const delta = Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]);
      if (delta >= 12) changed++;
      total += delta;
    }
    return { changed, sampled: a.length / 4, total };
  }
  for (const pose of ['front', 'turn']) {
    check(JSON.stringify(before[pose].bounds) === JSON.stringify(after[pose].bounds), pose + ' identical canvas bounds');
    metrics[pose] = await tab.js('(' + measure.toString() + ')(' + JSON.stringify(before[pose].image) + ',' + JSON.stringify(after[pose].image) + ')');
    check(metrics[pose].changed > 30, pose + ' face details alter the rendered portrait');
  }
  check(await tab.js(`localStorage.getItem(${JSON.stringify(gameKey)})`) === game, 'same profile across both portraits');
  check(tab.errors.length === 0, 'both conditions free of uncaught browser errors');
  console.log('BODYFORGE_FACE_STUDY_PASS', JSON.stringify({ metrics, assertions }));
} catch (error) {
  console.error('BODYFORGE_FACE_STUDY_FAIL', String(error));
  process.exitCode = 18;
} finally {
  for (const client of clients) client.socket.close();
  chrome.kill();
  await sleep(500);
  const resolved = path.resolve(profile), root = path.resolve(os.tmpdir()) + path.sep;
  if (resolved.startsWith(root) && path.basename(resolved).startsWith('bf-athlete-quality-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true }); }
    catch { console.log('OWNED_PROFILE_CLEANUP_INCOMPLETE', resolved); }
  }
}
