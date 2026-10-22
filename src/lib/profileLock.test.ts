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
});
