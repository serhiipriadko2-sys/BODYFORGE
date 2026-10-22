import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshGame } from './game';
import {
  addCompletedWorkout, parseProfile, PROFILE_BACKUP_KEY, STORAGE_KEY, type Profile,
} from './progression';
import {
  commitWorkoutResult, prepareWorkoutSession, readResultJournal, reconcileWorkoutResults,
  RESULT_JOURNAL_PREFIX, type CompletedWorkoutResult,
} from './workoutJournal';

const PROFILE_ID = '8f711190-e774-4aa9-b44e-7777b2294021';
const OTHER_PROFILE_ID = '4a2c6303-1c89-4913-a8b9-bc373aa2517f';
const SESSION_ID = '69203342-b175-4b02-8673-8e8934360089';
const FINISHED_AT = '2026-10-22T12:00:00.000Z';
const player = (): Profile => ({
  profileId: PROFILE_ID, xp: 0, coins: 100, workouts: [],
  game: { ...freshGame(), created: true, nickname: 'JOURNAL QA' },
});
const completion = (changes: Partial<CompletedWorkoutResult> = {}): CompletedWorkoutResult => ({
  schemaVersion: 1, profileId: PROFILE_ID, sessionId: SESSION_ID,
  mode: 'tower', floor: 1, durationMs: 65000, finishedAt: FINISHED_AT,
  repetitions: 20, splitsMs: Array.from({ length: 20 }, (_, i) => (i + 1) * 3250),
  ...changes,
});
const serialized = (profile: Profile) => JSON.stringify(parseProfile(profile));
function storage(profile: Profile | null = player()) {
  const values = new Map<string, string>();
  if (profile !== null) values.set(STORAGE_KEY, serialized(profile));
  const getItem = vi.fn((key: string) => values.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => { values.set(key, value); });
  const removeItem = vi.fn((key: string) => { values.delete(key); });
  const fake = {
    getItem, setItem, removeItem,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', fake);
  return { values, getItem, setItem, removeItem };
}
function disk(values: Map<string, string>): Profile {
  return JSON.parse(values.get(STORAGE_KEY)!);
}
function entries() {
  const result = readResultJournal();
  expect(result.status).toBe('ready');
  return result.entries;
}
function seed(values: Map<string, string>, result: CompletedWorkoutResult) {
  const key = RESULT_JOURNAL_PREFIX + result.sessionId;
  values.set(key, JSON.stringify(result));
  return key;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('profile identity and frozen workout session', () => {
  it('does not invent an identity while parsing or viewing a legacy profile', () => {
    const { profileId: _id, ...legacy } = player();
    const { values, setItem } = storage(legacy);
    const before = values.get(STORAGE_KEY);
    expect(parseProfile(legacy).profileId).toBeUndefined();
    expect(parseProfile(legacy).profileId).toBeUndefined();
    expect(values.get(STORAGE_KEY)).toBe(before);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('assigns and verifies a legacy identity once when preparing a real session', () => {
    const { profileId: _id, ...legacy } = { ...player(), xp: 500, coins: 900 };
    const { values } = storage(legacy);
    const prepared = prepareWorkoutSession(values.get(STORAGE_KEY)!, 'tower');
    expect(prepared.status).toBe('ready');
    if (prepared.status !== 'ready') throw Error('Expected prepared fixture session');
    const saved = disk(values);
    expect(saved.profileId).toBeTruthy();
    expect(prepared.session.profileId).toBe(saved.profileId);
    expect(prepared.state.revision).toBe(values.get(STORAGE_KEY));
    expect(saved).toMatchObject({ xp: 500, coins: 900, workouts: [] });
    const second = prepareWorkoutSession(values.get(STORAGE_KEY)!, 'training');
    expect(second.status).toBe('ready');
    if (second.status !== 'ready') throw Error('Expected second fixture session');
    expect(second.session.profileId).toBe(prepared.session.profileId);
    expect(second.session.sessionId).not.toBe(prepared.session.sessionId);
  });

  it('captures the current intended floor and keeps a stable existing profile identity', () => {
    const p = player();
    p.game.highestClearedFloor = 2;
    const { values } = storage(p);
    const prepared = prepareWorkoutSession(values.get(STORAGE_KEY)!, 'tower');
    expect(prepared.status).toBe('ready');
    if (prepared.status !== 'ready') throw Error('Expected prepared fixture session');
    expect(prepared.session).toMatchObject({ schemaVersion: 1, profileId: PROFILE_ID, mode: 'tower', floor: 3 });
    expect(prepared.session.sessionId).toBeTruthy();
  });

  it.each(['training', 'ghost'] as const)('does not attach a tower floor to %s', (mode) => {
    const { values } = storage();
    const prepared = prepareWorkoutSession(values.get(STORAGE_KEY)!, mode);
    expect(prepared.status).toBe('ready');
    if (prepared.status !== 'ready') throw Error('Expected prepared fixture session');
    expect(prepared.session.floor).toBeNull();
  });

  it('rejects a stale session start without altering current primary or backup', () => {
    const { values, setItem } = storage();
    const raw = values.get(STORAGE_KEY);
    expect(prepareWorkoutSession('stale-revision', 'tower').status).toBe('conflict');
    expect(values.get(STORAGE_KEY)).toBe(raw);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('does not start a legacy session if its identity cannot be persisted', () => {
    const { profileId: _id, ...legacy } = player();
    const { values, setItem } = storage(legacy);
    const before = values.get(STORAGE_KEY);
    setItem.mockImplementation(() => { throw Error('quota'); });
    expect(prepareWorkoutSession(before!, 'tower').status).toBe('unavailable');
    expect(values.get(STORAGE_KEY)).toBe(before);
    expect(disk(values).profileId).toBeUndefined();
  });

  it('preserves profile identity through parsing and workout profile construction', () => {
    const p = parseProfile(player());
    expect(p.profileId).toBe(PROFILE_ID);
    expect(addCompletedWorkout(p, 65000, new Date(FINISHED_AT), { sessionId: SESSION_ID }).profileId).toBe(PROFILE_ID);
  });
});

describe('pending result commit and interrupted writes', () => {
  it('writes and verifies the journal before touching the profile, then clears it after acknowledgement', () => {
    const { values, setItem } = storage();
    expect(commitWorkoutResult(completion()).status).toBe('saved');
    const keys = setItem.mock.calls.map(([key]) => key);
    expect(keys[0].startsWith(RESULT_JOURNAL_PREFIX)).toBe(true);
    expect(keys.indexOf(STORAGE_KEY)).toBeGreaterThan(0);
    expect(disk(values)).toMatchObject({ profileId: PROFILE_ID, xp: 185, coins: 165, game: { highestClearedFloor: 1 } });
    expect(disk(values).workouts).toHaveLength(1);
    expect(disk(values).creditedWorkoutIds).toContain(SESSION_ID);
    expect(entries()).toEqual([]);
  });

  it.each(['throw', 'noop'] as const)('does not award XP if the journal write fails with %s', (failure) => {
    const { values, setItem } = storage();
    const before = values.get(STORAGE_KEY);
    setItem.mockImplementation((key, value) => {
      if (key.startsWith(RESULT_JOURNAL_PREFIX)) {
        if (failure === 'throw') throw Error('quota');
        return;
      }
      values.set(key, value);
    });
    expect(commitWorkoutResult(completion()).status).toBe('unavailable');
    expect(values.get(STORAGE_KEY)).toBe(before);
    expect(entries()).toEqual([]);
  });

  it('does not award XP when the journal read-back is not confirmed', () => {
    const { values, getItem } = storage();
    const before = values.get(STORAGE_KEY);
    getItem.mockImplementation((key) => key.startsWith(RESULT_JOURNAL_PREFIX) ? null : values.get(key) ?? null);
    expect(commitWorkoutResult(completion()).status).toBe('unavailable');
    expect(values.get(STORAGE_KEY)).toBe(before);
    getItem.mockImplementation((key) => values.get(key) ?? null);
    expect(entries()).toHaveLength(1);
    expect(reconcileWorkoutResults().status).toBe('saved');
    expect(disk(values).xp).toBe(185);
  });

  it.each([STORAGE_KEY, PROFILE_BACKUP_KEY])('replays a durable journal after failed %s write', (failedKey) => {
    const { values, setItem } = storage();
    const before = values.get(STORAGE_KEY);
    setItem.mockImplementation((key, value) => { if (key === failedKey) throw Error('quota'); values.set(key, value); });
    expect(commitWorkoutResult(completion()).status).toBe('unavailable');
    expect(values.get(STORAGE_KEY)).toBe(before);
    expect(entries()).toHaveLength(1);
    setItem.mockImplementation((key, value) => { values.set(key, value); });
    expect(reconcileWorkoutResults().status).toBe('saved');
    expect(disk(values)).toMatchObject({ xp: 185, coins: 165, game: { highestClearedFloor: 1 } });
    expect(entries()).toEqual([]);
    expect(reconcileWorkoutResults().status).toBe('saved');
    expect(disk(values).workouts).toHaveLength(1);
  });

  it('retains a durable result after a no-op primary write', () => {
    const { values, setItem } = storage();
    const before = values.get(STORAGE_KEY);
    setItem.mockImplementation((key, value) => { if (key !== STORAGE_KEY) values.set(key, value); });
    expect(commitWorkoutResult(completion()).status).toBe('unavailable');
    expect(values.get(STORAGE_KEY)).toBe(before);
    expect(entries()).toHaveLength(1);
  });

  it('does not pay again when primary was written but its first read-back failed', () => {
    const { values, getItem, setItem } = storage();
    const before = values.get(STORAGE_KEY)!;
    let wrotePrimary = false;
    let failedReadBack = false;
    setItem.mockImplementation((key, value) => {
      values.set(key, value);
      if (key === STORAGE_KEY) wrotePrimary = true;
    });
    getItem.mockImplementation((key) => {
      if (key === STORAGE_KEY && wrotePrimary && !failedReadBack) {
        failedReadBack = true;
        return before;
      }
      return values.get(key) ?? null;
    });
    expect(commitWorkoutResult(completion()).status).toBe('unavailable');
    expect(disk(values)).toMatchObject({ xp: 185, coins: 165 });
    expect(entries()).toHaveLength(1);
    getItem.mockImplementation((key) => values.get(key) ?? null);
    const awarded = values.get(STORAGE_KEY);
    expect(reconcileWorkoutResults().status).toBe('saved');
    expect(values.get(STORAGE_KEY)).toBe(awarded);
    expect(entries()).toEqual([]);
  });

  it.each(['throw', 'noop'] as const)('does not pay again after primary succeeds but journal cleanup is %s', (failure) => {
    const { values, removeItem } = storage();
    removeItem.mockImplementation(() => { if (failure === 'throw') throw Error('denied'); });
    expect(commitWorkoutResult(completion()).status).toBe('unavailable');
    const awarded = values.get(STORAGE_KEY);
    expect(disk(values)).toMatchObject({ xp: 185, coins: 165 });
    expect(entries()).toHaveLength(1);
    removeItem.mockImplementation((key) => { values.delete(key); });
    expect(reconcileWorkoutResults().status).toBe('saved');
    expect(values.get(STORAGE_KEY)).toBe(awarded);
    expect(entries()).toEqual([]);
  });

  it('keeps newer wallet, purchases, and claimed days while applying the pending result', () => {
    const newer = player();
    newer.xp = 500; newer.coins = 900;
    newer.game.muscles.arms = 1;
    newer.game.outfit = 'ember'; newer.game.ownedOutfits = ['base', 'ember'];
    newer.game.lastLoginDay = '2026-10-22'; newer.game.claimedLoginDays = ['2026-10-22'];
    const { values } = storage(newer);
    seed(values, completion({ mode: 'training', floor: null }));
    expect(reconcileWorkoutResults().status).toBe('saved');
    expect(disk(values)).toMatchObject({ profileId: PROFILE_ID, xp: 620, coins: 935,
      game: { muscles: { arms: 1 }, outfit: 'ember', claimedLoginDays: ['2026-10-22'] } });
  });

  it('cleans an already-credited old result before checking the now-advanced floor', () => {
    let p = addCompletedWorkout(player(), 65000, new Date(FINISHED_AT), { sessionId: SESSION_ID, mode: 'tower' });
    for (let i = 0; i < 64; i++) p = addCompletedWorkout(p, 65000, new Date(FINISHED_AT), { sessionId: `later-${i}` });
    expect(p.workouts.some((w) => w.id === SESSION_ID)).toBe(false);
    const { values } = storage(p);
    seed(values, completion());
    const before = values.get(STORAGE_KEY);
    expect(reconcileWorkoutResults().status).toBe('saved');
    expect(values.get(STORAGE_KEY)).toBe(before);
    expect(entries()).toEqual([]);
  });
});

describe('journal mismatch and untrusted input gates', () => {
  it('preserves a mismatched profile result without giving it to a reset fighter', () => {
    const { values } = storage({ ...player(), profileId: OTHER_PROFILE_ID, xp: 500, coins: 900 });
    const before = values.get(STORAGE_KEY);
    expect(commitWorkoutResult(completion()).status).toBe('mismatch');
    expect(values.get(STORAGE_KEY)).toBe(before);
    expect(entries()).toHaveLength(1);
    expect(reconcileWorkoutResults().status).toBe('mismatch');
    expect(values.get(STORAGE_KEY)).toBe(before);
  });

  it('does not delete another profile result merely because its session ID is credited locally', () => {
    const p = { ...player(), profileId: OTHER_PROFILE_ID, creditedWorkoutIds: [SESSION_ID] };
    const { values } = storage(p);
    const key = seed(values, completion());
    const raw = values.get(key);
    const before = values.get(STORAGE_KEY);
    expect(reconcileWorkoutResults().status).toBe('mismatch');
    expect(values.get(STORAGE_KEY)).toBe(before);
    expect(values.get(key)).toBe(raw);
  });

  it('does not turn a result from floor 1 into a reward for floor 2', () => {
    const p = player(); p.game.highestClearedFloor = 1;
    const { values } = storage(p);
    const before = values.get(STORAGE_KEY);
    expect(commitWorkoutResult(completion()).status).toBe('mismatch');
    expect(values.get(STORAGE_KEY)).toBe(before);
    expect(entries()).toHaveLength(1);
  });

  it('never overwrites an existing immutable session payload with a changed result', () => {
    const { values } = storage();
    const key = seed(values, completion());
    const before = values.get(key);
    const outcome = commitWorkoutResult(completion({ durationMs: 66000 }));
    expect(outcome.status).not.toBe('saved');
    expect(values.get(key)).toBe(before);
    expect(disk(values).xp).toBe(0);
  });

  it('keeps different concurrent sessions independently when primary storage is full', () => {
    const { values, setItem } = storage();
    setItem.mockImplementation((key, value) => { if (key === STORAGE_KEY) throw Error('quota'); values.set(key, value); });
    const second = completion({ sessionId: 'f8cd0e6b-e7c8-4faf-b9d9-ea33b0518403', mode: 'training', floor: null });
    expect(commitWorkoutResult(completion({ mode: 'training', floor: null })).status).toBe('unavailable');
    expect(commitWorkoutResult(second).status).toBe('unavailable');
    expect(entries()).toHaveLength(2);
    setItem.mockImplementation((key, value) => { values.set(key, value); });
    expect(reconcileWorkoutResults().status).toBe('saved');
    expect(disk(values)).toMatchObject({ xp: 240, coins: 170 });
    expect(new Set(disk(values).workouts.map((w) => w.id)).size).toBe(2);
    expect(entries()).toEqual([]);
  });

  it('preserves the second result for the same original floor without paying the next floor', () => {
    const { values } = storage();
    seed(values, completion());
    const second = completion({ sessionId: 'f8cd0e6b-e7c8-4faf-b9d9-ea33b0518403', finishedAt: '2026-10-22T12:01:00.000Z' });
    const key = seed(values, second);
    const raw = values.get(key);
    expect(reconcileWorkoutResults().status).toBe('mismatch');
    expect(disk(values)).toMatchObject({ xp: 185, coins: 165, game: { highestClearedFloor: 1 } });
    expect(disk(values).workouts).toHaveLength(1);
    expect(entries()).toHaveLength(1);
    expect(values.get(key)).toBe(raw);
  });

  it('rejects a valid envelope stored under another session key', () => {
    const { values } = storage();
    const key = RESULT_JOURNAL_PREFIX + 'different-session';
    const raw = JSON.stringify(completion());
    values.set(key, raw);
    const before = values.get(STORAGE_KEY);
    expect(reconcileWorkoutResults().status).toBe('invalid');
    expect(values.get(STORAGE_KEY)).toBe(before);
    expect(values.get(key)).toBe(raw);
  });

  it.each(['{bad', JSON.stringify({ ...completion(), schemaVersion: 99 })])('preserves malformed or unknown journal input %s', (raw) => {
    const { values } = storage();
    const key = RESULT_JOURNAL_PREFIX + SESSION_ID;
    values.set(key, raw);
    const before = values.get(STORAGE_KEY);
    expect(readResultJournal()).toMatchObject({ status: 'ready', entries: [{ key, raw, result: null }] });
    expect(reconcileWorkoutResults().status).toBe('invalid');
    expect(values.get(key)).toBe(raw);
    expect(values.get(STORAGE_KEY)).toBe(before);
  });

  it.each([
    { repetitions: 19 }, { durationMs: 0 }, { durationMs: Number.NaN },
    { finishedAt: 'invalid-date' }, { mode: 'online' }, { floor: 0 },
    { profileId: '' }, { sessionId: '' }, { splitsMs: Array(20).fill(-1) },
  ])('does not award a malformed result %j', (changes) => {
    const { values } = storage();
    const before = values.get(STORAGE_KEY);
    const result = { ...completion(), ...changes } as CompletedWorkoutResult;
    expect(commitWorkoutResult(result).status).toBe('invalid');
    expect(values.get(STORAGE_KEY)).toBe(before);
  });

  it('leaves a damaged primary intact and retains the journal for explicit recovery', () => {
    const { values } = storage();
    values.set(STORAGE_KEY, '{damaged');
    const key = seed(values, completion());
    const raw = values.get(key);
    expect(reconcileWorkoutResults().status).toBe('recovery-required');
    expect(values.get(STORAGE_KEY)).toBe('{damaged');
    expect(values.get(key)).toBe(raw);
  });

  it('does not adopt a pending identity into a legacy profile during replay', () => {
    const { profileId: _id, ...legacy } = player();
    const { values } = storage(legacy);
    seed(values, completion());
    const before = values.get(STORAGE_KEY);
    expect(reconcileWorkoutResults().status).toBe('mismatch');
    expect(values.get(STORAGE_KEY)).toBe(before);
    expect(disk(values).profileId).toBeUndefined();
    expect(entries()).toHaveLength(1);
  });

  it('reports unavailable without pretending an unreadable journal is empty', () => {
    const { values, getItem } = storage();
    seed(values, completion());
    getItem.mockImplementation(() => { throw Error('denied'); });
    expect(readResultJournal()).toEqual({ status: 'unavailable', entries: [] });
  });
});
