// Unsupported browser observers must fall back before allocating WebGL/listeners.
// Only synthetic local game data is used. No camera, owner profile or public route.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('QA requires a loopback HTTP origin');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-avatar-observers-'));
const artifactDir = process.env.BODYFORGE_QA_ARTIFACT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'bf-avatar-observers-shots-'));
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

try {
  check((await fetch(origin + '/')).status === 200,'existing Vite HTTP 200');
  await waitFor(()=>{const f=path.join(profile,'DevToolsActivePort');if(fs.existsSync(f)){port=Number(fs.readFileSync(f,'utf8').split('\n')[0]);return port>0;}if(chrome.exitCode!==null)throw Error('Owned Chrome exited '+chrome.exitCode);return false;},'owned Chrome',10000);
  for(const [missing,mode] of [['IntersectionObserver','undefined'],['IntersectionObserver','deleted'],['ResizeObserver','undefined'],['ResizeObserver','deleted']]) {
    const tab=await newTab();
    await tab.cdp('Page.addScriptToEvaluateOnNewDocument',{source:(mode==='deleted'?'delete window['+JSON.stringify(missing)+'];':'Object.defineProperty(window,'+JSON.stringify(missing)+',{configurable:true,value:undefined});')+'window.__qaContextAttempts=0;const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(String(type).startsWith("webgl"))window.__qaContextAttempts++;return original.call(this,type,...args)};'});
    await app(tab);
    await tab.until('!!document.querySelector("#onboarding [data-3d-status=fallback]")','usable 3D fallback without '+missing);
    await tab.js('document.dispatchEvent(new Event("visibilitychange"));window.dispatchEvent(new Event("resize"));true');
    await sleep(200);
    check(tab.errors.length===0,missing+' '+mode+' fallback has no late listener exceptions');
    check(await tab.js('window.__qaContextAttempts===0'),missing+' '+mode+' fallback avoids unsupported WebGL allocation');
    await tab.click('.mobile-nav button:nth-child(2)');
    await tab.click('.mobile-nav button:nth-child(1)');
    await tab.until('!!document.querySelector("#onboarding [data-3d-status=fallback]")','fallback remounts without '+missing);
    await tab.js('document.dispatchEvent(new Event("visibilitychange"));true');await sleep(100);
    check(tab.errors.length===0,missing+' route changes preserve a usable fallback');
    await tab.close();
  }
  console.log('AVATAR_OBSERVERS_PASS',JSON.stringify({assertions}));
} catch(error){console.error('AVATAR_OBSERVERS_FAIL',error.stack||String(error));process.exitCode=19;}
finally {for(const client of clients)client.socket.close();chrome.kill();await sleep(500);const resolved=path.resolve(profile),root=path.resolve(os.tmpdir())+path.sep;if(resolved.startsWith(root)&&path.basename(resolved).startsWith('bf-avatar-observers-')){try{fs.rmSync(resolved,{recursive:true,force:true});}catch{console.log('OWNED_PROFILE_CLEANUP_INCOMPLETE',resolved);}}}
