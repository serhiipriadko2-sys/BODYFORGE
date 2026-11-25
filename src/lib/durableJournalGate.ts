import { STORAGE_KEY } from './progression';
import { PROFILE_WRITE_WAIT_MS, type ProfileLockResult } from './profileLock';

export const DURABLE_JOURNAL_WRITE_LOCK = `${STORAGE_KEY}:durable-write`;

/** Lock order: profile -> journal (never journal -> profile). Ordinary stages
 * take only shared journal access and release it after strict commit/read-back,
 * before waiting for the wallet lock. Recovery holds exclusive journal access
 * from its snapshot through exact local rollback. No steal or fallback bypass.
 * This coordinates cooperating app versions, not arbitrary database writers. */
export async function withDurableJournalGate<T>(
  mode: 'shared' | 'exclusive', operation: () => T | Promise<T>,
  options: { signal?: AbortSignal } = {},
): Promise<ProfileLockResult<T>> {
  if (options.signal?.aborted) return { status: 'cancelled' };
  const queue = new AbortController();
  const cancel = () => queue.abort();
  options.signal?.addEventListener('abort', cancel);
  const deadline = setTimeout(cancel, PROFILE_WRITE_WAIT_MS);
  try {
    if (typeof navigator === 'undefined' || !navigator.locks?.request) {
      return { status: 'unavailable', reason: 'unsupported' };
    }
    return await navigator.locks.request(DURABLE_JOURNAL_WRITE_LOCK, { mode, signal: queue.signal }, async () => {
      clearTimeout(deadline); // Queue timeout must not release an owned write.
      if (queue.signal.aborted) return options.signal?.aborted
        ? { status: 'cancelled' as const } : { status: 'unavailable' as const, reason: 'timeout' as const };
      return { status: 'completed' as const, value: await operation() };
    });
  } catch {
    return options.signal?.aborted ? { status: 'cancelled' }
      : { status: 'unavailable', reason: queue.signal.aborted ? 'timeout' : 'failed' };
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', cancel);
  }
}
