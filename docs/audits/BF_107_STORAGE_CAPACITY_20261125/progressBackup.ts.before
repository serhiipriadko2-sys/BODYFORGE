import type { Profile } from './progression';
import type { CompletedWorkoutResult } from './workoutJournal';
import { createProgressExport } from './progressExport';
import { readDurableJournal } from './durableJournal';
import { readProfileQuarantine } from './profileQuarantineExport';

export interface PreparedProgressBackup {
  readonly json: string;
  readonly filename: string;
  readonly complete: boolean;
  readonly sourcesChangedDuringRead?: boolean;
}

/** Build evidence without touching any app storage or making network requests.
 * The caller must later ask for a SECOND, direct user click to download.
 * iOS Safari can reject programmatic downloads triggered after an async wait.
 */
export async function prepareProgressBackup(
  profile: Profile, pendingResult: CompletedWorkoutResult | null, now = new Date(),
): Promise<PreparedProgressBackup> {
  const local = createProgressExport(profile, pendingResult);
  const profileQuarantine = readProfileQuarantine();
  const durable = await readDurableJournal();
  // IndexedDB reads are asynchronous. Check the other stores again before
  // claiming a complete snapshot: another tab may have changed the wallet,
  // journal or appearance while the durable read was in flight.
  const sourcesChangedDuringRead = JSON.stringify(local) !== JSON.stringify(createProgressExport(profile, pendingResult))
    || JSON.stringify(profileQuarantine) !== JSON.stringify(readProfileQuarantine());
  const complete = !sourcesChangedDuringRead && local.storedProfileRaw !== null && local.storageReadStatus === 'ready' && local.journalReadStatus === 'ready'
    && local.quarantineReadStatus === 'ready' && profileQuarantine.status === 'ready' && durable.status === 'ready'
    && Object.values(local.auxiliaryReadStatus).every((status) => status === 'ready');
  const json = JSON.stringify({
    exportFormat: 'bodyforge-manual-backup',
    exportSchemaVersion: 1,
    exportedAt: now.toISOString(),
    complete,
    sourcesChangedDuringRead,
    ...local,
    storedProfileQuarantineRaw: profileQuarantine.entries,
    profileQuarantineReadStatus: profileQuarantine.status,
    durableResults: durable.entries,
    durableReadStatus: durable.status,
  }, null, 2);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return { json, filename: `bodyforge-backup-${stamp}.json`, complete, sourcesChangedDuringRead };
}

/** Must be invoked synchronously from a real user click. The file is private:
 * never fetch(), share(), upload() or copy it to the clipboard implicitly.
 */
export function requestProgressBackupDownload(
  prepared: PreparedProgressBackup,
): void {
  const blob = new Blob([prepared.json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  let clicked = false;
  try {
    link.href = url;
    link.download = prepared.filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    clicked = true;
  } finally {
    link.remove();
    if (clicked) {
      // A delayed revocation gives mobile browsers time to start the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      URL.revokeObjectURL(url);
    }
  }
}
