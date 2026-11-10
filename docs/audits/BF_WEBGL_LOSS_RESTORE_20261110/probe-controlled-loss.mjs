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
let browserUrl, socket, sequence = 0, pageLoads = 0;
const pending = new Map(), browserErrors = [], observations = [];
const pageEvents = [];
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
async function reloadWithEvidence(label) {
  const beforeOrigin = await evaluate('performance.timeOrigin');
  const beforeLoads = pageLoads;
  const beforeEvents = pageEvents.length;
  await cdp('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 30 && pageLoads === beforeLoads; i++) await sleep(100);
  await waitFor('performance.timeOrigin > ' + JSON.stringify(beforeOrigin) + ' && document.readyState === "complete" && !!document.querySelector(".mobile-nav")', 'new hydrated document');
  const dom = await evaluate('({ timeOrigin: performance.timeOrigin, readyState: document.readyState, hasNav: !!document.querySelector(".mobile-nav") })');
  const result = { label, newDocument: dom.timeOrigin > beforeOrigin, loadEvent: pageLoads > beforeLoads, events: pageEvents.slice(beforeEvents).map(e => e.type), dom };
  console.log('RELOAD_EVIDENCE', JSON.stringify(result));
  if (!result.newDocument || dom.readyState !== 'complete' || !dom.hasNav) throw Error('Reload proof invalid: ' + label);
  return result;
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
    if (message.method === 'Page.loadEventFired') pageLoads++;
    if (message.method === 'Page.loadEventFired' || message.method === 'Page.frameNavigated') {
      pageEvents.push({ type: message.method, at: Date.now() });
    }
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
  const withDaily = process.env.BF_PROBE_DAILY === '1';
  if (withProfile) {
    // Disposable browser fixture: mirrors the existing mobile E2E purchase
    // sequence without touching the owner's real browser or saved wallet.
    await evaluate('document.querySelector(".build-options button:nth-child(2)").click();true');
    await evaluate('document.querySelector("#onboarding .forge-solid-button").click();true');
    await waitFor('!document.querySelector("#onboarding") && !!localStorage.getItem("bodyforge:pilot:v1")', 'fighter persisted');
    if (withDaily) {
      await evaluate('document.querySelector(".mobile-nav button:nth-child(2)").click();true');
      await waitFor('!!document.querySelector("#quests .quest-button")', 'daily login reward button');
      await evaluate('document.querySelector("#quests .quest-button").click();true');
      await waitFor('(() => { const p = JSON.parse(localStorage.getItem("bodyforge:pilot:v1")); return p.coins === 10 && !!p.game?.lastLoginDay; })()', 'daily reward persisted once');
      console.log('DAILY_PROOF', await evaluate('({coins:JSON.parse(localStorage.getItem("bodyforge:pilot:v1")).coins,day:JSON.parse(localStorage.getItem("bodyforge:pilot:v1")).game.lastLoginDay})'));
    }
    await evaluate(`(() => {
      const key = 'bodyforge:pilot:v1';
      const profile = JSON.parse(localStorage.getItem(key));
      if (!profile?.game?.created) throw Error('Profile not persisted after onboarding');
      profile.coins = 180;
      localStorage.setItem(key, JSON.stringify(profile));
      return true;
    })()`);
    if (withDaily) await reloadWithEvidence('after-daily-reward');
    else await cdp('Page.reload', { ignoreCache: true });
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
  if (withDaily && withProfile) await reloadWithEvidence('after-purchase');
  else await cdp('Page.reload', { ignoreCache: true });
  if (withProfile) {
    await waitFor('!!document.querySelector(".mobile-nav button:nth-child(3)")', 'profile page ready');
    await evaluate('document.querySelector(".mobile-nav button:nth-child(3)").click();true');
    await evaluate('document.querySelector("#forge .studio-preview")?.scrollIntoView({block:"start",behavior:"instant"});true');
    await waitFor('(() => { const status = document.querySelector("#forge [data-3d-status]"); return !!status && (document.querySelector("#forge [data-avatar-source]")?.dataset.avatarSource === "cc0" || status.dataset["3dStatus"] !== "active"); })()', 'purchased GLB after reload');
  } else {
    await waitFor('!!document.querySelector("#onboarding [data-3d-status]")', 'reloaded model status');
    await waitFor('document.querySelector("#onboarding [data-avatar-source]")?.dataset.avatarSource === "cc0" || document.querySelector("#onboarding [data-3d-status]")?.dataset["3dStatus"] !== "active"', 'reloaded model completion');
  }
  const second = await observe('after-reload');
  if (withProfile) {
    // This is a disposable Chrome canvas, not the user's 3D session.
    const saveBeforeLoss = await evaluate('localStorage.getItem("bodyforge:pilot:v1")');
    const injection = await evaluate(`(() => {
      const canvas = document.querySelector('#forge .avatar-3d-shell canvas');
      const gl = canvas?.getContext('webgl2');
      const extension = gl?.getExtension('WEBGL_lose_context');
      if (!extension) return { supported: false, reason: !canvas ? 'canvas-missing' : 'extension-missing' };
      extension.loseContext();
      return { supported: true };
    })()`);
    console.log('CONTROLLED_LOSS_REQUEST', JSON.stringify(injection));
    if (!injection.supported) throw Error('LOSS_INJECTION_UNSUPPORTED: ' + injection.reason);
    await waitFor('!!document.querySelector("#forge [data-3d-status=fallback]") && window.__bfWebglProbe?.events?.some(e => e.kind === "lost")',
      'explicit canvas context loss displays SVG fallback');
    const duringLoss = await observe('after-controlled-loss');
    const savedDuring = await evaluate('localStorage.getItem("bodyforge:pilot:v1")');
    const fallbackText = await evaluate('document.querySelector("#forge [data-3d-status=fallback]")?.textContent?.trim().slice(0,140)');
    console.log('CONTROLLED_LOSS_FALLBACK', JSON.stringify({
      fallback: duringLoss.three.includes('fallback'),
      eventObserved: duringLoss.lost.some(e => e.kind === 'lost'),
      savedBytesEqual: savedDuring === saveBeforeLoss,
      text: fallbackText,
    }));
    if (!duringLoss.three.includes('fallback') || !duringLoss.lost.some(e => e.kind === 'lost') ||
        savedDuring !== saveBeforeLoss) throw Error('CONTROLLED_LOSS_FALLBACK_FAILED');
    await reloadWithEvidence('after-controlled-loss');
    await evaluate('document.querySelector(".mobile-nav button:nth-child(3)").click();true');
    await waitFor('document.querySelector("#forge [data-avatar-source]")?.dataset.avatarSource === "cc0"',
      'GLB reinstantiated after controlled context loss and true document reload');
    const restored = await observe('after-controlled-loss-reload');
    const savedRestored = await evaluate('localStorage.getItem("bodyforge:pilot:v1")');
    const recovered = restored.avatar.includes('cc0') && restored.three.includes('active') &&
      savedRestored === saveBeforeLoss && restored.game?.coins === 95 &&
      restored.game?.outfit === 'ember' && restored.game?.arms === 1;
    console.log('CONTROLLED_LOSS_RECOVERY', JSON.stringify({
      pass: recovered,
      source: restored.avatar,
      savedBytesEqual: savedRestored === saveBeforeLoss,
      game: restored.game,
      events: restored.lost,
    }));
    if (!recovered) throw Error('CONTROLLED_LOSS_RECOVERY_FAILED');
  }
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
