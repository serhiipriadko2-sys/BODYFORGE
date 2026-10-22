import { PROFILE_BACKUP_KEY, STORAGE_KEY, type Profile } from './progression';
import { readQuarantinedResults, readResultJournal, type CompletedWorkoutResult } from './workoutJournal';

/** Read-only local export. Keep exact stored strings beside parsed data so a
 * damaged save or an unknown result can be inspected without normalizing it. */
export function createProgressExport(profile: Profile, pendingResult: CompletedWorkoutResult | null) {
  const journal = readResultJournal();
  const quarantine = readQuarantinedResults();
  let storageReadStatus: 'ready' | 'unavailable' = 'ready';
  const readStored = (key: string): string | null => {
    try { return localStorage.getItem(key); }
    catch { storageReadStatus = 'unavailable'; return null; }
  };
  // Read independently: a blocked primary must not discard a readable backup.
  const storedProfileRaw = readStored(STORAGE_KEY);
  const storedBackupRaw = readStored(PROFILE_BACKUP_KEY);
  return {
    ...profile,
    pendingResult,
    pendingResults: journal.entries.map((entry) => entry.result ?? { key: entry.key, raw: entry.raw }),
    pendingResultOriginals: journal.entries.map((entry) => ({ key: entry.key, raw: entry.raw })),
    quarantinedResults: quarantine.entries,
    journalReadStatus: journal.status,
    quarantineReadStatus: quarantine.status,
    storedProfileRaw,
    storedBackupRaw,
    storageReadStatus,
  };
}
