// BF-604 pilot: browser lifecycle decisions, independent of React and player storage.
import { OFFLINE_VERSION_LIMIT, offlineVersionNames, offlineCacheName, type OfflineStatus } from './offlineCache';

export const OFFLINE_WORKER_PATH = '/bodyforge-offline.js';
export const OFFLINE_PILOT_BUDGET = 144 * 1024 * 1024; // 128 MiB cap + 16 MiB headroom
const STATUS = 'BODYFORGE_OFFLINE_STATUS_V1';
const REPAIR = 'BODYFORGE_OFFLINE_REPAIR_V1';
const PRUNE = 'BODYFORGE_OFFLINE_PRUNE_V1';
const LOCK = 'bodyforge-offline-control-v1';
type Phase = 'unobserved' | 'unsupported' | 'unprepared' | 'installing' |
  'needs-reopen' | 'ready' | 'repair-needed' | 'conflict' | 'unknown' |
  'space-low' | 'space-unknown' | 'offline' | 'released' | 'busy';
export interface OfflineObservation {
  phase: Phase;
  cache?: OfflineStatus;
  updatePending?: boolean;
  observedAt?: number;
  capacity?: { count: number; currentPresent?: boolean };
  cleanup?: { state: 'complete' | 'partial' | 'blocked' | 'unknown'; removed?: number; remaining?: number };
}
export interface OfflineEnvironment {
  production: boolean;
  secure: boolean;
  url: string;
  service?: ServiceWorkerContainer;
  locks?: LockManager;
  storage?: StorageManager;
  cacheStorage?: Pick<CacheStorage, 'keys'>;
  online: () => boolean;
}
type Intent = 'prepare' | 'repair' | 'disable' | 'cleanup';
const result = (phase: Phase): OfflineObservation => ({ phase });

/** Pilot is intentionally unavailable on public HTTPS, development and native WebView.
 * A query, localStorage flag or user agent must not expand this boundary. */
export function offlinePilotAllowed(env: Pick<OfflineEnvironment, 'production' | 'secure' | 'url'>): boolean {
  try {
    const u = new URL(env.url);
    return env.production && env.secure && ['http:', 'https:'].includes(u.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) &&
      ['/', '/index.html'].includes(u.pathname) && !u.search && !u.hash && !u.username && !u.password;
  } catch { return false; }
}

export function browserOfflineEnvironment(): OfflineEnvironment {
  let service: ServiceWorkerContainer | undefined, locks: LockManager | undefined, storage: StorageManager | undefined;
  let cacheStorage: CacheStorage | undefined;
  try { service = navigator.serviceWorker; } catch { /* denied */ }
  try { locks = navigator.locks; } catch { /* denied */ }
  try { storage = navigator.storage; } catch { /* denied */ }
  try { cacheStorage = globalThis.caches; } catch { /* denied */ }
  return {
    production: import.meta.env.PROD, secure: globalThis.isSecureContext === true,
    url: location.href, service, locks, storage, cacheStorage, online: () => navigator.onLine,
  };
}

export function parseOfflineStatus(value: unknown): OfflineStatus | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 6 || v.schema !== 1 || v.kind !== 'training' ||
      typeof v.version !== 'string' || !/^[a-f0-9]{64}$/.test(v.version) ||
      typeof v.state !== 'string' || !['missing', 'incomplete', 'corrupt', 'ready'].includes(v.state) ||
      typeof v.bytes !== 'number' || !Number.isSafeInteger(v.bytes) || v.bytes <= 0 || v.bytes > 128 * 1024 * 1024 ||
      typeof v.count !== 'number' || !Number.isSafeInteger(v.count) || v.count < 10 || v.count > 256) return null;
  return { kind: 'training', version: v.version, state: v.state as OfflineStatus['state'], bytes: v.bytes, count: v.count };
}

