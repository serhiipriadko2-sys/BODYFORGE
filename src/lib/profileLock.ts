import { STORAGE_KEY } from './progression';

export const PROFILE_WRITE_LOCK = `${STORAGE_KEY}:write`;
export const PROFILE_WRITE_WAIT_MS = 10000;
export type ProfileWriteIssue = 'unsupported' | 'timeout' | 'failed';
export type ProfileLockResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'cancelled' }
  | { status: 'unavailable'; reason: ProfileWriteIssue };

/** Cooperative, same-origin coordination. Every production writer must use this
 * lock; it cannot protect against old versions or manual localStorage writes.
 * Async operations retain the lock through settlement. A caller that cancels
 * after grant must check its own signal before starting subsequent writes. */
export async function withProfileWriteLock<T>(
  operation: () => T | Promise<T>, options: { signal?: AbortSignal } = {},
): Promise<ProfileLockResult<T>> {
  if (options.signal?.aborted) return { status: 'cancelled' };
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel);
  const deadline = setTimeout(cancel, PROFILE_WRITE_WAIT_MS);
  try {
    if (typeof navigator === 'undefined' || !navigator.locks?.request) {
      return { status: 'unavailable', reason: 'unsupported' };
    }
    return await navigator.locks.request(PROFILE_WRITE_LOCK, { mode: 'exclusive', signal: controller.signal }, async () => {
      // This deadline bounds queueing only; owned durable work must settle
      // before the browser may grant a competing writer the same lock.
      clearTimeout(deadline);
      if (controller.signal.aborted) return options.signal?.aborted
        ? { status: 'cancelled' as const } : { status: 'unavailable' as const, reason: 'timeout' as const };
      return { status: 'completed' as const, value: await operation() };
    });
  } catch {
    return options.signal?.aborted ? { status: 'cancelled' }
      : { status: 'unavailable', reason: controller.signal.aborted ? 'timeout' : 'failed' };
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', cancel);
  }
}
