import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshGame } from './game';
import { parseProfile, PROFILE_BACKUP_KEY, STORAGE_KEY, type Profile } from './progression';
import { createCompletionPersistence } from './completionPersistence';
import {
  commitWorkoutResult, quarantineWorkoutResults, readQuarantinedResults, readResultJournal,
  reconcileWorkoutResults, resultJournalEntry, sameWorkoutResult,
  RESULT_JOURNAL_PREFIX, RESULT_QUARANTINE_PREFIX, type CompletedWorkoutResult,
} from './workoutJournal';

const profile: Profile = { profileId: 'identity-qa', xp: 500, coins: 900, workouts: [],
  game: { ...freshGame(), created: true } };
const result = (sessionId: string): CompletedWorkoutResult => ({
  schemaVersion: 1, profileId: profile.profileId!, sessionId, mode: 'training', floor: null,
  durationMs: 65000, finishedAt: '2026-11-24T12:00:00.000Z', repetitions: 20,
});
function storage() {
  const values = new Map([[STORAGE_KEY, JSON.stringify(parseProfile(profile))],
    [PROFILE_BACKUP_KEY, JSON.stringify(parseProfile({ ...profile, coins: 880 }))]]);
  const setItem = vi.fn((key: string, raw: string) => { values.set(key, raw); });
  const removeItem = vi.fn((key: string) => { values.delete(key); });
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null, setItem, removeItem,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  });
  return { values, setItem, removeItem };
}
afterEach(() => vi.unstubAllGlobals());

describe('journal identity encoding and recovery', () => {
  it.each(['\uD800', '\uDFFF', 'broken-\uD800-tail'])('rejects unencodable new session %j without a write', (id) => {
    const { values, setItem, removeItem } = storage();
    const input = result(id), before = [...values];
    expect(resultJournalEntry(input)).toBeNull();
    expect(sameWorkoutResult(input, input)).toBe(false);
    expect(commitWorkoutResult(input).status).toBe('invalid');
    expect([...values]).toEqual(before);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('rejects an unencodable completion before durable staging', () => {
    const input = result('bad-\uDFFF');
    const write = vi.fn();
    expect(createCompletionPersistence(input, { session: input, baseProfileRaw: null }, write)).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it('exposes malformed session bytes as an invalid record, not an unavailable journal', () => {
    const { values, setItem, removeItem } = storage();
    const key = RESULT_JOURNAL_PREFIX + 'old-invalid';
    const raw = JSON.stringify(result('bad-\uD800'));
    values.set(key, raw);
    const before = [...values];
    expect(readResultJournal()).toEqual({ status: 'ready', entries: [{ key, raw, result: null }] });
    expect(reconcileWorkoutResults().status).toBe('invalid');
    expect([...values]).toEqual(before);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('keeps valid neighbors visible and pays the valid workout exactly once', () => {
    const { values } = storage();
    const brokenKey = RESULT_JOURNAL_PREFIX + 'bad';
    const brokenRaw = JSON.stringify(result('\uD800'));
    values.set(brokenKey, brokenRaw);
    const valid = result('good');
    const entry = resultJournalEntry(valid)!;
    values.set(entry.key, entry.raw);
    expect(readResultJournal().entries).toHaveLength(2);
    expect(reconcileWorkoutResults().status).toBe('invalid');
    const paid = values.get(STORAGE_KEY);
    expect(JSON.parse(paid!)).toMatchObject({ xp: 620, coins: 935, creditedWorkoutIds: ['good'] });
    expect(values.get(brokenKey)).toBe(brokenRaw);
    expect(values.has(entry.key)).toBe(false);
    expect(reconcileWorkoutResults().status).toBe('invalid');
    expect(values.get(STORAGE_KEY)).toBe(paid);
  });

  it('retains canonical keys and reward deduplication for valid Unicode and percent signs', () => {
    const { values } = storage();
    const input = result('unicode-\u0442\u0435\u0441\u0442-\uD83D\uDCAA-%u16:');
    expect(resultJournalEntry(input)?.key).toBe(RESULT_JOURNAL_PREFIX + encodeURIComponent(input.sessionId));
    expect(commitWorkoutResult(input).status).toBe('saved');
    const paid = values.get(STORAGE_KEY);
    expect(commitWorkoutResult(input).status).toBe('saved');
    expect(values.get(STORAGE_KEY)).toBe(paid);
    expect(JSON.parse(paid!)).toMatchObject({ xp: 620, coins: 935, creditedWorkoutIds: [input.sessionId] });
  });

  it('explicit quarantine preserves distinct broken keys and raw payloads without normalizing them', () => {
    const { values } = storage();
    const original = new Map([
      [RESULT_JOURNAL_PREFIX + 'bad-\uD800', '{broken A'],
      [RESULT_JOURNAL_PREFIX + 'bad-\uDFFF', '{broken B'],
      [RESULT_JOURNAL_PREFIX + 'bad-\uFFFD', '{replacement is distinct'],
      [RESULT_JOURNAL_PREFIX + '%u16:abcd', '{literal marker'],
    ]);
    for (const [key, raw] of original) values.set(key, raw);
    const wallet = [values.get(STORAGE_KEY), values.get(PROFILE_BACKUP_KEY)];
    const snapshot = readResultJournal();
    expect(snapshot.status).toBe('ready');
    expect(quarantineWorkoutResults(snapshot.entries).status).toBe('saved');
    expect(readResultJournal()).toEqual({ status: 'ready', entries: [] });
    const held = readQuarantinedResults();
    expect(held.status).toBe('ready');
    expect(held.entries).toHaveLength(original.size);
    expect(new Set(held.entries.map(row => row.key)).size).toBe(original.size);
    const recovered = new Map(held.entries.map(row => {
      const data = JSON.parse(row.raw);
      return [data.sourceKey, data.raw];
    }));
    expect(recovered).toEqual(original);
    const normal = RESULT_JOURNAL_PREFIX + 'bad-\uFFFD';
    expect(held.entries.some(row => row.key === RESULT_QUARANTINE_PREFIX + encodeURIComponent(normal))).toBe(true);
    expect([values.get(STORAGE_KEY), values.get(PROFILE_BACKUP_KEY)]).toEqual(wallet);
  });

  it('does not rewrite previously paid historical IDs, even if not usable for new journal keys', () => {
    const id = 'legacy-\uD800';
    const historical = { ...profile, creditedWorkoutIds: [id], workouts: [
      { id, durationMs: 65000, finishedAt: '2026-10-01T12:00:00.000Z', repetitions: 20, xp: 120 },
    ] };
    const parsed = parseProfile(JSON.parse(JSON.stringify(historical)));
    expect(parsed).toMatchObject({ xp: 500, coins: 900, creditedWorkoutIds: [id] });
    expect(parsed.workouts[0].id).toBe(id);
  });
});
