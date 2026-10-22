import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshGame } from './game';
import { parseProfile, PROFILE_BACKUP_KEY, STORAGE_KEY, type Profile } from './progression';
import { RESULT_JOURNAL_PREFIX, RESULT_QUARANTINE_PREFIX, type CompletedWorkoutResult } from './workoutJournal';
import { createProgressExport } from './progressExport';

const result = (): CompletedWorkoutResult => ({
  schemaVersion: 1, profileId: 'export-profile', sessionId: 'export-session', mode: 'tower', floor: 1,
  durationMs: 65000, finishedAt: '2026-10-22T12:00:00.000Z', repetitions: 20,
});
function storage(values: Map<string, string>) {
  const getItem = vi.fn((key: string) => values.get(key) ?? null);
  const setItem = vi.fn(), removeItem = vi.fn(), fetch = vi.fn();
  const fake = {
    getItem, setItem, removeItem,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  vi.stubGlobal('localStorage', fake);
  vi.stubGlobal('fetch', fetch);
  return { fake, getItem, setItem, removeItem, fetch };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('local progress export evidence', () => {
  it('preserves corrupt profile, original journal metadata and unknown quarantined bytes exactly', () => {
    const completed = result();
    const key = RESULT_JOURNAL_PREFIX + completed.sessionId;
    const raw = '\n' + JSON.stringify({ ...completed, futureMetadata: { note: 'Не терять' } }, null, 2) + '\n';
    const unknownKey = RESULT_JOURNAL_PREFIX + 'future-session';
    const unknownRaw = '{ "schemaVersion": 99, "opaque": "original bytes" }\n';
    const quarantineKey = RESULT_QUARANTINE_PREFIX + 'unknown-envelope';
    const quarantineRaw = '{damaged quarantine\n';
    const storedProfileRaw = '{broken primary\n';
    const storedBackupRaw = ' { "xp": 500, "coins": 900, "workouts": [], "unknown": true }\n';
    const values = new Map([
      [STORAGE_KEY, storedProfileRaw], [PROFILE_BACKUP_KEY, storedBackupRaw],
      [key, raw], [unknownKey, unknownRaw], [quarantineKey, quarantineRaw],
    ]);
    const before = [...values];
    const { setItem, removeItem, fetch } = storage(values);
    const payload = createProgressExport(parseProfile(null), null);
    expect(payload.storedProfileRaw).toBe(storedProfileRaw);
    expect(payload.storedBackupRaw).toBe(storedBackupRaw);
    expect(payload.pendingResults).toEqual(expect.arrayContaining([completed, { key: unknownKey, raw: unknownRaw }]));
    expect(payload.pendingResultOriginals).toEqual(expect.arrayContaining([{ key, raw }, { key: unknownKey, raw: unknownRaw }]));
    expect(payload.quarantinedResults).toEqual([{ key: quarantineKey, raw: quarantineRaw }]);
    expect([payload.storageReadStatus, payload.journalReadStatus, payload.quarantineReadStatus]).toEqual(['ready', 'ready', 'ready']);
    expect([...values]).toEqual(before);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps legacy progress and a RAM-only result without inventing an identity or awarding XP', () => {
    const legacy: Profile = { xp: 120, coins: 35, workouts: [{ id: 'legacy-1', repetitions: 20, xp: 120,
      durationMs: 65000, finishedAt: '2026-10-21T12:00:00.000Z' }], game: freshGame() };
    const original = JSON.stringify({ xp: legacy.xp, coins: legacy.coins, workouts: legacy.workouts });
    const values = new Map([[STORAGE_KEY, original]]);
    const { setItem, removeItem, fetch } = storage(values);
    const pending = result();
    const payload = createProgressExport(legacy, pending);
    expect(payload).toMatchObject({ ...legacy, pendingResult: pending, pendingResults: [],
      pendingResultOriginals: [], quarantinedResults: [], storedProfileRaw: original, storedBackupRaw: null });
    expect(payload.profileId).toBeUndefined();
    expect(payload.xp).toBe(120);
    expect(payload.coins).toBe(35);
    expect(values.get(STORAGE_KEY)).toBe(original);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports failed reads without losing a readable backup or the in-memory result', () => {
    const rawBackup = ' {"xp":120,"coins":35,"workouts":[]}\n';
    const values = new Map([[PROFILE_BACKUP_KEY, rawBackup]]);
    const { fake, getItem, setItem, removeItem, fetch } = storage(values);
    getItem.mockImplementation((key) => {
      if (key === STORAGE_KEY) throw new DOMException('Storage blocked', 'SecurityError');
      return values.get(key) ?? null;
    });
    Object.defineProperty(fake, 'length', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
    const pending = result();
    const payload = createProgressExport(parseProfile(null), pending);
    expect(payload).toMatchObject({ pendingResult: pending, storedProfileRaw: null, storedBackupRaw: rawBackup,
      storageReadStatus: 'unavailable', journalReadStatus: 'unavailable', quarantineReadStatus: 'unavailable',
      pendingResults: [], pendingResultOriginals: [], quarantinedResults: [] });
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
