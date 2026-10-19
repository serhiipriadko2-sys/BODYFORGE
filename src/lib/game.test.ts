import { describe, expect, it } from 'vitest';
import {
  buyOrEquipOutfit, canClaimQuest, claimDailyQuest, claimLogin, createFighter,
  freshGame, ghostRepetitions, muscleCost, nextTowerFloor, normalizeGame,
  storeGhost, upgradeMuscle,
} from './game';
import { addCompletedWorkout, EMPTY_PROFILE, parseProfile, type Profile } from './progression';

function player(xp = 0, coins = 0): Profile {
  return createFighter({ ...EMPTY_PROFILE, xp, coins, workouts: [], game: freshGame() }, 'lean', 'Кузнец');
}
const day = new Date('2026-10-19T12:00:00Z');

describe('tamagotchi game economy', () => {
  it('migrates existing local workout saves without losing XP, coins or history', () => {
    const legacy = { xp: 360, coins: 70, workouts: [{
      id: 'previous', finishedAt: day.toISOString(), durationMs: 64000, repetitions: 20, xp: 120,
    }] };
    const result = parseProfile(legacy);
    expect(result.xp).toBe(360);
    expect(result.coins).toBe(70);
    expect(result.workouts[0].id).toBe('previous');
    expect(result.game.created).toBe(false);
    expect(result.game.muscles.arms).toBe(0);
  });

  it('creates a human character once with a chosen starting build', () => {
    const initial = { ...EMPTY_PROFILE, game: freshGame() };
    const created = createFighter(initial, 'solid', 'БОЕЦ');
    expect(created.game.build).toBe('solid');
    expect(created.game.created).toBe(true);
    expect(created.game.nickname).toBe('БОЕЦ');
    expect(createFighter(created, 'lean', 'ПЕРЕЗАПИСЬ')).toBe(created);
  });

  it('spends only owned coins on muscle upgrades and caps progression', () => {
    let p = player(0, 500);
    expect(muscleCost(0)).toBe(25);
    expect(muscleCost(1)).toBe(50);
    p = upgradeMuscle(p, 'legs');
    expect(p.game.muscles.legs).toBe(1);
    expect(p.coins).toBe(475);
    p = upgradeMuscle(p, 'legs');
    expect(p.game.muscles.legs).toBe(2);
    expect(p.coins).toBe(425);
    for (let i = 0; i < 8; i++) p = upgradeMuscle(p, 'legs');
    expect(p.game.muscles.legs).toBe(5);
    expect(p.coins).toBe(125);
    expect(upgradeMuscle(player(0, 0), 'core').coins).toBe(0);
  });

  it('buys clothing once, then changes into previously owned clothing for free', () => {
    const p = player(0, 80);
    const bought = buyOrEquipOutfit(p, 'ember');
    expect(bought.coins).toBe(20);
    expect(bought.game.outfit).toBe('ember');
    const base = buyOrEquipOutfit(bought, 'base');
    expect(base.coins).toBe(20);
    const equipped = buyOrEquipOutfit(base, 'ember');
    expect(equipped.coins).toBe(20);
    expect(equipped.game.ownedOutfits).toEqual(['base', 'ember']);
    expect(buyOrEquipOutfit(equipped, 'steel')).toBe(equipped);
  });

  it('claims a daily login reward once per local day', () => {
    const p = player();
    const claimed = claimLogin(p, day);
    expect(claimed.coins).toBe(10);
    expect(claimLogin(claimed, day)).toBe(claimed);
    const tomorrow = claimLogin(claimed, new Date('2026-10-20T12:00:00Z'));
    expect(tomorrow.coins).toBe(20);
  });

  it('only unlocks the daily quest reward after a completed camera workout', () => {
    const p = player();
    expect(canClaimQuest(p, day)).toBe(false);
    const trained = addCompletedWorkout(p, 65000, day);
    expect(canClaimQuest(trained, day)).toBe(true);
    const claimed = claimDailyQuest(trained, day);
    expect(claimed.xp).toBe(175);
    expect(claimed.coins).toBe(55);
    expect(canClaimQuest(claimed, day)).toBe(false);
    expect(claimDailyQuest(claimed, day)).toBe(claimed);
  });

  it('rejects hostile or invalid saved upgrades and outfit selections', () => {
    const bad = normalizeGame({
      created: true, nickname: 'x', build: 'elf', muscles: { arms: 999, legs: -5 },
      outfit: 'steel', ownedOutfits: ['ember', 'invalid'], highestClearedFloor: 99,
    });
    expect(bad.build).toBe('lean');
    expect(bad.muscles.arms).toBe(0);
    expect(bad.muscles.legs).toBe(0);
    expect(bad.outfit).toBe('base');
    expect(bad.highestClearedFloor).toBe(5);
  });
});

describe('solo tower and ghost', () => {
  it('wins only when the camera workout beats the current bot time', () => {
    const p = player();
    expect(nextTowerFloor(p.game).floor).toBe(1);
    const lost = addCompletedWorkout(p, 111000, day, { mode: 'tower' });
    expect(lost.game.highestClearedFloor).toBe(0);
    expect(lost.xp).toBe(120);
    const won = addCompletedWorkout(lost, 105000, day, { mode: 'tower' });
    expect(won.game.highestClearedFloor).toBe(1);
    expect(won.xp).toBe(305);
    expect(won.coins).toBe(100);
    expect(nextTowerFloor(won.game).floor).toBe(2);
  });

  it('stores only validated faster ghosts with 20 ordered split times', () => {
    const p = player();
    const splits = Array.from({ length: 20 }, (_, i) => (i + 1) * 3000);
    const trained = addCompletedWorkout(p, 61000, day, { mode: 'training', splitsMs: splits });
    expect(trained.game.bestGhost?.durationMs).toBe(61000);
    expect(trained.game.bestGhost?.splitsMs).toEqual(splits);
    expect(ghostRepetitions(splits, 15000)).toBe(5);
    expect(storeGhost(trained, 65000, splits)).toBe(trained);
    expect(storeGhost(trained, 58000, [1, 2])).toBe(trained);
    const corrupted = parseProfile({
      ...trained, game: { ...trained.game, bestGhost: { durationMs: 5, splitsMs: Array(20).fill(12) } },
    });
    expect(corrupted.game.bestGhost).toBeNull();
  });

  it('preserves the regular camera rewards when running in shadow mode', () => {
    const p = player();
    const result = addCompletedWorkout(p, 65000, day, { mode: 'ghost' });
    expect(result.xp).toBe(120);
    expect(result.coins).toBe(35);
    expect(result.game.highestClearedFloor).toBe(0);
  });
});
