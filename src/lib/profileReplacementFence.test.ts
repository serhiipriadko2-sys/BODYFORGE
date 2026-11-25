import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshGame } from './game';
import { loadProfileState, recoverProfile, saveProfile, PROFILE_BACKUP_KEY,
  PROFILE_REPLACEMENT_MARKER_KEY, STORAGE_KEY, type Profile } from './progression';
import { prepareWorkoutSession, RESULT_JOURNAL_PREFIX } from './workoutJournal';
import { replayDurableWorkouts } from './durableWorkout';

const profile: Profile = { profileId: 'test-fighter', creditedWorkoutIds: [], xp: 100, coins: 42,
  workouts: [], game: { ...freshGame(), created: true } };
const primary = JSON.stringify(profile, null, 2);
const fallback = JSON.stringify({ ...profile, coins: 11 });
const journal = RESULT_JOURNAL_PREFIX + 'preserved';
const contents = new Map<string, string>();
const setItem = vi.fn((key: string, value: string) => contents.set(key, value));
const removeItem = vi.fn((key: string) => contents.delete(key));
const durableOpen = vi.fn();
beforeEach(() => {
  contents.clear();
  contents.set(STORAGE_KEY, primary);
  contents.set(PROFILE_BACKUP_KEY, fallback);
  setItem.mockClear();
  removeItem.mockClear();
  durableOpen.mockClear();
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => contents.get(key) ?? null, setItem, removeItem,
    get length() { return contents.size; }, key: (index: number) => [...contents.keys()][index] ?? null,
  });
  vi.stubGlobal('indexedDB', { open: durableOpen });
});
afterEach(() => vi.unstubAllGlobals());

describe('BF-106 protection while a replacement is unresolved', () => {
  it.each(['', '{broken', '{"version":1}'])('hides transitional primary and stops ordinary mutations for marker %j', async marker => {
    contents.set(PROFILE_REPLACEMENT_MARKER_KEY, marker);
    contents.set(journal, '{original pending bytes}');
    const original = [...contents.entries()];
    expect(loadProfileState()).toMatchObject({ status: 'unavailable', backupAvailable: false, revision: null });
    expect(saveProfile({ ...profile, coins: 900 }, { expectedRaw: primary })).toEqual({ status: 'unavailable' });
    expect(recoverProfile('backup').status).toBe('unavailable');
    expect(recoverProfile('empty').status).toBe('unavailable');
    expect(prepareWorkoutSession(primary, 'training').status).toBe('unavailable');
    const signal = new AbortController().signal;
    expect((await replayDurableWorkouts(null, { signal, isCurrent: () => true })).status).toBe('unavailable');
    expect([...contents.entries()]).toEqual(original);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(durableOpen).not.toHaveBeenCalled();
  });

  it('leaves the existing save and backup behavior available after explicit settlement clears the marker', () => {
    contents.set(PROFILE_REPLACEMENT_MARKER_KEY, 'staged');
    expect(saveProfile(profile).status).toBe('unavailable');
    contents.delete(PROFILE_REPLACEMENT_MARKER_KEY);
    expect(loadProfileState()).toMatchObject({ status: 'ready', revision: primary });
    expect(saveProfile({ ...profile, coins: 70 }, { expectedRaw: primary }).status).toBe('saved');
    expect(loadProfileState().profile.coins).toBe(70);
    expect(JSON.parse(contents.get(PROFILE_BACKUP_KEY)!).coins).toBe(42);
  });
});
