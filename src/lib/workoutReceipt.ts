import type { Workout } from './progression';

type GrantSource = 'workout-base' | 'tower-first-clear';
type Wallet = { xp: number; coins: number };
type WorkoutGoal = { unit: 'repetitions'; target: 20 } | { unit: 'seconds'; target: 30 };

export interface RewardGrant {
  schemaVersion: 1;
  policyVersion: 1;
  rewardId: string;
  sourceType: GrantSource;
  sourceId: string;
  xpDelta: number;
  coinDelta: number;
  grantedAt: string;
}

export interface WorkoutReceipt {
  schemaVersion: 1;
  workoutId: string;
  goal: WorkoutGoal;
  grants: [RewardGrant] | [RewardGrant, RewardGrant];
}

function goalFor(workout: Workout): WorkoutGoal {
  return workout.exerciseId === 'plank'
    ? { unit: 'seconds', target: 30 }
    : { unit: 'repetitions', target: 20 };
}

function grantIdentity(workout: Workout, sourceType: GrantSource) {
  return { schemaVersion: 1 as const, policyVersion: 1 as const, sourceType,
    rewardId: sourceType + ':' + workout.id, sourceId: workout.id, grantedAt: workout.finishedAt };
}

/** Evidence of the transitions that already ran, never input to a reward write. */
export function recordWorkoutReceipt(
  workout: Workout, before: Wallet, base: Wallet, towerAward?: Wallet,
): WorkoutReceipt {
  const grants: [RewardGrant] = [{
    ...grantIdentity(workout, 'workout-base'), xpDelta: base.xp - before.xp, coinDelta: base.coins - before.coins,
  }];
  return { schemaVersion: 1, workoutId: workout.id, goal: goalFor(workout),
    grants: towerAward ? [...grants, {
      ...grantIdentity(workout, 'tower-first-clear'), xpDelta: towerAward.xp - base.xp, coinDelta: towerAward.coins - base.coins,
    }] : grants };
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const nonnegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function readGrant(value: unknown, workout: Workout, sourceType: GrantSource): RewardGrant | null {
  const identity = grantIdentity(workout, sourceType);
  if (!record(value) || Object.entries(identity).some(([key, expected]) => value[key] !== expected) ||
      !nonnegative(value.xpDelta) || !nonnegative(value.coinDelta)) return null;
  return { ...identity, xpDelta: value.xpDelta, coinDelta: value.coinDelta };
}

/** Optional historical evidence. Missing, corrupt and future values are opaque
 * to current callers; never estimate historical grants from today's economy. */
export function readWorkoutReceipt(workout: Workout): WorkoutReceipt | null {
  const value = workout.receipt;
  const goal = goalFor(workout);
  if (!record(value) || value.schemaVersion !== 1 || value.workoutId !== workout.id ||
      !record(value.goal) || value.goal.unit !== goal.unit || value.goal.target !== goal.target ||
      !Array.isArray(value.grants) || value.grants.length < 1 || value.grants.length > 2) return null;
  const base = readGrant(value.grants[0], workout, 'workout-base');
  if (!base) return null;
  if (value.grants.length === 1) return { schemaVersion: 1, workoutId: workout.id, goal, grants: [base] };
  const tower = workout.mode === 'tower' ? readGrant(value.grants[1], workout, 'tower-first-clear') : null;
  return tower ? { schemaVersion: 1, workoutId: workout.id, goal, grants: [base, tower] } : null;
}
