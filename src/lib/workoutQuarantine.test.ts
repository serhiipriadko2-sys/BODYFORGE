import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshGame } from './game';
import { parseProfile, PROFILE_BACKUP_KEY, STORAGE_KEY, type Profile } from './progression';
import {
  quarantineWorkoutResults, readQuarantinedResults, readResultJournal, reconcileWorkoutResults,
  RESULT_JOURNAL_PREFIX, RESULT_QUARANTINE_PREFIX, sameWorkoutResult, type CompletedWorkoutResult,
} from './workoutJournal';

const PROFILE_ID = '8f711190-e774-4aa9-b44e-7777b2294021';
const OTHER_PROFILE_ID = '4a2c6303-1c89-4913-a8b9-bc373aa2517f';
const SESSION_ID = '69203342-b175-4b02-8673-8e8934360089';
const player = (): Profile => ({
  profileId: PROFILE_ID, xp: 500, coins: 900, workouts: [],
  game: { ...freshGame(), created: true },
});
function storage() {
  const values = new Map<string, string>([
    [STORAGE_KEY, JSON.stringify(parseProfile(player()))],
    [PROFILE_BACKUP_KEY, JSON.stringify(parseProfile({ ...player(), coins: 880 }))],
  ]);
  const getItem = vi.fn((key: string) => values.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => { values.set(key, value); });
  const removeItem = vi.fn((key: string) => { values.delete(key); });
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem, setItem, removeItem,
    key: (i: number) => [...values.keys()][i] ?? null,
    get length() { return values.size; },
  });
  return { values, getItem, setItem, removeItem };
}
function foreign(changes: Partial<CompletedWorkoutResult> = {}): CompletedWorkoutResult {
  return {
    schemaVersion: 1, profileId: OTHER_PROFILE_ID, sessionId: SESSION_ID,
    mode: 'tower', floor: 1, durationMs: 65000,
    finishedAt: '2026-10-22T12:00:00.000Z', repetitions: 20, ...changes,
  };
}
function seed(values: Map<string, string>, raw = JSON.stringify(foreign()), sessionId = SESSION_ID) {
  const key = RESULT_JOURNAL_PREFIX + encodeURIComponent(sessionId);
  values.set(key, raw);
  return key;
}
function active() {
  const read = readResultJournal();
  expect(read.status).toBe('ready');
  return read.entries;
}
function quarantined() {
  const read = readQuarantinedResults();
  expect(read.status).toBe('ready');
  return read.entries;
}
function walletBytes(values: Map<string, string>) {
  return [values.get(STORAGE_KEY), values.get(PROFILE_BACKUP_KEY)];
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('exact completed-result acknowledgement', () => {
  it('does not treat the same session ID from another profile as the same completed result', () => {
    const result = foreign();
    expect(sameWorkoutResult(result, { ...result, profileId: PROFILE_ID })).toBe(false);
  });

  it('does not acknowledge different timing or rep splits under the same session ID', () => {
    const result = foreign({ splitsMs: Array.from({ length: 20 }, (_, i) => (i + 1) * 3250) });
    expect(sameWorkoutResult(result, { ...result, durationMs: 66000 })).toBe(false);
    const differentSplits = [...result.splitsMs!]; differentSplits[0] += 100;
    expect(sameWorkoutResult(result, { ...result, splitsMs: differentSplits })).toBe(false);
  });

  it('compares valid canonical fields independently of property order and extra metadata', () => {
    const result = foreign();
    const reordered = Object.fromEntries(Object.entries(result).reverse()) as unknown as CompletedWorkoutResult;
    const decorated = { ...reordered, debug: 'UI metadata' };
    expect(sameWorkoutResult(result, decorated)).toBe(true);
    const invalid = { ...result, durationMs: -1 };
    expect(sameWorkoutResult(invalid, invalid)).toBe(false);
  });
});

describe('explicit unresolved-result quarantine', () => {
  it('moves a foreign result with exact source bytes without changing primary or backup', () => {
    const { values } = storage();
    const raw = '\n' + JSON.stringify({ ...foreign(), note: 'Исходные поля и пробелы' }, null, 2) + '\n';
    const key = seed(values, raw);
    const before = walletBytes(values);
    expect(quarantineWorkoutResults(active()).status).toBe('saved');
    expect(walletBytes(values)).toEqual(before);
    expect(active()).toEqual([]);
    const held = quarantined();
    expect(held).toHaveLength(1);
    expect(held[0].key).toBe(RESULT_QUARANTINE_PREFIX + encodeURIComponent(key));
    expect(JSON.parse(held[0].raw)).toEqual({ schemaVersion: 1, sourceKey: key, raw });
    expect(reconcileWorkoutResults().status).toBe('saved');
    expect(walletBytes(values)).toEqual(before);
  });

  it.each(['{bad\n', JSON.stringify({ ...foreign(), schemaVersion: 99 })])('preserves damaged or unknown active bytes %s', (raw) => {
    const { values } = storage();
    const key = seed(values, raw);
    expect(quarantineWorkoutResults(active()).status).toBe('saved');
    expect(JSON.parse(quarantined()[0].raw)).toEqual({ schemaVersion: 1, sourceKey: key, raw });
    expect(values.has(key)).toBe(false);
  });

  it('can quarantine an obsolete original floor without awarding the next floor', () => {
    const { values } = storage();
    const p = player(); p.game.highestClearedFloor = 1;
    values.set(STORAGE_KEY, JSON.stringify(parseProfile(p)));
    seed(values, JSON.stringify(foreign({ profileId: PROFILE_ID, floor: 1 })));
    const before = walletBytes(values);
    expect(quarantineWorkoutResults(active()).status).toBe('saved');
    expect(walletBytes(values)).toEqual(before);
    expect(active()).toEqual([]);
    expect(quarantined()).toHaveLength(1);
  });

  it.each(['training', 'tower', 'ghost'] as const)('does not set aside a currently applicable %s result instead of reconciling it', (mode) => {
    const { values, setItem, removeItem } = storage();
    seed(values, JSON.stringify(foreign({ profileId: PROFILE_ID, mode, floor: mode === 'tower' ? 1 : null })));
    const before = [...values];
    expect(quarantineWorkoutResults(active()).status).not.toBe('saved');
    expect([...values]).toEqual(before);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('requires reconciliation of a credited result instead of hiding its cleanup', () => {
    const { values, setItem, removeItem } = storage();
    const p = player(); p.creditedWorkoutIds = [SESSION_ID]; p.game.highestClearedFloor = 1;
    values.set(STORAGE_KEY, JSON.stringify(parseProfile(p)));
    seed(values, JSON.stringify(foreign({ profileId: PROFILE_ID })));
    const before = [...values];
    expect(quarantineWorkoutResults(active()).status).not.toBe('saved');
    expect([...values]).toEqual(before);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('preflights the entire batch before moving a foreign entry beside an applicable entry', () => {
    const { values, setItem } = storage();
    seed(values);
    const own = foreign({ profileId: PROFILE_ID, sessionId: 'own-workout', mode: 'training', floor: null });
    seed(values, JSON.stringify(own), own.sessionId);
    const before = [...values];
    expect(quarantineWorkoutResults(active()).status).not.toBe('saved');
    expect([...values]).toEqual(before);
    expect(setItem).not.toHaveBeenCalled();
  });

  it.each(['changed', 'added', 'removed'] as const)('rejects an expected snapshot made stale by a %s entry', (kind) => {
    const { values, setItem, removeItem } = storage();
    const key = seed(values);
    const expected = active();
    if (kind === 'changed') values.set(key, '{different bytes');
    if (kind === 'added') seed(values, '{another entry', 'new-session');
    if (kind === 'removed') values.delete(key);
    const before = [...values];
    expect(quarantineWorkoutResults(expected).status).toBe('conflict');
    expect([...values]).toEqual(before);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('does not interpret an empty expected list as permission to move newly discovered results', () => {
    const { values, setItem } = storage();
    seed(values);
    const before = [...values];
    expect(quarantineWorkoutResults([]).status).toBe('conflict');
    expect([...values]).toEqual(before);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('never overwrites a conflicting quarantine envelope', () => {
    const { values } = storage();
    const key = seed(values);
    const heldKey = RESULT_QUARANTINE_PREFIX + encodeURIComponent(key);
    const heldRaw = JSON.stringify({ schemaVersion: 1, sourceKey: key, raw: 'different original' });
    values.set(heldKey, heldRaw);
    const before = [...values];
    expect(quarantineWorkoutResults(active()).status).not.toBe('saved');
    expect([...values]).toEqual(before);
    expect(values.get(heldKey)).toBe(heldRaw);
  });

  it('does not quarantine over a damaged primary that needs explicit profile recovery', () => {
    const { values, setItem, removeItem } = storage();
    values.set(STORAGE_KEY, '{damaged-primary');
    seed(values);
    const before = [...values];
    expect(quarantineWorkoutResults(active()).status).toBe('recovery-required');
    expect([...values]).toEqual(before);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });
});

describe('quarantine durability boundaries', () => {
  it.each(['throw', 'noop'] as const)('preserves active bytes when quarantine write is %s', (failure) => {
    const { values, setItem, removeItem } = storage();
    const key = seed(values);
    const raw = values.get(key);
    const before = walletBytes(values);
    setItem.mockImplementation((entryKey, value) => {
      if (entryKey.startsWith(RESULT_QUARANTINE_PREFIX)) {
        if (failure === 'throw') throw Error('quota');
        return;
      }
      values.set(entryKey, value);
    });
    expect(quarantineWorkoutResults(active()).status).toBe('unavailable');
    expect(values.get(key)).toBe(raw);
    expect(walletBytes(values)).toEqual(before);
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('retains active bytes if the quarantine write cannot be read back', () => {
    const { values, getItem } = storage();
    const key = seed(values);
    const raw = values.get(key);
    getItem.mockImplementation((entryKey) => entryKey.startsWith(RESULT_QUARANTINE_PREFIX) ? null : values.get(entryKey) ?? null);
    expect(quarantineWorkoutResults(active()).status).toBe('unavailable');
    expect(values.get(key)).toBe(raw);
    getItem.mockImplementation((entryKey) => values.get(entryKey) ?? null);
    expect(quarantined()).toHaveLength(1);
    expect(quarantineWorkoutResults(active()).status).toBe('saved');
    expect(active()).toEqual([]);
    expect(quarantined()).toHaveLength(1);
  });

  it.each(['throw', 'noop'] as const)('retries without losing or duplicating bytes after active removal is %s', (failure) => {
    const { values, setItem, removeItem } = storage();
    const key = seed(values);
    const raw = values.get(key);
    const before = walletBytes(values);
    removeItem.mockImplementation(() => { if (failure === 'throw') throw Error('denied'); });
    expect(quarantineWorkoutResults(active()).status).toBe('unavailable');
    expect(values.get(key)).toBe(raw);
    const copy = quarantined();
    expect(copy).toHaveLength(1);
    expect(JSON.parse(copy[0].raw).raw).toBe(raw);
    removeItem.mockImplementation((entryKey) => { values.delete(entryKey); });
    setItem.mockClear();
    expect(quarantineWorkoutResults(active()).status).toBe('saved');
    expect(active()).toEqual([]);
    expect(quarantined()).toEqual(copy);
    expect(walletBytes(values)).toEqual(before);
  });

  it('preserves all originals across interruption halfway through a batch and fresh-snapshot retry', () => {
    const { values, removeItem } = storage();
    const first = seed(values, '{first original', 'a-session');
    const second = seed(values, '{second original', 'b-session');
    const originals = new Map([[first, values.get(first)!], [second, values.get(second)!]]);
    const expected = active();
    const before = walletBytes(values);
    let removed = 0;
    removeItem.mockImplementation((key) => { if (removed++ > 0) throw Error('interrupted'); values.delete(key); });
    expect(quarantineWorkoutResults(expected).status).toBe('unavailable');
    expect(active()).toHaveLength(1);
    expect(quarantined()).toHaveLength(2);
    removeItem.mockImplementation((key) => { values.delete(key); });
    expect(quarantineWorkoutResults(expected).status).toBe('conflict');
    expect(quarantineWorkoutResults(active()).status).toBe('saved');
    expect(active()).toEqual([]);
    const copies = quarantined().map((entry) => JSON.parse(entry.raw) as { sourceKey: string; raw: string });
    expect(new Map(copies.map((copy) => [copy.sourceKey, copy.raw]))).toEqual(originals);
    expect(walletBytes(values)).toEqual(before);
  });

  it('does not erase a journal entry changed during quarantine read-back', () => {
    const { values, setItem } = storage();
    const key = seed(values);
    const original = values.get(key)!;
    setItem.mockImplementation((entryKey, value) => {
      values.set(entryKey, value);
      if (entryKey.startsWith(RESULT_QUARANTINE_PREFIX)) values.set(key, '{changed-before-delete');
    });
    expect(quarantineWorkoutResults(active()).status).not.toBe('saved');
    expect(values.get(key)).toBe('{changed-before-delete');
    expect(JSON.parse(quarantined()[0].raw).raw).toBe(original);
  });

  it('retains future or malformed quarantine envelopes for export without interpreting them as active rewards', () => {
    const { values } = storage();
    const malformedKey = RESULT_QUARANTINE_PREFIX + 'future';
    const malformedRaw = '{unknown quarantine format\n';
    values.set(malformedKey, malformedRaw);
    expect(readQuarantinedResults()).toEqual({ status: 'ready', entries: [{ key: malformedKey, raw: malformedRaw }] });
    expect(active()).toEqual([]);
    const before = walletBytes(values);
    expect(reconcileWorkoutResults().status).toBe('saved');
    expect(walletBytes(values)).toEqual(before);
    expect(values.get(malformedKey)).toBe(malformedRaw);
  });

  it('does not report a denied quarantine read as an empty successful export', () => {
    const { values, getItem } = storage();
    values.set(RESULT_QUARANTINE_PREFIX + 'held', '{source');
    getItem.mockImplementation(() => { throw Error('denied'); });
    expect(readQuarantinedResults()).toEqual({ status: 'unavailable', entries: [] });
  });
});
