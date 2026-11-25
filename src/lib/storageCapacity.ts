/** Advisory storage observations only. Never write test bytes, clear data,
 * request persistence permission or turn an estimate into a save guarantee. */
export const MIB = 1024 * 1024;
// Policy threshold, not a detected browser quota: leave headroom for the
// primary, previous snapshot and a possible rollback record.
export const LOCAL_STORAGE_WARNING_BYTES = 3 * MIB;
export const STORAGE_OBSERVATION_TIMEOUT_MS = 2000;

export type LocalStorageCapacity =
  | { state: 'observed'; estimatedBytes: number; warning: boolean }
  | { state: 'unknown' };

type StorageReader = Pick<Storage, 'length' | 'key' | 'getItem'>;

/** Count key/value UTF-16 code units, including other keys at this origin.
 * Browser accounting can differ. No key names or values leave this function. */
export function measureLocalStorage(storage: StorageReader): LocalStorageCapacity {
  try {
    const count = storage.length;
    if (!Number.isSafeInteger(count) || count < 0) return { state: 'unknown' };
    const seen = new Set<string>();
    let estimatedBytes = 0;
    for (let i = 0; i < count; i++) {
      const key = storage.key(i);
      if (key === null || seen.has(key)) return { state: 'unknown' };
      const value = storage.getItem(key);
      if (value === null) return { state: 'unknown' };
      seen.add(key);
      estimatedBytes += 2 * (key.length + value.length);
    }
    if (storage.length !== count || !Number.isSafeInteger(estimatedBytes)) return { state: 'unknown' };
    return { state: 'observed', estimatedBytes, warning: estimatedBytes >= LOCAL_STORAGE_WARNING_BYTES };
  } catch { return { state: 'unknown' }; }
}

export interface StorageCapacity {
  local: LocalStorageCapacity;
  origin: { usage: number; quota: number } | null;
  persistent: boolean | null;
}

/** A failed or stalled read is unknown; late results cannot change it. */
function observe<T>(read: () => T | Promise<T> | undefined): Promise<T | undefined> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(undefined), STORAGE_OBSERVATION_TIMEOUT_MS);
    Promise.resolve().then(read).then(value => {
      clearTimeout(timer);
      resolve(value);
    }, () => {
      clearTimeout(timer);
      resolve(undefined);
    });
  });
}

/** Origin estimate includes browser-managed storage (e.g. IndexedDB), not
 * an exact localStorage allowance. API errors are unknown, never zero. */
export async function readStorageCapacity(): Promise<StorageCapacity> {
  let local: LocalStorageCapacity = { state: 'unknown' };
  try { local = measureLocalStorage(globalThis.localStorage); } catch { /* denied */ }
  let manager: StorageManager | undefined;
  try { manager = globalThis.navigator?.storage; } catch { /* denied */ }
  const [estimate, persisted] = await Promise.all([
    observe(() => manager?.estimate?.()),
    observe(() => manager?.persisted?.()),
  ]);
  const usage = estimate?.usage, quota = estimate?.quota;
  const origin = typeof usage === 'number' && typeof quota === 'number' &&
    Number.isFinite(usage) && Number.isFinite(quota) && usage >= 0 && quota > 0
      ? { usage, quota } : null;
  const persistent = typeof persisted === 'boolean' ? persisted : null;
  return { local, origin, persistent };
}
export function formatStorageBytes(bytes: number): string {
  return bytes < MIB
    ? (bytes / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' КиБ'
    : (bytes / MIB).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' МиБ';
}
