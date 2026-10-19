export const TARGET_REPS = 20;
export const XP_REWARD = 120;
export const COIN_REWARD = 35;
const STORAGE_KEY = 'bodyforge:pilot:v1';

export interface Workout {
  id: string;
  finishedAt: string;
  durationMs: number;
  repetitions: number;
  xp: number;
}

export interface Profile {
  xp: number;
  coins: number;
  workouts: Workout[];
}

export const EMPTY_PROFILE: Profile = { xp: 0, coins: 0, workouts: [] };

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

export function addCompletedWorkout(profile: Profile, durationMs: number, now = new Date()): Profile {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Время тренировки должно быть положительным');
  const workout: Workout = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 9)}`,
    finishedAt: now.toISOString(),
    durationMs,
    repetitions: TARGET_REPS,
    xp: XP_REWARD,
  };
  return {
    xp: profile.xp + XP_REWARD,
    coins: profile.coins + COIN_REWARD,
    workouts: [workout, ...profile.workouts].slice(0, 30),
  };
}

export function loadProfile(): Profile {
  if (typeof window === 'undefined') return EMPTY_PROFILE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_PROFILE;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return EMPTY_PROFILE;
    const record = value as Partial<Profile>;
    if (typeof record.xp !== 'number' || !Number.isFinite(record.xp) || record.xp < 0 ||
        typeof record.coins !== 'number' || !Number.isFinite(record.coins) || record.coins < 0 ||
        !Array.isArray(record.workouts)) return EMPTY_PROFILE;
    const workouts = record.workouts.filter((item): item is Workout =>
      typeof item === 'object' && item !== null &&
      typeof item.id === 'string' && typeof item.finishedAt === 'string' &&
      typeof item.durationMs === 'number' && Number.isFinite(item.durationMs) && item.durationMs > 0 &&
      item.repetitions === TARGET_REPS && typeof item.xp === 'number',
    ).slice(0, 30);
    return { xp: record.xp, coins: record.coins, workouts };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function persistProfile(profile: Profile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Private browsing and restricted storage can reject writes. Session still works.
  }
}
