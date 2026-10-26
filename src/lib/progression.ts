import {
  beatTowerFloor, freshGame, normalizeGame, storeGhost,
  type GameState, type WorkoutMode,
} from './game';

export const TARGET_REPS = 20;
export const XP_REWARD = 120;
export const COIN_REWARD = 35;
// Do not change the key: upgrading a game must not destroy prior workout progress.
export const STORAGE_KEY = 'bodyforge:pilot:v1';
export const PROFILE_BACKUP_KEY = `${STORAGE_KEY}:backup`;
const QUARANTINE_PREFIX = `${STORAGE_KEY}:quarantine:`;

export interface Workout {
  id: string;
  finishedAt: string;
  durationMs: number;
  repetitions: number;
  xp: number;
  mode?: WorkoutMode;
  /** Measured finish times, in ms from calibrated start, for each rep. */
  splitsMs?: number[];
}

export interface ProfileTotals { workouts: number; repetitions: number; bestDurationMs: number | null }

export interface Profile {
  /** Stable local identity; assigned under the write lock before a workout. */
  profileId?: string;
  /** Reward identities outlive the last-60 display history. Optional on legacy
   * saves; null preserves an unreadable ledger across read/export round-trips. */
  creditedWorkoutIds?: string[] | null;
  /** Optional on legacy saves; updated independently of the last-60 display history. */
  totals?: ProfileTotals;
  xp: number;
  coins: number;
  workouts: Workout[];
  game: GameState;
}

export interface ProfileLoadResult {
  profile: Profile;
  status: 'ready' | 'empty' | 'recovery-required' | 'unavailable';
  backupAvailable: boolean;
  /** Exact observed primary value for optimistic stale-tab detection; never sent to a server. */
  revision: string | null;
}

export type ProfilePersistResult = 'saved' | 'recovery-required' | 'unavailable' | 'conflict';
export type ProfileWriteResult =
  | { status: 'saved'; revision: string }
  | { status: Exclude<ProfilePersistResult, 'saved'> };

export const EMPTY_PROFILE: Profile = { xp: 0, coins: 0, workouts: [], game: freshGame() };

export function getLevel(xp: number): number {
  return Math.floor(Math.max(0, xp) / 250) + 1;
}

export function getLevelProgress(xp: number): number {
  return (Math.max(0, xp) % 250) / 250;
}

export function getRank(workoutCount: number): string {
  if (workoutCount >= 20) return 'ЛЕГЕНДА КУЗНИ';
  if (workoutCount >= 8) return 'ЖЕЛЕЗНЫЙ БОЕЦ';
  if (workoutCount >= 3) return 'УЧЕНИК КУЗНИ';
  return 'НОВОБРАНЕЦ';
}

export function formatTime(milliseconds: number): string {
  const centiseconds = Math.max(0, Math.floor(milliseconds / 10));
  const seconds = Math.floor(centiseconds / 100);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
}

export function bestTime(workouts: Workout[]): number | null {
  const valid = workouts.filter((workout) => workout.repetitions === TARGET_REPS && workout.durationMs > 0);
  return valid.length ? Math.min(...valid.map((workout) => workout.durationMs)) : null;
}

export interface WorkoutOptions { mode?: WorkoutMode; splitsMs?: number[]; sessionId?: string }

export function getProfileTotals(profile: Profile): ProfileTotals {
  const history = { workouts: profile.workouts.length, repetitions: profile.workouts.reduce((sum, w) => sum + w.repetitions, 0), bestDurationMs: bestTime(profile.workouts) };
  const t = profile.totals;
  if (!t || !Number.isSafeInteger(t.workouts) || t.workouts < history.workouts ||
      !Number.isSafeInteger(t.repetitions) || t.repetitions !== t.workouts * TARGET_REPS ||
      (t.bestDurationMs !== null && (!Number.isFinite(t.bestDurationMs) || t.bestDurationMs <= 0))) return history;
  const candidates = [t.bestDurationMs, history.bestDurationMs].filter((v): v is number => v !== null);
  return { workouts: t.workouts, repetitions: t.repetitions, bestDurationMs: candidates.length ? Math.min(...candidates) : null };
}

function validWorkoutSplits(splits: unknown, durationMs: number): splits is number[] {
  // Saves and runtime input can violate TypeScript types; array-like values are not split times.
  return Array.isArray(splits) && splits.length === TARGET_REPS && Array.from(splits).every((ms, i) =>
    typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 && ms <= durationMs
      && (i === 0 || ms >= splits[i - 1]));
}

const validWorkoutId = (id: unknown): id is string =>
  typeof id === 'string' && id.trim().length > 0 && id.length <= 128;

function ambiguousWorkoutIds(profile: object): boolean {
  if (!('creditedWorkoutIds' in profile)) return false;
  const value = (profile as { creditedWorkoutIds: unknown }).creditedWorkoutIds;
  return !Array.isArray(value) || !Array.from(value).every(validWorkoutId);
}

