import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addCompletedWorkout, EMPTY_PROFILE, loadProfile, parseProfile, persistProfile,
  PROFILE_BACKUP_KEY, recoverProfile, STORAGE_KEY, type Profile,
} from './progression';
import { buyOrEquipOutfit, canClaimQuest, claimDailyQuest, claimLogin, freshGame, normalizeGame, upgradeMuscle } from './game';

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
    setItem: (key: string, value: string) => { values.set(key, value); },
  });
  return values;
}
afterEach(() => vi.unstubAllGlobals());

describe('durable workout reward identity', () => {
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

  it('keeps valid credited IDs when optional ledger entries are malformed', () => {
    const p = parseProfile({ ...player(), xp: 120, coins: 35,
      creditedWorkoutIds: ['old-credit', null, 7, '', '  ', 'x'.repeat(129), 'old-credit'] });
    expect(p.xp).toBe(120);
    expect(p.coins).toBe(35);
    expect(addCompletedWorkout(p, 65000, firstDay, { sessionId: 'old-credit' })).toBe(p);
    const next = addCompletedWorkout(p, 65000, firstDay, { sessionId: 'genuinely-new' });
    expect(next.xp).toBe(240);
    expect(next.coins).toBe(70);
  });

  it.each([null, {}, 'not-an-array'])('preserves valid legacy progress with malformed optional ledger %j', (ledger) => {
    const p = addCompletedWorkout(player(), 65000, firstDay, { sessionId: 'still-in-history' });
    const loaded = parseProfile({ ...p, creditedWorkoutIds: ledger });
    expect(loaded.xp).toBe(120);
    expect(loaded.workouts).toHaveLength(1);
    expect(addCompletedWorkout(loaded, 65000, firstDay, { sessionId: 'still-in-history' })).toBe(loaded);
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
