import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addCompletedWorkout, EMPTY_PROFILE, loadProfile, loadProfileState, parseProfile, persistProfile, saveProfile,
  PROFILE_BACKUP_KEY, recoverProfile, STORAGE_KEY, type Profile,
} from './progression';
import { buyOrEquipOutfit, canClaimQuest, claimDailyQuest, claimLogin, freshGame, normalizeGame, upgradeMuscle } from './game';
import { reconcileWorkoutResults, RESULT_JOURNAL_PREFIX, type CompletedWorkoutResult } from './workoutJournal';

const firstDay = new Date(2026, 9, 22, 12);
const secondDay = new Date(2026, 9, 23, 12);
const player = (): Profile => ({ ...EMPTY_PROFILE, workouts: [], game: { ...freshGame(), created: true } });
const roundTrip = (p: Profile) => parseProfile(JSON.parse(JSON.stringify(p)));
function longHistory() {
  let p = player();
  for (let i = 0; i < 65; i++) {
    p = addCompletedWorkout(p, 65000, firstDay, { sessionId: 'completed-' + i, mode: i === 0 ? 'tower' : 'training' });
  }
  return p;
}
function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  });
  return values;
}
afterEach(() => vi.unstubAllGlobals());

describe('durable workout reward identity', () => {
  it('preserves an identified save with a missing ledger and never repays a session outside its last 60 workouts', () => {
    const intact = { ...longHistory(), profileId: 'paid-profile' };
    const { creditedWorkoutIds: _ledger, ...damaged } = intact;
    expect(damaged.workouts.some((workout) => workout.id === 'completed-1')).toBe(false);
    const values = storage();
    const raw = JSON.stringify(damaged);
    const backup = JSON.stringify(intact);
    const result: CompletedWorkoutResult = { schemaVersion: 1, profileId: intact.profileId,
      sessionId: 'completed-1', mode: 'training', floor: null, durationMs: 65000,
      finishedAt: firstDay.toISOString(), repetitions: 20 };
    values.set(STORAGE_KEY, raw);
    values.set(PROFILE_BACKUP_KEY, backup);
    values.set(RESULT_JOURNAL_PREFIX + result.sessionId, JSON.stringify(result));
    const before = [...values];

    expect(reconcileWorkoutResults().status).toBe('recovery-required');
    expect(loadProfileState()).toMatchObject({ status: 'recovery-required', backupAvailable: true,
      revision: raw, profile: { profileId: intact.profileId, xp: intact.xp, creditedWorkoutIds: null } });
    expect(parseProfile(JSON.parse(raw)).creditedWorkoutIds).toBeNull();
    expect(roundTrip(parseProfile(JSON.parse(raw))).creditedWorkoutIds).toBeNull();
    expect(saveProfile({ ...damaged, coins: damaged.coins + 1 })).toEqual({ status: 'recovery-required' });
    expect(() => addCompletedWorkout(damaged, 65000, firstDay, { sessionId: result.sessionId }))
      .toThrow('Reward identity ledger requires recovery');
    expect([...values]).toEqual(before);
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });

  it('keeps missing-ledger ambiguity when only lifetime workout totals survive', () => {
    const intact = { ...longHistory(), profileId: 'paid-profile' };
    const { creditedWorkoutIds: _ledger, ...missingLedger } = intact;
    const loaded = parseProfile({ ...missingLedger, workouts: [] });
    expect(loaded.totals?.workouts).toBe(65);
    expect(loaded.creditedWorkoutIds).toBeNull();
    expect(() => addCompletedWorkout(loaded, 65000, firstDay, { sessionId: 'completed-1' }))
      .toThrow('Reward identity ledger requires recovery');
  });

  it('keeps a new identified wallet without workout history compatible', () => {
    const empty = parseProfile({ ...player(), profileId: 'new-profile', xp: 500, coins: 900 });
    expect(empty.creditedWorkoutIds).toBeUndefined();
    expect(addCompletedWorkout(empty, 65000, firstDay, { sessionId: 'first-workout' }))
      .toMatchObject({ profileId: 'new-profile', xp: 620, creditedWorkoutIds: ['first-workout'] });
  });

  it('rejects an old tower result after the visible history rotates and the profile reloads', () => {
    const p = roundTrip(longHistory());
    expect(p.workouts).toHaveLength(60);
    expect(p.workouts.some((w) => w.id === 'completed-0')).toBe(false);
    const replay = addCompletedWorkout(p, 1000, secondDay, { sessionId: 'completed-0', mode: 'tower' });
    expect(replay).toBe(p);
    expect(replay.game.highestClearedFloor).toBe(1);
    expect(replay.totals?.workouts).toBe(65);
  });

  it('seeds legacy history IDs before the next workout evicts their visible record', () => {
    const p = longHistory();
    const legacy = parseProfile({ xp: p.xp, coins: p.coins, workouts: p.workouts, game: p.game, totals: p.totals });
    const oldest = legacy.workouts.at(-1)!.id;
    const advanced = roundTrip(addCompletedWorkout(legacy, 65000, secondDay, { sessionId: 'new-after-upgrade' }));
    expect(advanced.workouts.some((w) => w.id === oldest)).toBe(false);
    expect(addCompletedWorkout(advanced, 65000, secondDay, { sessionId: oldest })).toBe(advanced);
    expect(advanced.xp).toBe(p.xp + 120);
  });

  it('preserves reward identities through actual primary, backup, and explicit recovery', () => {
    const values = storage();
    const p = longHistory();
    expect(persistProfile(p)).toBe('saved');
    const latest = addCompletedWorkout(p, 65000, secondDay, { sessionId: 'latest' });
    expect(persistProfile(latest)).toBe('saved');
    expect(values.has(PROFILE_BACKUP_KEY)).toBe(true);
    values.set(STORAGE_KEY, '{damaged');
    expect(recoverProfile('backup').status).toBe('ready');
    const recovered = loadProfile();
    expect(recovered.xp).toBe(p.xp);
    expect(addCompletedWorkout(recovered, 65000, secondDay, { sessionId: 'completed-0' })).toBe(recovered);
  });

  it('keeps reward history through spending, daily rewards, and subsequent workouts', () => {
    let p = claimLogin(longHistory(), firstDay);
    p = upgradeMuscle(buyOrEquipOutfit(p, 'ember'), 'arms');
    p = roundTrip(addCompletedWorkout(p, 65000, secondDay, { sessionId: 'after-spending' }));
    expect(p.game.outfit).toBe('ember');
    expect(p.game.muscles.arms).toBe(1);
    expect(addCompletedWorkout(p, 65000, secondDay, { sessionId: 'completed-0' })).toBe(p);
    expect(claimLogin(p, firstDay)).toBe(p);
  });

  it('preserves all known totals, record and reward IDs before trimming an unbounded legacy import', () => {
    const workouts = Array.from({ length: 65 }, (_, i) => ({
      id: 'legacy-' + i, finishedAt: firstDay.toISOString(), repetitions: 20,
      durationMs: i === 64 ? 30000 : 65000, xp: 120,
    }));
    const p = roundTrip(parseProfile({ ...player(), xp: 7800, coins: 2275, workouts }));
    expect(p.workouts).toHaveLength(60);
    expect(p.totals).toEqual({ workouts: 65, repetitions: 1300, bestDurationMs: 30000 });
    expect(addCompletedWorkout(p, 65000, secondDay, { sessionId: 'legacy-64' })).toBe(p);
  });

  it('preserves the wallet but blocks rewards when any ledger entry is malformed', () => {
    const p = parseProfile({ ...player(), xp: 120, coins: 35,
      creditedWorkoutIds: ['old-credit', null, 7, '', '  ', 'x'.repeat(129), 'old-credit'] });
    expect(p.xp).toBe(120);
    expect(p.coins).toBe(35);
    // The ledger authorizes rewards after display history has been trimmed.
    // Filtering bad entries cannot establish which old sessions were paid.
    expect(p.creditedWorkoutIds).toBeNull();
    for (const sessionId of ['old-credit', 'genuinely-new']) {
      expect(() => addCompletedWorkout(p, 65000, firstDay, { sessionId })).toThrow('Reward identity ledger requires recovery');
    }
    expect(p.xp).toBe(120);
    expect(p.coins).toBe(35);
  });

  it.each([null, {}, 'not-an-array'])('preserves readable progress while a malformed explicit ledger %j needs recovery', (ledger) => {
    const p = addCompletedWorkout(player(), 65000, firstDay, { sessionId: 'still-in-history' });
    const loaded = parseProfile({ ...p, creditedWorkoutIds: ledger });
    expect(loaded.xp).toBe(120);
    expect(loaded.coins).toBe(p.coins);
    expect(loaded.workouts).toHaveLength(1);
    expect(loaded.workouts).toEqual(p.workouts);
    expect(loaded.creditedWorkoutIds).toBeNull();
    expect(() => addCompletedWorkout(loaded, 65000, firstDay, { sessionId: 'still-in-history' }))
      .toThrow('Reward identity ledger requires recovery');
  });
});

