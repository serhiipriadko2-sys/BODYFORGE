import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { makeOfflineManifest, createOfflineCache, OFFLINE_STORAGE_HEADROOM } from './offlineCache';
import {
  attachOfflineWorker, offlineRecoveryPage, OFFLINE_REPAIR_MESSAGE,
  OFFLINE_STATUS_MESSAGE, OFFLINE_PRUNE_MESSAGE, type OfflineWorkerScope,
} from './offlineWorker';

const origin = 'http://127.0.0.1:8123';
const entry = '/assets/index-Abcd_123.js';
const content = new Map([
  ['/index.html', '<html>pinned build</html>'],
  [entry, 'console.log("pinned build")'],
  ['/manifest.webmanifest', '{}'],
]);
const sha = (data: string, encoding: 'hex' | 'base64' = 'hex') =>
  createHash('sha256').update(data).digest(encoding);
const assets = [...content].map(([key, body]) => ({
  key, bytes: Buffer.byteLength(body), sha256: sha(body),
}));

class MemoryCache {
  readonly data = new Map<string, Response>();
  async keys() { return [...this.data.keys()].map(url => new Request(url)); }
  async match(url: string) { return this.data.get(url)?.clone(); }
  async put(url: string, response: Response) { this.data.set(url, response.clone()); }
}
class MemoryStorage {
  readonly data = new Map<string, MemoryCache>();
  async keys() { return [...this.data.keys()]; }
  async has(name: string) { return this.data.has(name); }
  async open(name: string) {
    if (!this.data.has(name)) this.data.set(name, new MemoryCache());
    return this.data.get(name)!;
  }
  async delete(name: string) { return this.data.delete(name); }
}
type Listener = (event: Record<string, unknown>) => void;
async function fixture(options: { initialQuota?: number; initialVersions?: string[]; skipInstall?: boolean } = {}) {
  const manifest = await makeOfflineManifest('shell', assets);
  const storage = new MemoryStorage();
  const handlers = new Map<string, Listener>();
  const calls: string[] = [];
  let online = true, changed = false;
  let quota = options.initialQuota ?? 1024 * 1024 * 1024, lockCalls = 0;
  for (const name of options.initialVersions ?? []) await storage.open(name);
  const registration = { scope: origin + '/', active: { scriptURL: origin + '/bodyforge-offline.js', state: 'activating' },
    waiting: null as object | null, installing: null as object | null };
  const windowClient = { id: 'fixture-window', type: 'window', url: origin + '/' };
  let clients = [windowClient], controlled = [windowClient];
  const scope = {
    location: { origin }, caches: storage, registration,
    clients: { matchAll: async (options: { includeUncontrolled: boolean }) => options.includeUncontrolled ? clients : controlled },
    navigator: { storage: { estimate: async () => ({ usage: 0, quota }) },
      locks: { request: async (_name: string, fn: () => Promise<unknown>) => { lockCalls++; return fn(); } } },
    async fetch(url: string) {
      calls.push(url);
      if (!online) throw Error('offline fixture');
      const path = new URL(url).pathname;
      const body = changed && path === '/index.html' ? '<html>new build</html>' : content.get(path);
      const r = new Response(body, { status: body ? 200 : 404 });
      Object.defineProperty(r, 'url', { value: url });
      return r;
    },
    addEventListener(name: string, handler: Listener) { handlers.set(name, handler); },
  };
  attachOfflineWorker(scope as unknown as OfflineWorkerScope, manifest);
  async function lifetime(name: 'install' | 'activate') {
    let task: Promise<unknown> | undefined;
    handlers.get(name)!({ waitUntil: (p: Promise<unknown>) => { task = p; } });
    await task;
  }
  if (!options.skipInstall) await lifetime('install');
  const name = 'bodyforge-offline-v1-' + manifest.version;
  async function fetchRequest(path: string, mode = 'navigate', method = 'GET', headers = new Headers()) {
    let response: Promise<Response> | undefined;
    handlers.get('fetch')!({
      request: { url: new URL(path, origin).href, mode, method, headers },
      respondWith: (p: Promise<Response>) => { response = p; },
    });
    return response ? await response : null;
  }
  async function message(data: unknown, source: { type: string; url: string; id?: string } = windowClient, from = origin, portCount = 1) {
    let task: Promise<unknown> | undefined;
    let reply: unknown;
    let closed = 0;
    const port = { postMessage: (r: unknown) => { reply = r; }, close: () => { closed++; } };
    handlers.get('message')!({
      origin: from, data, source, ports: Array.from({ length: portCount }, () => port),
      waitUntil: (p: Promise<unknown>) => { task = p; },
    });
    if (task) await task;
    return { reply, closed, handled: !!task };
  }
  return { manifest, storage, name, calls, fetchRequest, message, registration, windowClient,
    setClients: (all: typeof clients, owned: typeof controlled) => { clients = all; controlled = owned; },
    lifetime, setQuota: (value: number) => { quota = value; }, lockCalls: () => lockCalls,
    disconnect: () => { online = false; }, reconnect: () => { online = true; },
    change: () => { changed = true; },
  };
}