async function bounded<T>(read: () => Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('timeout')), ms); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function requestMessage(worker: ServiceWorker, message: typeof STATUS | typeof REPAIR | typeof PRUNE): Promise<unknown> {
  const channel = new MessageChannel();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise(resolve => {
      const finish = (value: unknown) => resolve(value);
      timer = setTimeout(() => resolve(null), message === STATUS ? 30000 : 180000);
      channel.port1.onmessage = e => finish(e.data);
      channel.port1.onmessageerror = () => resolve(null);
      try { worker.postMessage(message, [channel.port2]); } catch { channel.port2.close(); resolve(null); }
    });
  } finally { clearTimeout(timer); channel.port1.close(); }
}

async function requestStatus(worker: ServiceWorker, message: typeof STATUS | typeof REPAIR) {
  return parseOfflineStatus(await requestMessage(worker, message));
}
export function parsePruneResult(value: unknown, version: string): NonNullable<OfflineObservation['cleanup']> {
  const unknown = { state: 'unknown' as const };
  if (!value || typeof value !== 'object') return unknown;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 5 || v.schema !== 1 || v.version !== version ||
      (typeof v.state !== 'string' || !['complete','partial','blocked'].includes(v.state)) ||
      typeof v.removed !== 'number' || !Number.isSafeInteger(v.removed) || v.removed < 0 || v.removed > 4 ||
      typeof v.remaining !== 'number' || !Number.isSafeInteger(v.remaining) || v.remaining < 0 ||
      (v.state === 'complete' && v.remaining !== 0) || (v.state === 'partial' && v.remaining === 0)) return unknown;
  return { state: v.state as 'complete'|'partial'|'blocked', removed: v.removed, remaining: v.remaining };
}
export { OFFLINE_VERSION_LIMIT };

export function storagePreflight(estimate: StorageEstimate | undefined): 'ok' | 'space-low' | 'space-unknown' {
  const u = estimate?.usage, q = estimate?.quota;
  if (typeof u !== 'number' || typeof q !== 'number' ||
      !Number.isFinite(u) || !Number.isFinite(q) || u < 0 || q <= 0 || u > q) return 'space-unknown';
  return q - u >= OFFLINE_PILOT_BUDGET ? 'ok' : 'space-low';
}

