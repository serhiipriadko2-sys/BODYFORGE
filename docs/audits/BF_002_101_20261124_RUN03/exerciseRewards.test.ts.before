import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshGame } from './game';
import { getProfileTotals, parseProfile, addCompletedWorkout, STORAGE_KEY, type Profile } from './progression';
import { commitWorkoutResult, resultJournalEntry, type CompletedWorkoutResult } from './workoutJournal';

const profile = (): Profile => ({ profileId: 'profile-verified', xp: 0, coins: 0,
  workouts: [], game: { ...freshGame(), created: true } });
const result = (id: 'pushup' | 'plank', changes: Partial<CompletedWorkoutResult> = {}): CompletedWorkoutResult => ({
  schemaVersion: 1, profileId: 'profile-verified', sessionId: 'session-' + id,
  mode: 'training', floor: null, exerciseId: id,
  durationMs: 40_000, finishedAt: '2026-10-27T12:00:00Z',
  repetitions: id === 'plank' ? 0 : 20,
  ...(id === 'plank' ? { holdSeconds: 30 as const } : {}),
  ...changes,
});
function mockStorage() {
  const storage = new Map([[STORAGE_KEY, JSON.stringify(profile())]]);
  const getItem = vi.fn((key: string) => storage.get(key) ?? null);
  const setItem = vi.fn((key: string,value: string) => { storage.set(key,value); });
  const removeItem = vi.fn((key: string) => { storage.delete(key); });
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', { getItem,setItem,removeItem,
    key: (i:number) => [...storage.keys()][i] ?? null, get length() {return storage.size;} });
  return { storage };
}
afterEach(() => vi.unstubAllGlobals());

describe('exercise-specific durable reward integrity', () => {
  it('preserves older squat records and a new timed plank through a profile parse', () => {
    const old = addCompletedWorkout(profile(), 55_000);
    const next = addCompletedWorkout(old, 40_000, new Date('2026-10-27T12:00:00Z'),
      { exerciseId:'plank', mode:'training', holdSeconds:30, sessionId:'plank-test' });
    const parsed = parseProfile(JSON.parse(JSON.stringify(next)));
    expect(parsed.workouts).toHaveLength(2);
    expect(parsed.workouts[0]).toMatchObject({ exerciseId:'plank', repetitions:0, holdSeconds:30 });
    expect(parsed.workouts[1].exerciseId).toBeUndefined();
    expect(getProfileTotals(parsed)).toMatchObject({ workouts:2, repetitions:20, holdSeconds:30, bestDurationMs:55_000 });
  });
  it('rejects malformed targets and competitive reward attempts for other exercises', () => {
    expect(resultJournalEntry(result('plank',{ holdSeconds:undefined }))).toBeNull();
    expect(resultJournalEntry(result('plank',{ repetitions:20 }))).toBeNull();
    expect(resultJournalEntry(result('pushup',{ mode:'tower', floor:1 }))).toBeNull();
    expect(resultJournalEntry(result('pushup',{ exerciseId:'unknown' as 'pushup' }))).toBeNull();
    expect(() => addCompletedWorkout(profile(), 40000, new Date(), {
      exerciseId:'plank', holdSeconds:22, mode:'training',
    })).toThrow();
  });
  it('saves each kind once and never repeats the reward', () => {
    const { storage } = mockStorage();
    const pushup = result('pushup');
    expect(commitWorkoutResult(pushup).status).toBe('saved');
    expect(commitWorkoutResult(pushup).status).toBe('saved');
    const plank = result('plank');
    expect(commitWorkoutResult(plank).status).toBe('saved');
    expect(commitWorkoutResult(plank).status).toBe('saved');
    const saved = JSON.parse(storage.get(STORAGE_KEY)!);
    expect(saved.xp).toBe(240);
    expect(saved.coins).toBe(70);
    expect(saved.workouts).toHaveLength(2);
    expect(saved.creditedWorkoutIds).toEqual(expect.arrayContaining([pushup.sessionId, plank.sessionId]));
    expect(getProfileTotals(parseProfile(saved))).toMatchObject({
      workouts:2, repetitions:20, holdSeconds:30,
    });
  });
});
