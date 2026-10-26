import { localDay } from './game';
import type { Workout } from './progression';

export type PulseDay = { date: string; label: string; sessions: number; reps: number };
export type PulseTrend = { days: PulseDay[]; sessions: number; reps: number; activeDays: number; peak: number };

/**
 * Seven *local calendar* days, not 7x24h intervals (DST-safe).
 * Include only acknowledged 20-rep workouts from persisted profile, deduped
 * by session ID. Manual steps, camera-in-progress and estimates are excluded.
 */
export function weeklyPulse(workouts: readonly Workout[], now: Date): PulseTrend {
  if (!Number.isFinite(now.getTime())) return { days: [], sessions: 0, reps: 0, activeDays: 0, peak: 0 };
  const days: PulseDay[] = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index, 12, 0);
    return {
      date: localDay(day),
      label: new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(day).replace('.', '').toUpperCase(),
      sessions: 0,
      reps: 0,
    };
  });
  const byDay = new Map(days.map((d) => [d.date, d]));
  const seen = new Set<string>();
  for (const workout of workouts) {
    if (typeof workout.id !== 'string' || !workout.id || seen.has(workout.id)) continue;
    seen.add(workout.id);
    if (workout.repetitions !== 20) continue;
    const date = new Date(workout.finishedAt);
    if (!Number.isFinite(date.getTime())) continue;
    const day = byDay.get(localDay(date));
    if (!day) continue;
    day.sessions++;
    day.reps += 20;
  }
  return {
    days,
    sessions: days.reduce((count, day) => count + day.sessions, 0),
    reps: days.reduce((count, day) => count + day.reps, 0),
    activeDays: days.filter((day) => day.sessions > 0).length,
    peak: Math.max(0, ...days.map((day) => day.sessions)),
  };
}
