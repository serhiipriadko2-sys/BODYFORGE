// BF-604: root service-worker adapter. Registration is deliberately external.
import { createOfflineCache, offlineVersionNames, pruneRetiredOfflineCaches,
  OFFLINE_VERSION_LIMIT, OFFLINE_STORAGE_HEADROOM, type OfflineManifest } from './offlineCache';

export const OFFLINE_STATUS_MESSAGE = 'BODYFORGE_OFFLINE_STATUS_V1';
export const OFFLINE_REPAIR_MESSAGE = 'BODYFORGE_OFFLINE_REPAIR_V1';
export const OFFLINE_PRUNE_MESSAGE = 'BODYFORGE_OFFLINE_PRUNE_V1';
type LifetimeEvent = { waitUntil(task: Promise<unknown>): void };
type FetchEventLike = { request: Request; respondWith(task: Promise<Response>): void };
type MessageEventLike = LifetimeEvent & {
  data: unknown; origin: string; ports: readonly MessagePort[];
  source?: { type?: string; url?: string; id?: string } | null;
};
export interface OfflineWorkerScope {
  location: { origin: string };
  caches: CacheStorage;
  navigator: { locks?: LockManager; storage?: Pick<StorageManager, 'estimate'> };
  registration: Pick<ServiceWorkerRegistration, 'scope' | 'active' | 'installing' | 'waiting'>;
  clients?: { matchAll(options: { type: 'all'; includeUncontrolled: boolean }): Promise<readonly { id: string; type: string; url: string }[]> };
  fetch(url: string, init?: RequestInit): Promise<Response>;
  addEventListener(type: 'install' | 'activate', listener: (event: LifetimeEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
  addEventListener(type: 'message', listener: (event: MessageEventLike) => void): void;
}

const recoveryStyle = 'html{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0a1018;color:#e7eef4;font:16px/1.55 system-ui,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}main{max-width:480px;width:100%;background:#131e29;border:1px solid #314556;border-radius:20px;padding:24px}h1{line-height:1.15;font-size:28px;margin:12px 0}p{margin:12px 0}small{color:#aebdcc;letter-spacing:.12em}button{display:block;width:100%;min-height:48px;padding:12px;margin:12px 0;border:1px solid #536474;border-radius:10px;font:inherit;font-weight:600;color:inherit;background:#223243;cursor:pointer}button:first-of-type{background:#69e6d2;color:#081b1e;border-color:#69e6d2}button:disabled{opacity:.5;cursor:default}button:focus-visible{outline:3px solid #fff;outline-offset:3px}[hidden]{display:none!important}#recovery-status{min-height:3em;color:#c7d9e5}';
const recoveryScript = String.raw`(() => {
  'use strict';
  const body = document.body;
  const status = document.getElementById('recovery-status');
  const repair = document.getElementById('recovery-repair');
  const reopen = document.getElementById('recovery-reopen');
  const leave = document.getElementById('recovery-leave');
  const confirmLeave = document.getElementById('recovery-confirm-leave');
  const cancelLeave = document.getElementById('recovery-cancel-leave');
  const expected = new URL('/bodyforge-offline.js', location.origin).href;
  const root = new URL('/', location.origin).href;
  const version = body.dataset.version;
  let busy = false, released = false, repaired = false;
  function say(state, message) {
    body.dataset.recoveryState = state;
    status.textContent = message;
  }
  function refresh() {
    repair.disabled = busy || released || repaired || !navigator.onLine;
    leave.disabled = busy || released;
    reopen.hidden = !repaired;
    if (!busy && !released && !repaired && !navigator.onLine) {
      say('offline', 'Нет подключения. Подключитесь к интернету для восстановления.');
    } else if (!busy && !released && !repaired && body.dataset.recoveryState === 'offline') {
      say('waiting', 'Подключение появилось. Нажмите «Восстановить файлы».');
    }
  }
  function message(worker) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const finish = (fn, value) => {
        clearTimeout(timer); channel.port1.close(); fn(value);
      };
      const timer = setTimeout(() => finish(reject, Error('timeout')), 180000);
      channel.port1.onmessage = e => finish(resolve, e.data);
      channel.port1.onmessageerror = () => finish(reject, Error('message'));
      try { worker.postMessage('BODYFORGE_OFFLINE_REPAIR_V1', [channel.port2]); }
      catch (error) { channel.port2.close(); finish(reject, error); }
    });
  }
  repair.addEventListener('click', async () => {
    if (busy || released || repaired || !navigator.onLine) return;
    busy = true; confirmLeave.hidden = true; cancelLeave.hidden = true;
    say('repairing', 'Проверяем и загружаем недостающие файлы этой версии. Не закрывайте страницу.');
    refresh();
    try {
      const worker = navigator.serviceWorker?.controller;
      if (!worker || worker.scriptURL !== expected) throw Error('controller');
      const result = await message(worker);
      if (!result || result.schema !== 1 || result.version !== version ||
          result.state !== 'ready' || result.error || navigator.serviceWorker.controller !== worker) {
        throw Error('not ready');
      }
      repaired = true;
      say('ready', 'Файлы этой версии проверены. Теперь можно открыть игру.');
    } catch {
      say('failed', 'Восстановить эту версию не удалось. Проверьте сеть и свободное место. Если версия больше недоступна, можно отключить автономный режим.');
    } finally { busy = false; refresh(); }
  });
  reopen.addEventListener('click', () => {
    if (repaired && !busy && !released) location.reload();
  });
  leave.addEventListener('click', () => {
    if (busy || released) return;
    confirmLeave.hidden = false; cancelLeave.hidden = false;
    say('confirm', 'Будет запрошено отключение автономного режима только для BODYFORGE. Сохранения и кэш не будут очищаться.');
  });
  cancelLeave.addEventListener('click', () => {
    confirmLeave.hidden = true; cancelLeave.hidden = true;
    say(repaired ? 'ready' : 'waiting', repaired ? 'Файлы проверены. Можно открыть игру.' : 'Можно попробовать восстановить файлы.');
    refresh();
  });
  confirmLeave.addEventListener('click', async () => {
    if (busy || released) return;
    busy = true; confirmLeave.hidden = true; cancelLeave.hidden = true;
    say('leaving', 'Запрашиваем отключение автономного режима.');
    refresh();
    try {
      const service = navigator.serviceWorker;
      const controller = service?.controller;
      const registration = await service?.getRegistration(location.href);
      if (!controller || controller.scriptURL !== expected || !registration || registration.scope !== root ||
          [registration.active, registration.waiting, registration.installing].some(w => w && w.scriptURL !== expected) ||
          !await registration.unregister()) throw Error('registration');
      released = true; repaired = false;
      say('released', 'Запрос отключения принят. Закройте все окна и вкладки BODYFORGE, включая установленное приложение. Затем откройте игру снова при наличии интернета. Не очищайте данные сайта.');
    } catch {
      say('failed', 'Не удалось подтвердить запрос отключения. Сохранения не очищались. Попробуйте снова.');
    } finally { busy = false; refresh(); }
  });
  addEventListener('online', refresh);
  addEventListener('offline', refresh);
  say('waiting', 'Автономные файлы недоступны или не прошли проверку.');
  refresh();
})();`;

async function cspHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return "'sha256-" + btoa(String.fromCharCode(...new Uint8Array(digest))) + "'";
}

/** A standalone navigation response: no dependencies on the lost cache or application JS. */
export async function offlineRecoveryPage(version: string): Promise<Response> {
  const safeVersion = /^[a-f0-9]{64}$/.test(version) ? version : '';
  const html = '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>BODYFORGE — восстановление</title><link rel="icon" href="data:,">' +
    '<style>' + recoveryStyle + '</style></head><body data-offline-recovery="1" data-version="' + safeVersion + '">' +
    '<main><small>BODYFORGE / OFFLINE</small><h1>Восстановление игры</h1>' +
    '<p>Файлы автономного режима недоступны. Чтобы не смешивать разные версии игры, загрузка остановлена.</p>' +
    '<p>Восстановление и отключение режима не удаляют сохранения. Если сам браузер очистил данные сайта, часть прогресса может быть утрачена.</p>' +
    '<p id="recovery-status" role="status" aria-live="polite">Для восстановления потребуется интернет.</p>' +
    '<button id="recovery-repair" disabled>Восстановить файлы</button>' +
    '<button id="recovery-reopen" hidden>Открыть игру</button>' +
    '<button id="recovery-leave" disabled>Отключить автономный режим</button>' +
    '<button id="recovery-confirm-leave" hidden>Подтвердить отключение</button>' +
    '<button id="recovery-cancel-leave" hidden>Отмена</button>' +
    '<noscript>Для управления автономным режимом нужен JavaScript. Не очищайте данные сайта.</noscript>' +
    '</main><script>' + recoveryScript + '</script></body></html>';
  const csp = "default-src 'none'; script-src " + await cspHash(recoveryScript) +
    '; style-src ' + await cspHash(recoveryStyle) +
    "; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  return new Response(html, { status: 503, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  } });
}

/** The manifest is embedded in the generated worker, never accepted from a page message. */
export function attachOfflineWorker(scope: OfflineWorkerScope, manifest: OfflineManifest): void {
  const origin = scope.location.origin;
  const engine = createOfflineCache({
    origin, manifest, storage: scope.caches,
    fetchAsset: (url, init) => scope.fetch(url, init),
  });
  void engine.catch(() => undefined);
  const known = new Set(manifest.entries.map(asset => new URL(asset.key, origin).href));
  const rootUrls = new Set([origin + '/', origin + '/index.html']);
  const unavailable = () => new Response('Offline resource unavailable', {
    status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
  const recovery = () => offlineRecoveryPage(manifest.version).catch(unavailable);
  const writerLock = 'bodyforge-offline-cache-v1';
  // Worker-side preflight also covers automatic updates and the standalone
  // recovery screen, not only the Settings button. Estimates are advisory.
  async function prepareVersion() {
    const cache = await engine;
    const locks = scope.navigator?.locks;
    if (!locks) throw Error('Offline writer lock unavailable');
    return locks.request(writerLock, async () => {
      const status = await cache.inspect();
      if (status.state === 'ready') return status;
      const names = await offlineVersionNames(scope.caches);
      if (!names.includes(cache.name) && names.length >= OFFLINE_VERSION_LIMIT)
        throw Error('Offline version capacity reached');
      const estimate = await scope.navigator.storage?.estimate?.();
      const usage = estimate?.usage, quota = estimate?.quota;
      if (typeof usage !== 'number' || typeof quota !== 'number' ||
          !Number.isFinite(usage) || !Number.isFinite(quota) || usage < 0 || quota <= 0 ||
          quota - usage < status.bytes + OFFLINE_STORAGE_HEADROOM)
        throw Error('Offline storage capacity unverified');
      return cache.prepare();
    });
  }
  // Normal activation means no page is still controlled by the previous
  // worker. Do not prune during installation, or while another version waits.
  const canPrune = () => {
    const r = scope.registration;
    return r?.scope === origin + '/' && r.active?.scriptURL === origin + '/bodyforge-offline.js' &&
      r.active.state === 'activating' && !r.installing && !r.waiting;
  };
  // Explicit maintenance is more conservative than normal activation: one
  // controlled root window, no other same-origin clients, no pending worker.
  async function maintenance(source: MessageEventLike['source']) {
    const identity = source?.id;
    const stillActive = () => {
      const r = scope.registration;
      return r?.scope === origin + '/' && r.active?.scriptURL === origin + '/bodyforge-offline.js' &&
        r.active.state === 'activated' && !r.installing && !r.waiting;
    };
    const permit = async () => {
      if (!identity || !scope.clients || !stillActive()) return false;
      const all = await scope.clients.matchAll({ type: 'all', includeUncontrolled: true });
      const owned = await scope.clients.matchAll({ type: 'all', includeUncontrolled: false });
      const one = (list: typeof all) => list.length === 1 && list[0].id === identity &&
        list[0].type === 'window' && rootUrls.has(list[0].url);
      return stillActive() && one(all) && one(owned);
    };
    const names = async () => (await offlineVersionNames(scope.caches)).filter(name => name !== ('bodyforge-offline-v1-' + manifest.version)).length;
    const blocked = async () => ({ schema: 1, version: manifest.version, state: 'blocked', removed: 0, remaining: await names() });
    // Do not expand the loopback-only pilot through a message.
    if (!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname) || !scope.navigator?.locks) return blocked();
    return scope.navigator.locks.request(writerLock, async () => {
      const cache = await engine;
      if (!await permit() || (await cache.inspect()).state !== 'ready') return blocked();
      const result = await pruneRetiredOfflineCaches(scope.caches, origin, manifest.version, permit);
      return { schema: 1, version: manifest.version, removed: result.removed, remaining: result.remaining,
        state: result.blocked ? 'blocked' : result.remaining ? 'partial' : 'complete' };
    });
  }
  scope.addEventListener('install', event => {
    event.waitUntil(prepareVersion().then(status => {
      if (status.state !== 'ready') throw Error('Offline installation incomplete');
    }));
  });
  scope.addEventListener('activate', event => {
    event.waitUntil((async () => {
      const locks = scope.navigator?.locks;
      if (!locks || !canPrune()) return;
      await locks.request(writerLock, async () => {
        const cache = await engine;
        if (!canPrune() || (await cache.inspect()).state !== 'ready') return;
        await pruneRetiredOfflineCaches(scope.caches, origin, manifest.version, canPrune);
      });
    })().catch(() => undefined)); // Failed maintenance cannot corrupt the active cache.
  });
  // No skipWaiting, clients.claim, broad cache deletion, or automatic reload.
  scope.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const navigation = request.mode === 'navigate' && rootUrls.has(request.url) && !request.headers.has('Range');
    const url = request.url === origin + '/' && request.mode === 'navigate'
      ? origin + '/index.html' : request.url;
    if (!known.has(url)) return;
    event.respondWith(engine.then(async cache => {
      if (navigation) {
        // Check the complete pinned version before returning HTML. A missing
        // critical chunk must not leave the player on an unrecoverable blank page.
        if ((await cache.inspect()).state !== 'ready') return recovery();
        const response = await cache.serve(request, false);
        return response?.status === 200 ? response : recovery();
      }
      return await cache.serve(request) ?? unavailable();
    }).catch(navigation ? recovery : unavailable));
  });
  scope.addEventListener('message', event => {
    if (event.origin !== origin || event.ports.length !== 1) return;
    const repair = event.data === OFFLINE_REPAIR_MESSAGE;
    const prune = event.data === OFFLINE_PRUNE_MESSAGE;
    if (event.data !== OFFLINE_STATUS_MESSAGE && !repair && !prune) return;
    if ((repair || prune) && (event.source?.type !== 'window' || !rootUrls.has(event.source.url ?? ''))) return;
    const port = event.ports[0];
    if (prune) {
      event.waitUntil(maintenance(event.source).catch(() => ({ schema: 1, version: manifest.version, state: 'unknown' }))
        .then(result => port.postMessage(result)).finally(() => port.close()));
      return;
    }
    event.waitUntil(engine.then(async cache => {
      if (repair) {
        try {
          await prepareVersion();
          const result = await cache.inspect();
          return { schema: 1, ...result, ...(result.state === 'ready' ? {} : { error: 'repair-failed' }) };
        } catch {
          return { schema: 1, ...await cache.inspect(), error: 'repair-failed' };
        }
      }
      return { schema: 1, ...await cache.inspect() };
    }).catch(() => ({
      schema: 1, state: 'corrupt', version: manifest.version, kind: manifest.kind,
      ...(repair ? { error: 'repair-failed' } : {}),
    })).then(result => port.postMessage(result)).finally(() => port.close()));
  });
}
