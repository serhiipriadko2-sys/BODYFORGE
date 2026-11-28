import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createOfflineCache, makeOfflineManifest, POSE_CACHE_ASSETS, type OfflineAsset, type OfflineKind } from './offlineCache';

const origin = 'http://127.0.0.1:8123';
const payloads = new Map([
  ['/index.html', '<html>old build</html>'],
  ['/assets/index-AAAAAAAA.js', 'console.log("old build")'],
  ['/manifest.webmanifest', '{"name":"BODYFORGE"}'],
]);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const entries: OfflineAsset[] = [...payloads].map(([key, text]) => ({
  key, bytes: Buffer.byteLength(text), sha256: sha(text),
}));
class FakeCache {
  readonly data = new Map<string, Response>();
  failPut = false;
  async keys() { return [...this.data.keys()].map(url => new Request(url)); }
  async match(url: RequestInfo | URL) {
    return this.data.get(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url)?.clone();
  }
  async put(url: RequestInfo | URL, response: Response) {
    if (this.failPut) throw new DOMException('fixture quota', 'QuotaExceededError');
    const key = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    this.data.set(key, response.clone());
  }
}
class FakeStorage {
  readonly data = new Map<string, FakeCache>();
  failDelete = false;
  failWrites = false;
  async has(name: string) { return this.data.has(name); }
  async open(name: string) {
    let cache = this.data.get(name);
    if (!cache) { cache = new FakeCache(); cache.failPut = this.failWrites; this.data.set(name, cache); }
    return cache;
  }
  async delete(name: string) {
    if (this.failDelete) throw Error('fixture cleanup error');
    return this.data.delete(name);
  }
}
function networkResponse(url: string, text: string, status = 200) {
  const response = new Response(text, { status, headers: { 'X-Untrusted': 'must not survive' } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}
async function fixture(kind: OfflineKind = 'shell', resources = entries) {
  const manifest = await makeOfflineManifest(kind, resources);
  const storage = new FakeStorage();
  const calls: { url: string; init: RequestInit }[] = [];
  let transport = (url: string) => networkResponse(url, payloads.get(new URL(url).pathname) ?? 'not pinned');
  const cache = await createOfflineCache({ origin, manifest, storage,
    fetchAsset: async (url, init) => { calls.push({ url, init }); return transport(url); } });
  const request = (key = '/index.html', method = 'GET', mode: RequestMode = 'same-origin', headers = new Headers()) =>
    ({ url: new URL(key, origin).href, method, mode, headers });
  const marker = origin + '/__bodyforge_offline/commit/' + manifest.version;
  return { manifest, storage, cache, calls, request, marker,
    change: (next: typeof transport) => { transport = next; } };
}
describe('offline manifest trust boundary', () => {
  it('canonicalizes input order and changes identity when bytes change', async () => {
    const a = await makeOfflineManifest('shell', entries);
    const b = await makeOfflineManifest('shell', [...entries].reverse());
    expect(a.version).toBe(b.version);
    expect(Object.isFrozen(a.entries[0])).toBe(true);
    const changed = entries.map(x => x.key === '/index.html' ? { ...x, sha256: sha('new') } : x);
    expect((await makeOfflineManifest('shell', changed)).version).not.toBe(a.version);
  });
  it('rejects private, traversal, query, arbitrary external, duplicate and oversized entries', async () => {
    for (const key of ['/.bodyforge-qa/a', '/docs/audits/a', '/assets/../index.html', '/assets/%2e%2e/a.jpg',
      '/assets/ok.jpg?x=1', '//evil.invalid/x.js', 'https://odml.pa.googleapis.com/v1/log', '/INDEX.html',
      '/assets/extra.exe', '/assets/con.jpg']) {
      await expect(makeOfflineManifest('shell', [...entries, { key, bytes: 1, sha256: sha('x') }])).rejects.toMatchObject({ code: 'manifest' });
    }
    await expect(makeOfflineManifest('shell', [...entries, entries[0]])).rejects.toMatchObject({ code: 'manifest' });
    await expect(makeOfflineManifest('shell', [...entries, { key: '/assets/large.jpg', bytes: 33554433, sha256: sha('x') }])).rejects.toMatchObject({ code: 'manifest' });
    await expect(makeOfflineManifest('shell', entries.filter(e => e.key !== '/manifest.webmanifest'))).rejects.toMatchObject({ code: 'manifest' });
  });
  it('requires the complete exact pose pin set for training, and none for shell', async () => {
    expect((await makeOfflineManifest('training', [...entries, ...POSE_CACHE_ASSETS])).entries.length).toBe(10);
    await expect(makeOfflineManifest('training', [...entries, ...POSE_CACHE_ASSETS.slice(1)])).rejects.toMatchObject({ code: 'manifest' });
    await expect(makeOfflineManifest('shell', [...entries, POSE_CACHE_ASSETS[0]])).rejects.toMatchObject({ code: 'manifest' });
    await expect(makeOfflineManifest('training', [...entries, ...POSE_CACHE_ASSETS.map((e, i) => i ? e : { ...e, sha256: sha('forged') })])).rejects.toMatchObject({ code: 'manifest' });
  });
  it('keeps browser pins equal to the separately checked SDK and model pins', () => {
    const source = readFileSync(new URL('../../qa/offline-pose-pack.mjs', import.meta.url), 'utf8');
    for (const pin of POSE_CACHE_ASSETS) {
      expect(source).toContain(pin.sha256);
      expect(source).toContain(String(pin.bytes));
      expect(source).toContain(new URL(pin.key).pathname.split('/').at(-1));
    }
    expect(source).toContain("SDK_VERSION='1.1.1'");
  });
  it('rejects forged manifest identity and insecure origins before cache operations', async () => {
    const f = await fixture();
    const options = { manifest: f.manifest, storage: f.storage, fetchAsset: async () => new Response('bad') };
    await expect(createOfflineCache({ ...options, origin: 'http://example.test' })).rejects.toMatchObject({ code: 'manifest' });
    await expect(createOfflineCache({ ...options, origin, manifest: { ...f.manifest, version: sha('fake') } })).rejects.toMatchObject({ code: 'manifest' });
    expect(f.storage.data.size).toBe(0);
  });
});
describe('verified cache lifecycle', () => {
  it('does not claim readiness until all resources and marker are verified; reuses without downloads', async () => {
    const f = await fixture();
    expect((await f.cache.inspect()).state).toBe('missing');
    const ready = await f.cache.prepare();
    expect(ready).toMatchObject({ state: 'ready', kind: 'shell', count: 3 });
    expect((await f.cache.inspect()).state).toBe('ready');
    expect(f.calls).toHaveLength(3);
    for (const { init } of f.calls) expect(init).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', mode: 'same-origin', cache: 'no-store' });
    expect(await f.cache.prepare()).toEqual(ready);
    expect(f.calls).toHaveLength(3);
    const response = await f.cache.serve(f.request('/', 'GET', 'navigate'));
    expect(await response?.text()).toBe(payloads.get('/index.html'));
    expect(response?.headers.get('X-Untrusted')).toBeNull();
    expect(response?.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  });
  it('coalesces concurrent preparation of a single worker version', async () => {
    const f = await fixture();
    const a = f.cache.prepare(), b = f.cache.prepare();
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(f.calls).toHaveLength(3);
  });
  it('rejects wrong status, URL, truncated, oversized and forged bytes', async () => {
    for (const make of [
      (url: string) => networkResponse(url, 'bad', 404),
      (url: string) => networkResponse(url + '?redirect', payloads.get(new URL(url).pathname)!),
      (url: string) => networkResponse(url, ''),
      (url: string) => networkResponse(url, 'x'.repeat(100)),
      (url: string) => networkResponse(url, 'x'.repeat(payloads.get(new URL(url).pathname)!.length)),
    ]) {
      const f = await fixture(); f.change(make);
      await expect(f.cache.prepare()).rejects.toMatchObject({ name: 'OfflineCacheError' });
      expect((await f.cache.inspect()).state).toBe('missing');
      expect(f.storage.data.size).toBe(0);
    }
  });
  it('a failed update never deletes the previous version or any unrelated cache', async () => {
    const f = await fixture(); await f.cache.prepare();
    const unrelated = await f.storage.open('other-app');
    await unrelated.put(origin + '/unrelated', new Response('keep'));
    const next = await makeOfflineManifest('shell', entries.map(e => e.key === '/index.html' ? { ...e, sha256: sha('wrong') } : e));
    const updated = await createOfflineCache({ origin, manifest: next, storage: f.storage, fetchAsset: async url => networkResponse(url, 'bad') });
    await expect(updated.prepare()).rejects.toMatchObject({ code: 'integrity' });
    expect((await f.cache.inspect()).state).toBe('ready');
    expect(await (await unrelated.match(origin + '/unrelated'))?.text()).toBe('keep');
    expect(await f.storage.has(updated.name)).toBe(false);
  });
  it('reports quota failure without a ready marker or old-cache deletion', async () => {
    const f = await fixture(); f.storage.failWrites = true;
    await expect(f.cache.prepare()).rejects.toMatchObject({ code: 'storage' });
    expect((await f.cache.inspect()).state).toBe('missing');
  });
  it('surfaces cleanup failure instead of claiming ready', async () => {
    const f = await fixture(); f.storage.failWrites = true; f.storage.failDelete = true;
    await expect(f.cache.prepare()).rejects.toMatchObject({ code: 'cleanup' });
    expect((await f.cache.inspect()).state).toBe('incomplete');
  });
  it('resumes interrupted staging and refuses to serve before commit', async () => {
    const f = await fixture();
    const staged = await f.storage.open(f.cache.name);
    await staged.put(origin + '/index.html', new Response(payloads.get('/index.html')));
    expect((await f.cache.inspect()).state).toBe('incomplete');
    expect((await f.cache.serve(f.request()))?.status).toBe(503);
    expect(f.calls).toHaveLength(0);
    await f.cache.prepare();
    expect(f.calls).toHaveLength(2);
    expect((await f.cache.inspect()).state).toBe('ready');
  });
  it('rejects unknown cache keys or a forged marker without destructive cleanup', async () => {
    const f = await fixture(); const staged = await f.storage.open(f.cache.name);
    await staged.put(origin + '/foreign', new Response('keep'));
    await expect(f.cache.prepare()).rejects.toMatchObject({ code: 'conflict' });
    expect(await (await staged.match(origin + '/foreign'))?.text()).toBe('keep');
    const g = await fixture(); const gCache = await g.storage.open(g.cache.name);
    await gCache.put(g.marker, new Response('fake'));
    expect((await g.cache.inspect()).state).toBe('corrupt');
    await expect(g.cache.prepare()).rejects.toMatchObject({ code: 'conflict' });
    expect(await g.storage.has(g.cache.name)).toBe(true);
  });
  it('detects post-install corruption and repairs only the exact pinned bytes online', async () => {
    const f = await fixture(); await f.cache.prepare();
    const store = await f.storage.open(f.cache.name);
    await store.put(origin + '/index.html', new Response('forgery'));
    expect((await f.cache.inspect()).state).toBe('corrupt');
    expect((await f.cache.serve(f.request(), false))?.status).toBe(503);
    expect(f.calls).toHaveLength(3);
    const fixed = await f.cache.serve(f.request());
    expect(await fixed?.text()).toBe(payloads.get('/index.html'));
    expect(f.calls).toHaveLength(4);
    expect((await f.cache.inspect()).state).toBe('ready');
  });
  it('rejects a newer server build when repairing an older version', async () => {
    const f = await fixture(); await f.cache.prepare();
    const store = await f.storage.open(f.cache.name);
    store.data.delete(origin + '/index.html');
    f.change(url => networkResponse(url, '<html>new build</html>'));
    expect((await f.cache.serve(f.request()))?.status).toBe(503);
    expect((await f.cache.inspect()).state).toBe('corrupt');
    expect(await store.match(origin + '/index.html')).toBeUndefined();
  });
  it('passes through unknown URLs and non-GET requests and refuses unsupported ranges', async () => {
    const f = await fixture(); await f.cache.prepare();
    for (const request of [f.request('/private'), f.request('/index.html?x=1'), f.request('/index.html', 'POST'),
      f.request('https://odml.pa.googleapis.com/v1/log'), f.request(f.marker)]) expect(await f.cache.serve(request)).toBeNull();
    expect((await f.cache.serve(f.request('/index.html', 'GET', 'same-origin', new Headers({ Range: 'bytes=0-1' }))))?.status).toBe(416);
    expect(f.calls).toHaveLength(3);
  });
  it('detects eviction and never creates readiness from an absent cache', async () => {
    const f = await fixture(); await f.cache.prepare();
    await f.storage.delete(f.cache.name);
    expect((await f.cache.inspect()).state).toBe('missing');
    expect((await f.cache.serve(f.request()))?.status).toBe(503);
    expect(f.storage.data.size).toBe(0);
  });
});
