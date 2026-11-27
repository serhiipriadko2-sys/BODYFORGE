import { loadProfileState, type Profile } from './progression';
import { inspectImportProfile } from './progressImportPreview';
import { receiptFromJournal, type WorkoutReceiptView } from './receiptCompatibility';
import { resultJournalEntry } from './workoutJournal';
import { readDurableHistoryReceipts, type DurableHistoryReceipt } from './durableJournal';
import { readProfileEpoch } from './profileEpoch';
import { withProfileWriteLock } from './profileLock';
import type { ActivityRecord } from './progressPulse';

export interface ActivityHistoryIndex {
  readonly records: readonly ActivityRecord[];
  readonly complete: boolean;
  readonly expectedCount: number;
  readonly restoredCount: number;
}

/** Read-only projection, never a wallet, reward ledger or migration.
 * Retention: do not prune settled originals or quarantine to build this view. */
function activity(row: WorkoutReceiptView): ActivityRecord {
  return { id: row.sessionId, finishedAt: row.finishedAt, exerciseId: row.exerciseId,
    repetitions: row.unit === 'reps' ? row.completedUnits : 0,
    ...(row.unit === 'seconds' ? { holdSeconds: row.completedUnits } : {}) };
}
function agrees(a: WorkoutReceiptView, b: WorkoutReceiptView): boolean {
  return a.sessionId === b.sessionId && a.exerciseId === b.exerciseId &&
    a.durationMs === b.durationMs && Date.parse(a.finishedAt) === Date.parse(b.finishedAt) &&
    a.unit === b.unit && a.completedUnits === b.completedUnits &&
    (a.mode === null || b.mode === null || a.mode === b.mode) &&
    JSON.stringify(a.splitsMs) === JSON.stringify(b.splitsMs);
}

function expectedCount(profile: Profile): number {
  return Math.max(profile.workouts.length, profile.totals?.workouts ?? 0, profile.creditedWorkoutIds?.length ?? 0);
}
export function visibleActivityHistory(profile: Profile, forcePartial = false): ActivityHistoryIndex {
  const expected = expectedCount(profile);
  return { records: profile.workouts, expectedCount: expected, restoredCount: 0,
    complete: !forcePartial && profile.creditedWorkoutIds !== null && profile.workouts.length < 60 &&
      expected === profile.workouts.length };
}

/** Exact stored receipts and paid IDs before admitting archived rows.
 * Missing dates are never estimated from totals, rewards or row order.
 * Contradicting originals are excluded from the projection, not deleted. */
export function indexActivityHistory(raw: string, profile: Profile,
  journal: { status: 'ready' | 'unavailable'; entries: readonly DurableHistoryReceipt[] }): ActivityHistoryIndex {
  const view = inspectImportProfile(raw);
  if (!view || historySignature(view.profile) !== historySignature(profile)) return visibleActivityHistory(profile, true);
  const ids = view.storedCreditedWorkoutIds;
  const paid = new Set(ids ?? []);
  const rows = new Map(view.receipts.map(row => [row.sessionId, row]));
  const disputed = new Set<string>();
  const visible = new Set(profile.workouts.map(row => row.id));
  let incomplete = journal.status !== 'ready';
  if (ids && view.profile.profileId && journal.status === 'ready') {
    for (const original of journal.entries) {
      if (original.state !== 'settled') continue;
      let entry: ReturnType<typeof resultJournalEntry>;
      try { entry = resultJournalEntry(JSON.parse(original.raw)); }
      catch { incomplete = true; continue; }
      if (!entry?.result || entry.key !== original.key || entry.raw !== original.raw) {
        incomplete = true; continue;
      }
      if (entry.result.profileId !== view.profile.profileId) continue;
      if (!paid.has(entry.result.sessionId)) { incomplete = true; continue; }
      const receipt = receiptFromJournal(entry.result);
      if (!receipt) { incomplete = true; continue; }
      const existing = rows.get(receipt.sessionId);
      if (existing && !agrees(existing, receipt)) disputed.add(receipt.sessionId);
      if (!existing) rows.set(receipt.sessionId, receipt);
    }
  }
  for (const id of disputed) rows.delete(id);
  const records = [...rows.values()].map(activity);
  const expected = Math.max(expectedCount(profile), view.receipts.length, paid.size);
  const storedTotals = (JSON.parse(raw) as { totals?: Profile['totals'] }).totals;
  const needsFullProof = view.receipts.length >= 60 || expected > view.receipts.length;
  const allIdentities = ids !== null && paid.size === records.length && records.every(row => paid.has(row.id));
  const totalsAgree = !!storedTotals && storedTotals.workouts === records.length &&
    storedTotals.repetitions === records.reduce((sum,row) => sum + row.repetitions, 0) &&
    (storedTotals.holdSeconds ?? 0) === records.reduce((sum,row) => sum + (row.holdSeconds ?? 0), 0);
  const complete = !incomplete && disputed.size === 0 && records.length === expected &&
    (needsFullProof ? allIdentities && totalsAgree : ids === null || allIdentities) &&
    (!storedTotals || totalsAgree);
  return { records, expectedCount: expected, complete,
    restoredCount: records.filter(row => !visible.has(row.id)).length };
}

function historySignature(profile: Profile): string {
  return JSON.stringify([profile.profileId ?? null, expectedCount(profile), profile.creditedWorkoutIds ?? null,
    profile.workouts.map(row => [row.id, row.finishedAt, row.durationMs, row.repetitions,
      row.exerciseId ?? 'squat', row.holdSeconds ?? null, row.mode ?? null, row.splitsMs ?? null]),
    profile.totals?.repetitions ?? null, profile.totals?.holdSeconds ?? null]);
}
export async function readActivityHistory(profile: Profile, signal: AbortSignal): Promise<ActivityHistoryIndex> {
  const fallback = visibleActivityHistory(profile, true);
  const result = await withProfileWriteLock(async () => {
    if (signal.aborted) return fallback;
    const initial = loadProfileState();
    if (initial.status === 'empty' && !profile.workouts.length && !expectedCount(profile))
      return visibleActivityHistory(profile);
    if (initial.status !== 'ready' || initial.revision === null ||
        historySignature(initial.profile) !== historySignature(profile)) return fallback;
    const epoch = readProfileEpoch();
    const journal = await readDurableHistoryReceipts(signal);
    const final = loadProfileState();
    if (signal.aborted || final.status !== 'ready' || final.revision !== initial.revision ||
        readProfileEpoch() !== epoch) return fallback;
    return indexActivityHistory(initial.revision, profile, journal);
  }, { signal });
  return result.status === 'completed' && !signal.aborted ? result.value : fallback;
}
