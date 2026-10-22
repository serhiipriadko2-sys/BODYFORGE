import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_WRITE_LOCK, PROFILE_WRITE_WAIT_MS, withProfileWriteLock } from './profileLock';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('cooperative profile write lock', () => {
  it('never writes without a lock manager', async () => {
    vi.stubGlobal('navigator', {});
    const operation = vi.fn();
    expect(await withProfileWriteLock(operation)).toEqual({ status: 'unavailable', reason: 'unsupported' });
    expect(operation).not.toHaveBeenCalled();
  });

  it('handles an absent navigator without executing the operation', async () => {
    vi.stubGlobal('navigator', undefined);
    const operation = vi.fn();
    expect(await withProfileWriteLock(operation)).toMatchObject({ status: 'unavailable' });
    expect(operation).not.toHaveBeenCalled();
  });

  it('runs inside an exclusive lock with the stable profile key', async () => {
    const order: string[] = [];
    const request = vi.fn(async (name, options, callback) => {
      expect(name).toBe(PROFILE_WRITE_LOCK);
      expect(options.mode).toBe('exclusive');
      expect(options.signal).toBeInstanceOf(AbortSignal);
      order.push('granted');
      const result = callback();
      order.push('released');
      return result;
    });
    vi.stubGlobal('navigator', { locks: { request } });
    const result = await withProfileWriteLock(() => { order.push('write'); return { revision: 'own' }; });
    expect(result).toEqual({ status: 'completed', value: { revision: 'own' } });
    expect(order).toEqual(['granted', 'write', 'released']);
  });

  it('does not execute a queued operation before grant', async () => {
    let grant!: () => void;
    vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, _options, callback) =>
      new Promise((resolve) => { grant = () => resolve(callback()); })) } });
    const operation = vi.fn(() => 42);
    const pending = withProfileWriteLock(operation);
    expect(operation).not.toHaveBeenCalled();
    grant();
    expect(await pending).toEqual({ status: 'completed', value: 42 });
    expect(operation).toHaveBeenCalledOnce();
  });

  it('does not request a lock for an already aborted operation', async () => {
    const request = vi.fn();
    vi.stubGlobal('navigator', { locks: { request } });
    const controller = new AbortController(); controller.abort();
    expect(await withProfileWriteLock(vi.fn(), { signal: controller.signal })).toEqual({ status: 'cancelled' });
    expect(request).not.toHaveBeenCalled();
  });

  it('cancels a pending request without inventing a storage failure', async () => {
    vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, options) =>
      new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)))) } });
    const operation = vi.fn(), controller = new AbortController();
    const pending = withProfileWriteLock(operation, { signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual({ status: 'cancelled' });
    expect(operation).not.toHaveBeenCalled();
  });

  it('refuses an obsolete callback even if a broken manager grants it after abort', async () => {
    let grant!: () => void;
    vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, _options, callback) =>
      new Promise((resolve) => { grant = () => resolve(callback()); })) } });
    const operation = vi.fn(), controller = new AbortController();
    const pending = withProfileWriteLock(operation, { signal: controller.signal });
    controller.abort(); grant();
    expect(await pending).toEqual({ status: 'cancelled' });
    expect(operation).not.toHaveBeenCalled();
  });

  it('bounds waiting for another tab instead of hanging indefinitely', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, options) =>
      new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)))) } });
    const operation = vi.fn();
    const pending = withProfileWriteLock(operation);
    await vi.advanceTimersByTimeAsync(PROFILE_WRITE_WAIT_MS);
    expect(await pending).toEqual({ status: 'unavailable', reason: 'timeout' });
    expect(operation).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans the deadline and external abort listener after completion', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { locks: { request: vi.fn(async (_name, _options, callback) => callback()) } });
    const controller = new AbortController(), remove = vi.spyOn(controller.signal, 'removeEventListener');
    expect(await withProfileWriteLock(() => 'written', { signal: controller.signal })).toEqual({ status: 'completed', value: 'written' });
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    controller.abort();
  });

  it.each(['request', 'operation'])('fails closed after a %s error', async (source) => {
    const operation = vi.fn(() => { if (source === 'operation') throw Error('failed'); return true; });
    vi.stubGlobal('navigator', { locks: { request: vi.fn(async (_name, _options, callback) => {
      if (source === 'request') throw Error('denied');
      return callback();
    }) } });
    expect(await withProfileWriteLock(operation)).toEqual({ status: 'unavailable', reason: 'failed' });
    expect(operation).toHaveBeenCalledTimes(source === 'operation' ? 1 : 0);
  });

  it('awaits an async operation before releasing the lock and returns its resolved receipt', async () => {
    let finish!: (value: string) => void;
    const durableWrite = new Promise<string>((resolve) => { finish = resolve; });
    const order: string[] = [];
    vi.stubGlobal('navigator', { locks: { request: vi.fn(async (_name, _options, callback) => {
      order.push('granted');
      const result = await callback();
      order.push('released');
      return result;
    }) } });
    const pending = withProfileWriteLock(async () => {
      order.push('stage');
      const receipt = await durableWrite;
      order.push('primary');
      return receipt;
    });
    await Promise.resolve(); await Promise.resolve();
    expect(order).toEqual(['granted', 'stage']);
    finish('strict-complete');
    expect(await pending).toEqual({ status: 'completed', value: 'strict-complete' });
    expect(order).toEqual(['granted', 'stage', 'primary', 'released']);
  });

  it('does not grant a second writer while the first awaits its durable transaction', async () => {
    let finish!: () => void;
    const durableWrite = new Promise<void>((resolve) => { finish = resolve; });
    let tail = Promise.resolve();
    const order: string[] = [];
    vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, _options, callback) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      return previous.then(async () => { try { return await callback(); } finally { release(); } });
    }) } });
    const first = withProfileWriteLock(async () => {
      order.push('first-stage');
      await durableWrite;
      order.push('first-primary');
      return 1;
    });
    const second = withProfileWriteLock(() => { order.push('second-write'); return 2; });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(order).toEqual(['first-stage']);
    finish();
    expect(await first).toEqual({ status: 'completed', value: 1 });
    expect(await second).toEqual({ status: 'completed', value: 2 });
    expect(order).toEqual(['first-stage', 'first-primary', 'second-write']);
  });

  it('reports a rejected async durable write as a failure instead of a nested promise receipt', async () => {
    vi.stubGlobal('navigator', { locks: { request: vi.fn(async (_name, _options, callback) => callback()) } });
    expect(await withProfileWriteLock(async () => {
      await Promise.resolve();
      throw Error('IDB transaction aborted');
    })).toEqual({ status: 'unavailable', reason: 'failed' });
  });

  it('clears the queue deadline when granted instead of timing out owned async work', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const durableWrite = new Promise<void>((resolve) => { finish = resolve; });
    let lockSignal!: AbortSignal;
    vi.stubGlobal('navigator', { locks: { request: vi.fn(async (_name, options, callback) => {
      lockSignal = options.signal;
      return await callback();
    }) } });
    const pending = withProfileWriteLock(async () => { await durableWrite; return 'committed'; });
    await vi.advanceTimersByTimeAsync(PROFILE_WRITE_WAIT_MS + 1);
    expect(lockSignal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    finish();
    expect(await pending).toEqual({ status: 'completed', value: 'committed' });
  });

  it('holds an already-granted lock until async work settles when the caller aborts', async () => {
    let finish!: () => void;
    const durableWrite = new Promise<void>((resolve) => { finish = resolve; });
    const order: string[] = [];
    vi.stubGlobal('navigator', { locks: { request: vi.fn(async (_name, _options, callback) => {
      order.push('granted');
      try { return await callback(); } finally { order.push('released'); }
    }) } });
    const controller = new AbortController();
    const pending = withProfileWriteLock(async () => {
      order.push('stage');
      await durableWrite;
      // The caller checks its cancellation token before starting later writes.
      order.push(controller.signal.aborted ? 'skip-primary' : 'primary');
      return 'settled';
    }, { signal: controller.signal });
    controller.abort();
    await Promise.resolve(); await Promise.resolve();
    expect(order).toEqual(['granted', 'stage']);
    finish();
    expect(await pending).toEqual({ status: 'completed', value: 'settled' });
    expect(order).toEqual(['granted', 'stage', 'skip-primary', 'released']);
  });
});
