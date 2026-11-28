// BF-604: verified, version-scoped resource cache for one root worker.
// A trusted build manifest and one writer per version are required.
// No player storage, camera, registration, or telemetry.
export interface OfflineAsset {
  key: string;
  bytes: number;
  sha256: string;
}
export type OfflineKind = 'shell' | 'training';
export interface OfflineManifest {
  schema: 1;
  kind: OfflineKind;
  version: string;
  entries: readonly OfflineAsset[];
}
export type OfflineState = 'missing' | 'incomplete' | 'corrupt' | 'ready';
export interface OfflineStatus {
  state: OfflineState;
  version: string;
  kind: OfflineKind;
  bytes: number;
  count: number;
}
type AssetCache = Pick<Cache, 'keys' | 'match' | 'put'>;
type CacheBackend = {
  has(name: string): Promise<boolean>;
  open(name: string): Promise<AssetCache>;
  delete(name: string): Promise<boolean>;
};
type AssetFetcher = (url: string, init: RequestInit) => Promise<Response>;
type RequestShape = Pick<Request, 'url' | 'method' | 'mode' | 'headers'>;
type Failure = 'manifest' | 'response' | 'integrity' | 'conflict' | 'storage' | 'cleanup';
export class OfflineCacheError extends Error {
  constructor(readonly code: Failure) { super('Offline cache: ' + code); this.name = 'OfflineCacheError'; }
}
const fail = (code: Failure): never => { throw new OfflineCacheError(code); };
const MAX_BYTES = 128 * 1024 * 1024;
export const OFFLINE_VERSION_LIMIT = 2;
export const OFFLINE_STORAGE_HEADROOM = 16 * 1024 * 1024;
const CACHE_NAME = /^bodyforge-offline-v1-[a-f0-9]{64}$/;
export const offlineCacheName = (version: string) => 'bodyforge-offline-v1-' + version;
type VersionStorage = CacheBackend & { keys(): Promise<string[]> };
export async function offlineVersionNames(storage: Pick<VersionStorage, 'keys'>): Promise<string[]> {
  return (await storage.keys()).filter(name => CACHE_NAME.test(name)).sort();
}
const MAX_FILE = 32 * 1024 * 1024;
const MAX_COUNT = 256;
const SHA = /^[a-f0-9]{64}$/;
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm/';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
export const POSE_CACHE_ASSETS: readonly Readonly<OfflineAsset>[] = Object.freeze([
  { key: WASM + 'vision_wasm_internal.js', bytes: 334128, sha256: '6522286aa32dd93eff17c3da002b0649516f87abfec7a80b5bfe5c9625caa5f8' },
  { key: WASM + 'vision_wasm_internal.wasm', bytes: 13519922, sha256: '0e101a010e262ef8e78f22e3c95b60a9705fd06962753c9acd6356d9fb56b7bd' },
  { key: WASM + 'vision_wasm_module_internal.js', bytes: 334166, sha256: '539a4386fd12d0723d6e900ec80467d168ba7290dda2f79e77a2181b8e906115' },
  { key: WASM + 'vision_wasm_module_internal.wasm', bytes: 13519940, sha256: '3b57e4b55ac6346bf940212e3e11250b308a6a474077385e2f527b119cf74525' },
  { key: WASM + 'vision_wasm_nosimd_internal.js', bytes: 333931, sha256: '942654dbdcebce08ea039af23d18e58bebf23c8607d74023d2df7071c8a7b638' },
  { key: WASM + 'vision_wasm_nosimd_internal.wasm', bytes: 12627509, sha256: 'c9b1b69bb87baf9e529254d8559dcbcf4c5a9c0eda84f56a12f17d675335ec9c' },
  { key: MODEL, bytes: 5777746, sha256: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a' },
].map(entry => Object.freeze(entry)));
const remote = new Map(POSE_CACHE_ASSETS.map(entry => [entry.key, entry]));
const mime: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  hdr: 'application/octet-stream', glb: 'model/gltf-binary',
  woff2: 'font/woff2', wasm: 'application/wasm', task: 'application/octet-stream',
  md: 'text/plain; charset=utf-8', txt: 'text/plain; charset=utf-8',
};
const localAsset = (key: string) =>
  ['/index.html', '/favicon.svg', '/manifest.webmanifest', '/third-party-notices.txt'].includes(key) ||
  /^\/assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/.test(key) ||
  /^\/assets\/[a-z0-9_-]+\.(?:png|jpg|hdr|glb)$/.test(key) ||
  /^\/assets\/athlete-[a-z0-9_-]+-source\.md$/.test(key) ||
  /^\/fonts\/(?:[a-z0-9_-]+\.woff2|(?:Manrope|Unbounded)-OFL\.txt|README\.md)$/.test(key) ||
  /^\/icons\/bodyforge-[a-z0-9_-]+\.(?:png|svg)$/.test(key);
