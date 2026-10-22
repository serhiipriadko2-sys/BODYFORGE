import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshGame } from './game';
import { parseProfile, PROFILE_BACKUP_KEY, STORAGE_KEY, type Profile } from './progression';
import { quarantineDurableWorkouts, replayDurableWorkouts } from './durableWorkout';
import { readResultJournal, resultJournalEntry, RESULT_QUARANTINE_PREFIX, type CompletedWorkoutResult, type JournalEntry } from './workoutJournal';

const durable = vi.hoisted(() => ({ read: vi.fn(), stage: vi.fn(), mark: vi.fn() }));
vi.mock('./durableJournal', () => ({
  readDurableJournal: durable.read,
  stageDurableResults: durable.stage,
  markDurableResults: durable.mark,
}));

const PROFILE_ID = '8f711190-e774-4aa9-b44e-7777b2294021';
const OTHER_PROFILE_ID = '4a2c6303-1c89-4913-a8b9-bc373aa2517f';
const player = (): Profile => ({ profileId: PROFILE_ID, xp: 0, coins: 100, workouts: [], game: { ...freshGame(), created: true } });
const result = (changes: Partial<CompletedWorkoutResult> = {}): CompletedWorkoutResult => ({
  schemaVersion: 1, profileId: PROFILE_ID, sessionId: '69203342-b175-4b02-8673-8e8934360089',
  mode: 'tower', floor: 1, durationMs: 65000, finishedAt: '2026-10-22T12:00:00.000Z', repetitions: 20, ...changes,
});
interface RecordEntry { key: string; raw: string; profileId: string | null; state: 'active' | 'settled' | 'quarantined'; baseProfileRaw?: string }
let records: Map<string, RecordEntry>;
function storage(profile: Profile | null = player()) {
  const values = new Map<string, string>();
  if (profile !== null) values.set(STORAGE_KEY, JSON.stringify(parseProfile(profile)));
  const getItem = vi.fn((key: string) => values.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => { values.set(key, value); });
  const removeItem = vi.fn((key: string) => { values.delete(key); });
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem, setItem, removeItem, key: (i: number) => [...values.keys()][i] ?? null,
    get length() { return values.size; },
  });
  return { values, getItem, setItem, removeItem };
}
const context = () => ({ signal: new AbortController().signal, isCurrent: () => true });
function asEntry(value: CompletedWorkoutResult): JournalEntry {
  const entry = resultJournalEntry(value);
  if (!entry) throw Error('Invalid test fixture');
  return entry;
}
function stored(value: CompletedWorkoutResult, state: RecordEntry['state']): RecordEntry {
  return { ...asEntry(value), profileId: value.profileId, state };
}
function disk(values: Map<string, string>): Profile { return JSON.parse(values.get(STORAGE_KEY)!); }
beforeEach(() => {
  records = new Map();
  durable.read.mockReset().mockImplementation(async () => ({ status: 'ready', entries: [...records.values()] }));
  durable.stage.mockReset().mockImplementation(async (entries: JournalEntry[], baseProfileRaw: string | null) => {
    if (entries.some((entry) => records.has(entry.key) && records.get(entry.key)!.raw !== entry.raw)) return { status: 'invalid' };
    for (const entry of entries) if (!records.has(entry.key)) {
      records.set(entry.key, { key: entry.key, raw: entry.raw, profileId: entry.result?.profileId ?? null,
        state: 'active', ...(baseProfileRaw === null ? {} : { baseProfileRaw }) });
    }
    return { status: 'saved' };
  });
  durable.mark.mockReset().mockImplementation(async (entries: { key: string; raw: string }[], state: RecordEntry['state']) => {
    if (entries.some((entry) => !records.has(entry.key) || records.get(entry.key)!.raw !== entry.raw)) return { status: 'invalid' };
    for (const entry of entries) records.set(entry.key, { ...records.get(entry.key)!, state });
    return { status: 'saved' };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('strict journal before local reward', () => {
  it('does not touch local rewards when durable staging fails', async () => {
    const { values, setItem, removeItem } = storage();
    const before = [...values];
    durable.stage.mockResolvedValue({ status: 'unavailable' });
    expect((await replayDurableWorkouts(result(), context())).status).toBe('unavailable');
    expect([...values]).toEqual(before);
    expect(setItem).not.toHaveBeenCalled(); expect(removeItem).not.toHaveBeenCalled();
    expect(durable.mark).not.toHaveBeenCalled();
  });

  it('waits for staging completion before modifying primary and retains the settled row', async () => {
    const { values, setItem } = storage();
    let finish!: () => void;
    const staged = new Promise<void>((resolve) => { finish = resolve; });
    durable.stage.mockImplementation(async (entries: JournalEntry[]) => {
      await staged;
      for (const entry of entries) records.set(entry.key, { ...entry, profileId: entry.result!.profileId, state: 'active' });
      return { status: 'saved' };
    });
    const pending = replayDurableWorkouts(result(), context());
    await Promise.resolve();
    expect(setItem).not.toHaveBeenCalled();
    finish();
    expect((await pending).status).toBe('saved');
    expect(disk(values)).toMatchObject({ xp: 185, coins: 165 });
    expect(records.get(asEntry(result()).key)?.state).toBe('settled');
    expect(readResultJournal().entries).toEqual([]);
  });

  it('restores a retained settled result after the entire local primary rolls back', async () => {
    const { values } = storage();
    const baseline = values.get(STORAGE_KEY)!;
    expect((await replayDurableWorkouts(result(), context())).status).toBe('saved');
    expect(records.size).toBe(1);
    values.clear(); values.set(STORAGE_KEY, baseline);
    expect((await replayDurableWorkouts(null, context())).status).toBe('saved');
    expect(disk(values)).toMatchObject({ xp: 185, coins: 165, game: { highestClearedFloor: 1 } });
    expect(disk(values).workouts).toHaveLength(1);
    const restored = values.get(STORAGE_KEY);
    expect((await replayDurableWorkouts(null, context())).status).toBe('saved');
    expect(values.get(STORAGE_KEY)).toBe(restored);
    expect(records.size).toBe(1);
  });

  it('lets a durable quarantine tombstone dominate a resurrected applicable local record', async () => {
    const { values } = storage();
    const held = stored(result(), 'quarantined'); records.set(held.key, held);
    values.set(held.key, held.raw);
    const baseline = values.get(STORAGE_KEY);
    expect((await replayDurableWorkouts(null, context())).status).toBe('saved');
    expect(values.get(STORAGE_KEY)).toBe(baseline);
    expect(values.has(held.key)).toBe(false);
    const preserved = values.get(RESULT_QUARANTINE_PREFIX + encodeURIComponent(held.key));
    expect(JSON.parse(preserved!)).toEqual({ schemaVersion: 1, sourceKey: held.key, raw: held.raw });
    expect(records.get(held.key)?.state).toBe('quarantined');
  });

  it('keeps foreign settled history out of the active journal of a reset profile', async () => {
    const { values, setItem } = storage({ ...player(), profileId: OTHER_PROFILE_ID });
    const old = stored(result(), 'settled'); records.set(old.key, old);
    const baseline = [...values];
    expect((await replayDurableWorkouts(null, context())).status).toBe('saved');
    expect([...values]).toEqual(baseline);
    expect(setItem).not.toHaveBeenCalled();
    expect(records.get(old.key)).toEqual(old);
  });

  it('cancels stale UI work after staging without deleting the durable completed result', async () => {
    const { values, setItem } = storage();
    let finish!: () => void;
    const staged = new Promise<void>((resolve) => { finish = resolve; });
    durable.stage.mockImplementation(async (entries: JournalEntry[]) => {
      await staged;
      for (const entry of entries) records.set(entry.key, { ...entry, profileId: entry.result!.profileId, state: 'active' });
      return { status: 'saved' };
    });
    let current = true;
    const controller = new AbortController();
    const ctx = { signal: controller.signal, isCurrent: () => current && !controller.signal.aborted };
    const baseline = [...values];
    const pending = replayDurableWorkouts(result(), ctx);
    current = false; controller.abort(); finish();
    expect((await pending).status).toBe('unavailable');
    expect([...values]).toEqual(baseline);
    expect(setItem).not.toHaveBeenCalled();
    expect(records.get(asEntry(result()).key)?.state).toBe('active');
  });

  it('preserves both sources when the same durable key contains a different immutable result', async () => {
    const { values } = storage();
    const old = stored(result({ durationMs: 66000 }), 'active'); records.set(old.key, old);
    const baseline = [...values];
    expect((await replayDurableWorkouts(result(), context())).status).toBe('invalid');
    expect([...values]).toEqual(baseline);
    expect(records.get(old.key)).toEqual(old);
  });

  it.each(['legacy', 'missing'] as const)('never infers profile identity or a wallet from baseProfileRaw after %s primary', async (kind) => {
    const { profileId: _id, ...legacy } = player();
    const { values } = storage(kind === 'legacy' ? legacy : null);
    const active = { ...stored(result(), 'active'), baseProfileRaw: JSON.stringify({ ...player(), xp: 7000, coins: 8000 }) };
    records.set(active.key, active);
    const baseline = values.get(STORAGE_KEY);
    expect((await replayDurableWorkouts(null, context())).status).toBe('mismatch');
    expect(values.get(STORAGE_KEY)).toBe(baseline);
    expect(values.get(active.key)).toBe(active.raw);
    expect(records.get(active.key)?.state).toBe('active');
  });

  it('retains an active durable receipt when settling acknowledgement fails after local reward', async () => {
    const { values } = storage();
    durable.mark.mockResolvedValue({ status: 'unavailable' });
    expect((await replayDurableWorkouts(result(), context())).status).toBe('unavailable');
    expect(disk(values).xp).toBe(185);
    expect(records.get(asEntry(result()).key)?.state).toBe('active');
    durable.mark.mockImplementation(async (entries: { key: string }[]) => {
      for (const entry of entries) records.set(entry.key, { ...records.get(entry.key)!, state: 'settled' });
      return { status: 'saved' };
    });
    const awarded = values.get(STORAGE_KEY);
    expect((await replayDurableWorkouts(null, context())).status).toBe('saved');
    expect(values.get(STORAGE_KEY)).toBe(awarded);
  });
});

describe('durable owner deferral before local journal cleanup', () => {
  it('refuses stale confirmation before staging any durable or local changes', async () => {
    const { values } = storage();
    const entry = asEntry(result({ profileId: OTHER_PROFILE_ID })); values.set(entry.key, entry.raw);
    const baseline = [...values];
    expect((await quarantineDurableWorkouts([], context())).status).toBe('conflict');
    expect([...values]).toEqual(baseline);
    expect(durable.stage).not.toHaveBeenCalled();
    expect(durable.mark).not.toHaveBeenCalled();
  });

  it('does not move local originals when strict quarantine marking fails', async () => {
    const { values, removeItem } = storage();
    const entry = asEntry(result({ profileId: OTHER_PROFILE_ID })); values.set(entry.key, entry.raw);
    const expected = readResultJournal().entries, baseline = [...values];
    durable.mark.mockResolvedValue({ status: 'unavailable' });
    expect((await quarantineDurableWorkouts(expected, context())).status).toBe('unavailable');
    expect([...values]).toEqual(baseline);
    expect(removeItem).not.toHaveBeenCalled();
    expect(records.get(entry.key)?.state).toBe('active');
  });

  it('keeps a strict tombstone even if the later local quarantine copy fails', async () => {
    const { values, setItem } = storage();
    const entry = asEntry(result({ profileId: OTHER_PROFILE_ID })); values.set(entry.key, entry.raw);
    const expected = readResultJournal().entries;
    const before = [values.get(STORAGE_KEY), values.get(PROFILE_BACKUP_KEY)];
    setItem.mockImplementation((key, value) => { if (key.startsWith(RESULT_QUARANTINE_PREFIX)) throw Error('quota'); values.set(key, value); });
    expect((await quarantineDurableWorkouts(expected, context())).status).toBe('unavailable');
    expect(values.get(entry.key)).toBe(entry.raw);
    expect(records.get(entry.key)?.state).toBe('quarantined');
    expect([values.get(STORAGE_KEY), values.get(PROFILE_BACKUP_KEY)]).toEqual(before);
    setItem.mockImplementation((key, value) => { values.set(key, value); });
    expect((await replayDurableWorkouts(null, context())).status).toBe('saved');
    expect(values.has(entry.key)).toBe(false);
    expect(records.get(entry.key)?.state).toBe('quarantined');
  });
});
