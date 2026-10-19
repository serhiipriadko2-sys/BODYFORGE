import { describe, expect, it } from 'vitest';
import { addCompletedWorkout, bestTime, EMPTY_PROFILE, formatTime, getLevel, getLevelProgress, TARGET_REPS } from './progression';

describe('RPG progression', () => {
  it('awards XP and coins once per completed workout', () => {
    const result = addCompletedWorkout(EMPTY_PROFILE, 17420, new Date('2026-10-19T10:00:00Z'));
    expect(result.xp).toBe(120);
    expect(result.coins).toBe(35);
    expect(result.workouts[0].repetitions).toBe(TARGET_REPS);
    expect(bestTime(result.workouts)).toBe(17420);
  });
  it('levels up after earning enough XP', () => {
    expect(getLevel(0)).toBe(1);
    expect(getLevel(240)).toBe(1);
    expect(getLevel(360)).toBe(2);
    expect(getLevelProgress(360)).toBeCloseTo(110 / 250);
  });
  it('formats elapsed time in minutes, seconds and centiseconds', () => {
    expect(formatTime(17420)).toBe('00:17.42');
    expect(formatTime(65030)).toBe('01:05.03');
  });
  it('rejects invalid durations', () => {
    expect(() => addCompletedWorkout(EMPTY_PROFILE, 0)).toThrow();
  });
});
