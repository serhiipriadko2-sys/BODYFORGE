import { nextTowerFloor, TOWER_FLOORS, type WorkoutMode } from './game';
import { addCompletedWorkout, loadProfileState, saveProfile, STORAGE_KEY, TARGET_REPS, type ProfileLoadResult } from './progression';

export const RESULT_JOURNAL_PREFIX = `${STORAGE_KEY}:result:`;
export const RESULT_QUARANTINE_PREFIX = `${STORAGE_KEY}:result-quarantine:`;
export interface WorkoutSession {
  schemaVersion: 1;
  profileId: string;
  sessionId: string;
  mode: WorkoutMode;
  floor: number | null;
}
export interface CompletedWorkoutResult extends WorkoutSession {
  durationMs: number;
  finishedAt: string;
  repetitions: 20;
  splitsMs?: number[];
}
export interface JournalEntry { key: string; raw: string; result: CompletedWorkoutResult | null }
export type JournalOutcome = {
  status: 'saved' | 'unavailable' | 'mismatch' | 'invalid' | 'recovery-required' | 'conflict';
  state: ProfileLoadResult;
};
const validId = (id: unknown): id is string => typeof id === 'string' && id.trim().length > 0 && id.length <= 128;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function parseResult(value: unknown): CompletedWorkoutResult | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Partial<CompletedWorkoutResult>;
  if (r.schemaVersion !== 1 || !validId(r.profileId) || !validId(r.sessionId) ||
      !['training', 'tower', 'ghost'].includes(r.mode ?? '') || r.repetitions !== TARGET_REPS ||
      typeof r.durationMs !== 'number' || !Number.isFinite(r.durationMs) || r.durationMs <= 0 ||
      typeof r.finishedAt !== 'string' || !Number.isFinite(Date.parse(r.finishedAt))) return null;
  if (r.mode === 'tower'
    ? !Number.isInteger(r.floor) || r.floor! < 1 || r.floor! > TOWER_FLOORS.length
    : r.floor !== null) return null;
  if (r.splitsMs !== undefined && (!Array.isArray(r.splitsMs) || r.splitsMs.length !== TARGET_REPS ||
      Array.from(r.splitsMs).some((ms, i) => !Number.isFinite(ms) || ms < 0 || ms > r.durationMs! || (i > 0 && ms < r.splitsMs![i - 1])))) return null;
  return { schemaVersion: 1, profileId: r.profileId, sessionId: r.sessionId, mode: r.mode!, floor: r.floor!,
    durationMs: r.durationMs, finishedAt: r.finishedAt, repetitions: 20,
    ...(r.splitsMs ? { splitsMs: [...r.splitsMs] } : {}) };
}

export function sameWorkoutResult(a: unknown, b: unknown): boolean {
  const first = parseResult(a), second = parseResult(b);
  return !!first && !!second && JSON.stringify(first) === JSON.stringify(second);
}

export function resultJournalEntry(input: unknown): JournalEntry | null {
  const result = parseResult(input);
  return result ? { key: RESULT_JOURNAL_PREFIX + encodeURIComponent(result.sessionId), raw: JSON.stringify(result), result } : null;
}

/** Quarantine is an exportable local recovery copy, never a source of rewards. */
export function readQuarantinedResults(): { status: 'ready' | 'unavailable'; entries: { key: string; raw: string }[] } {
  const entries: { key: string; raw: string }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(RESULT_QUARANTINE_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (raw !== null) entries.push({ key, raw });
    }
    entries.sort((a, b) => a.key.localeCompare(b.key));
    return { status: 'ready', entries };
  } catch { return { status: 'unavailable', entries }; }
}

/** Caller MUST hold PROFILE_WRITE_LOCK. Only the explicitly confirmed snapshot
 * may move. Applicable/credited results require reconciliation, never quarantine. */
export function quarantineWorkoutResults(expected: readonly JournalEntry[]): JournalOutcome {
  const state = loadProfileState(), journal = readResultJournal();
  if (state.status === 'unavailable' || state.status === 'recovery-required') return { status: state.status, state };
  if (journal.status !== 'ready') return { status: 'unavailable', state };
  if (expected.length !== journal.entries.length || new Set(expected.map((e) => e.key)).size !== expected.length ||
      journal.entries.some((e) => !expected.some((confirmed) => confirmed.key === e.key && confirmed.raw === e.raw))) {
    return { status: 'conflict', state };
  }
  for (const { result } of journal.entries) {
    if (result && state.profile.profileId === result.profileId &&
        (state.profile.creditedWorkoutIds?.includes(result.sessionId) || state.profile.workouts.some((w) => w.id === result.sessionId) ||
          result.mode !== 'tower' || state.profile.game.highestClearedFloor + 1 === result.floor)) return { status: 'conflict', state };
  }
  try {
    for (const entry of journal.entries) {
      const key = RESULT_QUARANTINE_PREFIX + encodeURIComponent(entry.key);
      const raw = JSON.stringify({ schemaVersion: 1, sourceKey: entry.key, raw: entry.raw });
      const existing = localStorage.getItem(key);
      if (existing !== null && existing !== raw) return { status: 'invalid', state: loadProfileState() };
      if (existing === null) localStorage.setItem(key, raw);
      if (localStorage.getItem(key) !== raw) return { status: 'unavailable', state: loadProfileState() };
      if (localStorage.getItem(entry.key) !== entry.raw) return { status: 'conflict', state: loadProfileState() };
      localStorage.removeItem(entry.key);
      if (localStorage.getItem(entry.key) !== null) return { status: 'unavailable', state: loadProfileState() };
    }
    return { status: 'saved', state: loadProfileState() };
  } catch { return { status: 'unavailable', state: loadProfileState() }; }
}

