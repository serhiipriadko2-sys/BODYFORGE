import { describe, expect, it, vi } from 'vitest';
import { createOfflineClient, offlinePilotAllowed, OFFLINE_PILOT_BUDGET,
  parseOfflineStatus, parsePruneResult, storagePreflight, type OfflineEnvironment } from './offlineClient';

const origin = 'http://127.0.0.1:8123';
const scriptURL = origin + '/bodyforge-offline.js';
const cache = { schema: 1, kind: 'training', version: 'a'.repeat(64),
  state: 'ready', bytes: 82382242, count: 83 };
const envBase = { production: true, secure: true, url: origin + '/' };
type Worker = { state: ServiceWorkerState; scriptURL: string;
  postMessage: (message: string, transfer: MessagePort[]) => void };
function fixture() {
  let online = true, locked = false, denied = false;
  let reply: unknown = cache;
  let pruneReply: unknown = { schema: 1, version: cache.version, state: 'complete', removed: 1, remaining: 0 };
  let names: string[] | undefined;
  let otherRegistration = false;
  let registration: ServiceWorkerRegistration | undefined;
  let controller: ServiceWorker | null = null;
  const worker: Worker = {
    state: 'activated', scriptURL,
    postMessage: vi.fn((message, ports) => {
      ports[0].postMessage(message === 'BODYFORGE_OFFLINE_PRUNE_V1' ? pruneReply : reply); ports[0].close();
    }),
  };
  const sw = worker as unknown as ServiceWorker;
  const unregister = vi.fn(async () => { registration = undefined; return true; });
  const r = { scope: origin + '/', active: sw, waiting: null, installing: null,
    unregister } as unknown as ServiceWorkerRegistration;
  const getRegistration = vi.fn(async () => registration);
  const register = vi.fn(async (_url: string, _options: RegistrationOptions) => {
    registration = r; return r;
  });
  const service = { getRegistration, register, get controller() { return controller; },
    getRegistrations: async () => registration ? [registration, ...(otherRegistration ? [{ scope: origin + '/other/' }] : [])] : [] };
  const estimate = vi.fn(async (): Promise<StorageEstimate> => ({
    usage: 10, quota: OFFLINE_PILOT_BUDGET + 10,
  }));
  const request = vi.fn(async (_name: string, _options: unknown, callback: (lock: object | null) => Promise<unknown>) => {
    if (denied || locked) return callback(null);
    locked = true;
    try { return await callback({}); } finally { locked = false; }
  });
  const environment = { ...envBase, service: service as unknown as ServiceWorkerContainer,
    locks: { request } as unknown as LockManager, storage: { estimate } as unknown as StorageManager,
    cacheStorage: { keys: async () => { if (!names) throw Error('fixture unavailable'); return names; } },
    online: () => online } satisfies OfflineEnvironment;
  const client = createOfflineClient(environment);
  return { client, environment, worker, sw, r, getRegistration, register, unregister, estimate, request,
    useRegistration: (value: ServiceWorkerRegistration | undefined = r) => { registration = value; },
    removeRegistration: () => { registration = undefined; },
    useController: (value: ServiceWorker | null = sw) => { controller = value; },
    useReply: (value: unknown) => { reply = value; },
    usePruneReply: (value: unknown) => { pruneReply = value; },
    useNames: (value: string[]) => { names = value; },
    addForeignRegistration: () => { otherRegistration = true; },
    setOnline: (value: boolean) => { online = value; },
    denyLock: () => { denied = true; },
  };
}

