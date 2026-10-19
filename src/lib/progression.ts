import {
  beatTowerFloor, freshGame, normalizeGame, storeGhost,
  type GameState, type WorkoutMode,
} from './game';

export const TARGET_REPS = 20;
export const XP_REWARD = 120;
export const COIN_REWARD = 35;
// Do not change the key: upgrading a game must not destroy prior workout progress.
const STORAGE_KEY = 'bodyforge:pilot:v1';

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

export interface Profile {
  xp: number;
  coins: number;
  workouts: Workout[];
  game: GameState;
}

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

export interface WorkoutOptions { mode?: WorkoutMode; splitsMs?: number[] }

/** Applies a verified *local* camera result; not an anti-cheat proof for online PvP. */
export function addCompletedWorkout(
  profile: Profile, durationMs: number, now = new Date(), options: WorkoutOptions = {},
): Profile {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Время тренировки должно быть положительным');
  const splits = options.splitsMs;
  const validSplits = splits && splits.length === TARGET_REPS && splits.every((ms, i) =>
    Number.isFinite(ms) && ms >= 0 && ms <= durationMs && (i === 0 || ms >= splits[i - 1]));
  const workout: Workout = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 9)}`,
    finishedAt: now.toISOString(),
    durationMs,
    repetitions: TARGET_REPS,
    xp: XP_REWARD,
    mode: options.mode ?? 'training',
    ...(validSplits ? { splitsMs: [...splits] } : {}),
  };
  const updated: Profile = {
    xp: profile.xp + XP_REWARD,
    coins: profile.coins + COIN_REWARD,
    workouts: [workout, ...profile.workouts].slice(0, 60),
    game: normalizeGame(profile.game),
  };
  const withGhost = validSplits ? storeGhost(updated, durationMs, splits) : updated;
  return options.mode === 'tower' ? beatTowerFloor(withGhost, durationMs) : withGhost;
}

export function parseProfile(value: unknown): Profile {
  const empty = (): Profile => ({ ...EMPTY_PROFILE, workouts: [], game: freshGame() });
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return empty();
  const record = value as Partial<Profile>;
  if (typeof record.xp !== 'number' || !Number.isFinite(record.xp) || record.xp < 0 ||
      typeof record.coins !== 'number' || !Number.isFinite(record.coins) || record.coins < 0 ||
      !Array.isArray(record.workouts)) return empty();
  const workouts = record.workouts.filter((item): item is Workout => {
    if (typeof item !== 'object' || item === null) return false;
    return typeof item.id === 'string' && typeof item.finishedAt === 'string'
      && Number.isFinite(Date.parse(item.finishedAt))
      && typeof item.durationMs === 'number' && Number.isFinite(item.durationMs) && item.durationMs > 0
      && item.repetitions === TARGET_REPS && typeof item.xp === 'number' && Number.isFinite(item.xp) && item.xp >= 0;
  }).slice(0, 60).map((workout) => {
    const splits = workout.splitsMs;
    if (!splits || splits.length !== TARGET_REPS || !splits.every((ms, i) =>
      Number.isFinite(ms) && ms >= 0 && ms <= workout.durationMs && (i === 0 || ms >= splits[i - 1]))) {
      const { splitsMs: _, ...rest } = workout;
      void _;
      return rest;
    }
    return workout;
  });
  return { xp: record.xp, coins: record.coins, workouts, game: normalizeGame(record.game) };
}

export function loadProfile(): Profile {
  if (typeof window === 'undefined') return { ...EMPTY_PROFILE, workouts: [], game: freshGame() };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseProfile(JSON.parse(raw) as unknown) : parseProfile(null);
  } catch {
    return parseProfile(null);
  }
}

export function persistProfile(profile: Profile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Restricted storage can reject writes. The current browser session still works.
  }
}