describe('standalone recovery document', () => {
  it('has exact hash-based CSP, no cache dependencies, and escaped version identity', async () => {
    const v = 'a'.repeat(64);
    const r = await offlineRecoveryPage(v), html = await r.text();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const style = html.match(/<style>([\s\S]*?)<\/style>/)![1];
    expect(r.status).toBe(503);
    expect(r.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Content-Security-Policy')).toContain("script-src 'sha256-" + sha(script, 'base64') + "'");
    expect(r.headers.get('Content-Security-Policy')).toContain("style-src 'sha256-" + sha(style, 'base64') + "'");
    expect(r.headers.get('Content-Security-Policy')).toContain("connect-src 'none'");
    expect(r.headers.get('Content-Security-Policy')).not.toContain('unsafe-inline');
    expect(r.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(html).toContain('data-version="' + v + '"');
    expect(html).not.toMatch(/<(?:script|img)[^>]+src=/);
    expect(script).not.toMatch(/(?:localStorage|indexedDB|caches\.delete|fetch\()/);
    expect(html).toContain('id="recovery-confirm-leave" hidden');
    const forged = await (await offlineRecoveryPage('"><script>alert(1)</script>')).text();
    expect(forged).toContain('data-version=""');
    expect(forged).not.toContain('alert(1)');
  });
});
describe('offline worker recovery boundaries', () => {
  it('serves the complete pinned app, and intercepts only approved navigation/asset URLs', async () => {
    const f = await fixture();
    expect(await (await f.fetchRequest('/'))?.text()).toBe(content.get('/index.html'));
    expect(await (await f.fetchRequest('/index.html'))?.text()).toBe(content.get('/index.html'));
    expect(await f.fetchRequest('/unknown')).toBeNull();
    expect(await f.fetchRequest('/?x=1')).toBeNull();
    expect(await f.fetchRequest('/', 'navigate', 'POST')).toBeNull();
    expect((await f.fetchRequest('/index.html', 'navigate', 'GET', new Headers({ Range: 'bytes=0-1' })))?.status).toBe(416);
    expect(f.calls).toHaveLength(3);
  });
  it('shows recovery for a partial cache without issuing speculative downloads', async () => {
    const f = await fixture();
    const cache = await f.storage.open(f.name);
    cache.data.delete(origin + entry);
    const r = await f.fetchRequest('/');
    expect(r?.status).toBe(503);
    expect(await r?.text()).toContain('data-offline-recovery="1"');
    expect(f.calls).toHaveLength(3);
    expect((await f.message(OFFLINE_STATUS_MESSAGE)).reply).toMatchObject({ state: 'corrupt' });
    const repaired = await f.message(OFFLINE_REPAIR_MESSAGE);
    expect(repaired.reply).toMatchObject({ schema: 1, state: 'ready', version: f.manifest.version });
    expect(repaired.closed).toBe(1);
    expect(f.calls).toHaveLength(4);
    expect(f.calls.at(-1)).toBe(origin + entry);
    expect(await (await f.fetchRequest('/'))?.text()).toBe(content.get('/index.html'));
  });
  it('only repairs after an exact message from a same-origin root window', async () => {
    const f = await fixture();
    await f.storage.delete(f.name);
    for (const result of [
      await f.message(OFFLINE_REPAIR_MESSAGE, { type: 'window', url: origin + '/other' }),
      await f.message(OFFLINE_REPAIR_MESSAGE, { type: 'worker', url: origin + '/' }),
      await f.message(OFFLINE_REPAIR_MESSAGE, { type: 'window', url: origin + '/' }, 'https://other.test'),
      await f.message(OFFLINE_REPAIR_MESSAGE, { type: 'window', url: origin + '/' }, origin, 0),
      await f.message({ command: OFFLINE_REPAIR_MESSAGE }),
      await f.message('BODYFORGE_UNKNOWN'),
    ]) expect(result.handled).toBe(false);
    expect(await f.storage.has(f.name)).toBe(false);
    expect(f.calls).toHaveLength(3);
    expect((await f.message(OFFLINE_STATUS_MESSAGE)).reply).toMatchObject({ state: 'missing' });
    expect(await f.storage.has(f.name)).toBe(false);
    expect((await f.message(OFFLINE_REPAIR_MESSAGE, { type: 'window', url: origin + '/index.html' })).reply)
      .toMatchObject({ state: 'ready', version: f.manifest.version });
    expect(f.calls).toHaveLength(6);
  });
  it('never silently serves newer HTML or deletes other caches on failed recovery', async () => {
    const f = await fixture();
    const other = await f.storage.open('unrelated');
    await other.put(origin + '/private', new Response('keep'));
    await f.storage.delete(f.name);
    f.change();
    const r = await f.fetchRequest('/');
    expect(await r?.text()).toContain('data-offline-recovery="1"');
    expect(f.calls).toHaveLength(3);
    const result = await f.message(OFFLINE_REPAIR_MESSAGE);
    expect(result.reply).toMatchObject({ state: 'missing', version: f.manifest.version, error: 'repair-failed' });
    expect(await f.storage.has(f.name)).toBe(false);
    expect(await (await other.match(origin + '/private'))?.text()).toBe('keep');
    expect((await f.fetchRequest(entry, 'same-origin'))?.status).toBe(503);
  });
  it('preserves unexpected cache keys and reports a failed explicit repair', async () => {
    const f = await fixture();
    const cache = await f.storage.open(f.name);
    await cache.put(origin + '/unknown', new Response('keep'));
    expect((await f.fetchRequest('/'))?.status).toBe(503);
    expect((await f.message(OFFLINE_REPAIR_MESSAGE)).reply).toMatchObject({ state: 'corrupt', error: 'repair-failed' });
    expect(await (await cache.match(origin + '/unknown'))?.text()).toBe('keep');
    expect(f.calls).toHaveLength(3);
  });
  it('reports failed offline repair without a false ready marker, then recovers exact bytes online', async () => {
    const f = await fixture();
    await f.storage.delete(f.name);
    f.disconnect();
    expect((await f.message(OFFLINE_REPAIR_MESSAGE)).reply).toMatchObject({ state: 'missing', error: 'repair-failed' });
    expect(await f.storage.has(f.name)).toBe(false);
    f.reconnect();
    expect((await f.message(OFFLINE_REPAIR_MESSAGE)).reply).toMatchObject({ state: 'ready' });
    expect(await (await f.fetchRequest('/'))?.text()).toBe(content.get('/index.html'));
  });
});

describe('bounded offline version lifecycle', () => {
  const staleName = (char: string) => 'bodyforge-offline-v1-' + char.repeat(64);
  async function addPrior(f: Awaited<ReturnType<typeof fixture>>, label: string) {
    const body = '<html>' + label + '</html>';
    const old = await makeOfflineManifest('shell', assets.map(asset => asset.key === '/index.html'
      ? { ...asset, bytes: Buffer.byteLength(body), sha256: sha(body) } : asset));
    const cache = await createOfflineCache({ origin, manifest: old, storage: f.storage,
      fetchAsset: async url => {
        const r = new Response(new URL(url).pathname === '/index.html' ? body : content.get(new URL(url).pathname));
        Object.defineProperty(r, 'url', { value: url }); return r;
      } });
    await cache.prepare(); return cache.name;
  }
  it('blocks installation before any download if quota is unknown or insufficient', async () => {
    for (const quota of [NaN, OFFLINE_STORAGE_HEADROOM]) {
      const f = await fixture({ initialQuota: quota, skipInstall: true });
      await expect(f.lifetime('install')).rejects.toThrow('storage capacity');
      expect(f.calls).toHaveLength(0); expect(await f.storage.keys()).toEqual([]);
    }
  });
  it('blocks a third version without deleting any other cache or downloading', async () => {
    const names = [staleName('a'), staleName('b')];
    const f = await fixture({ initialVersions: names, skipInstall: true });
    await expect(f.lifetime('install')).rejects.toThrow('version capacity');
    expect(await f.storage.keys()).toEqual(names); expect(f.calls).toHaveLength(0);
  });
  it('retains old cache during install and prunes only recognized retired version on activation', async () => {
    const f = await fixture(); const prior = await addPrior(f, 'prior');
    const unknown = staleName('a'); await f.storage.open(unknown);
    const foreign = await f.storage.open('other-app-cache'); await foreign.put(origin + '/private', new Response('keep'));
    expect(await f.storage.has(prior)).toBe(true);
    await f.lifetime('activate');
    expect(await f.storage.has(prior)).toBe(false); expect(await f.storage.has(f.name)).toBe(true);
    expect(await f.storage.has(unknown)).toBe(true); expect(await (await foreign.match(origin + '/private'))?.text()).toBe('keep');
    expect(f.lockCalls()).toBeGreaterThanOrEqual(2);
  });
  it('does not prune when another worker waits, activation is not proven, or current bytes are missing', async () => {
    const f = await fixture(); const prior = await addPrior(f, 'prior');
    f.registration.waiting = {}; await f.lifetime('activate'); expect(await f.storage.has(prior)).toBe(true);
    f.registration.waiting = null; f.registration.active.state = 'activated';
    await f.lifetime('activate'); expect(await f.storage.has(prior)).toBe(true);
    f.registration.active.state = 'activating'; await f.storage.delete(f.name);
    await f.lifetime('activate'); expect(await f.storage.has(prior)).toBe(true);
  });
  it('preserves a plausible old marker and key list when content no longer proves its version', async () => {
    const f = await fixture(); const old = await addPrior(f, 'corrupt old');
    await (await f.storage.open(old)).put(origin + '/index.html', new Response('changed'));
    await f.lifetime('activate'); expect(await f.storage.has(old)).toBe(true);
  });
  it('explicit maintenance requires one controlled root client, no waiting worker and ready current bytes', async () => {
    const f = await fixture(); const old = await addPrior(f, 'old');
    f.registration.active.state = 'activated';
    const other = { id: 'other-window', type: 'window', url: origin + '/' };
    f.setClients([f.windowClient, other], [f.windowClient, other]);
    expect((await f.message(OFFLINE_PRUNE_MESSAGE)).reply).toMatchObject({ state: 'blocked', removed: 0, remaining: 1 });
    f.setClients([f.windowClient, other], [f.windowClient]);
    expect((await f.message(OFFLINE_PRUNE_MESSAGE)).reply).toMatchObject({ state: 'blocked', removed: 0 });
    f.setClients([f.windowClient], [f.windowClient]); f.registration.waiting = {};
    expect((await f.message(OFFLINE_PRUNE_MESSAGE)).reply).toMatchObject({ state: 'blocked', removed: 0 });
    f.registration.waiting = null; await f.storage.delete(f.name);
    expect((await f.message(OFFLINE_PRUNE_MESSAGE)).reply).toMatchObject({ state: 'blocked', removed: 0 });
    expect(await f.storage.has(old)).toBe(true);
    expect((await f.message(OFFLINE_PRUNE_MESSAGE, { type: 'window', url: origin + '/other', id: 'fixture-window' })).handled).toBe(false);
  });
  it('explicit maintenance verifies removal, keeps unknown caches and never fetches', async () => {
    const f = await fixture(); const old = await addPrior(f, 'recognized');
    const unknown = staleName('a'); await f.storage.open(unknown);
    const foreign = await f.storage.open('foreign'); await foreign.put(origin + '/private', new Response('keep'));
    f.registration.active.state = 'activated'; const calls = f.calls.length;
    const reply = await f.message(OFFLINE_PRUNE_MESSAGE);
    expect(reply.reply).toEqual({ schema: 1, version: f.manifest.version, state: 'partial', removed: 1, remaining: 1 });
    expect(reply.closed).toBe(1);expect(await f.storage.has(old)).toBe(false);
    expect(await f.storage.has(f.name)).toBe(true); expect(await f.storage.has(unknown)).toBe(true);
    expect(await (await foreign.match(origin + '/private'))?.text()).toBe('keep');expect(f.calls).toHaveLength(calls);
    expect((await f.message(OFFLINE_PRUNE_MESSAGE)).reply).toMatchObject({ state: 'partial', removed: 0, remaining: 1 });
  });
  it('keeps structurally suspicious retired caches and rejects quota-denied repair', async () => {
    const f = await fixture(); const prior = await addPrior(f, 'prior');
    const old = await f.storage.open(prior); await old.put(origin + '/unknown', new Response('keep'));
    await f.lifetime('activate'); expect(await f.storage.has(prior)).toBe(true);
    await f.storage.delete(f.name); f.setQuota(0); const before = f.calls.length;
    expect((await f.message(OFFLINE_REPAIR_MESSAGE)).reply).toMatchObject({ state: 'missing', error: 'repair-failed' });
    expect(f.calls).toHaveLength(before); expect(await f.storage.has(f.name)).toBe(false);
    expect(await (await old.match(origin + '/unknown'))?.text()).toBe('keep');
  });
});
