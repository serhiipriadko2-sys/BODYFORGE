import type { DurableJournalEntry } from './durableJournal';
import { resultJournalEntry, type CompletedWorkoutResult } from './workoutJournal';
import { MAX_PROGRESS_BACKUP_BYTES } from './progressBackupInspector';
import { inspectImportProfile } from './progressImportPreview';

export interface SettledImportHistory {
  readonly digest: string;
  readonly profileId: string;
  readonly sessions: ReadonlyMap<string, CompletedWorkoutResult>;
  readonly rows: ReadonlyMap<string, DurableJournalEntry>;
}

/** The exclusive journal lock covers this snapshot and the subsequent profile operation. */
export async function snapshotSettledHistory(entries: readonly DurableJournalEntry[]): Promise<SettledImportHistory | undefined> {
  if (!entries.length) return;
  const rows = new Map<string, DurableJournalEntry>();
  const sessions = new Map<string, CompletedWorkoutResult>();
  let profileId: string | undefined;
  let length = 0;
  for (const row of entries) {
    length += row.key.length + row.raw.length + (row.baseProfileRaw?.length ?? 0);
    if (length > MAX_PROGRESS_BACKUP_BYTES || row.state !== 'settled' || rows.has(row.key)) return;
    let result;
    try { result = resultJournalEntry(JSON.parse(row.raw)); } catch { return; }
    if (!result?.result || result.key !== row.key || result.raw !== row.raw) return;
    if (profileId !== undefined && result.result.profileId !== profileId) return;
    profileId = result.result.profileId;
    sessions.set(result.result.sessionId, result.result);
    rows.set(row.key, row);
  }
  // Stable order covers every original (including nullable base revision) while keeping the localStorage marker small.
  const tuples = [...rows.keys()].sort().map(key => {
    const row = rows.get(key)!;
    return [key, row.raw, row.baseProfileRaw, row.state];
  });
  const bytes = new TextEncoder().encode(JSON.stringify(tuples));
  if (bytes.length > MAX_PROGRESS_BACKUP_BYTES || !profileId || !globalThis.crypto?.subtle) return;
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return { digest: Array.from(hash, b => b.toString(16).padStart(2, '0')).join(''), profileId, sessions, rows };
}

export function matchesExportedHistory(rows: unknown, history?: SettledImportHistory): boolean {
  if (!Array.isArray(rows) || rows.length !== (history?.rows.size ?? 0)) return false;
  const seen = new Set<string>();
  return rows.every(row => {
    if (!row || typeof row !== 'object' || Object.keys(row).length !== 4 || seen.has(row.key)) return false;
    const local = history?.rows.get(row.key);
    seen.add(row.key);
    return !!local && row.state === 'settled' && row.raw === local.raw && row.baseProfileRaw === local.baseProfileRaw;
  });
}

export function coversPaidHistory(raw: string | null, history?: SettledImportHistory): boolean {
  if (!history) return true;
  const view = raw && inspectImportProfile(raw);
  if (!view || view.profile.profileId !== history.profileId || !view.storedCreditedWorkoutIds) return false;
  const paid = new Set(view.storedCreditedWorkoutIds);
  const visible = new Map(view.profile.workouts.map(w => [w.id, w]));
  for (const [id, result] of history.sessions) {
    if (!paid.has(id)) return false;
    const workout = visible.get(id);
    if (!workout) continue;
    if (workout.durationMs !== result.durationMs || workout.repetitions !== result.repetitions ||
        Date.parse(workout.finishedAt) !== Date.parse(result.finishedAt) ||
        (workout.exerciseId ?? 'squat') !== (result.exerciseId ?? 'squat') ||
        (workout.mode !== undefined && workout.mode !== result.mode) || workout.holdSeconds !== result.holdSeconds ||
        JSON.stringify(workout.splitsMs) !== JSON.stringify(result.splitsMs)) return false;
  }
  return true;
}
