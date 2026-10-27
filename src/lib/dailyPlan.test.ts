import { describe, expect, it } from 'vitest';
import { completedSquatsToday, DAILY_PLAN_KEY, readDailyPlan, saveDailyPlan, validDailyGoal } from './dailyPlan';
import type { Workout } from './progression';

const store = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    raw: (value: string) => data.set(DAILY_PLAN_KEY, value),
  };
};
describe('daily training plans', () => {
  it('is user-configurable and independent of rewarded profile', () => {
    const storage = store();
    expect(readDailyPlan(storage).plan.targetReps).toBe(20);
    expect(saveDailyPlan(40, storage)).toBe(true);
    expect(readDailyPlan(storage)).toEqual({ status: 'ready', plan: { version: 1, targetReps: 40 } });
    expect(storage.getItem(DAILY_PLAN_KEY)).toBe('{"version":1,"targetReps":40}');
  });
  it('rejects malformed, negative, fractional, infinite or excessive targets', () => {
    for (const value of [0, -5, 3.5, 201, 205, Number.POSITIVE_INFINITY, NaN, 6]) {
      expect(validDailyGoal(value)).toBe(false);
      expect(saveDailyPlan(value, store())).toBe(false);
    }
    expect(validDailyGoal(20)).toBe(true);
    const storage = store();
    storage.raw('{"version":1,"targetReps":9999}');
    expect(readDailyPlan(storage).status).toBe('invalid');
    storage.raw('{"version":2,"targetReps":40}');
    expect(readDailyPlan(storage).status).toBe('invalid');
    storage.raw('broken-json');
    expect(readDailyPlan(storage).status).toBe('invalid');
  });
  it('never claims a preference was saved when storage throws', () => {
    const unavailable = {
      getItem: (_: string): string => { throw Error('quota'); },
      setItem: (_: string, __: string) => { throw Error('quota'); },
    };
    expect(readDailyPlan(unavailable).status).toBe('unavailable');
    expect(saveDailyPlan(40, unavailable)).toBe(false);
  });
  it('counts only saved full repetitions today and deduplicates workout IDs', () => {
    const now = new Date(2026, 9, 22, 16, 0);
    const workout = (id: string, finishedAt: string, repetitions = 20): Workout =>
      ({ id, finishedAt, repetitions, durationMs: 95_000, xp: 120 });
    const today = new Date(2026, 9, 22, 9, 0).toISOString();
    const yesterday = new Date(2026, 9, 21, 9, 0).toISOString();
    const workouts = [workout('one', today), workout('one', today), workout('two', today),
      workout('three', yesterday), workout('four', today, 10),
      workout('five', 'broken'), workout('six', today, 0)];
    expect(completedSquatsToday(workouts, now)).toBe(40);
    expect(completedSquatsToday(workouts, new Date(2026, 9, 23, 10))).toBe(0);
    expect(completedSquatsToday([], now)).toBe(0);
    expect(completedSquatsToday(workouts, new Date(Number.NaN))).toBe(0);
  });
  it('does not let an invalid duplicate id hide a later valid completed squat', () => {
    const now = new Date(2026, 9, 27, 12);
    const full: Workout = { id:'duplicate', finishedAt:now.toISOString(),
      durationMs:60000, repetitions:20, xp:120, exerciseId:'squat' };
    const workouts: Workout[] = [
      { ...full, repetitions: 1 },
      { ...full, finishedAt:'not-a-date' },
      full, { ...full, id:'second' }, { ...full, id:'second' },
    ];
    expect(completedSquatsToday(workouts,now)).toBe(40);
  });
  it('never awards squat-day progress for pushups, plank or other exercises', () => {
    const today = new Date(2026, 9, 27, 12);
    const base: Workout = { id: 'squat-legacy', finishedAt: today.toISOString(),
      durationMs: 60000, repetitions: 20, xp: 120 };
    const workouts: Workout[] = [
      { ...base, id: 'pushup', exerciseId: 'pushup' },
      { ...base, id: 'lunge', exerciseId: 'lunge' },
      { ...base, id: 'plank', exerciseId: 'plank', repetitions: 0, holdSeconds: 30 },
      base,
      { ...base, id: 'squat-explicit', exerciseId: 'squat' },
    ];
    expect(completedSquatsToday(workouts, today)).toBe(40);
    expect(completedSquatsToday(workouts.slice(0, 3), today)).toBe(0);
  });
});