describe('BF-604 local pilot boundary', () => {
  it.each([
    'http://localhost:5174/', 'https://127.0.0.1:4173/index.html', 'http://[::1]:9000/',
  ])('permits only secure production loopback root %s', url =>
    expect(offlinePilotAllowed({ ...envBase, url })).toBe(true));
  it.each([
    'https://appassets.androidplatform.net/', 'https://bodyforge.example/',
    'http://192.168.1.12:5174/', 'https://localhost.evil.example/',
    'http://127.0.0.1:8123/?offline=1', 'http://127.0.0.1:8123/#offline',
    'http://127.0.0.1:8123/sub/', 'http://foo@localhost:8123/', 'invalid',
  ])('rejects non-pilot %s', url => expect(offlinePilotAllowed({ ...envBase, url })).toBe(false));
  it('rejects dev, insecure context, missing locks and absent worker API', async () => {
    const f = fixture();
    for (const env of [{ ...f.environment, production: false }, { ...f.environment, secure: false },
      { ...f.environment, locks: undefined }, { ...f.environment, service: undefined }]) {
      const client = createOfflineClient(env);
      expect(client.supported).toBe(false);
      expect(await client.inspect()).toEqual({ phase: 'unsupported' });
      expect(await client.act('prepare', () => true)).toEqual({ phase: 'unsupported' });
    }
    expect(f.getRegistration).not.toHaveBeenCalled();
    expect(f.register).not.toHaveBeenCalled();
  });
  it('fails closed on untrusted status payloads and advisory quota values', () => {
    expect(parseOfflineStatus(cache)).toMatchObject({ state: 'ready', count: 83 });
    for (const value of [null, {}, { ...cache, schema: 2 }, { ...cache, kind: 'shell' },
      { ...cache, state: 'READY' }, { ...cache, count: 0 }, { ...cache, count: 257 },
      { ...cache, version: 'a' }, { ...cache, bytes: Infinity }, { ...cache, bytes: 1.5 },
      { ...cache, bytes: 129 * 1024 * 1024 }, { ...cache, error: 'repair-failed' }]) {
      expect(parseOfflineStatus(value)).toBeNull();
    }
    expect(storagePreflight(undefined)).toBe('space-unknown');
    expect(storagePreflight({ usage: NaN, quota: 1 })).toBe('space-unknown');
    expect(storagePreflight({ usage: 2, quota: 1 })).toBe('space-unknown');
    expect(storagePreflight({ usage: 1, quota: OFFLINE_PILOT_BUDGET })).toBe('space-low');
    expect(storagePreflight({ usage: 1, quota: OFFLINE_PILOT_BUDGET + 1 })).toBe('ok');
  });
});
describe('explicit offline actions and lifecycle', () => {
  it('construction and observation do not register, fetch or request persistence', async () => {
    const f = fixture();
    expect(f.getRegistration).not.toHaveBeenCalled();
    expect(await f.client.inspect()).toEqual({ phase: 'unprepared' });
    expect(f.register).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
    expect(f.estimate).not.toHaveBeenCalled();
  });
  it('explicit preparation registers only the exact root script, never claims readiness before control', async () => {
    const f = fixture();
    expect(await f.client.act('prepare', () => true)).toMatchObject({ phase: 'needs-reopen' });
    expect(f.register).toHaveBeenCalledExactlyOnceWith('/bodyforge-offline.js', { scope: '/', updateViaCache: 'none' });
    expect(f.worker.postMessage).toHaveBeenCalledWith('BODYFORGE_OFFLINE_STATUS_V1', expect.any(Array));
    expect(await f.client.act('prepare', () => true)).toMatchObject({ phase: 'needs-reopen' });
    expect(f.register).toHaveBeenCalledTimes(1);
    f.useController();
    expect(await f.client.inspect()).toMatchObject({ phase: 'ready', cache: { state: 'ready' } });
  });
  it('never claims ready during installation, partial cache or version drift', async () => {
    const f = fixture();
    f.useRegistration({ ...f.r, active: null, installing: f.sw } as ServiceWorkerRegistration);
    expect(await f.client.inspect()).toMatchObject({ phase: 'installing' });
    f.useRegistration();
    f.useController();
    f.useReply({ ...cache, state: 'corrupt' });
    expect(await f.client.inspect()).toMatchObject({ phase: 'repair-needed' });
    f.useReply({ ...cache, bytes: undefined });
    expect(await f.client.inspect()).toMatchObject({ phase: 'unknown' });
    f.useReply(cache);
    f.useController({ ...f.sw } as ServiceWorker);
    expect(await f.client.inspect()).toMatchObject({ phase: 'conflict' });
  });
  it('reports a waiting version without activating or unregistering it', async () => {
    const f = fixture();
    f.useRegistration({ ...f.r, waiting: f.sw } as ServiceWorkerRegistration);
    f.useController();
    expect(await f.client.inspect()).toMatchObject({ phase: 'ready', updatePending: true });
    expect(await f.client.act('disable', () => true)).toMatchObject({ phase: 'installing' });
    expect(f.unregister).not.toHaveBeenCalled();
    expect(f.register).not.toHaveBeenCalled();
  });
  it('blocks preparation for no network, low/unknown quota, denied lock and revoked permission', async () => {
    const f = fixture();
    f.setOnline(false);
    expect(await f.client.act('prepare', () => true)).toMatchObject({ phase: 'offline' });
    f.setOnline(true);
    f.estimate.mockResolvedValueOnce({ usage: 0, quota: 1 });
    expect(await f.client.act('prepare', () => true)).toMatchObject({ phase: 'space-low' });
    f.estimate.mockRejectedValueOnce(Error('estimate denied'));
    expect(await f.client.act('prepare', () => true)).toMatchObject({ phase: 'space-unknown' });
    let permitted = true;
    f.estimate.mockImplementationOnce(async () => { permitted = false; return { usage: 0, quota: OFFLINE_PILOT_BUDGET }; });
    expect(await f.client.act('prepare', () => permitted)).toMatchObject({ phase: 'busy' });
    f.denyLock();
    expect(await f.client.act('prepare', () => true)).toMatchObject({ phase: 'busy' });
    expect(f.register).not.toHaveBeenCalled();
  });
  it('protects other worker registrations and controllers from any mutation', async () => {
    const f = fixture();
    f.useRegistration({ ...f.r, active: { ...f.sw, scriptURL: origin + '/foreign.js' } } as ServiceWorkerRegistration);
    expect(await f.client.inspect()).toMatchObject({ phase: 'conflict' });
    for (const intent of ['prepare', 'repair', 'disable'] as const) {
      expect(await f.client.act(intent, () => true)).toMatchObject({ phase: 'conflict' });
    }
    f.removeRegistration();
    f.useController({ ...f.sw, scriptURL: origin + '/foreign.js' } as ServiceWorker);
    expect(await f.client.act('prepare', () => true)).toMatchObject({ phase: 'conflict' });
    expect(f.unregister).not.toHaveBeenCalled();
    expect(f.register).not.toHaveBeenCalled();
    expect(f.worker.postMessage).not.toHaveBeenCalled();
  });
  it('repairs explicitly then checks the actual active cache; disable does not clear caches or saves', async () => {
    const f = fixture();
    f.useRegistration(); f.useController();
    f.useReply({ ...cache, state: 'missing' });
    expect(await f.client.inspect()).toMatchObject({ phase: 'repair-needed' });
    f.useReply(cache);
    expect(await f.client.act('repair', () => true)).toMatchObject({ phase: 'ready' });
    expect(f.worker.postMessage).toHaveBeenCalledWith('BODYFORGE_OFFLINE_REPAIR_V1', expect.any(Array));
    expect(f.register).not.toHaveBeenCalled();
    expect(await f.client.act('disable', () => false)).toMatchObject({ phase: 'busy' });
    expect(f.unregister).not.toHaveBeenCalled();
    expect(await f.client.act('disable', () => true)).toMatchObject({ phase: 'released' });
    expect(f.unregister).toHaveBeenCalledTimes(1);
    expect(await f.client.inspect()).toMatchObject({ phase: 'released' });
  });
  it('rechecks registration after quota observation and rejects concurrent drift', async () => {
    const f = fixture();
    f.estimate.mockImplementationOnce(async () => {
      f.useRegistration();
      return { usage: 0, quota: OFFLINE_PILOT_BUDGET };
    });
    expect(await f.client.act('prepare', () => true)).toMatchObject({ phase: 'unknown' });
    expect(f.register).not.toHaveBeenCalled();
  });
});

