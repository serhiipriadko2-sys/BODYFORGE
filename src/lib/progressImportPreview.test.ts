import { afterEach, describe, expect, it, vi } from 'vitest';
import { addCompletedWorkout, parseProfile, type Profile } from './progression';
import { freshGame } from './game';
import { MAX_PROGRESS_BACKUP_BYTES } from './progressBackupInspector';
import { previewProgressImportFile, previewProgressImportJson } from './progressImportPreview';
import { prepareBackupArchive } from './backupArchive';
const date = new Date('2026-11-24T12:00:00.000Z');
const initial: Profile = parseProfile({ profileId: 'qa', xp: 400, coins: 200, creditedWorkoutIds: [],
  workouts: [], game: { ...freshGame(), created: true, outfit: 'ember', ownedOutfits: ['base', 'ember'] } });
const incoming = addCompletedWorkout(initial, 32000, date, { sessionId: 'tower-1', mode: 'tower' });
const raw = JSON.stringify(incoming, null, 2);
function envelope(overrides: Record<string, unknown> = {}) {
  return { exportFormat: 'bodyforge-manual-backup', exportSchemaVersion: 1, exportedAt: date.toISOString(),
    complete: true, sourcesChangedDuringRead: false, storedProfileRaw: raw,
    storedBackupRaw: JSON.stringify(initial), storageReadStatus: 'ready', journalReadStatus: 'ready',
    quarantineReadStatus: 'ready', profileQuarantineReadStatus: 'ready', durableReadStatus: 'ready',
    auxiliaryReadStatus: { avatarLook: 'ready', appearance: 'ready', manualSteps: 'ready', dailyPlan: 'ready' },
    storedAuxiliaryRaw: { avatarLook: null, appearance: null, manualSteps: null, dailyPlan: null },
    pendingResultOriginals: [], quarantinedResults: [], storedProfileQuarantineRaw: [], durableResults: [],
    ...overrides };
}
function preview(overrides: Record<string, unknown> = {}, current = initial) {
  return previewProgressImportJson(JSON.stringify(envelope(overrides)), current);
}
afterEach(() => vi.unstubAllGlobals());
describe('BF-106 local import preview', () => {
  it('uses the stored primary, not misleading export mirror or fallback', () => {
    const result = preview({ xp: 999999, coins: 999999, workouts: [] });
    expect(result).toMatchObject({ state: 'preview-ready', identity: 'same', applyAuthorized: false,
      current: { xp: 400, coins: 200, workouts: 0, towerFloor: 0, ownedOutfits: 2 },
      incoming: { xp: 585, coins: 265, workouts: 1, availableWorkouts: 1, repetitions: 20,
        holdSeconds: 0, towerFloor: 1, ownedOutfits: 2 }, recordedGrants: 2 });
    expect(result.warnings).toEqual([]);
  });
  it('warns about different fighters and regressions without authorizing merge', () => {
    const different = preview({ storedProfileRaw: JSON.stringify({ ...incoming, profileId: 'other' }) });
    expect(different.identity).toBe('different');
    expect(different.warnings.join(' ')).toContain('другому бойцу');
    const older = preview({ storedProfileRaw: JSON.stringify(initial) }, incoming);
    expect(older.warnings.join(' ')).toContain('потерять прогресс');
    expect(older.applyAuthorized).toBe(false);
  });
  it('counts untrimmed legacy records without inventing a grant ledger', () => {
    const oldRow = { id: 'old', finishedAt: date.toISOString(), durationMs: 65000, repetitions: 20, xp: 100 };
    const legacy = { xp: 9000, coins: 50, workouts: Array.from({ length: 70 }, (_, i) => ({ ...oldRow, id: 'old-' + i })) };
    const result = preview({ storedProfileRaw: JSON.stringify(legacy), storedBackupRaw: null });
    expect(result).toMatchObject({ state: 'preview-ready', identity: 'unknown', recordedGrants: 0,
      incoming: { availableWorkouts: 70 }, applyAuthorized: false });
    expect(result.warnings.join(' ')).toContain('идентификаторы наград');
  });
  it.each([{ complete: false }, { sourcesChangedDuringRead: true }, { storedBackupRaw: '{' }])
  ('blocks incomplete or damaged fallback %# while preserving comparison', overrides => {
    expect(preview(overrides)).toMatchObject({ state: 'blocked', incoming: { xp: 585 }, applyAuthorized: false });
  });
  it.each([
    { storedProfileRaw: '{' }, { storedProfileRaw: JSON.stringify({ ...incoming, schemaVersion: 9 }) },
    { storedProfileRaw: JSON.stringify({ ...incoming, creditedWorkoutIds: ['tower-1', 'tower-1'] }) },
    { storedProfileRaw: JSON.stringify({ ...incoming, workouts: [{ ...incoming.workouts[0], repetitions: 19 }] }) },
    { storedProfileRaw: raw.replace('"xp": 585', '"xp": 1, "\\u0078p": 585') },
  ])('blocks incompatible embedded profile %#', override => {
    expect(preview(override)).toMatchObject({ state: 'blocked', incoming: null, applyAuthorized: false });
  });
  it('rejects duplicate decoded names, unsafe keys, deep or oversized JSON', () => {
    const cases = ['{', 'null', JSON.stringify(envelope({ exportSchemaVersion: 2 })),
      JSON.stringify(envelope()).replace('"complete":true', '"complete":false,"\\u0063omplete":true'),
      JSON.stringify(envelope()).replace('"complete":true', '"complete":true,"__proto__":{}'),
      JSON.stringify(envelope({ extra: 'x' })).replace('"extra":"x"', '"extra":' + '['.repeat(40) + '0' + ']'.repeat(40)),
      '"' + 'я'.repeat(MAX_PROGRESS_BACKUP_BYTES / 2) + '"'];
    for (const json of cases) expect(previewProgressImportJson(json, initial)).toMatchObject({ state: 'invalid', applyAuthorized: false });
  });
  it('warns about journals, settings and opaque receipts without paying them', () => {
    const row = { ...incoming.workouts[0], receipt: { schemaVersion: 999 } };
    const result = preview({ storedProfileRaw: JSON.stringify({ ...incoming, workouts: [row] }),
      storedAuxiliaryRaw: { avatarLook: '{broken', appearance: null, manualSteps: null, dailyPlan: null },
      pendingResultOriginals: [{ key: 'bodyforge:pilot:v1:result:pending', raw: '{}' }] });
    expect(result.state).toBe('preview-ready');
    expect(result.recordedGrants).toBe(0);
    expect(result.warnings.join(' ')).toContain('непрозрачные');
    expect(result.warnings.join(' ')).toContain('Журнал');
    expect(result.warnings.join(' ')).toContain('Внешность');
  });
  it('reads a Blob without storage, network or mutation of either source', async () => {
    const forbidden = vi.fn(() => { throw Error('forbidden'); });
    vi.stubGlobal('localStorage', { getItem: forbidden, setItem: forbidden, removeItem: forbidden, clear: forbidden });
    vi.stubGlobal('indexedDB', { open: forbidden, deleteDatabase: forbidden });
    vi.stubGlobal('fetch', forbidden);
    const json = JSON.stringify(envelope());
    const current = JSON.stringify(initial);
    const file = new Blob([json], { type: 'application/json' });
    const result = await previewProgressImportFile(file, initial);
    expect(result.state).toBe('preview-ready');
    expect(result.applyAuthorized).toBe(false);
    expect(JSON.stringify(initial)).toBe(current);
    expect(await file.text()).toBe(json);
    expect(forbidden).not.toHaveBeenCalled();
  });
  it('checks file size before reading and rejects malformed UTF-8 and short reads', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(1));
    for (const size of [0, -1, NaN, MAX_PROGRESS_BACKUP_BYTES + 1]) {
      expect((await previewProgressImportFile({ size, arrayBuffer }, initial)).state).toBe('invalid');
    }
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect((await previewProgressImportFile(new Blob([new Uint8Array([0xc3, 0x28])]), initial)).state).toBe('invalid');
    expect((await previewProgressImportFile({ size: 2, arrayBuffer }, initial)).state).toBe('invalid');
    expect((await previewProgressImportFile({ size: 1, arrayBuffer: async () => { throw Error('read'); } }, initial)).state).toBe('invalid');
  });
  it('compares an actual compressed backup with identical strict evidence and no additional authority', async () => {
    const json = JSON.stringify(envelope({ extra: 'opaque '.repeat(3000) }));
    const archive = await prepareBackupArchive(json, 'backup.json');
    if (archive.status !== 'ready') throw Error(archive.status);
    const comparable = vi.fn();
    const result = await previewProgressImportFile(archive.blob, initial, comparable);
    expect(result).toEqual(previewProgressImportJson(json, initial));
    expect(result.applyAuthorized).toBe(false);
    expect(comparable).toHaveBeenCalledExactlyOnceWith(json);
    const signal = new AbortController();
    signal.abort();
    comparable.mockClear();
    expect((await previewProgressImportFile(archive.blob, initial, comparable, signal.signal)).state).toBe('invalid');
    expect(comparable).not.toHaveBeenCalled();
  });
  it('keeps strict duplicate-key validation and inflated byte limit for gzip', async () => {
    const duplicate = JSON.stringify(envelope()).replace('"complete":true', '"complete":false,"complete":true');
    const pack = async (json: string) => new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    const comparable = vi.fn();
    expect((await previewProgressImportFile(await pack(duplicate), initial, comparable)).state).toBe('invalid');
    const huge = await pack('я'.repeat(MAX_PROGRESS_BACKUP_BYTES / 2 + 1));
    const rejected = await previewProgressImportFile(huge, initial, comparable);
    expect(rejected.state).toBe('invalid');
    expect(rejected.inspection.message).toContain('Распакованный');
    expect(comparable).not.toHaveBeenCalled();
  });
  it('captures comparison baseline before asynchronous reading', async () => {
    let finish!: (value: ArrayBuffer) => void;
    const bytes = new TextEncoder().encode(JSON.stringify(envelope()));
    const current = { ...initial };
    const pending = previewProgressImportFile({ size: bytes.byteLength, arrayBuffer: () => new Promise(resolve => { finish = resolve; }) }, current);
    current.xp = 999;
    current.profileId = 'changed';
    finish(bytes.buffer as ArrayBuffer);
    expect(await pending).toMatchObject({ current: { xp: 400 }, identity: 'same' });
  });
});
