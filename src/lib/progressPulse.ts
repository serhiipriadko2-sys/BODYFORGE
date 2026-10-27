import { localDay } from './game';
import type { Workout } from './progression';
import { isExerciseId } from './trainingCatalog';

export type PulseRange = 7 | 30;
export type PulseDay = { date: string; label: string; sessions: number; reps: number; holdSeconds?: number };
export type PulseTrend = { days: PulseDay[]; sessions: number; reps: number; holdSeconds: number; activeDays: number; peak: number };
export type PulseComparison = {
  current: PulseTrend; previous: PulseTrend; deltaSessions: number;
  /** Only the 60 most recent workouts are retained as detailed history. */
  historyLimited: boolean;
};

const EMPTY: PulseTrend = { days: [], sessions: 0, reps: 0, holdSeconds: 0, activeDays: 0, peak: 0 };

/**
 * Exactly 7 or 30 LOCAL calendar days, not a rolling fixed 24-hour duration.
 * Only verified full sessions count (20 repetitions or 30 seconds of plank). Dates, time zones, and DST are
 * resolved using noon on the local calendar to avoid midnight transitions.
 * Rendering never writes to the game profile or creates reward entries.
 */
export function activityPulse(
  workouts: readonly Workout[], now: Date, range: PulseRange = 7,
): PulseTrend {
  if (!Number.isFinite(now.getTime()) || (range !== 7 && range !== 30)) return { ...EMPTY, days: [] };
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
  const days: PulseDay[] = Array.from({ length: range }, (_, index) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (range - 1) + index, 12);
    return {
      date: localDay(day),
      label: weekday.format(day).replace('.', '').toUpperCase(),
      sessions: 0, reps: 0, holdSeconds: 0,
    };
  });
  const byDay = new Map(days.map(day => [day.date, day]));
  const seen = new Set<string>();
  for (const workout of workouts) {
    if (typeof workout.id !== 'string' || !workout.id.trim() || seen.has(workout.id)) continue;
    const isPlank = workout.exerciseId === 'plank';
    if (isPlank ? workout.repetitions !== 0 || workout.holdSeconds !== 30
      : workout.repetitions !== 20 || (workout.exerciseId !== undefined && !isExerciseId(workout.exerciseId))) continue;
    const when = new Date(workout.finishedAt);
    if (!Number.isFinite(when.getTime())) continue;
    const day = byDay.get(localDay(when));
    if (!day) continue;
    seen.add(workout.id);
    day.sessions += 1;
    day.reps += isPlank ? 0 : 20;
    day.holdSeconds = (day.holdSeconds ?? 0) + (isPlank ? 30 : 0);
  }
  return {
    days,
    sessions: days.reduce((count, day) => count + day.sessions, 0),
    reps: days.reduce((count, day) => count + day.reps, 0),
    holdSeconds: days.reduce((seconds, day) => seconds + (day.holdSeconds ?? 0), 0),
    activeDays: days.filter(day => day.sessions > 0).length,
    peak: Math.max(0, ...days.map(day => day.sessions)),
  };
}

/** Kept as the backwards-compatible seven-day view of activityPulse. */
export function weeklyPulse(workouts: readonly Workout[], now: Date): PulseTrend {
  return activityPulse(workouts, now, 7);
}

/** Compare two non-overlapping periods with equal LOCAL-calendar lengths.
 * When the displayed history hits the 60-entry retention ceiling, suppress
 * potentially misleading comparisons, not the current visible period.
 */
export function comparePulsePeriods(
  workouts: readonly Workout[], now: Date, range: PulseRange,
): PulseComparison {
  const current = activityPulse(workouts, now, range);
  if (!current.days.length) return {
    current, previous: { ...EMPTY, days: [] }, deltaSessions: 0,
    historyLimited: workouts.length >= 60,
  };
  const previousEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - range, 12);
  const previous = activityPulse(workouts, previousEnd, range);
  return {
    current, previous, deltaSessions: current.sessions - previous.sessions,
    historyLimited: workouts.length >= 60,
  };
}