function creditedWorkoutIds(value: unknown, history: Workout[]): Set<string> {
  const ids = Array.isArray(value) ? value.filter(validWorkoutId) : [];
  // Seed every known legacy ID before trimming a record from the visible history.
  return new Set([...ids, ...history.map((workout) => workout.id).filter(validWorkoutId)]);
}

/** Applies a verified *local* camera result; not an anti-cheat proof for online PvP. */
export function addCompletedWorkout(
  profile: Profile, durationMs: number, now = new Date(), options: WorkoutOptions = {},
): Profile {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Время тренировки должно быть положительным');
  if (options.sessionId !== undefined && !validWorkoutId(options.sessionId)) throw new Error('Invalid workout session ID');
  if (ambiguousWorkoutIds(profile)) throw new Error('Reward identity ledger requires recovery');
  const credited = creditedWorkoutIds(profile.creditedWorkoutIds, profile.workouts);
  if (options.sessionId && credited.has(options.sessionId)) return profile;
  const totals = getProfileTotals(profile);
  const splits = options.splitsMs;
  const validSplits = validWorkoutSplits(splits, durationMs);
  const workout: Workout = {
    id: options.sessionId ?? `${now.getTime()}-${Math.random().toString(36).slice(2, 9)}`,
    finishedAt: now.toISOString(),
    durationMs,
    repetitions: TARGET_REPS,
    xp: XP_REWARD,
    mode: options.mode ?? 'training',
    ...(validSplits ? { splitsMs: [...splits] } : {}),
  };
  const updated: Profile = {
    ...(profile.profileId ? { profileId: profile.profileId } : {}),
    creditedWorkoutIds: [...credited, workout.id],
    xp: profile.xp + XP_REWARD,
    coins: profile.coins + COIN_REWARD,
    workouts: [workout, ...profile.workouts].slice(0, 60),
    game: normalizeGame(profile.game),
    totals: { workouts: totals.workouts + 1, repetitions: totals.repetitions + TARGET_REPS, bestDurationMs: Math.min(totals.bestDurationMs ?? durationMs, durationMs) },
  };
  const withGhost = validSplits ? storeGhost(updated, durationMs, splits) : updated;
  return options.mode === 'tower' ? beatTowerFloor(withGhost, durationMs) : withGhost;
}

function validProfileRoot(value: unknown): value is Pick<Profile, 'xp' | 'coins' | 'workouts'> & { game?: unknown } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Partial<Profile>;
  return typeof record.xp === 'number' && Number.isFinite(record.xp) && record.xp >= 0
    && typeof record.coins === 'number' && Number.isFinite(record.coins) && record.coins >= 0
    && Array.isArray(record.workouts);
}

export function parseProfile(value: unknown): Profile {
  if (!validProfileRoot(value)) return { ...EMPTY_PROFILE, workouts: [], game: freshGame() };
  const record = value;
  const history = record.workouts.filter((item): item is Workout => {
    if (typeof item !== 'object' || item === null) return false;
    return typeof item.id === 'string' && typeof item.finishedAt === 'string'
      && Number.isFinite(Date.parse(item.finishedAt))
      && typeof item.durationMs === 'number' && Number.isFinite(item.durationMs) && item.durationMs > 0
      && item.repetitions === TARGET_REPS && typeof item.xp === 'number' && Number.isFinite(item.xp) && item.xp >= 0;
  });
  const workouts = history.slice(0, 60).map((workout) => {
    const { splitsMs, mode, ...rest } = workout;
    return {
      ...rest,
      ...(mode === 'training' || mode === 'tower' || mode === 'ghost' ? { mode } : {}),
      ...(validWorkoutSplits(splitsMs, workout.durationMs) ? { splitsMs: [...splitsMs] } : {}),
    };
  });
  const parsed: Profile = { xp: record.xp, coins: record.coins, workouts, game: normalizeGame(record.game) };
  if ('profileId' in record && validWorkoutId(record.profileId)) parsed.profileId = record.profileId;
  if ('creditedWorkoutIds' in record || history.length > 60) {
    // Silently discarding a damaged dedup ledger can replay a paid result once
    // it leaves the last-60 history. Keep ambiguity visible after serialization.
    parsed.creditedWorkoutIds = ambiguousWorkoutIds(record) ? null
      : [...creditedWorkoutIds('creditedWorkoutIds' in record ? record.creditedWorkoutIds : undefined, history)];
  }
  const totals = 'totals' in record && typeof record.totals === 'object' && record.totals !== null
    ? record.totals as ProfileTotals : undefined;
  if (totals || history.length > 60) {
    parsed.totals = getProfileTotals({ ...parsed, workouts: history, totals });
  }
  return parsed;
}