describe('daily rewards across clock changes', () => {
  it('does not pay the same login day again after A to B to A and reload', () => {
    const p = roundTrip(claimLogin(claimLogin(player(), firstDay), secondDay));
    expect(p.coins).toBe(20);
    expect(claimLogin(p, firstDay)).toBe(p);
  });

  it('does not pay an already claimed quest after A to B to A and reload', () => {
    let p = addCompletedWorkout(player(), 65000, firstDay, { sessionId: 'day-A' });
    p = claimDailyQuest(p, firstDay);
    p = addCompletedWorkout(p, 65000, secondDay, { sessionId: 'day-B' });
    p = roundTrip(claimDailyQuest(p, secondDay));
    expect(p.xp).toBe(350);
    expect(p.coins).toBe(110);
    expect(canClaimQuest(p, firstDay)).toBe(false);
    expect(claimDailyQuest(p, firstDay)).toBe(p);
  });

  it('migrates a legacy last-claimed date without paying it a second time', () => {
    const legacy = player();
    legacy.game.lastLoginDay = '2026-10-22';
    legacy.game.lastQuestClaimDay = '2026-10-22';
    legacy.workouts = [{ id: 'old', finishedAt: firstDay.toISOString(), repetitions: 20, durationMs: 65000, xp: 120 }];
    const next = roundTrip(claimLogin(legacy, secondDay));
    expect(claimLogin(next, firstDay)).toBe(next);
    expect(canClaimQuest(next, firstDay)).toBe(false);
  });

  it('allows a never-claimed date after correcting a future clock without reopening an old claim', () => {
    const future = new Date(2030, 0, 1, 12);
    const p = roundTrip(claimLogin(claimLogin(player(), future), firstDay));
    expect(p.coins).toBe(20);
    expect(claimLogin(p, future)).toBe(p);
  });

  it('preserves valid claimed dates while discarding malformed optional entries', () => {
    const p = parseProfile({ ...player(), game: { ...freshGame(), created: true,
      claimedLoginDays: ['2026-10-22', '2026-02-31', null, '2026-10-22'],
      claimedQuestDays: ['2026-10-22', {}, '2026-13-01'],
    }, workouts: [{ id: 'old', finishedAt: firstDay.toISOString(), repetitions: 20, durationMs: 65000, xp: 120 }] });
    expect(claimLogin(p, firstDay)).toBe(p);
    expect(canClaimQuest(p, firstDay)).toBe(false);
    expect(p.workouts).toHaveLength(1);
  });

  it('never pays a login reward for an invalid Date', () => {
    const p = player();
    expect(claimLogin(p, new Date(NaN))).toBe(p);
  });

  it.each(['2026-02-31', '2026-13-01', '2026-00-00'])('rejects impossible legacy calendar date %s', (invalid) => {
    const game = normalizeGame({ ...freshGame(), lastLoginDay: invalid, lastQuestClaimDay: invalid });
    expect(game.lastLoginDay).toBeNull();
    expect(game.lastQuestClaimDay).toBeNull();
  });
});
