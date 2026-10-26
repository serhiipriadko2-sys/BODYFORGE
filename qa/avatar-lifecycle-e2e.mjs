// Real WebGL lifecycle checks in a disposable browser profile. No camera or owner saves.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-avatar-lifecycle-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  'about:blank',
], { stdio: 'ignore' });
let socket, seq = 0, assertions = 0;
const pending = new Map(), errors = [], observations = {};
function check(ok, message) {
  if (!ok) throw Error('FAIL ' + message);
  assertions++;
  console.log('PASS', message);
}
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 15000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function js(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function until(expression, label) {
  const expires = Date.now() + 20000;
  while (Date.now() < expires) {
    if (await js(expression)) return;
    await sleep(100);
  }
  throw Error('TIMEOUT ' + label);
}
const canvas = "document.querySelector('#onboarding canvas')";
const loop = canvas + '?.dataset.renderLoop';
const draws = "window.__avatarDraws.get(window.__avatarCanvas) || 0";
try {
  let port;
  for (let i = 0; i < 100; i++) {
    const portFile = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(portFile)) { port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]); break; }
    if (chrome.exitCode !== null) throw Error('Chrome exited ' + chrome.exitCode);
    await sleep(100);
  }
  if (!port) throw Error('Chrome DevTools unavailable');
  const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
  const tab = tabs.find((item) => item.type === 'page');
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data.toString());
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__avatarDraws = new WeakMap();
    for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!type) continue;
      for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const original = type.prototype[name];
        if (!original) continue;
        type.prototype[name] = function(...args) {
          window.__avatarDraws.set(this.canvas, (window.__avatarDraws.get(this.canvas) || 0) + 1);
          return original.apply(this, args);
        };
      }
    }
  ` });
  await cdp('Page.navigate', { url: origin + '/' });
  await until("document.querySelector('#onboarding [data-avatar-source]')?.dataset.avatarSource==='cc0'", 'real GLB load');
  await until(loop + "==='running'", 'visible animation');
  await js('window.__avatarCanvas=' + canvas + ';true');
  check(await js(draws + '>0'), 'anatomical GLB renders actual WebGL draw calls');

  // A runtime OS/browser preference change must be observed without a reload.
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  // CDP acknowledgement precedes the browser's asynchronous media-query event.
  // Await the observable state; still prove that no GPU draws recur below.
  await until("matchMedia('(prefers-reduced-motion: reduce)').matches && " + loop + "==='paused'", 'live reduced-motion event and stopped RAF');
  observations.reducedMotionLoop = await js(loop);
  check(observations.reducedMotionLoop === 'paused', 'live reduced-motion change stops the avatar RAF');
  const still = await js(draws);
  await sleep(250);
  check(await js(draws) === still, 'reduced motion keeps the static 3D without recurring draws');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await until(loop + "==='running'", 'motion resumes');
  const resumed = await js(draws);
  await sleep(200);
  check(await js(draws) > resumed, 'removing reduced motion resumes actual rendering');

  // document.hidden is controlled only in this isolated page. Resize/model
  // updates exercise the direct render path separately from the RAF guard.
  await js("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))");
  await until(loop + "==='paused'", 'background pause');
  const hidden = await js(draws);
  await js(canvas + ".style.width='96%'");
  await sleep(350);
  observations.backgroundDraws = (await js(draws)) - hidden;
  check(observations.backgroundDraws === 0, 'background resize performs zero GPU draw calls');
  await js("document.querySelector('.build-options button:nth-child(2)').click()");
  await sleep(250);
  check(await js(draws) === hidden, 'background body-build update performs zero GPU draw calls');
  await js("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))");
  await until(loop + "==='running'", 'foreground resume');
  await sleep(200);
  check(await js(draws) > hidden, 'returning foreground draws the updated 3D character');
  await js(canvas + ".style.removeProperty('width')");

  // Reduced motion still permits explicit interactions and one-off updates.
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await until(loop + "==='paused'", 'reduced motion again');
  const beforeUpdate = await js(draws);
  await js("document.querySelector('.build-options button:first-child').click()");
  await sleep(250);
  check(await js(draws) > beforeUpdate, 'visible body-build change redraws in reduced motion');
  check(await js(loop) === 'paused', 'manual update does not restart the reduced-motion loop');
  const beforeKeyboard = await js(draws);
  await js(canvas + '.focus()');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await sleep(100);
  check(await js(draws) > beforeKeyboard && await js(loop) === 'paused',
    'keyboard arrow rotates the 3D hero without starting a reduced-motion RAF');
  await js("document.querySelector('.mobile-nav button:nth-child(2)').click()");
  await until("!document.querySelector('#onboarding canvas')", 'avatar unmount');
  const stopped = await js(draws);
  await sleep(250);
  check(await js(draws) === stopped, 'unmounted GLB avatar stops drawing');
  await js("document.querySelector('.mobile-nav button:first-child').click()");
  await until("document.querySelector('#onboarding [data-avatar-source]')?.dataset.avatarSource==='cc0'", 'GLB remount');
  check(await js(loop) === 'paused', 'remounted GLB respects the current reduced-motion setting');
  check(errors.length === 0, 'no uncaught browser runtime exceptions');
  console.log('BODYFORGE_AVATAR_LIFECYCLE_PASS', JSON.stringify({ assertions, observations, errors }));
} catch (error) {
  console.error('BODYFORGE_AVATAR_LIFECYCLE_FAIL', error.stack || String(error));
  console.log('READBACK', JSON.stringify({ assertions, observations, errors }));
  process.exitCode = 12;
} finally {
  socket?.close();
  chrome.kill();
  await sleep(400);
  // This exact directory is exclusively owned by the process that created it.
  try { fs.rmSync(profile, { recursive: true, force: true }); }
  catch { console.error('TEMP_CLEANUP_BLOCKED', profile); process.exitCode ||= 13; }
}
