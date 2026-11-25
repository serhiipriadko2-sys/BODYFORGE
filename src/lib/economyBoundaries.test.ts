import { afterEach, describe, expect, it, vi } from 'vitest';
import { buyOrEquipOutfit, claimDailyQuest, claimLogin, freshGame, upgradeMuscle, type Muscle, type Outfit } from './game';
import { addCompletedWorkout, parseProfile, type Profile } from './progression';

const day = new Date(2026, 10, 24, 12);
const player = (coins = 100): Profile => ({
  xp: 0, coins, workouts: [], game: { ...freshGame(), created: true },
});
const roundTrip = (p: Profile) => parseProfile(JSON.parse(JSON.stringify(p)));
afterEach(() => vi.restoreAllMocks());

describe('purchase boundaries preserve the wallet', () => {
  it.each([NaN, Infinity, -Infinity, -1])('rejects malformed wallet %s without applying a purchase', coins => {
    const p = player(coins);
    expect(upgradeMuscle(p, 'arms')).toBe(p);
    expect(buyOrEquipOutfit(p, 'ember')).toBe(p);
    expect(p.game.muscles.arms).toBe(0);
    expect(p.game.ownedOutfits).toEqual(['base']);
  });
  it.each([NaN, Infinity, -1, 1.5])('rejects invalid current muscle level %s without changing the wallet', level => {
    const p = player();
    p.game.muscles.arms = level;
    expect(upgradeMuscle(p, 'arms')).toBe(p);
    expect(p.coins).toBe(100);
  });
  it('rejects unknown item identifiers and cannot purchase below the price', () => {
    const p = player(24);
    expect(upgradeMuscle(p, 'invalid' as Muscle)).toBe(p);
    expect(buyOrEquipOutfit(p, 'invalid' as Outfit)).toBe(p);
    expect(upgradeMuscle(p, 'arms')).toBe(p);
    expect(buyOrEquipOutfit(p, 'ember')).toBe(p);
  });
  it('accepts exact purchase price, equips owned items at zero coins, and makes identical equip a no-op', () => {
    const p = player(60);
    const paid = roundTrip(buyOrEquipOutfit(p, 'ember'));
    expect(paid.coins).toBe(0);
    expect(paid.game.ownedOutfits).toEqual(['base', 'ember']);
    expect(buyOrEquipOutfit(paid, 'ember')).toBe(paid);
    const base = buyOrEquipOutfit(paid, 'base');
    const again = buyOrEquipOutfit(base, 'ember');
    expect(again.coins).toBe(0);
    expect(again.game.ownedOutfits).toEqual(['base', 'ember']);
    expect(buyOrEquipOutfit(again, 'steel')).toBe(again);
    expect(upgradeMuscle(again, 'core')).toBe(again);
    const exact = upgradeMuscle(player(25), 'core');
    expect(exact.coins).toBe(0);
    expect(exact.game.muscles.core).toBe(1);
  });
});

describe('new reward identity and historical compatibility', () => {
  it.each(['', ' ', 'x'.repeat(129), '\uD800', 'bad-\uDFFF'])('rejects invalid new reward ID %j', sessionId => {
    const p = player();
    const original = JSON.stringify(p);
    expect(() => addCompletedWorkout(p, 60000, day, { sessionId })).toThrow('Invalid workout session ID');
    expect(JSON.stringify(p)).toBe(original);
  });
  it('does not award a generated fallback identity collision', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const first = addCompletedWorkout(player(), 60000, day);
    const original = JSON.stringify(first);
    expect(() => addCompletedWorkout(first, 60000, day)).toThrow('Workout session ID collision');
    expect(JSON.stringify(first)).toBe(original);
  });
  it('keeps legacy opaque IDs and a valid Unicode reward without duplicate credit', () => {
    const oldId = 'legacy-\uD800', newId = 'valid-\uD83D\uDCAA-%u16:';
    const original = { ...player(35), xp:120, creditedWorkoutIds:[oldId],
      workouts:[{ id:oldId, finishedAt:day.toISOString(), durationMs:60000, repetitions:20, xp:120 }] };
    const p = roundTrip(original);
    expect(p.workouts).toEqual(original.workouts);
    expect(p.creditedWorkoutIds).toEqual([oldId]);
    const paid = roundTrip(addCompletedWorkout(p, 60000, day, { sessionId:newId }));
    expect(paid.xp).toBe(240);
    expect(paid.coins).toBe(70);
    expect(paid.creditedWorkoutIds).toEqual([oldId,newId]);
    expect(addCompletedWorkout(paid, 60000, day, { sessionId:newId })).toBe(paid);
  });
  it('retains daily claim history after clock rollback, spending and reload', () => {
    const tomorrow = new Date(2026, 10, 25, 12);
    let p = addCompletedWorkout(player(0), 60000, day, { sessionId:'first-day' });
    p = claimDailyQuest(claimLogin(p,day),day);
    p = addCompletedWorkout(p, 60000, tomorrow, { sessionId:'second-day' });
    p = claimDailyQuest(claimLogin(p,tomorrow),tomorrow);
    p = roundTrip(buyOrEquipOutfit(p,'ember'));
    expect(p.coins).toBe(70);
    expect(p.xp).toBe(350);
    expect(claimLogin(p,day)).toBe(p);
    expect(claimDailyQuest(p,day)).toBe(p);
    expect(p.workouts).toHaveLength(2);
  });
});