export function createOfflineClient(env: OfflineEnvironment) {
  const service = env.service;
  const supported = offlinePilotAllowed(env) && !!service && !!env.locks;
  const origin = supported ? new URL(env.url).origin : '';
  const scope = origin + '/';
  const script = origin + OFFLINE_WORKER_PATH;
  const owned = (r: ServiceWorkerRegistration) =>
    r.scope === scope && [r.active, r.waiting, r.installing].some(Boolean) &&
    [r.active, r.waiting, r.installing].every(w => !w || w.scriptURL === script);
  async function current() {
    const r = await bounded(() => service!.getRegistration(env.url), 5000);
    const controller = service!.controller;
    return { r, controller, conflict: (!!r && !owned(r)) || (!!controller && controller.scriptURL !== script) };
  }
  async function readCapacity(version?: string): Promise<OfflineObservation['capacity']> {
    if (!env.cacheStorage) return undefined;
    try {
      const names = await bounded(() => offlineVersionNames(env.cacheStorage!), 3000);
      return { count: names.length, ...(version ? { currentPresent: names.includes(offlineCacheName(version)) } : {}) };
    } catch { return undefined; }
  }
  async function inspect(): Promise<OfflineObservation> {
    if (!supported) return result('unsupported');
    try {
      const { r, controller, conflict } = await current();
      if (conflict) return result('conflict');
      if (!r) {
        const capacity = await readCapacity(); const after = await current();
        if (after.r || after.controller !== controller || after.conflict) return result('unknown');
        return { phase: controller ? 'released' : 'unprepared', ...(capacity ? { capacity } : {}) };
      }
      const active = r.active;
      if (!active) return result(r.installing || r.waiting ? 'installing' : 'unknown');
      if (active.state !== 'activated') return result('installing');
      // A stale controller is not proof of the active version.
      if (controller && controller !== active) return result('conflict');
      const cache = await requestStatus(active, STATUS);
      const capacity = await readCapacity(cache?.version);
      const after = await current();
      if (after.conflict || !after.r || after.r.active !== active ||
          after.controller !== controller || active.state !== 'activated') return result('unknown');
      if (!cache) return result('unknown');
      return {
        phase: cache.state !== 'ready' ? 'repair-needed' : controller === active ? 'ready' : 'needs-reopen',
        cache, ...(capacity ? { capacity } : {}), updatePending: !!(after.r.installing || after.r.waiting), observedAt: Date.now(),
      };
    } catch { return result('unknown'); }
  }
  async function act(intent: Intent, permitted: () => boolean): Promise<OfflineObservation> {
    if (!supported) return result('unsupported');
    if (!permitted()) return result('busy');
    try {
      // Serialize our explicit mutations across same-origin tabs. Browser-driven
      // worker updates are separate; never force activation or reload.
      return await env.locks!.request(LOCK, { ifAvailable: true }, async lock => {
        if (!lock || !permitted()) return result('busy');
        const { r, controller, conflict } = await current();
        if (conflict) return result('conflict');
        if (!permitted()) return result('busy');
        if (intent === 'disable') {
          if (!r || !owned(r) || (controller && controller !== r.active)) return result('unknown');
          // Avoid unregistering during a partly installed version.
          if (r.installing || r.waiting) return result('installing');
          if (!permitted()) return result('busy');
          return result(await r.unregister() ? 'released' : 'unknown');
        }
        if (intent === 'cleanup') {
          const blocked = async () => ({ ...await inspect(), cleanup: { state: 'blocked' as const } });
          if (!r?.active || controller !== r.active || r.active.state !== 'activated' || r.installing || r.waiting) return blocked();
          const active = r.active;
          const observed = await inspect();
          if (observed.phase !== 'ready' || !observed.cache || observed.updatePending) return blocked();
          const registrations = await bounded(() => service!.getRegistrations(), 5000);
          if (registrations.length !== 1 || !owned(registrations[0]) || registrations[0].active !== active) return blocked();
          const latest = await current();
          if (latest.conflict || latest.r?.active !== active || latest.controller !== active ||
              latest.r.installing || latest.r.waiting || !permitted()) return blocked();
          const cleanup = parsePruneResult(await requestMessage(active, PRUNE), observed.cache.version);
          const after = await inspect();
          if (after.cache?.version !== observed.cache.version || after.phase !== 'ready' ||
              (after.capacity && typeof cleanup.remaining === 'number' &&
                (!after.capacity.currentPresent || after.capacity.count - 1 !== cleanup.remaining))) return { ...after, cleanup: { state: 'unknown' as const } };
          return { ...after, cleanup };
        }
        const originalActive = r?.active;
        if (!env.online()) return result('offline');
        if (intent === 'prepare' && (r || controller)) return inspect();
        if (intent === 'repair' && (!r?.active || r.active.state !== 'activated' ||
            r.installing || r.waiting || (controller && controller !== r.active))) return inspect();
        // Advisory estimate, not a guarantee. Do not call persist() or write
        // probe bytes. Unknown or insufficient headroom blocks this pilot.
        let estimate: StorageEstimate | undefined;
        try { estimate = await bounded(async () => env.storage?.estimate?.(), 3000); } catch { /* unknown */ }
        const space = storagePreflight(estimate);
        if (space !== 'ok') return result(space);
        const latest = await current();
        if (latest.conflict || latest.controller !== controller ||
            !!latest.r !== !!r || (r && (latest.r?.active !== originalActive || latest.r?.installing || latest.r?.waiting))) return result('unknown');
        if (!permitted()) return result('busy');
        if (!env.online()) return result('offline');
        if (intent === 'prepare') {
          // This is the only explicit registration site; never called on mount.
          const registered = await service!.register(OFFLINE_WORKER_PATH, {
            scope: '/', updateViaCache: 'none',
          });
          if (!owned(registered)) return result('unknown');
          return inspect();
        }
        const active = latest.r?.active;
        if (!active) return result('unknown');
        await requestStatus(active, REPAIR);
        return inspect();
      });
    } catch { return result('unknown'); }
  }
  return { supported, inspect, act };
}
