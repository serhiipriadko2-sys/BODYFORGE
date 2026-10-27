import { localDay } from './game';
import type { Workout } from './progression';

export const DAILY_PLAN_KEY = 'bodyforge:daily-plan:v1';
export const DEFAULT_DAILY_REPS = 20;
export const MAX_DAILY_REPS = 200;
// This daily target is specifically for squats; other completed exercise types do not qualify.
export const GOAL_INCREMENT = 20;

export interface DailyPlan {
  version: 1;
  targetReps: number;
}
export type GoalRead = { status: 'ready' | 'unavailable' | 'invalid'; plan: DailyPlan };
export const DEFAULT_DAILY_PLAN: DailyPlan = Object.freeze({ version: 1, targetReps: DEFAULT_DAILY_REPS });

export function validDailyGoal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= GOAL_INCREMENT && value <= MAX_DAILY_REPS &&
    value % GOAL_INCREMENT === 0;
}

export function readDailyPlan(storage?: Pick<Storage, 'getItem'>): GoalRead {
  try {
    const store = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    if (!store) return { status: 'unavailable', plan: { ...DEFAULT_DAILY_PLAN } };
    const raw = store.getItem(DAILY_PLAN_KEY);
    if (raw === null) return { status: 'ready', plan: { ...DEFAULT_DAILY_PLAN } };
    let value: unknown;
    try { value = JSON.parse(raw); }
    catch { return { status: 'invalid', plan: { ...DEFAULT_DAILY_PLAN } }; }
    if (typeof value !== 'object' || value === null || !('version' in value) || !('targetReps' in value)) {
      return { status: 'invalid', plan: { ...DEFAULT_DAILY_PLAN } };
    }
    const parsed = value as { version: unknown; targetReps: unknown };
    if (parsed.version !== 1 || !validDailyGoal(parsed.targetReps)) {
      return { status: 'invalid', plan: { ...DEFAULT_DAILY_PLAN } };
    }
    return { status: 'ready', plan: { version: 1, targetReps: parsed.targetReps } };
  } catch { return { status: 'unavailable', plan: { ...DEFAULT_DAILY_PLAN } }; }
}

export function saveDailyPlan(targetReps: number, storage?: Pick<Storage, 'setItem' | 'getItem'>): boolean {
  if (!validDailyGoal(targetReps)) return false;
  try {
    const store = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    if (!store) return false;
    const raw = JSON.stringify({ version: 1, targetReps });
    store.setItem(DAILY_PLAN_KEY, raw);
    return store.getItem(DAILY_PLAN_KEY) === raw;
  } catch { return false; }
}

/** Counts only actually saved full camera sessions, not an unfinished workout,
 * an unsaved in-memory result, an imported/manual estimate or a step count. */
export function completedSquatsToday(workouts: readonly Workout[], now: Date): number {
  if (!Number.isFinite(now.getTime())) return 0;
  const day = localDay(now);
  const ids = new Set<string>();
  let count = 0;
  for (const workout of workouts) {
    if (typeof workout.id !== 'string' || !workout.id.trim() || ids.has(workout.id)) continue;
    const ended = new Date(workout.finishedAt);
    if (!Number.isFinite(ended.getTime()) || localDay(ended) !== day) continue;
    if ((workout.exerciseId !== undefined && workout.exerciseId !== 'squat') ||
        !Number.isSafeInteger(workout.repetitions) || workout.repetitions !== 20) continue;
    ids.add(workout.id);
    count += 20;
  }
  return count;
}
