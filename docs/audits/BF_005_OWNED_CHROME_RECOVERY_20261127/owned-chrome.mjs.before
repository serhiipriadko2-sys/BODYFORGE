// Shared isolation boundary for destructive browser QA.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class OwnershipError extends Error {}
export function parseDevToolsIdentity(raw) {
  const [text, browserPath, ...extra] = raw.trim().split(/\r?\n/);
  const port = Number(text);
  if (!/^[1-9]\d{0,4}$/.test(text) || port > 65535 ||
      !/^\/devtools\/browser\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(browserPath || '') || extra.length) {
    throw new OwnershipError('Invalid disposable DevToolsActivePort identity');
  }
  return { port, browserPath };
}
export function checkedEndpoint(value, identity, pageId) {
  const url = new URL(value);
  const expected = pageId === undefined ? identity.browserPath : '/devtools/page/' + pageId;
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' ||
      url.port !== String(identity.port) || url.pathname !== expected ||
      url.username || url.password || url.search || url.hash) {
    throw new OwnershipError('CDP endpoint does not match disposable identity');
  }
  return url.href;
}
async function get(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw Error('HTTP ' + response.status + ' for ' + url);
  return response;
}
function requireLoopbackOrigin(origin) {
  if (!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(origin) || Number(new URL(origin).port) > 65535) {
    throw Error('QA requires explicit loopback HTTP');
  }
}
export async function requirePreviewOrigin(origin, expectedSha256) {
  requireLoopbackOrigin(origin);
  if (!/^[0-9a-f]{64}$/i.test(expectedSha256 || '')) {
    throw Error('Set BODYFORGE_QA_EXPECT_ENTRY_SHA256 to the measured production entry digest');
  }
  const html = await (await get(origin + '/')).text();
  const entries = [...html.matchAll(/<script\b[^>]*\bsrc=["'](\/assets\/index-[\w-]+\.js)["']/g)];
  if (html.includes('/@vite/client') || entries.length !== 1) {
    throw Error('QA requires a production preview with exactly one hashed entry');
  }
  const entry = entries[0][1];
  const response = await get(origin + entry);
  if (!/^(?:text|application)\/(?:javascript|ecmascript)\b/i.test(response.headers.get('content-type') || '')) {
    throw Error('Preview entry is not JavaScript');
  }
  const sha256 = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  if (sha256 !== expectedSha256.toLowerCase()) throw Error('Production entry SHA-256 mismatch: ' + sha256);
  return { entry, sha256 };
}
export async function requireDevOrigin(origin) {
  requireLoopbackOrigin(origin);
  if (!(await (await get(origin + '/')).text()).includes('/@vite/client')) {
    throw Error('Source-module QA requires Vite dev, not production preview');
  }
  const module = await get(origin + '/src/lib/progression.ts');
  if (!/javascript/.test(module.headers.get('content-type') || '')) throw Error('Vite source module unavailable');
}
async function confirmBrowser(identity) {
  const version = await (await get('http://127.0.0.1:' + identity.port + '/json/version')).json();
  return checkedEndpoint(version.webSocketDebuggerUrl, identity);
}
export async function waitForOwnedBrowser(profile, chrome) {
  let launchError;
  chrome.on('error', error => { launchError = error; });
  const deadline = Date.now() + 15000;
  const file = path.join(profile, 'DevToolsActivePort');
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    if (chrome.exitCode !== null && chrome.exitCode !== 0) throw Error('Chrome launcher exit ' + chrome.exitCode);
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      if (raw.trim().split(/\r?\n/).length === 2) {
        const identity = parseDevToolsIdentity(raw);
        try {
          await confirmBrowser(identity);
          console.log('QA_OWNED_BROWSER', JSON.stringify(identity));
          return identity;
        } catch (error) {
          if (error instanceof OwnershipError) throw error;
          if (Date.now() >= deadline) throw error;
        }
      }
    }
    await sleep(100);
  }
  throw Error('Disposable browser identity not verified within 15s');
}
export async function newOwnedPage(identity) {
  await confirmBrowser(identity);
  const target = await (await get('http://127.0.0.1:' + identity.port + '/json/new?about:blank', { method: 'PUT' })).json();
  if (target.type !== 'page' || typeof target.id !== 'string' || !/^[\w-]+$/.test(target.id)) throw new OwnershipError('Invalid page descriptor');
  checkedEndpoint(target.webSocketDebuggerUrl, identity, target.id);
  return target;
}
export async function closeOwnedPage(identity, target) {
  checkedEndpoint(target.webSocketDebuggerUrl, identity, target.id);
  await confirmBrowser(identity);
  const response = await fetch('http://127.0.0.1:' + identity.port + '/json/close/' + target.id,
    { redirect: 'error', signal: AbortSignal.timeout(3000) });
  if (!response.ok && response.status !== 404) throw Error('Owned page close HTTP ' + response.status);
}
async function closeBrowser(identity) {
  const socket = new WebSocket(await confirmBrowser(identity));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Owned CDP open timeout')), 2000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('Owned CDP connection failed')); }, { once: true });
    });
    const closed = new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 3000);
      socket.addEventListener('close', () => { clearTimeout(timer); resolve(true); }, { once: true });
    });
    socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    if (!await closed) throw Error('Owned Chrome close unconfirmed');
  } finally { socket.close(); }
}
export async function cleanupOwnedChrome(profile, prefix, chrome, identity) {
  if (path.dirname(profile) !== os.tmpdir() || !path.basename(profile).startsWith(prefix)) throw new OwnershipError('Unexpected cleanup target');
  let issue;
  try {
    if (!identity && fs.existsSync(path.join(profile, 'DevToolsActivePort'))) {
      identity = parseDevToolsIdentity(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8'));
    }
    if (identity) await closeBrowser(identity);
  } catch (error) { issue = error; }
  if (chrome.exitCode === null) {
    const until = Date.now() + 3000;
    while (chrome.exitCode === null && Date.now() < until) await sleep(100);
    if (chrome.exitCode === null) chrome.kill();
  }
  const deadline = Date.now() + 15000;
  let lastError, attempts = 0;
  do {
    attempts++;
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 0 }); lastError = undefined; }
    catch (error) { lastError = error; if (!['EPERM', 'EBUSY', 'ENOTEMPTY', 'EACCES'].includes(error.code)) break; }
    if (!fs.existsSync(profile)) break;
    await sleep(350);
  } while (Date.now() < deadline);
  if (fs.existsSync(profile)) throw lastError || Error('Disposable profile still exists');
  if (issue) throw issue;
  console.log('QA_OWNED_CLEANUP PASS attempts=' + attempts);
}
