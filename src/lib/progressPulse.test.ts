import { describe, expect, it } from 'vitest';
import { activityPulse, comparePulsePeriods, weeklyPulse, type PulseRange } from './progressPulse';
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
  it('counts exactly thirty local dates across the New Year without adding phantom sessions', () => {
    const now = new Date(2026, 0, 2, 12);
    const workouts = [
      workout('first', new Date(2025, 11, 4, 18)),
      workout('last', new Date(2026, 0, 2, 9)),
      workout('mid', new Date(2025, 11, 22, 8)),
      workout('too-old', new Date(2025, 11, 3, 23, 59)),
    ];
    const data = activityPulse(workouts, now, 30);
    expect(data.days).toHaveLength(30);
    expect(data.days[0].date).toBe('2025-12-04');
    expect(data.days[29].date).toBe('2026-01-02');
    expect(data).toMatchObject({ sessions: 3, reps: 60, activeDays: 3, peak: 1 });
  });
  it('compares two equal, non-overlapping calendar periods without percentages', () => {
    const now = new Date(2026, 9, 26, 12);
    const entries = [
      workout('current-a', new Date(2026, 9, 20, 8)),
      workout('current-b', new Date(2026, 9, 26, 10)),
      workout('previous', new Date(2026, 9, 19, 10)),
      workout('outside', new Date(2026, 9, 12, 10)),
    ];
    const initial = JSON.stringify(entries);
    const result = comparePulsePeriods(entries, now, 7);
    expect(result).toMatchObject({
      deltaSessions: 1, historyLimited: false,
      current: { sessions: 2, activeDays: 2 },
      previous: { sessions: 1, activeDays: 1 },
    });
    expect(result.current.days[0].date).toBe('2026-10-20');
    expect(result.previous.days[6].date).toBe('2026-10-19');
    expect(JSON.stringify(entries)).toBe(initial);
  });
  it('does not double count an ID when the first matching row is unusable', () => {
    const now = new Date(2026, 9, 26, 12);
    const valid = workout('valid', new Date(2026, 9, 26, 11));
    const items = [
      { ...valid, repetitions: 11 },
      valid,
      valid,
      { ...workout('bad', new Date(2026, 9, 26, 11)), finishedAt: 'broken' },
    ];
    expect(activityPulse(items, now, 7)).toMatchObject({ sessions: 1, reps: 20 });
    expect(activityPulse(items, new Date(NaN), 30).days).toHaveLength(0);
    expect(activityPulse(items, now, 31 as PulseRange).days).toHaveLength(0);
  });
  it('marks comparisons as insufficient when detailed history reaches 60 saved rows', () => {
    const now = new Date(2026, 9, 26, 12);
    const recent = Array.from({ length: 60 }, (_, i) => workout('id-' + i, new Date(2026, 9, 26, 8)));
    expect(comparePulsePeriods(recent, now, 30)).toMatchObject({
      historyLimited: true, current: { sessions: 60 }, previous: { sessions: 0 },
    });
  });
});