function decodeStoredProfile(raw: string | null, allowAmbiguousIds = false): Profile | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return validProfileRoot(value) && (allowAmbiguousIds || !ambiguousWorkoutIds(value)) ? parseProfile(value) : null;
  } catch {
    return null;
  }
}

export function loadProfileState(): ProfileLoadResult {
  const empty = parseProfile(null);
  if (typeof window === 'undefined') return { profile: empty, status: 'unavailable', backupAvailable: false, revision: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const profile = decodeStoredProfile(raw);
    if (profile) return { profile, status: 'ready', backupAvailable: false, revision: raw };
    const backupRaw = localStorage.getItem(PROFILE_BACKUP_KEY);
    return {
      // A readable wallet is preserved for inspection/export, but cannot
      // authorize rewards while the identity ledger needs explicit recovery.
      profile: decodeStoredProfile(raw, true) ?? empty,
      status: raw !== null || backupRaw !== null ? 'recovery-required' : 'empty',
      backupAvailable: decodeStoredProfile(backupRaw) !== null,
      revision: raw,
    };
  } catch {
    return { profile: empty, status: 'unavailable', backupAvailable: false, revision: null };
  }
}

/** Compatibility wrapper. Automatic persistence still independently protects unreadable originals. */
export function loadProfile(): Profile {
  return loadProfileState().profile;
}

function writeVerified(key: string, raw: string): boolean {
  localStorage.setItem(key, raw);
  return localStorage.getItem(key) === raw;
}

/** Acknowledges only this write's verified revision. Another tab may change the
 * primary immediately afterwards; its revision must never be adopted as ours. */
export function saveProfile(profile: Profile, options: { expectedRaw?: string | null } = {}): ProfileWriteResult {
  if (!validProfileRoot(profile)) return { status: 'unavailable' };
  if (ambiguousWorkoutIds(profile)) return { status: 'recovery-required' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Detect a stale tab BEFORE altering the validated backup. This is optimistic
    // conflict detection, not server-authoritative or a transactional anti-cheat.
    if ('expectedRaw' in options && raw !== options.expectedRaw) return { status: 'conflict' };
    const previous = decodeStoredProfile(raw);
    // Recheck on every save, including the initial React effect and other tabs' changes.
    if (raw !== null && !previous) return { status: 'recovery-required' };
    if (raw === null && localStorage.getItem(PROFILE_BACKUP_KEY) !== null) return { status: 'recovery-required' };
    const next = JSON.stringify(parseProfile(profile));
    // React StrictMode/reload must not replace yesterday's fallback with an
    // identical current snapshot. Seed a backup only when it is missing/invalid.
    if (previous && JSON.stringify(previous) === next && decodeStoredProfile(localStorage.getItem(PROFILE_BACKUP_KEY))) {
      if (localStorage.getItem(STORAGE_KEY) !== raw) return { status: 'conflict' };
      return raw === next || writeVerified(STORAGE_KEY, next)
        ? { status: 'saved', revision: next } : { status: 'unavailable' };
    }
    const backup = previous ? JSON.stringify(previous) : next;
    // Preserve a validated fallback before touching the primary; quota/no-op failures fail closed.
    if (!writeVerified(PROFILE_BACKUP_KEY, backup)) return { status: 'unavailable' };
    if (localStorage.getItem(STORAGE_KEY) !== raw) return { status: 'recovery-required' };
    return writeVerified(STORAGE_KEY, next)
      ? { status: 'saved', revision: next } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Existing callers retain the status-only API. React uses the revision receipt. */
export function persistProfile(profile: Profile, options: { expectedRaw?: string | null } = {}): ProfilePersistResult {
  return saveProfile(profile, options).status;
}

/** Explicit user action only: preserve the exact damaged original before replacing it. */
export function recoverProfile(source: 'backup' | 'empty'): ProfileLoadResult {
  const state = loadProfileState();
  if (state.status !== 'recovery-required') return state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const backupRaw = localStorage.getItem(PROFILE_BACKUP_KEY);
    const restored = source === 'backup' ? decodeStoredProfile(backupRaw) : parseProfile(null);
    if (!restored) return state;
    // If the primary was removed, preserve the surviving backup before a deliberate fresh start.
    const original = raw ?? backupRaw;
    if (original !== null) {
      let preserved = false;
      for (let index = 0; index < 1000; index += 1) {
        const key = `${QUARANTINE_PREFIX}${index}`;
        const existing = localStorage.getItem(key);
        if (existing === original) { preserved = true; break; }
        if (existing === null) { preserved = writeVerified(key, original); break; }
      }
      if (!preserved) return { ...state, status: 'unavailable' };
    }
    // A changed primary is never overwritten using a stale recovery decision.
    if (localStorage.getItem(STORAGE_KEY) !== raw) return loadProfileState();
    if (!writeVerified(STORAGE_KEY, JSON.stringify(restored))) return { ...state, status: 'unavailable' };
    return loadProfileState();
  } catch {
    return { ...state, status: 'unavailable' };
  }
}
