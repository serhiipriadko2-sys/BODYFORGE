import { loadProfileState, type ProfileLoadResult } from './progression';
import { readDurableJournal, stageDurableResults, markDurableResults } from './durableJournal';
import { readResultJournal, reconcileWorkoutResults, quarantineWorkoutResults, resultJournalEntry,
  RESULT_QUARANTINE_PREFIX, type CompletedWorkoutResult, type JournalEntry, type JournalOutcome } from './workoutJournal';

interface Context { signal: AbortSignal; isCurrent: () => boolean }
const credited = (state: ProfileLoadResult, result: CompletedWorkoutResult) => state.status === 'ready' &&
  state.profile.profileId === result.profileId && (state.profile.creditedWorkoutIds?.includes(result.sessionId) ||
    state.profile.workouts.some((w) => w.id === result.sessionId));
const failed = (status: JournalOutcome['status'] = 'unavailable'): JournalOutcome => ({ status, state: loadProfileState() });

function decoded(raw: string): CompletedWorkoutResult | null {
  try { return resultJournalEntry(JSON.parse(raw))?.result ?? null; } catch { return null; }
}

function preserveQuarantine(entry: { key: string; raw: string }): boolean {
  const key = RESULT_QUARANTINE_PREFIX + encodeURIComponent(entry.key);
  const raw = JSON.stringify({ schemaVersion: 1, sourceKey: entry.key, raw: entry.raw });
  const existing = localStorage.getItem(key);
  if (existing !== null && existing !== raw) return false;
  if (existing === null) localStorage.setItem(key, raw);
  if (localStorage.getItem(key) !== raw) return false;
  const active = localStorage.getItem(entry.key);
  if (active !== null && active !== entry.raw) return false;
  if (active !== null) localStorage.removeItem(entry.key);
  return localStorage.getItem(entry.key) === null;
}

/** Caller holds the exclusive Web Lock across every await. IndexedDB strict
 * completion precedes local rewards. Settled rows remain: localStorage itself
 * can roll back when the entire browser/storage process is killed. */
export async function replayDurableWorkouts(pending: CompletedWorkoutResult | null, context: Context): Promise<JournalOutcome> {
  const local = readResultJournal();
  if (local.status !== 'ready') return failed();
  const own = pending ? resultJournalEntry(pending) : null;
  if (pending && !own) return failed('invalid');
  const staged = await stageDurableResults([...local.entries, ...(own ? [own] : [])], loadProfileState().revision, context.signal);
  if (!context.isCurrent()) return failed();
  if (staged.status !== 'saved') return failed(staged.status);
  const durable = await readDurableJournal();
  if (!context.isCurrent() || durable.status !== 'ready') return failed();
  try {
    for (const entry of durable.entries) {
      if (entry.state === 'quarantined') {
        if (!preserveQuarantine(entry)) return failed('invalid');
        continue;
      }
      const result = decoded(entry.raw);
      // Foreign settled history is kept for export, never attached to a reset fighter.
      if (entry.state === 'settled' && (!result || loadProfileState().profile.profileId !== result.profileId || credited(loadProfileState(), result))) continue;
      const existing = localStorage.getItem(entry.key);
      if (existing !== null && existing !== entry.raw) return failed('invalid');
      if (existing === null) localStorage.setItem(entry.key, entry.raw);
      if (localStorage.getItem(entry.key) !== entry.raw) return failed();
    }
  } catch { return failed(); }
  const outcome = reconcileWorkoutResults();
  const settled = durable.entries.filter((entry) => {
    const result = decoded(entry.raw);
    return entry.state !== 'quarantined' && result && credited(outcome.state, result);
  });
  const acknowledgement = await markDurableResults(settled, 'settled', context.signal);
  if (!context.isCurrent() || acknowledgement.status !== 'saved') return failed();
  return outcome;
}

/** The durable deferral is recorded first, so a restart cannot resurrect a
 * result the owner explicitly set aside. All copies remain exportable. */
export async function quarantineDurableWorkouts(expected: readonly JournalEntry[], context: Context): Promise<JournalOutcome> {
  // Preflight without writing: reuse the synchronous quarantine's exact eligibility
  // rules, but never move an applicable result or a changed confirmation snapshot.
  const local = readResultJournal(), state = loadProfileState();
  if (state.status === 'unavailable' || state.status === 'recovery-required') return { status: state.status, state };
  if (local.status !== 'ready') return failed();
  if (local.entries.length !== expected.length || local.entries.some((entry) => !expected.some((e) => e.key === entry.key && e.raw === entry.raw))) return failed('conflict');
  if (local.entries.some(({ result }) => result && state.profile.profileId === result.profileId &&
      (credited(state, result) || result.mode !== 'tower' || state.profile.game.highestClearedFloor + 1 === result.floor))) return failed('conflict');
  const staged = await stageDurableResults(expected, state.revision, context.signal);
  if (!context.isCurrent() || staged.status !== 'saved') return failed();
  const marked = await markDurableResults(expected, 'quarantined', context.signal);
  if (!context.isCurrent() || marked.status !== 'saved') return failed();
  return quarantineWorkoutResults(expected);
}
