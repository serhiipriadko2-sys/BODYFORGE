import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimDailyQuest, claimLogin, freshGame, upgradeMuscle } from './game';
import { addCompletedWorkout, loadProfileState, parseProfile, PROFILE_BACKUP_KEY, recoverProfile,
  saveProfile, STORAGE_KEY, type Profile } from './progression';
import { replayDurableWorkouts } from './durableWorkout';
import { resultJournalEntry, type CompletedWorkoutResult } from './workoutJournal';
import { createProgressExport } from './progressExport';

// Real replay/progression code; durable storage acknowledgements are mocked.
// This suite tests malformed profile data, not actual IndexedDB durability.
const durable = vi.hoisted(() => ({ read: vi.fn(), stage: vi.fn(), mark: vi.fn() }));
vi.mock('./durableJournal', () => ({
  readDurableJournal: durable.read,
  stageDurableResults: durable.stage,
  markDurableResults: durable.mark,
}));

const PROFILE_ID = 'dedup-recovery-player';
const FINISHED_AT = '2026-10-22T12:00:00.000Z';
const OLD_SESSION = 'dedup-recovery-session-0';
function completedProfile(): Profile {
  let profile: Profile = { profileId: PROFILE_ID, xp: 0, coins: 0, workouts: [],
    game: { ...freshGame(), created: true } };
  for (let index = 0; index < 65; index++) {
    profile = addCompletedWorkout(profile, 65000, new Date(FINISHED_AT), {
      sessionId: `dedup-recovery-session-${index}`, mode: 'training',
    });
  }
  return profile;
}
function storage(value: unknown) {
  const values = new Map<string, string>([[STORAGE_KEY, JSON.stringify(value)]]);
  const setItem = vi.fn((key: string, raw: string) => { values.set(key, raw); });
  const removeItem = vi.fn((key: string) => { values.delete(key); });
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem, removeItem, key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  });
  return { values, setItem, removeItem };
}
const context = () => ({ signal: new AbortController().signal, isCurrent: () => true });
beforeEach(() => {
  const result: CompletedWorkoutResult = { schemaVersion: 1, profileId: PROFILE_ID,
    sessionId: OLD_SESSION, mode: 'training', floor: null, durationMs: 65000,
    finishedAt: FINISHED_AT, repetitions: 20 };
  const entry = resultJournalEntry(result)!;
  durable.read.mockReset().mockResolvedValue({ status: 'ready', entries: [
    { ...entry, baseProfileRaw: null, state: 'settled' },
  ] });
  durable.stage.mockReset().mockImplementation(async (entries: { key: string; raw: string }[]) => ({
    status: 'saved', entries: entries.map((entry) => ({
      key: entry.key, raw: entry.raw, baseProfileRaw: null, state: 'active' as const,
    })),
  }));
  durable.mark.mockReset().mockImplementation(async (entries: { key: string; raw: string }[], state: 'settled' | 'quarantined') => ({
    status: 'saved', entries: entries.map((entry) => ({
      key: entry.key, raw: entry.raw, baseProfileRaw: null, state,
    })),
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('ambiguous reward identity recovery', () => {
  it('does not pay an old settled result again when its reward ledger is malformed', async () => {
    const profile = completedProfile();
    expect(profile.workouts.some((workout) => workout.id === OLD_SESSION)).toBe(false);
    expect(profile.creditedWorkoutIds).toContain(OLD_SESSION);
    const { values } = storage({ ...profile, creditedWorkoutIds: { malformed: true } });
    const original = values.get(STORAGE_KEY);
    const outcome = await replayDurableWorkouts(null, context());
    const after: Profile = JSON.parse(values.get(STORAGE_KEY)!);
    expect(after.xp).toBe(profile.xp);
    expect(after.coins).toBe(profile.coins);
    expect(after.totals).toEqual(profile.totals);
    expect(outcome.status).toBe('recovery-required');
    expect(loadProfileState()).toMatchObject({ status: 'recovery-required',
      profile: { profileId: PROFILE_ID, xp: profile.xp, coins: profile.coins } });
    expect(values.get(STORAGE_KEY)).toBe(original);
  });

  it.each([
    ['null', null], ['object', { malformed: true }], ['string', OLD_SESSION],
    ['invalid member', [OLD_SESSION, 3]], ['blank member', [OLD_SESSION, ' ']],
    ['overlong member', [OLD_SESSION, 'x'.repeat(129)]], ['sparse member', Array(1)],
  ])('preserves readable progress and exact originals for a %s ledger', async (_, ledger) => {
    const profile = completedProfile();
    const { values, setItem, removeItem } = storage({ ...profile, creditedWorkoutIds: ledger });
    const original = values.get(STORAGE_KEY);
    const state = loadProfileState();
    expect(state).toMatchObject({ status: 'recovery-required', backupAvailable: false,
      profile: { profileId: PROFILE_ID, xp: profile.xp, coins: profile.coins,
        workouts: profile.workouts, game: profile.game, totals: profile.totals, creditedWorkoutIds: null } });
    expect(createProgressExport(state.profile, null).storedProfileRaw).toBe(original);
    expect((await replayDurableWorkouts(null, context())).status).toBe('recovery-required');
    expect(durable.stage).not.toHaveBeenCalled();
    expect(durable.mark).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled(); expect(removeItem).not.toHaveBeenCalled();
    expect(values.get(STORAGE_KEY)).toBe(original);
  });

  it('does not normalize ambiguity into a trusted profile through JSON or manual mutations', () => {
    const profile = completedProfile();
    const normalized = parseProfile({ ...profile, creditedWorkoutIds: { malformed: true } });
    expect(normalized.creditedWorkoutIds).toBeNull();
    const { values, setItem } = storage(JSON.parse(JSON.stringify(normalized)));
    expect(loadProfileState().status).toBe('recovery-required');
    expect(() => addCompletedWorkout(normalized, 65000, new Date(FINISHED_AT), {
      sessionId: 'new-completion', mode: 'training',
    })).toThrow('Reward identity ledger requires recovery');
    // These ordinary game actions must preserve the sentinel rather than make
    // a normalized fallback safe to persist. Their derived rewards stay in RAM.
    for (const changed of [claimLogin(normalized, new Date(FINISHED_AT)),
      claimDailyQuest(normalized, new Date(FINISHED_AT)), upgradeMuscle(normalized, 'arms')]) {
      expect(changed.creditedWorkoutIds).toBeNull();
      expect(saveProfile(changed).status).toBe('recovery-required');
    }
    expect(JSON.parse(values.get(STORAGE_KEY)!).xp).toBe(profile.xp);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('rejects a malformed next ledger before altering a healthy primary or backup', () => {
    const profile = completedProfile();
    const { values, setItem } = storage(profile);
    const original = [...values];
    const malformed = { ...profile, creditedWorkoutIds: [OLD_SESSION, 3] } as unknown as Profile;
    expect(saveProfile(malformed).status).toBe('recovery-required');
    expect([...values]).toEqual(original);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('keeps a healthy old-session ledger idempotent after its display history is trimmed', async () => {
    const profile = completedProfile();
    const { values, setItem } = storage(profile);
    const original = values.get(STORAGE_KEY);
    expect((await replayDurableWorkouts(null, context())).status).toBe('saved');
    expect(values.get(STORAGE_KEY)).toBe(original);
    expect(setItem).not.toHaveBeenCalled();
    expect(loadProfileState().status).toBe('ready');
  });

  it('fails closed for an identified paid legacy profile with no dedup ledger', () => {
    const { creditedWorkoutIds: _ids, ...legacy } = completedProfile();
    const { values, setItem, removeItem } = storage(legacy);
    const original = values.get(STORAGE_KEY);
    const state = loadProfileState();
    expect(state).toMatchObject({ status: 'recovery-required', backupAvailable: false,
      profile: { profileId: PROFILE_ID, xp: legacy.xp, coins: legacy.coins,
        workouts: legacy.workouts, creditedWorkoutIds: null } });
    expect(() => addCompletedWorkout(state.profile, 65000, new Date(FINISHED_AT), {
      sessionId: 'another-session', mode: 'training',
    })).toThrow('Reward identity ledger requires recovery');
    expect(saveProfile(state.profile).status).toBe('recovery-required');
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(values.get(STORAGE_KEY)).toBe(original);
  });

  it('keeps an anonymous legacy save with no dedup ledger readable and unchanged', () => {
    const { creditedWorkoutIds: _ids, profileId: _profileId, ...anonymous } = completedProfile();
    const { values, setItem } = storage(anonymous);
    const original = values.get(STORAGE_KEY);
    const state = loadProfileState();
    expect(state.status).toBe('ready');
    expect(state.profile).toMatchObject({ xp: anonymous.xp,
      coins: anonymous.coins, workouts: anonymous.workouts });
    expect(state.profile).not.toHaveProperty('profileId');
    expect(state.profile).not.toHaveProperty('creditedWorkoutIds');
    expect(values.get(STORAGE_KEY)).toBe(original);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('restores a trusted backup explicitly, preserving the damaged raw and old reward identity', async () => {
    const profile = completedProfile();
    const { values } = storage({ ...profile, creditedWorkoutIds: { malformed: true } });
    const original = values.get(STORAGE_KEY);
    values.set(PROFILE_BACKUP_KEY, JSON.stringify(profile));
    expect(loadProfileState()).toMatchObject({ status: 'recovery-required', backupAvailable: true });
    expect(recoverProfile('backup')).toMatchObject({ status: 'ready', profile });
    expect(values.get(`${STORAGE_KEY}:quarantine:0`)).toBe(original);
    const recovered = values.get(STORAGE_KEY);
    expect((await replayDurableWorkouts(null, context())).status).toBe('saved');
    expect(values.get(STORAGE_KEY)).toBe(recovered);
    expect(JSON.parse(recovered!).totals.workouts).toBe(65);
  });

  it('never offers another malformed ledger as a trusted backup', () => {
    const profile = completedProfile();
    const { values, setItem } = storage({ ...profile, creditedWorkoutIds: null });
    values.set(PROFILE_BACKUP_KEY, JSON.stringify({ ...profile, creditedWorkoutIds: [3] }));
    const original = [...values];
    expect(loadProfileState()).toMatchObject({ status: 'recovery-required', backupAvailable: false });
    expect(recoverProfile('backup').status).toBe('recovery-required');
    expect([...values]).toEqual(original);
    expect(setItem).not.toHaveBeenCalled();
  });
});