/** Read-only inspection. Unknown versions and damaged originals remain exportable. */
export function readResultJournal(): { status: 'ready' | 'unavailable'; entries: JournalEntry[] } {
  const entries: JournalEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(RESULT_JOURNAL_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      let result: CompletedWorkoutResult | null = null;
      try { result = parseResult(JSON.parse(raw)); } catch { /* Preserve raw bytes. */ }
      if (result && key !== RESULT_JOURNAL_PREFIX + encodeURIComponent(result.sessionId)) result = null;
      entries.push({ key, raw, result });
    }
    entries.sort((a, b) => (a.result?.finishedAt ?? '').localeCompare(b.result?.finishedAt ?? '') || a.key.localeCompare(b.key));
    return { status: 'ready', entries };
  } catch { return { status: 'unavailable', entries }; }
}

/** Caller MUST hold PROFILE_WRITE_LOCK. Legacy identity is never generated by parsing. */
export function prepareWorkoutSession(expectedRaw: string | null, mode: WorkoutMode):
  | { status: 'ready'; state: ProfileLoadResult; session: WorkoutSession }
  | { status: 'unavailable' | 'conflict' | 'recovery-required'; state: ProfileLoadResult } {
  let state = loadProfileState();
  if (state.status === 'unavailable' || state.status === 'recovery-required') return { status: state.status, state };
  if (state.revision !== expectedRaw) return { status: 'conflict', state };
  if (!state.profile.game.created || !['training', 'tower', 'ghost'].includes(mode)) return { status: 'unavailable', state };
  if (!state.profile.profileId) {
    const write = saveProfile({ ...state.profile, profileId: newId() }, { expectedRaw: state.revision });
    if (write.status !== 'saved') return { status: write.status, state: loadProfileState() };
    state = loadProfileState();
    if (state.status !== 'ready' || state.revision !== write.revision || !state.profile.profileId) return { status: 'unavailable', state };
  }
  return { status: 'ready', state, session: { schemaVersion: 1, profileId: state.profile.profileId!, sessionId: newId(), mode,
    floor: mode === 'tower' ? nextTowerFloor(state.profile.game).floor : null } };
}

/** Caller MUST hold PROFILE_WRITE_LOCK. Replays only onto the matching fresh profile. */
export function reconcileWorkoutResults(): JournalOutcome {
  const journal = readResultJournal();
  if (journal.status !== 'ready') return { status: 'unavailable', state: loadProfileState() };
  let issue: JournalOutcome['status'] = 'saved';
  for (const entry of journal.entries) {
    const r = entry.result;
    if (!r) { issue = 'invalid'; continue; }
    const current = loadProfileState();
    if (current.status === 'unavailable' || current.status === 'recovery-required') return { status: current.status, state: current };
    if (current.status !== 'ready' || current.profile.profileId !== r.profileId) { issue = 'mismatch'; continue; }
    const credited = current.profile.creditedWorkoutIds?.includes(r.sessionId) || current.profile.workouts.some((w) => w.id === r.sessionId);
    // Dedup BEFORE the floor check: a crash after primary acknowledgement needs cleanup only.
    if (!credited) {
      if (r.mode === 'tower' && current.profile.game.highestClearedFloor + 1 !== r.floor) { issue = 'mismatch'; continue; }
      const next = addCompletedWorkout(current.profile, r.durationMs, new Date(r.finishedAt), {
        sessionId: r.sessionId, mode: r.mode, splitsMs: r.splitsMs,
      });
      const write = saveProfile(next, { expectedRaw: current.revision });
      if (write.status !== 'saved') return { status: write.status === 'recovery-required' ? 'recovery-required' : 'unavailable', state: loadProfileState() };
      const checked = loadProfileState();
      if (checked.status !== 'ready' || checked.revision !== write.revision || checked.profile.profileId !== r.profileId ||
          !checked.profile.creditedWorkoutIds?.includes(r.sessionId)) return { status: 'unavailable', state: checked };
    }
    try {
      // Never delete a changed record, nor claim cleanup succeeded on a no-op removal.
      if (localStorage.getItem(entry.key) !== entry.raw) return { status: 'invalid', state: loadProfileState() };
      localStorage.removeItem(entry.key);
      if (localStorage.getItem(entry.key) !== null) return { status: 'unavailable', state: loadProfileState() };
    } catch { return { status: 'unavailable', state: loadProfileState() }; }
  }
  return { status: issue, state: loadProfileState() };
}

/** Caller MUST hold PROFILE_WRITE_LOCK. The journal is verified before ANY reward. */
export function commitWorkoutResult(input: CompletedWorkoutResult): JournalOutcome {
  const result = parseResult(input);
  if (!result) return { status: 'invalid', state: loadProfileState() };
  const key = RESULT_JOURNAL_PREFIX + encodeURIComponent(result.sessionId), raw = JSON.stringify(result);
  try {
    const existing = localStorage.getItem(key);
    if (existing !== null && existing !== raw) return { status: 'invalid', state: loadProfileState() };
    if (existing === null) localStorage.setItem(key, raw);
    if (localStorage.getItem(key) !== raw) return { status: 'unavailable', state: loadProfileState() };
  } catch { return { status: 'unavailable', state: loadProfileState() }; }
  return reconcileWorkoutResults();
}
