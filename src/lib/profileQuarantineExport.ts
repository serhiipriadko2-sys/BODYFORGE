import { STORAGE_KEY } from './progression';

export interface QuarantinedProfileRaw {
  key: string;
  raw: string;
}
export interface ProfileQuarantineExport {
  status: 'ready' | 'unavailable';
  entries: QuarantinedProfileRaw[];
}

/** Read-only preservation of originals saved during explicit profile recovery.
 * An unreadable value is never replaced, parsed, or silently discarded.
 */
export function readProfileQuarantine(
  store?: Pick<Storage, 'length' | 'key' | 'getItem'>,
): ProfileQuarantineExport {
  const entries: QuarantinedProfileRaw[] = [];
  let status: ProfileQuarantineExport['status'] = 'ready';
  try {
    const storage = store ?? localStorage;
    const prefix = `${STORAGE_KEY}:quarantine:`;
    const count = storage.length;
    for (let index = 0; index < count; index++) {
      const key = storage.key(index);
      if (!key || !key.startsWith(prefix)) continue;
      try {
        const raw = storage.getItem(key);
        if (raw === null) { status = 'unavailable'; continue; }
        entries.push({ key, raw });
      } catch {
        status = 'unavailable';
      }
    }
    // Another tab may have changed storage during enumeration. Partial
    // evidence is kept but must never be called a complete backup.
    if (storage.length !== count) status = 'unavailable';
  } catch {
    status = 'unavailable';
  }
  entries.sort((a, b) => a.key.localeCompare(b.key));
  return { status, entries };
}
