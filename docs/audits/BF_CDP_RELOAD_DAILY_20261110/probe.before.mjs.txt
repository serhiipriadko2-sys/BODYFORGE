// Independent production-preview probe. Uses a new disposable Chrome profile.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN ?? 'http://127.0.0.1:52871';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-webgl-probe-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle',
  '--use-angle=swiftshader', '--no-first-run', '--no-default-browser-check',
  '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { stdio: 'ignore' });
let browserUrl, socket, sequence = 0;
const pending = new Map(), browserErrors = [], observations = [];
async function endpoint() {
  for (let i = 0; i < 70; i++) {
    try {
      const port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      if (Number.isInteger(port) && port > 0) {
        const version = await (await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(1000) })).json();
        const pages = await (await fetch('http://127.0.0.1:' + port + '/json', { signal: AbortSignal.timeout(1000) })).json();
        const page = pages.find((item) => item.type === 'page');
        if (page?.webSocketDebuggerUrl && version.webSocketDebuggerUrl) {
          browserUrl = version.webSocketDebuggerUrl;
          return page.webSocketDebuggerUrl;
        }
      }
    } catch {}
    await sleep(200);
  }
  throw Error('CDP endpoint unavailable');
}
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 10000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, label) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await sleep(200);
  }
  throw Error('TIMEOUT ' + label);
}
async function observe(stage) {
  const state = await evaluate(`(() => ({
    screen: document.querySelector('.app-shell')?.dataset.screen ?? null,
    three: [...document.querySelectorAll('[data-3d-status]')].map(e => e.dataset['3dStatus']),
    avatar: [...document.querySelectorAll('[data-avatar-source]')].map(e => e.dataset.avatarSource),
    lost: window.__bfWebglProbe?.events ?? [],
    canvasCount: document.querySelectorAll('canvas').length,
    game: (() => { try {
      const p = JSON.parse(localStorage.getItem('bodyforge:pilot:v1') || 'null');
      return p?.game ? { outfit: p.game.outfit, arms: p.game.muscles?.arms, coins: p.coins } : null;
    } catch { return null; } })()
  }))()`);
  observations.push({ stage, state });
  console.log('OBSERVE', JSON.stringify(observations.at(-1)));
  return state;
}
try {
  const pageUrl = await endpoint();
  socket = new WebSocket(pageUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data.toString());
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params?.type)) {
      browserErrors.push(message.params.args?.map(a => a.value ?? a.description).join(' ').slice(0, 260));
    }
  });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__bfWebglProbe = { events: [] };
    document.addEventListener('webglcontextlost', e => {
      window.__bfWebglProbe.events.push({ kind: 'lost', time: performance.now() });
    }, true);
    document.addEventListener('webglcontextrestored', e => {
      window.__bfWebglProbe.events.push({ kind: 'restored', time: performance.now() });
    }, true);
  ` });
  await cdp('Page.navigate', { url: origin + '/' });
  await waitFor('!!document.querySelector("#onboarding [data-3d-status]")', 'initial model status');
  await waitFor('document.querySelector("#onboarding [data-avatar-source]")?.dataset.avatarSource === "cc0" || document.querySelector("#onboarding [data-3d-status]")?.dataset["3dStatus"] !== "active"', 'initial model completion');
  const first = await observe('before-reload');
  const withProfile = process.env.BF_PROBE_PROFILE === '1';
  if (withProfile) {
    // Disposable browser fixture: mirrors the existing mobile E2E purchase
    // sequence without touching the owner's real browser or saved wallet.
    await evaluate('document.querySelector(".build-options button:nth-child(2)").click();true');
    await evaluate('document.querySelector("#onboarding .forge-solid-button").click();true');
    await waitFor('!document.querySelector("#onboarding") && !!localStorage.getItem("bodyforge:pilot:v1")', 'fighter persisted');
    await evaluate(`(() => {
      const key = 'bodyforge:pilot:v1';
      const profile = JSON.parse(localStorage.getItem(key));
      if (!profile?.game?.created) throw Error('Profile not persisted after onboarding');
      profile.coins = 180;
      localStorage.setItem(key, JSON.stringify(profile));
      return true;
    })()`);
    await cdp('Page.reload', { ignoreCache: true });
    await waitFor('!!document.querySelector(".mobile-nav button:nth-child(3)")', 'fixture reload');
    await evaluate('document.querySelector(".mobile-nav button:nth-child(3)").click();true');
    await waitFor('document.querySelector("#forge .muscle-card button")?.disabled === false', 'muscle action');
    await evaluate('document.querySelector("#forge .muscle-card button").click();true');
    await waitFor('JSON.parse(localStorage.getItem("bodyforge:pilot:v1")).game?.muscles?.arms === 1', 'muscle persisted');
    await evaluate('document.querySelector("#forge .outfit-item:nth-child(2)").click();true');
    await waitFor('JSON.parse(localStorage.getItem("bodyforge:pilot:v1")).game?.outfit === "ember"', 'outfit persisted');
    await waitFor('document.querySelector("#forge [data-avatar-source]")?.dataset.avatarSource === "cc0"', 'purchased GLB ready');
    await observe('purchased-before-final-reload');
  }
  await cdp('Page.reload', { ignoreCache: true });
  if (withProfile) {
    await waitFor('!!document.querySelector(".mobile-nav button:nth-child(3)")', 'profile page ready');
    await evaluate('document.querySelector(".mobile-nav button:nth-child(3)").click();true');
    await evaluate('document.querySelector("#forge .studio-preview")?.scrollIntoView({block:"start",behavior:"instant"});true');
    await waitFor('document.querySelector("#forge [data-avatar-source]")?.dataset.avatarSource === "cc0" || document.querySelector("#forge [data-3d-status]")?.dataset["3dStatus"] !== "active"', 'purchased GLB after reload');
  } else {
    await waitFor('!!document.querySelector("#onboarding [data-3d-status]")', 'reloaded model status');
    await waitFor('document.querySelector("#onboarding [data-avatar-source]")?.dataset.avatarSource === "cc0" || document.querySelector("#onboarding [data-3d-status]")?.dataset["3dStatus"] !== "active"', 'reloaded model completion');
  }
  const second = await observe('after-reload');
  const pass = first.avatar.includes('cc0') && second.avatar.includes('cc0') &&
    !first.lost.some(e => e.kind === 'lost') && !second.lost.some(e => e.kind === 'lost') &&
    (!withProfile || (second.game?.outfit === 'ember' && second.game?.arms === 1 && second.game?.coins === 95));
  console.log('PROBE_RESULT', JSON.stringify({ pass, browserErrors, profileOwned: true }));
  if (!pass) process.exitCode = 12;
} catch (error) {
  console.error('PROBE_FAIL', error.stack ?? String(error));
  process.exitCode = 12;
} finally {
  socket?.close();
  if (browserUrl) {
    try {
      const owned = new WebSocket(browserUrl);
      await new Promise((resolve, reject) => {
        owned.addEventListener('open', resolve, { once: true });
        owned.addEventListener('error', reject, { once: true });
      });
      owned.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
      await sleep(500);
      owned.close();
    } catch (error) { console.error('OWNED_CLOSE_UNCONFIRMED', String(error)); process.exitCode ||= 13; }
  }
  chrome.kill();
  await sleep(450);
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  catch (error) { console.error('PROFILE_CLEANUP_FAIL', String(error)); process.exitCode ||= 13; }
}