const typeFor = (key: string) => mime[key.slice(key.lastIndexOf('.') + 1)];
const fields = (value: object, names: readonly string[]) =>
  Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
async function digest(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}
function canonicalEntries(kind: OfflineKind, input: readonly OfflineAsset[]): OfflineAsset[] {
  if ((kind !== 'shell' && kind !== 'training') || !Array.isArray(input) ||
      input.length < 3 || input.length > MAX_COUNT) fail('manifest');
  const seen = new Set<string>();
  let total = 0, remoteCount = 0, appEntries = 0;
  const result = Array.from(input, (entry: OfflineAsset) => {
    if (!entry || typeof entry !== 'object' || !fields(entry, ['key', 'bytes', 'sha256']) ||
        typeof entry.key !== 'string' || entry.key.length > 240 ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > MAX_FILE ||
        typeof entry.sha256 !== 'string' || !SHA.test(entry.sha256) || !typeFor(entry.key)) fail('manifest');
    const key = entry.key;
    if (seen.has(key.toLowerCase())) fail('manifest');
    seen.add(key.toLowerCase());
    const pin = remote.get(key);
    if (pin) {
      if (kind !== 'training' || pin.bytes !== entry.bytes || pin.sha256 !== entry.sha256) fail('manifest');
      remoteCount++;
    } else {
      if (!localAsset(key) || key.split('/').some(part => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) fail('manifest');
      if (/^\/assets\/index-[A-Za-z0-9_-]{8}\.js$/.test(key)) appEntries++;
    }
    total += entry.bytes;
    if (total > MAX_BYTES) fail('manifest');
    return { key, bytes: entry.bytes, sha256: entry.sha256 };
  });
  if (!seen.has('/index.html') || !seen.has('/manifest.webmanifest') ||
      appEntries !== 1 || remoteCount !== (kind === 'training' ? remote.size : 0)) fail('manifest');
  return result.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}
export async function makeOfflineManifest(kind: OfflineKind, input: readonly OfflineAsset[]): Promise<OfflineManifest> {
  const entries = canonicalEntries(kind, input);
  const bytes = new TextEncoder().encode(JSON.stringify({ schema: 1, kind, entries }));
  const version = await digest(bytes.buffer);
  return Object.freeze({ schema: 1 as const, kind, version,
    entries: Object.freeze(entries.map(entry => Object.freeze(entry))) });
}
async function boundedBody(response: Response, size: number): Promise<ArrayBuffer> {
  if (!response.body) return fail('response');
  const buffer = new ArrayBuffer(size), bytes = new Uint8Array(buffer);
  const reader = response.body.getReader();
  let offset = 0, done = false;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) { done = true; break; }
      if (!(part.value instanceof Uint8Array) || offset + part.value.byteLength > size) fail('integrity');
      bytes.set(part.value, offset);
      offset += part.value.byteLength;
    }
  } finally {
    if (!done) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (offset !== size) fail('integrity');
  return buffer;
}
// Reconstruct the old manifest from its bytes. A matching name, marker or
// plausible key list alone does not prove a retired cache belongs to us.
async function retiredAsset(response: Response | undefined, key: string, limit: number): Promise<OfflineAsset> {
  if (!response?.body || response.status !== 200 || response.redirected ||
      ['opaque', 'opaqueredirect', 'error'].includes(response.type)) return fail('integrity');
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0, done = false;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) { done = true; break; }
      if (!(part.value instanceof Uint8Array) || size + part.value.length > limit) return fail('integrity');
      size += part.value.length; if (part.value.length) parts.push(part.value.slice());
    }
  } finally { if (!done) await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  if (!size) return fail('integrity');
  const bytes = new Uint8Array(size); let offset = 0;
  for (const p of parts) { bytes.set(p, offset); offset += p.length; }
  return { key, bytes: size, sha256: await digest(bytes.buffer) };
}
// Unknown, incomplete, malformed, corrupted or foreign-key caches are retained.
async function ownedRetiredCache(cache: AssetCache, origin: string, version: string): Promise<boolean> {
  const marker = origin + '/__bodyforge_offline/commit/' + version;
  const response = await cache.match(marker);
  if (!response?.body || response.status !== 200 || response.redirected) return false;
  const reader = response.body.getReader();
  const bytes = new Uint8Array(512); let count = 0, done = false;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) { done = true; break; }
      if (!(part.value instanceof Uint8Array) || count + part.value.length > bytes.length) return false;
      bytes.set(part.value, count); count += part.value.length;
    }
  } finally {
    if (!done) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || !fields(value, ['schema', 'version', 'kind', 'count'])) return false;
  const v = value as { schema: unknown; version: unknown; kind: unknown; count: unknown };
  if (v.schema !== 1 || v.version !== version || (v.kind !== 'shell' && v.kind !== 'training') ||
      typeof v.count !== 'number' || !Number.isSafeInteger(v.count) || v.count < 3 || v.count > MAX_COUNT ||
      text !== JSON.stringify({ schema: 1, version, kind: v.kind, count: v.count })) return false;
  const keys = await cache.keys();
  if (keys.length !== v.count + 1) return false;
  const seen = new Set<string>(); let app = 0, pose = 0;
  const urls: { url: string; key: string }[] = [];
  for (const key of keys) {
    if (key.method !== 'GET' || seen.has(key.url)) return false;
    seen.add(key.url);
    if (key.url === marker) continue;
    if (remote.has(key.url)) { pose++; urls.push({ url: key.url, key: key.url }); continue; }
    if (!key.url.startsWith(origin + '/')) return false;
    const local = key.url.slice(origin.length);
    if (!localAsset(local)) return false;
    urls.push({ url: key.url, key: local });
    if (/^\/assets\/index-[A-Za-z0-9_-]{8}\.js$/.test(local)) app++;
  }
  if (!seen.has(marker) || !seen.has(origin + '/index.html') || !seen.has(origin + '/manifest.webmanifest') ||
      app !== 1 || pose !== (v.kind === 'training' ? remote.size : 0)) return false;
  let total = 0; const entries: OfflineAsset[] = [];
  for (const {url,key} of urls) {
    const asset = await retiredAsset(await cache.match(url), key, Math.min(MAX_FILE, MAX_BYTES-total));
    total += asset.bytes; entries.push(asset);
  }
  return (await makeOfflineManifest(v.kind, entries)).version === version;
}

