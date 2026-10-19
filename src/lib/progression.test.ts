import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshGame } from './game';
import {
  addCompletedWorkout, bestTime, EMPTY_PROFILE, formatTime, getLevel, getLevelProgress,
  loadProfile, loadProfileState, parseProfile, persistProfile, PROFILE_BACKUP_KEY, recoverProfile,
  TARGET_REPS, type WorkoutOptions,
} from './progression';

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

describe('local save recovery', () => {
  const splits = Array.from({ length: TARGET_REPS }, (_, index) => (index + 1) * 3000);
  const savedProfile = (splitsMs: unknown = splits, mode: unknown = 'tower') => ({
    xp: 360,
    coins: 70,
    workouts: [{
      id: 'previous', finishedAt: '2026-10-19T10:00:00Z', durationMs: 64000,
      repetitions: TARGET_REPS, xp: 120, splitsMs, mode,
    }],
    game: {
      ...freshGame(), created: true, nickname: 'Кузнец', build: 'solid',
      muscles: { arms: 1, core: 0, legs: 2, back: 0 },
      outfit: 'ember', ownedOutfits: ['base', 'ember'], highestClearedFloor: 2,
      bestGhost: { durationMs: 64000, splitsMs: splits },
    },
  });
  const malformedSplits: [string, unknown][] = [
    ['20-character string', '1'.repeat(TARGET_REPS)],
    ['array-like object', { length: TARGET_REPS, 0: 3000 }],
    ['object', {}],
    ['null', null],
    ['nonfinite number', [...splits.slice(0, -1), Number.NaN]],
    ['infinite number', [...splits.slice(0, -1), Number.POSITIVE_INFINITY]],
    ['negative number', [-1, ...splits.slice(1)]],
    ['unordered times', [splits[1], splits[0], ...splits.slice(2)]],
    ['time past finish', [...splits.slice(0, -1), 65000]],
    ['too few times', splits.slice(1)],
    ['sparse array', Array(TARGET_REPS)],
  ];

  afterEach(() => vi.unstubAllGlobals());

  it.each(malformedSplits)('drops only malformed optional splits: %s', (_, malformed) => {
    const saved = savedProfile(malformed);
    saved.workouts.push({ ...saved.workouts[0], id: 'intact', splitsMs: splits });
    const result = parseProfile(saved);
    expect(result.xp).toBe(saved.xp);
    expect(result.coins).toBe(saved.coins);
    expect(result.game).toEqual(saved.game);
    expect(result.workouts).toHaveLength(2);
    expect(result.workouts[0]).toEqual({
      id: 'previous', finishedAt: '2026-10-19T10:00:00Z', durationMs: 64000,
      repetitions: TARGET_REPS, xp: 120, mode: 'tower',
    });
    expect(result.workouts[1]).toEqual(saved.workouts[1]);
  });

  it('preserves valid split times and every existing workout mode', () => {
    for (const mode of ['training', 'tower', 'ghost']) {
      const saved = savedProfile(splits, mode);
      expect(parseProfile(saved)).toEqual(saved);
    }
  });

  it('removes an invalid optional mode without discarding the workout or valid splits', () => {
    for (const mode of [null, 'online', {}, 0]) {
      const saved = savedProfile(splits, mode);
      const result = parseProfile(saved);
      expect(result.xp).toBe(saved.xp);
      expect(result.coins).toBe(saved.coins);
      expect(result.game).toEqual(saved.game);
      expect(result.workouts).toHaveLength(1);
      expect(result.workouts[0].splitsMs).toEqual(splits);
      expect(result.workouts[0]).not.toHaveProperty('mode');
    }
  });

  it.each(malformedSplits)('ignores malformed split arguments for a completed workout: %s', (_, malformed) => {
    const result = addCompletedWorkout(EMPTY_PROFILE, 64000, new Date('2026-10-19T10:00:00Z'), {
      splitsMs: malformed,
    } as WorkoutOptions);
    expect(result.xp).toBe(120);
    expect(result.coins).toBe(35);
    expect(result.workouts[0]).not.toHaveProperty('splitsMs');
    expect(result.game.bestGhost).toBeNull();
  });

  it('loads, persists and reloads recovered progress using the unchanged storage key', () => {
    const key = 'bodyforge:pilot:v1';
    const saved = savedProfile({ length: TARGET_REPS });
    const storage = new Map([[key, JSON.stringify(saved)]]);
    const getItem = vi.fn((item: string) => storage.get(item) ?? null);
    const setItem = vi.fn((item: string, value: string) => { storage.set(item, value); });
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem, setItem });

    const recovered = loadProfile();
    expect(recovered.xp).toBe(saved.xp);
    expect(recovered.coins).toBe(saved.coins);
    expect(recovered.game).toEqual(saved.game);
    expect(recovered.workouts).toHaveLength(1);
    expect(recovered.workouts[0]).not.toHaveProperty('splitsMs');
    persistProfile(recovered);
    expect(setItem).toHaveBeenCalledWith(key, JSON.stringify(recovered));
    expect(loadProfile()).toEqual(recovered);
    expect(getItem).toHaveBeenCalledWith(key);
    expect(storage.size).toBe(2);
    expect(JSON.parse(storage.get(PROFILE_BACKUP_KEY)!)).toEqual(recovered);
  });

  it.each([
    ['invalid JSON', '{"xp":360'],
    ['empty string', ''],
    ['invalid XP', JSON.stringify({ ...savedProfile(), xp: '360' })],
    ['missing workouts', JSON.stringify({ xp: 360, coins: 70 })],
    ['null root', 'null'],
    ['array root', '[]'],
  ])('never replaces an unreadable original during automatic persistence: %s', (_, raw) => {
    const key = 'bodyforge:pilot:v1';
    const storage = new Map([[key, raw]]);
    const setItem = vi.fn((item: string, value: string) => { storage.set(item, value); });
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: (item: string) => storage.get(item) ?? null, setItem });

    persistProfile(loadProfile());

    expect(storage.get(key)).toBe(raw);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('protected profile storage', () => {
  const key = 'bodyforge:pilot:v1';
  const quarantineKey = `${key}:quarantine:0`;
  const previous = { ...EMPTY_PROFILE, xp: 360, coins: 70, game: { ...freshGame(), nickname: 'Кузнец' } };
  const next = { ...previous, xp: 480, coins: 105 };
  const raw = JSON.stringify(previous);

  function mockStorage(entries: [string, string][] = []) {
    const values = new Map(entries);
    const getItem = vi.fn((item: string) => values.get(item) ?? null);
    const setItem = vi.fn((item: string, value: string) => { values.set(item, value); });
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem, setItem });
    return { values, getItem, setItem };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('distinguishes a genuinely new profile from a damaged existing save without writes', () => {
    const { values, setItem } = mockStorage();
    expect(loadProfileState()).toMatchObject({ status: 'empty', backupAvailable: false });
    values.set(key, 'broken');
    expect(loadProfileState()).toMatchObject({ status: 'recovery-required', backupAvailable: false });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('keeps the previous validated progress as backup before persisting the next profile', () => {
    const { values } = mockStorage([[key, raw]]);
    expect(persistProfile(next)).toBe('saved');
    expect(JSON.parse(values.get(PROFILE_BACKUP_KEY)!)).toEqual(previous);
    expect(loadProfile()).toEqual(next);
  });

  it('seeds a verified backup for the very first save', () => {
    const { values } = mockStorage();
    expect(persistProfile(previous)).toBe('saved');
    expect(JSON.parse(values.get(PROFILE_BACKUP_KEY)!)).toEqual(previous);
    expect(loadProfile()).toEqual(previous);
  });

  it.each([null, '{broken backup', 'null'])('does not infer a valid recovery source from backup %s', (backup) => {
    const { values, setItem } = mockStorage([[key, '{broken original']]);
    if (backup !== null) values.set(PROFILE_BACKUP_KEY, backup);
    expect(loadProfileState()).toMatchObject({ status: 'recovery-required', backupAvailable: false });
    expect(recoverProfile('backup').status).toBe('recovery-required');
    expect(values.get(key)).toBe('{broken original');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('offers a valid backup without silently loading or overwriting the damaged original', () => {
    const { values, setItem } = mockStorage([[key, '{broken original'], [PROFILE_BACKUP_KEY, raw]]);
    expect(loadProfileState()).toMatchObject({ status: 'recovery-required', backupAvailable: true, profile: { xp: 0 } });
    expect(persistProfile(previous)).toBe('recovery-required');
    expect(values.get(key)).toBe('{broken original');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('restores a backup only after preserving the exact damaged original', () => {
    const { values, setItem } = mockStorage([[key, '{broken original'], [PROFILE_BACKUP_KEY, raw]]);
    expect(recoverProfile('backup')).toMatchObject({ status: 'ready', profile: previous });
    expect(values.get(quarantineKey)).toBe('{broken original');
    expect(setItem.mock.calls.map(([item]) => item)).toEqual([quarantineKey, key]);
    expect(loadProfile()).toEqual(previous);
  });

  it('starts a fresh profile only after an explicit action preserves the old raw value', () => {
    const { values } = mockStorage([[key, 'null']]);
    expect(recoverProfile('empty')).toMatchObject({ status: 'ready', profile: { xp: 0, coins: 0, workouts: [] } });
    expect(values.get(quarantineKey)).toBe('null');
    expect(loadProfile()).toEqual(EMPTY_PROFILE);
  });

  it('never overwrites a different prior quarantine and can recover again safely', () => {
    const { values } = mockStorage([[key, '{new broken'], [quarantineKey, '{older broken']]);
    expect(recoverProfile('empty').status).toBe('ready');
    expect(values.get(quarantineKey)).toBe('{older broken');
    expect(values.get(`${key}:quarantine:1`)).toBe('{new broken');
    values.set(key, '{new broken');
    expect(recoverProfile('empty').status).toBe('ready');
    expect(values.size).toBe(3);
  });

  it.each([raw, '{broken backup'])('protects a surviving backup when the primary is missing: %s', (backup) => {
    const { values, setItem } = mockStorage([[PROFILE_BACKUP_KEY, backup]]);
    expect(loadProfileState().status).toBe('recovery-required');
    expect(persistProfile(EMPTY_PROFILE)).toBe('recovery-required');
    expect(setItem).not.toHaveBeenCalled();
    expect(values.get(PROFILE_BACKUP_KEY)).toBe(backup);
    expect(recoverProfile('empty').status).toBe('ready');
    expect(values.get(quarantineKey)).toBe(backup);
  });

  it.each(['throw', 'no-op', 'wrong-value'] as const)('does not replace primary if backup verification fails: %s', (failure) => {
    const { values, setItem } = mockStorage([[key, raw]]);
    setItem.mockImplementation((item, value) => {
      if (item === PROFILE_BACKUP_KEY) {
        if (failure === 'throw') throw new Error('quota exceeded');
        if (failure === 'wrong-value') values.set(item, 'wrong');
      } else values.set(item, value);
    });
    expect(persistProfile(next)).toBe('unavailable');
    expect(values.get(key)).toBe(raw);
    expect(setItem.mock.calls.some(([item]) => item === key)).toBe(false);
  });

  it.each(['throw', 'no-op', 'wrong-value', 'read-throw'] as const)('does not replace unreadable primary if quarantine fails: %s', (failure) => {
    const { values, getItem, setItem } = mockStorage([[key, '{broken original'], [PROFILE_BACKUP_KEY, raw]]);
    setItem.mockImplementation((item, value) => {
      if (item === quarantineKey) {
        if (failure === 'throw') throw new Error('quota exceeded');
        if (failure === 'wrong-value') values.set(item, 'wrong');
        if (failure === 'read-throw') values.set(item, value);
      } else values.set(item, value);
    });
    getItem.mockImplementation((item) => {
      if (failure === 'read-throw' && values.has(quarantineKey) && item === quarantineKey) throw new Error('read failed');
      return values.get(item) ?? null;
    });
    expect(recoverProfile('backup').status).toBe('unavailable');
    expect(values.get(key)).toBe('{broken original');
    expect(values.get(PROFILE_BACKUP_KEY)).toBe(raw);
    expect(setItem.mock.calls.some(([item]) => item === key)).toBe(false);
  });

  it.each(['throw', 'no-op'] as const)('keeps the original and backup if explicit recovery cannot replace primary: %s', (failure) => {
    const { values, setItem } = mockStorage([[key, '{broken original'], [PROFILE_BACKUP_KEY, raw]]);
    setItem.mockImplementation((item, value) => {
      if (item === key) {
        if (failure === 'throw') throw new Error('quota exceeded');
      } else values.set(item, value);
    });
    expect(recoverProfile('backup').status).toBe('unavailable');
    expect(values.get(key)).toBe('{broken original');
    expect(values.get(quarantineKey)).toBe('{broken original');
    expect(values.get(PROFILE_BACKUP_KEY)).toBe(raw);
  });

  it('preserves the prior profile in backup if saving the next primary exceeds quota', () => {
    const { values, setItem } = mockStorage([[key, raw]]);
    setItem.mockImplementation((item, value) => {
      if (item === key) throw new Error('quota exceeded');
      values.set(item, value);
    });
    expect(persistProfile(next)).toBe('unavailable');
    expect(values.get(key)).toBe(raw);
    expect(JSON.parse(values.get(PROFILE_BACKUP_KEY)!)).toEqual(previous);
  });

  it('reports denied storage without attempting any writes', () => {
    const { getItem, setItem } = mockStorage();
    getItem.mockImplementation(() => { throw new Error('storage denied'); });
    expect(loadProfileState()).toMatchObject({ status: 'unavailable', backupAvailable: false });
    expect(persistProfile(previous)).toBe('unavailable');
    expect(recoverProfile('empty').status).toBe('unavailable');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('does not persist invalid mandatory profile values even when TypeScript is bypassed', () => {
    const { values, setItem } = mockStorage([[key, raw]]);
    expect(persistProfile({ ...next, xp: Number.NaN })).toBe('unavailable');
    expect(values.get(key)).toBe(raw);
    expect(setItem).not.toHaveBeenCalled();
  });
});
