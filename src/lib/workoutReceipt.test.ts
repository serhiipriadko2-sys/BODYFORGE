import { describe, expect, it } from 'vitest';
import { freshGame } from './game';
import { addCompletedWorkout, parseProfile, type Profile, type Workout } from './progression';
import { readWorkoutReceipt } from './workoutReceipt';

const date = new Date('2026-11-24T12:00:00.000Z');
const splits = Array.from({ length: 20 }, (_, index) => (index + 1) * 2_000);
const initial: Profile = {
  profileId: 'fighter', xp: 400, coins: 91, workouts: [], creditedWorkoutIds: [],
  game: { ...freshGame(), created: true, build: 'solid', outfit: 'ember', ownedOutfits: ['base', 'ember'] },
};
const roundTrip = (value: unknown) => parseProfile(JSON.parse(JSON.stringify(value)));

describe('versioned training evidence', () => {
  it('records the two exact observed awards with distinct identities on a first tower clear', () => {
    const result = addCompletedWorkout(initial, 65_000, date, { mode: 'tower', sessionId: 'clear' });
    const receipt = readWorkoutReceipt(result.workouts[0]);
    expect(receipt).toMatchObject({
      schemaVersion: 1, workoutId: 'clear', goal: { unit: 'repetitions', target: 20 },
      grants: [
        { schemaVersion: 1, policyVersion: 1, rewardId: 'workout-base:clear', sourceType: 'workout-base',
          sourceId: 'clear', xpDelta: 120, coinDelta: 35, grantedAt: date.toISOString() },
        { schemaVersion: 1, policyVersion: 1, rewardId: 'tower-first-clear:clear', sourceType: 'tower-first-clear',
          sourceId: 'clear', xpDelta: 65, coinDelta: 30, grantedAt: date.toISOString() },
      ],
    });
    expect(result.xp - initial.xp).toBe(185);
    expect(result.coins - initial.coins).toBe(65);
    const reloaded = roundTrip(result);
    expect(readWorkoutReceipt(reloaded.workouts[0])).toEqual(receipt);
    expect(addCompletedWorkout(reloaded, 65_000, date, { mode: 'tower', sessionId: 'clear' })).toBe(reloaded);
  });

  it('records distinct goals without inventing a tower grant when no floor was earned', () => {
    const failed = addCompletedWorkout(initial, 115_000, date, { mode: 'tower', sessionId: 'slow' });
    expect(readWorkoutReceipt(failed.workouts[0])?.grants.map((g) => g.sourceType)).toEqual(['workout-base']);
    expect(failed.game.highestClearedFloor).toBe(0);
    const plank = addCompletedWorkout(failed, 31_500, date,
      { exerciseId: 'plank', holdSeconds: 30, sessionId: 'plank' });
    expect(readWorkoutReceipt(roundTrip(plank).workouts[0])).toMatchObject({
      goal: { unit: 'seconds', target: 30 }, grants: [{ xpDelta: 120, coinDelta: 35 }],
    });
    expect(plank.workouts[0]).toMatchObject({ repetitions: 0, holdSeconds: 30 });
    expect(plank.totals).toMatchObject({ workouts: 2, repetitions: 20, holdSeconds: 30 });
  });

  it('keeps the old history, full dedup, wallet, ghost and ownership intact', () => {
    const history: Workout[] = Array.from({ length: 60 }, (_, index) => ({
      id: 'legacy-' + index, finishedAt: date.toISOString(), durationMs: 60_000, repetitions: 20, xp: 100,
    }));
    const legacy = {
      ...initial, workouts: history, creditedWorkoutIds: [...history.map((w) => w.id), 'paid-outside-window'],
      totals: { workouts: 65, repetitions: 1300, bestDurationMs: 45_000 },
      game: { ...initial.game, bestGhost: { durationMs: 45_000, splitsMs: splits }, highestClearedFloor: 3 },
    };
    const restored = roundTrip(legacy);
    expect(restored).toEqual(legacy);
    expect(restored.workouts.every((w) => readWorkoutReceipt(w) === null && !('receipt' in w))).toBe(true);
    const newer = roundTrip(addCompletedWorkout(restored, 49_000, date, { sessionId: 'newer', splitsMs: splits }));
    expect(newer.workouts).toHaveLength(60);
    expect(newer.workouts[1]).toEqual(history[0]);
    expect(newer.totals).toEqual({ workouts: 66, repetitions: 1320, bestDurationMs: 45_000 });
    expect(newer.game).toEqual(legacy.game);
    expect(newer.creditedWorkoutIds).toEqual([...legacy.creditedWorkoutIds, 'newer']);
    expect(addCompletedWorkout(newer, 49_000, date, { sessionId: 'paid-outside-window' })).toBe(newer);
    expect(roundTrip(newer)).toEqual(newer);
  });

  it('preserves opaque future and malformed receipts without treating any of them as known evidence', () => {
    const result = addCompletedWorkout(initial, 53_000, date, { sessionId: 'known' });
    const row = result.workouts[0];
    const known = readWorkoutReceipt(row)!;
    const options: unknown[] = [
      null, false, [], {}, { ...known, schemaVersion: 2, untouched: [1, 'x'] },
      { ...known, workoutId: 'wrong' }, { ...known, goal: { unit: 'seconds', target: 30 } },
      { ...known, grants: [] }, { ...known, grants: [null] },
      { ...known, grants: [{ ...known.grants[0], rewardId: 'forged' }] },
      { ...known, grants: [{ ...known.grants[0], policyVersion: 2 }] },
      { ...known, grants: [{ ...known.grants[0], coinDelta: -2 }] },
      { ...known, grants: [known.grants[0], known.grants[0]] },
    ];
    for (const receipt of options) {
      const source = { ...result, workouts: [{ ...row, receipt }] };
      const restored = roundTrip(source);
      expect(readWorkoutReceipt(restored.workouts[0])).toBeNull();
      expect(restored).toEqual(source);
      expect(roundTrip(restored)).toEqual(restored);
      expect(addCompletedWorkout(restored, 53_000, date, { sessionId: 'known' })).toBe(restored);
    }
  });

  it('round-trips deterministic varied inputs without changing the applied wallet delta or granting twice', () => {
    let seed = 917;
    const sample = (max: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % max;
    };
    for (let index = 0; index < 96; index++) {
      const prior = { ...initial, xp: sample(5000) / 100, coins: sample(5000) / 100 };
      const mode = (['training', 'tower', 'ghost'] as const)[index % 3];
      const duration = 40_000 + sample(100_000);
      const sessionId = 'seed:' + index;
      const credited = addCompletedWorkout(prior, duration, date, { mode, sessionId });
      const reloaded = roundTrip(credited);
      const evidence = readWorkoutReceipt(reloaded.workouts[0])!;
      expect(evidence.grants.reduce((total, grant) => total + grant.xpDelta, 0)).toBeCloseTo(credited.xp - prior.xp, 10);
      expect(evidence.grants.reduce((total, grant) => total + grant.coinDelta, 0)).toBeCloseTo(credited.coins - prior.coins, 10);
      expect(addCompletedWorkout(reloaded, duration, date, { mode, sessionId })).toBe(reloaded);
      expect(roundTrip(reloaded)).toEqual(reloaded);
    }
  });
});
