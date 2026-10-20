import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from './withTimeout';

afterEach(() => vi.useRealTimers());
describe('unabortable media/library timeouts', () => {
  it('returns a fast resource without disposing it', async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    expect(await withTimeout(Promise.resolve('camera'), 1000, 'timeout', close)).toBe('camera');
    await vi.advanceTimersByTimeAsync(1001);
    expect(close).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects the stalled request and disposes a resource returned after timeout', async () => {
    vi.useFakeTimers();
    let resolve!: (value: string) => void;
    const close = vi.fn();
    const request = withTimeout(new Promise<string>((done) => { resolve = done; }), 1000, 'camera timeout', close);
    const observed = expect(request).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(1000);
    await observed;
    resolve('late-camera');
    await vi.advanceTimersByTimeAsync(0);
    expect(close).toHaveBeenCalledExactlyOnceWith('late-camera');
  });
  it('preserves permission errors and clears the timer', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.reject(new DOMException('denied', 'NotAllowedError')), 1000, 'timeout')).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('consumes late rejection without an unhandled promise', async () => {
    vi.useFakeTimers();
    let reject!: (error: Error) => void;
    const p = withTimeout(new Promise((_, fail) => { reject = fail; }), 10, 'expired');
    const observed = expect(p).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(10);
    await observed;
    reject(new Error('late offline'));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