describe('explicit retired-cache maintenance', () => {
  it('observes only reserved namespace counts, even before registration', async () => {
    const f=fixture(); f.useNames(['bodyforge-offline-v1-'+cache.version,'bodyforge-offline-v1-'+'b'.repeat(64),'foreign','bodyforge-offline-v1-lookalike']);
    expect(await f.client.inspect()).toMatchObject({phase:'unprepared',capacity:{count:2}});
    f.useRegistration();f.useController();
    expect(await f.client.inspect()).toMatchObject({phase:'ready',capacity:{count:2,currentPresent:true}});
    expect(f.register).not.toHaveBeenCalled();expect(f.unregister).not.toHaveBeenCalled();
  });
  it('only requests maintenance of a verified active controlled version and checks result', async () => {
    const f=fixture();f.useRegistration();f.useController();
    expect(await f.client.act('cleanup',()=>true)).toMatchObject({phase:'ready',cleanup:{state:'complete',removed:1,remaining:0}});
    expect(f.worker.postMessage).toHaveBeenCalledWith('BODYFORGE_OFFLINE_PRUNE_V1',expect.any(Array));
    f.addForeignRegistration();vi.mocked(f.worker.postMessage).mockClear();
    expect(await f.client.act('cleanup',()=>true)).toMatchObject({cleanup:{state:'blocked'}});
    expect(f.worker.postMessage).not.toHaveBeenCalledWith('BODYFORGE_OFFLINE_PRUNE_V1',expect.any(Array));
    expect(f.register).not.toHaveBeenCalled();expect(f.unregister).not.toHaveBeenCalled();
  });
  it('refuses cleanup before control, during updates or after permission revocation', async () => {
    const f=fixture();f.useRegistration();
    expect(await f.client.act('cleanup',()=>true)).toMatchObject({cleanup:{state:'blocked'}});
    f.useController();f.useRegistration({...f.r,waiting:f.sw} as ServiceWorkerRegistration);
    expect(await f.client.act('cleanup',()=>true)).toMatchObject({cleanup:{state:'blocked'}});
    expect(await f.client.act('cleanup',()=>false)).toMatchObject({phase:'busy'});
    expect(f.worker.postMessage).not.toHaveBeenCalledWith('BODYFORGE_OFFLINE_PRUNE_V1',expect.any(Array));
  });
  it('does not claim success when a fresh cache inventory contradicts the receipt',async()=>{
    const f=fixture(); f.useRegistration(); f.useController();
    f.useNames(['bodyforge-offline-v1-'+cache.version,'bodyforge-offline-v1-'+'b'.repeat(64)]);
    expect(await f.client.act('cleanup',()=>true)).toMatchObject({phase:'ready',cleanup:{state:'unknown'}});
  });
  it('rejects malformed or mismatched maintenance receipts',()=>{
    const good={schema:1,version:cache.version,state:'complete',removed:1,remaining:0};
    expect(parsePruneResult(good,cache.version)).toEqual({state:'complete',removed:1,remaining:0});
    for(const v of [{...good,version:'x'},{...good,removed:5},{...good,remaining:1},{...good,extra:1},{...good,state:'partial'},null])expect(parsePruneResult(v,cache.version)).toEqual({state:'unknown'});
  });
});