export interface OfflinePruneResult { removed: number; remaining: number; blocked: boolean }
/** Caller holds the cross-version writer lock and proves lifecycle/client safety.
 * Only byte-reconstructed old versions can be removed. No deletion on name alone.
 * At most four candidates per invocation. Report actual read-back, not an estimate. */
export async function pruneRetiredOfflineCaches(storage: VersionStorage, origin: string,
  currentVersion: string, canPrune: () => boolean | Promise<boolean>): Promise<OfflinePruneResult> {
  if (!SHA.test(currentVersion) || !secureOrigin(origin)) return fail('manifest');
  const current = offlineCacheName(currentVersion);
  const others = async () => (await offlineVersionNames(storage)).filter(name => name !== current);
  const names = await others(); let removed = 0, blocked = false;
  if (names.length > 4 || !await canPrune()) return { removed, remaining: names.length, blocked: true };
  for (const name of names) {
    if (!await canPrune() || !await storage.has(current)) { blocked = true; break; }
    if (!await storage.has(name)) continue;
    const cache = await storage.open(name); let owned = false;
    try { owned = await ownedRetiredCache(cache, origin, name.slice('bodyforge-offline-v1-'.length)); }
    catch { /* Unknown or damaged bytes: preserve. */ }
    if (!owned) continue;
    if (!await canPrune() || !await storage.has(current)) { blocked = true; break; }
    if (await storage.delete(name) && !await storage.has(name)) removed++;
    else { blocked = true; break; }
  }
  return { removed, remaining: (await others()).length, blocked };
}

