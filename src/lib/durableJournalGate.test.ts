import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stageDurableResults, markDurableResults } from './durableJournal';

// Fault-injected IDB boundary: any open would cross the lock before permission.
// Real IDB commit/read-back and two browser contexts are checked in journal-gate-e2e.
const input = [{ key: 'bodyforge:pilot:v1:result:gate-unit', raw: '{"immutable":true}' }];
const open = vi.fn(() => {
  const request = { onerror: null as (() => void) | null };
  queueMicrotask(() => request.onerror?.());
  return request;
});
beforeEach(() => { open.mockClear(); vi.stubGlobal('indexedDB', { open }); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('durable journal writer coordination boundary', () => {
  it('does not open IndexedDB when shared coordination is unsupported', async () => {
    vi.stubGlobal('navigator', {});
    expect((await stageDurableResults(input, 'original')).status).toBe('unavailable');
    expect(open).not.toHaveBeenCalled();
  });
  it.each(['stage', 'mark'] as const)('%s requests only the shared journal lock before IDB access', async kind => {
    const request = vi.fn(async (_name: string, _options: LockOptions, work: () => unknown) => work());
    vi.stubGlobal('navigator', { locks: { request } });
    const result = kind === 'stage' ? await stageDurableResults(input, 'original') : await markDurableResults(input, 'settled');
    expect(result.status).toBe('unavailable');
    expect(request).toHaveBeenCalledExactlyOnceWith('bodyforge:pilot:v1:durable-write',
      expect.objectContaining({ mode: 'shared', signal: expect.any(AbortSignal) }), expect.any(Function));
    expect(open).toHaveBeenCalledOnce();
  });
  it('aborts a queued writer without opening IDB or allowing a late callback', async () => {
    let work: (() => unknown) | undefined;
    const request = vi.fn((_name: string, options: LockOptions, callback: () => unknown) => {
      work = callback;
      return new Promise((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(options.signal!.reason), { once: true }));
    });
    vi.stubGlobal('navigator', { locks: { request } });
    const abort = new AbortController();
    const flight = stageDurableResults(input, 'original', abort.signal);
    await Promise.resolve();
    abort.abort();
    expect((await flight).status).toBe('unavailable');
    expect(open).not.toHaveBeenCalled();
    if (work) await work(); // Faulty/late host cannot activate a cancelled write.
    expect(open).not.toHaveBeenCalled();
  });
});
