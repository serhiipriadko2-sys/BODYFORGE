import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshGame } from './game';
import { parseProfile, saveProfile, STORAGE_KEY, PROFILE_BACKUP_KEY, type Profile } from './progression';

const base: Profile = { xp: 0, coins: 100, workouts: [], game: { ...freshGame(), created: true } };
const next: Profile = { ...base, coins: 110 };
const foreign: Profile = { ...base, xp: 500, coins: 900 };
const raw = JSON.stringify(parseProfile(base));
function storage(entries: [string, string][] = [[STORAGE_KEY, raw]]) {
  const values = new Map(entries);
  const getItem = vi.fn((key: string) => values.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => { values.set(key, value); });
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', { getItem, setItem });
  return { values, getItem, setItem };
}
afterEach(() => vi.unstubAllGlobals());

describe('profile write acknowledgement', () => {
  it('returns the exact verified serialized revision to its caller', () => {
    const { values } = storage();
    const result = saveProfile(next, { expectedRaw: raw });
    expect(result.status).toBe('saved');
    if (result.status !== 'saved') throw Error('Expected successful fixture save');
    expect(result.revision).toBe(values.get(STORAGE_KEY));
    expect(JSON.parse(result.revision)).toEqual(next);
  });

  it('never acknowledges another writer revision that appeared after its last read-back', () => {
    const { values, getItem, setItem } = storage();
    const remote = JSON.stringify(foreign);
    let awaiting = false;
    setItem.mockImplementation((key, value) => { values.set(key, value); if (key === STORAGE_KEY) awaiting = true; });
    getItem.mockImplementation((key) => {
      const value = values.get(key) ?? null;
      if (key === STORAGE_KEY && awaiting) { awaiting = false; values.set(key, remote); }
      return value;
    });
    const result = saveProfile(next, { expectedRaw: raw });
    expect(result.status).toBe('saved');
    if (result.status !== 'saved') throw Error('Expected successful fixture read-back');
    expect(result.revision).toBe(JSON.stringify(parseProfile(next)));
    expect(result.revision).not.toBe(remote);
    expect(saveProfile({ ...next, coins: 85 }, { expectedRaw: result.revision })).toEqual({ status: 'conflict' });
    expect(values.get(STORAGE_KEY)).toBe(remote);
  });

  it('does not return an acknowledged revision on a stale writer conflict', () => {
    storage([[STORAGE_KEY, JSON.stringify(foreign)]]);
    expect(saveProfile(next, { expectedRaw: raw })).toEqual({ status: 'conflict' });
  });

  it('does not return a revision for unreadable existing data', () => {
    const { values } = storage([[STORAGE_KEY, '{bad']]);
    expect(saveProfile(next)).toEqual({ status: 'recovery-required' });
    expect(values.get(STORAGE_KEY)).toBe('{bad');
  });

  it.each([PROFILE_BACKUP_KEY, STORAGE_KEY])('never confirms a failed write to %s', (failedKey) => {
    const { values, setItem } = storage();
    setItem.mockImplementation((key, value) => { if (key === failedKey) throw Error('quota'); values.set(key, value); });
    expect(saveProfile(next)).toEqual({ status: 'unavailable' });
    expect(values.get(STORAGE_KEY)).toBe(raw);
  });

  it('does not confirm a no-op primary write', () => {
    const { values, setItem } = storage();
    setItem.mockImplementation((key, value) => { if (key !== STORAGE_KEY) values.set(key, value); });
    expect(saveProfile(next)).toEqual({ status: 'unavailable' });
    expect(values.get(STORAGE_KEY)).toBe(raw);
  });

  it('can acknowledge an unchanged canonical save without rewriting its valid backup', () => {
    const { setItem } = storage([[STORAGE_KEY, raw], [PROFILE_BACKUP_KEY, JSON.stringify({ ...base, coins: 0 })]]);
    expect(saveProfile(base)).toEqual({ status: 'saved', revision: raw });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('acknowledges its own normalized revision when rewriting noncanonical JSON', () => {
    const pretty = JSON.stringify(base, null, 2);
    const { values } = storage([[STORAGE_KEY, pretty], [PROFILE_BACKUP_KEY, raw]]);
    expect(saveProfile(base, { expectedRaw: pretty })).toEqual({ status: 'saved', revision: raw });
    expect(values.get(STORAGE_KEY)).toBe(raw);
  });

  it('does not expose a revision if storage is unreadable', () => {
    const { getItem } = storage();
    getItem.mockImplementation(() => { throw Error('denied'); });
    expect(saveProfile(next)).toEqual({ status: 'unavailable' });
  });
});
