import { describe, expect, it } from 'vitest';
import { weeklyPulse } from './progressPulse';
import type { Workout } from './progression';
const workout = (id: string, date: Date, repetitions = 20): Workout => ({
  id, finishedAt: date.toISOString(), durationMs: 35000, repetitions, xp: 120,
});
describe('pulse dashboard — derived from stored, verified sessions', () => {
  it('has 7 local calendar buckets, including empty days, with no imaginary values', () => {
    const now = new Date(2026, 9, 26, 16);
    const data = weeklyPulse([], now);
    expect(data.days).toHaveLength(7);
    expect(data.days[6].date).toBe('2026-10-26');
    expect(data.days[0].date).toBe('2026-10-20');
    expect(data).toMatchObject({ sessions: 0, reps: 0, activeDays: 0, peak: 0 });
  });
  it('deduplicates session IDs, excludes incomplete and out-of-range rows', () => {
    const now = new Date(2026, 9, 26, 12);
    const today = new Date(2026, 9, 26, 10);
    const earlier = new Date(2026, 9, 24, 10);
    const old = new Date(2026, 9, 19, 10);
    const workouts = [
      workout('a', today), workout('a', today), workout('b', today),
      workout('c', earlier), workout('old', old), workout('partial', today, 10),
      { ...workout('broken', today), finishedAt: 'NaN' },
    ];
    const result = weeklyPulse(workouts, now);
    expect(result).toMatchObject({ sessions: 3, reps: 60, activeDays: 2, peak: 2 });
    expect(result.days[6]).toMatchObject({ sessions: 2, reps: 40 });
    expect(result.days[4]).toMatchObject({ sessions: 1, reps: 20 });
  });
  it('uses calendar boundaries rather than 168 hours and accepts DST weeks', () => {
    const now = new Date(2026, 9, 26, 1);
    const first = new Date(2026, 9, 20, 23, 59);
    expect(weeklyPulse([workout('edge', first)], now).sessions).toBe(1);
    expect(weeklyPulse([], new Date(NaN)).days).toHaveLength(0);
  });
});
