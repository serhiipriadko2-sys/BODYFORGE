import { STORAGE_KEY, PROFILE_BACKUP_KEY, PROFILE_REPLACEMENT_MARKER_KEY } from './progression';
import { withProfileWriteLock } from './profileLock';
import { PROFILE_EPOCH_KEY } from './profileEpoch';
import { withDurableJournalGate } from './durableJournalGate';
import { readDurableJournal } from './durableJournal';
import { readResultJournal, readQuarantinedResults } from './workoutJournal';
import { readProfileQuarantine } from './profileQuarantineExport';
import { AVATAR_LOOK_KEY } from './avatarLook';
import { APPEARANCE_KEY } from './appearance';
import { MANUAL_STEPS_KEY } from './stepsLog';
import { DAILY_PLAN_KEY } from './dailyPlan';
import { inspectProfileReplacement, rollbackProfileReplacement, finalizeProfileReplacement,
  type ReplacementObservation, type ReplacementPort, type ReplacementResult, type ReplacementState } from './profileReplacement';

/**
 * BF-106: explicit recovery of an already staged transaction. No apply API.
 * Observe both local and durable sources under the existing profile lock.
 * Profile -> exclusive journal lock prevents an independent stage between
 * the durable snapshot and rollback read-back. Never delete/replay records here,
 * and accept only an explicitly confirmed, fully applied pair.
 */
export interface ReplacementRecoveryView {
  readonly state: ReplacementState;
  readonly marker: string | null;
}
const unavailable = (): ReplacementRecoveryView => ({ state: 'unavailable', marker: null });

function localObservation(durable: Awaited<ReturnType<typeof readDurableJournal>>): ReplacementObservation {
  const journal = readResultJournal(), quarantine = readQuarantinedResults(), profiles = readProfileQuarantine();
  return {
    epoch: localStorage.getItem(PROFILE_EPOCH_KEY),
    pair: { primary: localStorage.getItem(STORAGE_KEY), backup: localStorage.getItem(PROFILE_BACKUP_KEY) },
    auxiliary: {
      avatarLook: localStorage.getItem(AVATAR_LOOK_KEY), appearance: localStorage.getItem(APPEARANCE_KEY),
      manualSteps: localStorage.getItem(MANUAL_STEPS_KEY), dailyPlan: localStorage.getItem(DAILY_PLAN_KEY),
    },
    sourcesReady: durable.status === 'ready' && journal.status === 'ready' &&
      quarantine.status === 'ready' && profiles.status === 'ready',
    pendingRecords: journal.entries.length, durableRecords: durable.entries.length,
    quarantineRecords: quarantine.entries.length + profiles.entries.length,
  };
}

async function lockedPort(signal?: AbortSignal): Promise<ReplacementPort | null> {
  const durable = await readDurableJournal();
  if (signal?.aborted) return null;
  return {
    observe: () => localObservation(durable),
    getMarker: () => localStorage.getItem(PROFILE_REPLACEMENT_MARKER_KEY),
    set(key, value) {
      // No await between core read-back and these narrowly scoped mutations.
      // A cancelled operation cannot start writing after lock acquisition.
      if (signal?.aborted) throw Error('Recovery cancelled');
      if (key !== STORAGE_KEY && key !== PROFILE_BACKUP_KEY && key !== PROFILE_REPLACEMENT_MARKER_KEY && key !== PROFILE_EPOCH_KEY) {
        throw Error('Unexpected recovery key');
      }
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    },
  };
}

/** Raw marker is kept in RAM for exact confirmation and local export.
 * A malformed marker is not automatically removed, even when rollback is blocked. */
export async function readReplacementRecovery(signal?: AbortSignal): Promise<ReplacementRecoveryView> {
  try {
    const result = await withProfileWriteLock(async () => {
      const marker = localStorage.getItem(PROFILE_REPLACEMENT_MARKER_KEY);
      if (marker === null) return { state: 'none' as const, marker };
      const journal = await withDurableJournalGate('exclusive', async () => {
        const port = await lockedPort(signal);
        if (!port) return unavailable();
        if (port.getMarker() !== marker) return { state: 'conflict' as const, marker: port.getMarker() };
        return { state: inspectProfileReplacement(port), marker };
      }, { signal });
      return journal.status === 'completed' ? journal.value : unavailable();
    }, { signal });
    return result.status === 'completed' ? result.value : unavailable();
  } catch { return unavailable(); }
}

/** Confirm against the exact previously observed marker, not the latest marker.
 * Cancellation is checked before any lock or IndexedDB access. */
export async function restoreInterruptedReplacement(
  expectedMarker: string, decision: 'rollback' | 'keep' | 'cancel', signal?: AbortSignal,
): Promise<ReplacementResult> {
  if ((decision !== 'rollback' && decision !== 'keep') || signal?.aborted) return { status: 'cancelled' };
  const result = await withProfileWriteLock(async (): Promise<ReplacementResult> => {
    if (signal?.aborted) return { status: 'cancelled' };
    if (localStorage.getItem(PROFILE_REPLACEMENT_MARKER_KEY) !== expectedMarker) {
      return { status: 'conflict', reason: 'marker-changed' };
    }
    const journal = await withDurableJournalGate('exclusive', async (): Promise<ReplacementResult> => {
      const port = await lockedPort(signal);
      if (!port || signal?.aborted) return { status: 'cancelled' };
      // Existing durable results block rollback; none can enter while this
      // snapshot is used. A queued late stage is preserved after gate release.
      return decision === 'keep' ? finalizeProfileReplacement(port, expectedMarker, 'keep')
        : rollbackProfileReplacement(port, expectedMarker, 'rollback');
    }, { signal });
    return journal.status === 'completed' ? journal.value : journal.status === 'cancelled'
      ? { status: 'cancelled' } : { status: 'unavailable', reason: journal.reason };
  }, { signal });
  return result.status === 'completed' ? result.value : result.status === 'cancelled'
    ? { status: 'cancelled' } : { status: 'unavailable', reason: result.reason };
}

/** Synchronous direct-click export, not proof a file reached disk.
 * Preserve the exact raw string even if the transaction is malformed. */
export function downloadReplacementEvidence(marker: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify({
    exportFormat: 'bodyforge-interrupted-replacement-evidence', exportSchemaVersion: 1,
    exportedAt: new Date().toISOString(), markerRaw: marker,
  }, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = 'bodyforge-interrupted-replacement.json';
    link.click();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 60000); }
}