async function verified(response: Response | undefined, asset: OfflineAsset): Promise<Response> {
  if (!response || response.status !== 200 || response.redirected ||
      response.type === 'opaque' || response.type === 'opaqueredirect' || response.type === 'error') return fail('response');
  const bytes = await boundedBody(response, asset.bytes);
  if (await digest(bytes) !== asset.sha256) fail('integrity');
  // Do not preserve arbitrary upstream headers or credentials in the cache.
  return new Response(bytes, { status: 200, headers: {
    'Content-Type': typeFor(asset.key), 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(remote.has(asset.key) ? { 'Access-Control-Allow-Origin': '*' } : {}),
  } });
}
function secureOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.origin === origin && (url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  } catch { return false; }
}
const unavailable = () => new Response('Offline resource unavailable. Reconnect and prepare offline mode again. Saved progress has not been cleared.',
  { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
export async function createOfflineCache(options: {
  origin: string;
  manifest: OfflineManifest;
  storage: CacheBackend;
  fetchAsset: AssetFetcher;
}) {
  const { origin, storage, fetchAsset } = options;
  const supplied = options.manifest;
  if (!secureOrigin(origin) || !supplied || typeof supplied !== 'object' ||
      !fields(supplied, ['schema', 'kind', 'version', 'entries']) || supplied.schema !== 1 ||
      typeof supplied.version !== 'string' || !SHA.test(supplied.version)) return fail('manifest');
  const manifest = await makeOfflineManifest(supplied.kind, supplied.entries);
  if (manifest.version !== supplied.version) fail('manifest');
  const name = offlineCacheName(manifest.version);
  const marker = origin + '/__bodyforge_offline/commit/' + manifest.version;
  const commitBytes = new TextEncoder().encode(JSON.stringify({
    schema: 1, version: manifest.version, kind: manifest.kind, count: manifest.entries.length,
  }));
  const assets = new Map(manifest.entries.map(asset => [new URL(asset.key, origin).href, asset]));
  const status = (state: OfflineState): OfflineStatus => ({
    state, version: manifest.version, kind: manifest.kind,
    bytes: manifest.entries.reduce((sum, asset) => sum + asset.bytes, 0), count: assets.size,
  });
  async function markerState(cache: AssetCache): Promise<'missing' | 'invalid' | 'valid'> {
    const response = await cache.match(marker);
    if (!response) return 'missing';
    try {
      if (response.status !== 200 || response.redirected) return 'invalid';
      const data = new Uint8Array(await boundedBody(response, commitBytes.byteLength));
      return data.every((value, i) => value === commitBytes[i]) ? 'valid' : 'invalid';
    } catch { return 'invalid'; }
  }
  async function hasOnlyKnownKeys(cache: AssetCache): Promise<boolean> {
    const keys = await cache.keys();
    const seen = new Set<string>();
    for (const key of keys) {
      if (key.method !== 'GET' || seen.has(key.url) || (key.url !== marker && !assets.has(key.url))) return false;
      seen.add(key.url);
    }
    return true;
  }
  async function verifyAssets(cache: AssetCache): Promise<boolean> {
    if (!await hasOnlyKnownKeys(cache)) return false;
    for (const [url, asset] of assets) {
      try { await verified(await cache.match(url), asset); }
      catch { return false; }
    }
    return true;
  }
  async function inspect(): Promise<OfflineStatus> {
    try {
      if (!await storage.has(name)) return status('missing');
      const cache = await storage.open(name);
      const mark = await markerState(cache);
      if (mark === 'missing') return status('incomplete');
      if (mark !== 'valid') return status('corrupt');
      return status(await verifyAssets(cache) ? 'ready' : 'corrupt');
    } catch { return status('corrupt'); }
  }
  async function download(url: string, asset: OfflineAsset): Promise<Response> {
    // All callers derive URL from the frozen allowlist. No credentials,
    // redirects, opportunistic caching or unconstrained fallback URLs.
    let response: Response;
    try {
      response = await fetchAsset(url, {
        method: 'GET', mode: remote.has(asset.key) ? 'cors' : 'same-origin',
        credentials: 'omit', redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(60000),
      });
    } catch { return fail('response'); }
    if (response.url !== url) fail('response');
    return verified(response, asset);
  }
  let pending: Promise<OfflineStatus> | undefined;
  async function install(): Promise<OfflineStatus> {
    let created = false;
    let cache: AssetCache | undefined;
    try {
      const exists = await storage.has(name);
      cache = await storage.open(name);
      created = !exists;
      const mark = await markerState(cache);
      if (mark === 'invalid' || !await hasOnlyKnownKeys(cache)) fail('conflict');
      if (mark === 'valid' && await verifyAssets(cache)) return status('ready');
      // Resume interrupted staging; never delete a different or committed cache.
      for (const [url, asset] of assets) {
        try { await verified(await cache.match(url), asset); continue; }
        catch { /* Missing or corrupt bytes can only be repaired from the pinned URL. */ }
        await cache.put(url, await download(url, asset));
      }
      if (!await verifyAssets(cache)) fail('integrity');
      await cache.put(marker, new Response(commitBytes.slice(), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }));
      if (await markerState(cache) !== 'valid') fail('integrity');
      return status('ready');
    } catch (error) {
      // Only a newly created, still uncommitted version is eligible for cleanup.
      // An existing incomplete version may be resumed by its next install.
      if (created && cache) {
        try {
          if (await markerState(cache) === 'missing' && await hasOnlyKnownKeys(cache) &&
              !await storage.delete(name) && await storage.has(name)) fail('cleanup');
        } catch { return fail('cleanup'); }
      }
      if (error instanceof OfflineCacheError) throw error;
      return fail('storage');
    }
  }
  function prepare(): Promise<OfflineStatus> {
    if (!pending) pending = install().finally(() => { pending = undefined; });
    return pending;
  }
  function match(request: RequestShape): string | null {
    if (request.method !== 'GET') return null;
    const url = request.url === origin + '/' && request.mode === 'navigate' ? origin + '/index.html' : request.url;
    return assets.has(url) ? url : null;
  }
  async function serve(request: RequestShape, allowRepair = true): Promise<Response | null> {
    const url = match(request);
    if (!url) return null;
    if (request.headers.has('Range')) return new Response(null, { status: 416, headers: { 'Cache-Control': 'no-store' } });
    const asset = assets.get(url)!;
    try {
      if (!await storage.has(name)) return unavailable();
      const cache = await storage.open(name);
      if (await markerState(cache) !== 'valid') return unavailable();
      try { return await verified(await cache.match(url), asset); }
      catch {
        if (!allowRepair) return unavailable();
        // Keep version identity: never substitute the newest server response
        // for an older cached HTML, JS, model or WASM with a different digest.
        const response = await download(url, asset);
        await cache.put(url, response);
        return await verified(await cache.match(url), asset);
      }
    } catch { return unavailable(); }
  }
  return Object.freeze({ name, manifest, inspect, prepare, match, serve });
}
