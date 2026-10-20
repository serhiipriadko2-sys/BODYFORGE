import { afterEach, describe, expect, it, vi } from 'vitest';
import { addCompletedWorkout, EMPTY_PROFILE, loadProfileState, parseProfile, persistProfile, PROFILE_BACKUP_KEY, type Profile } from './progression';
import { beatTowerFloor, freshGame, normalizeGame, storeGhost } from './game';
import { isUltraWideCamera } from './camera';
import { getKneeAngle } from './squatCounter';

const key = 'bodyforge:pilot:v1';
const fighter = (): Profile => ({ ...EMPTY_PROFILE, workouts: [], game: { ...freshGame(), created: true } });
function storage(primary: string, backup: string) {
  const values = new Map([[key, primary], [PROFILE_BACKUP_KEY, backup]]);
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value); },
  });
  return values;
}
afterEach(() => vi.unstubAllGlobals());

describe('audit: previously uncovered data invariants', () => {
  it('does not erase the useful previous backup on an unchanged React mount/save', () => {
    const prior = { ...fighter(), xp: 120, coins: 35 };
    const current = { ...prior, xp: 240, coins: 70 };
    const priorRaw = JSON.stringify(prior);
    const values = storage(JSON.stringify(current), priorRaw);
    expect(persistProfile(current)).toBe('saved');
    expect(values.get(PROFILE_BACKUP_KEY)).toBe(priorRaw);
  });
  it('rejects a stale writer before touching the other tab save or its backup', () => {
    const old = JSON.stringify(fighter());
    const external = JSON.stringify({ ...fighter(), coins: 70, xp: 240 });
    const values = storage(external, old);
    expect(persistProfile({ ...fighter(), coins: 10 }, { expectedRaw: old })).toBe('conflict');
    expect(values.get(key)).toBe(external);
    expect(values.get(PROFILE_BACKUP_KEY)).toBe(old);
  });
  it('rejects sparse ghost arrays rather than promoting empty samples to a record', () => {
    const game = { ...freshGame(), bestGhost: { durationMs: 60000, splitsMs: Array(20) } };
    expect(normalizeGame(game).bestGhost).toBeNull();
    const p = fighter();
    expect(storeGhost(p, 60000, Array(20))).toBe(p);
  });
  it.each([NaN, Infinity, -1, 0])('never pays a tower victory for invalid time %s', (ms) => {
    const p = fighter();
    expect(beatTowerFloor(p, ms)).toBe(p);
  });
  it('applies the same completed session at most once', () => {
    const now = new Date('2026-10-19T10:00:00Z');
    const once = addCompletedWorkout(fighter(), 60000, now, { mode: 'tower', sessionId: 'fixture-session' });
    const twice = addCompletedWorkout(once, 60000, now, { mode: 'tower', sessionId: 'fixture-session' });
    expect(twice).toBe(once);
    expect(twice.workouts).toHaveLength(1);
    expect(twice.game.highestClearedFloor).toBe(1);
  });
  it('keeps lifetime totals and the first record after the last-60 history rotates', () => {
    let p = fighter();
    for (let i = 0; i < 65; i++) p = addCompletedWorkout(p, i === 0 ? 30000 : 60000, new Date(1760868000000 + i * 86400000), { sessionId: 'session-' + i });
    expect(p.workouts).toHaveLength(60);
    expect(p.totals).toEqual({ workouts: 65, repetitions: 1300, bestDurationMs: 30000 });
    expect(parseProfile(p).totals).toEqual(p.totals);
  });
  it('does not call a standard wide-angle lens an ultrawide lens', () => {
    expect(isUltraWideCamera('Back Wide-Angle Camera')).toBe(false);
    expect(isUltraWideCamera('Основная широкоугольная камера')).toBe(false);
    expect(isUltraWideCamera('Back Ultra Wide Camera')).toBe(true);
  });
  it('rejects nonfinite visibility confidence on an otherwise straight leg', () => {
    const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }));
    for (const [index, y] of [[23, .3], [25, .5], [27, .7]]) points[index] = { x: .5, y, visibility: NaN };
    expect(getKneeAngle(points)).toBeNull();
  });
  it('exposes the exact primary revision with a readable profile', () => {
    const raw = JSON.stringify(fighter());
    storage(raw, raw);
    expect(loadProfileState().revision).toBe(raw);
  });
});

describe('audit: complete local game routes', () => {
  it.each(['arms', 'core', 'legs', 'back'] as const)('upgrades only %s and preserves the other muscle groups', async (muscle) => {
    const { upgradeMuscle } = await import('./game');
    const p = { ...fighter(), coins: 100 };
    const upgraded = upgradeMuscle(p, muscle);
    expect(upgraded.coins).toBe(75);
    for (const id of ['arms', 'core', 'legs', 'back'] as const) expect(upgraded.game.muscles[id]).toBe(id === muscle ? 1 : 0);
    expect(p.game.muscles[muscle]).toBe(0);
  });
  it('completes all five floors without awarding tower bonus after the cap', () => {
    let p = fighter();
    for (let i = 0; i < 5; i++) p = addCompletedWorkout(p, 60000, new Date(1760868000000 + i * 60000), { mode: 'tower', sessionId: 'floor-' + i });
    expect(p.game.highestClearedFloor).toBe(5);
    expect(p.xp).toBe(925);
    expect(p.coins).toBe(325);
    const afterCap = addCompletedWorkout(p, 60000, new Date(1760869000000), { mode: 'tower', sessionId: 'after-cap' });
    expect(afterCap.game.highestClearedFloor).toBe(5);
    expect(afterCap.xp).toBe(1045);
    expect(afterCap.coins).toBe(360);
  });
  it('rejects replay of a recently saved session after parsing its persisted profile', () => {
    const now = new Date('2026-10-19T10:00:00Z');
    const first = addCompletedWorkout(fighter(), 60000, now, { sessionId: 'persisted-session' });
    const restored = parseProfile(JSON.parse(JSON.stringify(first)));
    expect(addCompletedWorkout(restored, 60000, now, { sessionId: 'persisted-session' })).toBe(restored);
    expect(restored.workouts).toHaveLength(1);
  });
});
