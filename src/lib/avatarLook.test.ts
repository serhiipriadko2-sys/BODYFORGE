import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AVATAR_LOOK_KEY, DEFAULT_AVATAR_LOOK, SKIN_TONES, HAIR_TONES, HAIR_STYLES, TRIM_TONES,
  parseAvatarLook, readAvatarLook, saveAvatarLook, lookColors,
} from './avatarLook';
import { STORAGE_KEY, PROFILE_BACKUP_KEY } from './progression';
import { RESULT_JOURNAL_PREFIX } from './workoutJournal';

const reserved = new Map([
  [STORAGE_KEY, '{"xp":400,"coins":100,"workouts":[]}'],
  [PROFILE_BACKUP_KEY, '{"xp":400,"coins":120,"workouts":[]}'],
  [RESULT_JOURNAL_PREFIX + 'pending', 'opaque pending result'],
]);
function store(initial?: string) {
  const entries = new Map(reserved);
  if (initial !== undefined) entries.set(AVATAR_LOOK_KEY, initial);
  return {
    entries,
    getItem: vi.fn((k: string) => entries.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => { entries.set(k, v); }),
  };
}
afterEach(() => vi.restoreAllMocks());
describe('origin-local avatar appearance — independent of paid gear', () => {
  it('loads without side effects, not a shared mutable default', () => {
    const storage = store();
    const got = readAvatarLook(storage);
    expect(got).toEqual({ status: 'ready', look: DEFAULT_AVATAR_LOOK });
    got.look.skin = 'deep';
    expect(DEFAULT_AVATAR_LOOK.skin).toBe('sand');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.entries.size).toBe(reserved.size);
  });
  it('persists only the cosmetics key, never changing the game profile or journals', () => {
    const storage = store();
    const look = { version: 1 as const, skin: 'umber' as const, hair: 'plum' as const,
      trim: 'pulse' as const, visor: true };
    expect(saveAvatarLook(look, storage)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(AVATAR_LOOK_KEY, JSON.stringify(look));
    expect(readAvatarLook(storage)).toEqual({ status: 'ready', look });
    for (const [key, value] of reserved) expect(storage.entries.get(key)).toEqual(value);
  });
  it.each([
    'not-json', '{}', 'null', '[]',
    JSON.stringify({ ...DEFAULT_AVATAR_LOOK, version: 2 }),
    JSON.stringify({ ...DEFAULT_AVATAR_LOOK, skin: '__proto__' }),
    JSON.stringify({ ...DEFAULT_AVATAR_LOOK, hair: 'red;--x:0' }),
    JSON.stringify({ ...DEFAULT_AVATAR_LOOK, hairStyle: 'remote-code' }),
    JSON.stringify({ ...DEFAULT_AVATAR_LOOK, hairStyle: null }),
    JSON.stringify({ ...DEFAULT_AVATAR_LOOK, trim: 'blue' }),
    JSON.stringify({ ...DEFAULT_AVATAR_LOOK, visor: 'false' }),
  ])('rejects malformed/newer choice and keeps bytes: %s', (raw) => {
    const storage = store(raw);
    expect(parseAvatarLook(raw)).toBeNull();
    expect(readAvatarLook(storage).status).toBe('invalid');
    expect(storage.entries.get(AVATAR_LOOK_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('accepts legacy v1 bytes with no hairStyle without rewriting and lets a haircut be added later', () => {
    const legacy = { version: 1 as const, skin: 'sand' as const, hair: 'ink' as const,
      trim: 'glacier' as const, visor: false };
    const original = JSON.stringify(legacy);
    const storage = store(original);
    expect(readAvatarLook(storage)).toEqual({ status: 'ready', look: legacy });
    expect(storage.getItem(AVATAR_LOOK_KEY)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
    const extended = { ...legacy, hairStyle: 'swept' as const };
    expect(saveAvatarLook(extended, storage)).toBe(true);
    expect(readAvatarLook(storage).look.hairStyle).toBe('swept');
    expect(storage.entries.get(STORAGE_KEY)).toBe(reserved.get(STORAGE_KEY));
  });
  it('allows three haircuts but rejects injecting unsupported values into persisted looks', () => {
    expect(HAIR_STYLES.map((s) => s.id)).toEqual(['crop', 'buzz', 'swept']);
    for (const style of HAIR_STYLES) {
      const value = { ...DEFAULT_AVATAR_LOOK, hairStyle: style.id };
      expect(parseAvatarLook(JSON.stringify(value))).toEqual(value);
    }
  });
  it('does not claim durable save for storage errors, quota or silent writes', () => {
    const storage = store();
    storage.setItem.mockImplementation(() => { throw Error('disabled'); });
    expect(saveAvatarLook({ ...DEFAULT_AVATAR_LOOK }, storage)).toBe(false);
    const silent = { getItem: (_: string): string | null => null, setItem: (_: string, __: string) => undefined };
    expect(saveAvatarLook({ ...DEFAULT_AVATAR_LOOK }, silent)).toBe(false);
    const reader = { getItem: (_: string): string => { throw Error('denied'); } };
    expect(readAvatarLook(reader).status).toBe('unavailable');
  });
  it('offers unique labels and finite color inputs for 3D and SVG fallbacks', () => {
    for (const values of [SKIN_TONES, HAIR_TONES, TRIM_TONES]) {
      expect(new Set(values.map((v) => v.id)).size).toBe(values.length);
      expect(values.every((v) => /^#[0-9a-f]{6}$/i.test(v.color))).toBe(true);
    }
    expect(lookColors({ ...DEFAULT_AVATAR_LOOK })).toEqual({
      skin: '#c59473', hair: '#181a21', trim: '#55e3f2',
    });
    expect(lookColors({ ...DEFAULT_AVATAR_LOOK, skin: 'deep', hair: 'silver', trim: 'voltage' })).toEqual({
      skin: '#50372f', hair: '#b7c1cd', trim: '#cbfa55',
    });
  });
});
