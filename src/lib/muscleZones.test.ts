import { describe, expect, it } from 'vitest';
import { createFighter, freshGame, normalizeGame, upgradeMuscle, upgradeMuscleZone } from './game';
import { EMPTY_PROFILE, parseProfile, type Profile } from './progression';
import { ZONE_GROUPS, ZONE_IDS, ZONE_POINT_COST, ZONE_POINT_MAX, TOTAL_ZONE_POINTS, emptyZoneLevels,
  investmentSummary, legacyToZones, normalizeZoneProgress, zoneGroupPoints, zoneLevelsForGame, zoneTotal } from './muscleZones';

function player(coins = 4500): Profile {
  return createFighter({ ...EMPTY_PROFILE, coins, workouts: [], game: freshGame() }, 'solid', 'БОЕЦ', true);
}
describe('regional muscle economy', () => {
  it('has 15 independent zones, 12 points each, and 180 exact total', () => {
    expect(ZONE_GROUPS.map(g => g.zones.length)).toEqual([4,3,4,4]);
    expect(new Set(ZONE_IDS).size).toBe(15);
    expect(TOTAL_ZONE_POINTS).toBe(180);
    let p = player(TOTAL_ZONE_POINTS * ZONE_POINT_COST);
    for (const id of ZONE_IDS) {
      for (let i=0;i<ZONE_POINT_MAX;i++) {
        const before = zoneLevelsForGame(p.game)!;
        const oldCoins = p.coins;
        const next = upgradeMuscleZone(p,id);
        const after = zoneLevelsForGame(next.game)!;
        expect(next.coins).toBe(oldCoins - ZONE_POINT_COST);
        for (const other of ZONE_IDS) expect(after[other]).toBe(before[other]+(other===id?1:0));
        expect(zoneLevelsForGame(p.game)).toEqual(before);
        p = next;
      }
      expect(upgradeMuscleZone(p,id)).toBe(p);
    }
    expect(p.coins).toBe(0);
    expect(zoneTotal(zoneLevelsForGame(p.game)!)).toBe(180);
    expect(p.game.muscles).toEqual({arms:5,core:5,legs:5,back:5});
    expect(investmentSummary(p.game)).toEqual({points:180,max:180});
  });
  it('migrates only on successful first purchase and preserves old level, coins and history', () => {
    const old = createFighter({...EMPTY_PROFILE, coins:100, xp:45, workouts:[], game:freshGame()},'lean','БОЕЦ');
    const p = {...old, game:{...old.game,muscles:{arms:2,core:5,legs:0,back:1}}};
    const initial=legacyToZones(p.game.muscles);
    expect(zoneGroupPoints(initial,'arms')).toEqual({points:20,max:48});
    expect(zoneGroupPoints(initial,'core')).toEqual({points:36,max:36});
    expect(p.game.zoneProgress).toBeUndefined();
    expect(upgradeMuscleZone(p,'chest')).toBe(p);
    const next=upgradeMuscleZone(p,'biceps');
    expect(next.coins).toBe(75);
    expect(next.xp).toBe(45);
    expect(next.game.zoneProgress?.levels.biceps).toBe(initial.biceps+1);
    expect(next.game.zoneProgress?.levels.shoulders).toBe(initial.shoulders);
    expect(next.game.zoneProgress?.levels.chest).toBe(12);
    expect(parseProfile(JSON.parse(JSON.stringify(next)))).toEqual(next);
    expect(upgradeMuscle(next,'arms')).toBe(next);
  });
  it('preserves three builds, zero starting points, no duplicate creation', () => {
    for (const build of ['lean','solid','full'] as const) {
      const p=createFighter({...EMPTY_PROFILE,game:freshGame()},build,'БОЕЦ',true);
      expect(p.game.build).toBe(build);
      expect(p.game.zoneProgress).toEqual({version:1,levels:emptyZoneLevels()});
      expect(normalizeGame(JSON.parse(JSON.stringify(p.game)))).toEqual(p.game);
      expect(createFighter(p,'lean','НОВЫЙ',true)).toBe(p);
    }
  });
  it('fails closed on malformed saves, invalid zone and insufficient coins', () => {
    const p=player(0);
    expect(upgradeMuscleZone(p,'biceps')).toBe(p);
    const valid=player();expect(upgradeMuscleZone(valid,'bogus' as never)).toBe(valid);
    for(const bad of [{version:1,levels:{...emptyZoneLevels(),biceps:13}},
      {version:2,levels:emptyZoneLevels()}, {version:1,levels:{biceps:0}},
      {version:1,levels:{...emptyZoneLevels(),bogus:0}},null]) {
      expect(normalizeZoneProgress(bad)).toBeNull();
      const game=normalizeGame({...player().game,zoneProgress:bad});
      expect(game.zoneProgress).toBeNull();
      const damaged={...player(),game};
      expect(upgradeMuscleZone(damaged,'biceps')).toBe(damaged);
      expect(upgradeMuscle(damaged,'arms')).toBe(damaged);
    }
  });
});
