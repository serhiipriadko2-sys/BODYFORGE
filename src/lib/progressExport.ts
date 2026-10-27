import { PROFILE_BACKUP_KEY, STORAGE_KEY, type Profile } from './progression';
import { readQuarantinedResults, readResultJournal, type CompletedWorkoutResult } from './workoutJournal';
import { AVATAR_LOOK_KEY } from './avatarLook';
import { APPEARANCE_KEY } from './appearance';
import { MANUAL_STEPS_KEY } from './stepsLog';
import { DAILY_PLAN_KEY } from './dailyPlan';

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
  // Preferences have independent storage keys. Preserve opaque original bytes:
  // parsing and reserializing would lose unknown future schema or damaged data.
  const auxiliaryKeys = {
    avatarLook: AVATAR_LOOK_KEY,
    appearance: APPEARANCE_KEY,
    manualSteps: MANUAL_STEPS_KEY,
    dailyPlan: DAILY_PLAN_KEY,
  } as const;
  const auxiliaryReadStatus: Record<keyof typeof auxiliaryKeys, 'ready' | 'unavailable'> = {
    avatarLook: 'ready', appearance: 'ready', manualSteps: 'ready', dailyPlan: 'ready',
  };
  const storedAuxiliaryRaw = Object.fromEntries(Object.entries(auxiliaryKeys).map(([label, key]) => {
    try { return [label, localStorage.getItem(key)]; }
    catch { auxiliaryReadStatus[label as keyof typeof auxiliaryKeys] = 'unavailable'; return [label, null]; }
  })) as Record<keyof typeof auxiliaryKeys, string | null>;
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
    storedAuxiliaryRaw,
    auxiliaryReadStatus,
  };
}
