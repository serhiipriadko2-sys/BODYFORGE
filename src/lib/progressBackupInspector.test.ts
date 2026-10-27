import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from './progression';
import { RESULT_JOURNAL_PREFIX, RESULT_QUARANTINE_PREFIX } from './workoutJournal';
import {
  inspectProgressBackupFile, inspectProgressBackupJson, MAX_PROGRESS_BACKUP_BYTES,
} from './progressBackupInspector';

const source = { xp: 450, coins: 70, workouts: [{ id: 'original-session' }],
  creditedWorkoutIds: ['original-session'] };
const journalKey = RESULT_JOURNAL_PREFIX + 'session-a';
const quarantineKey = RESULT_QUARANTINE_PREFIX + 'session-old';
const profileQuarantineKey = STORAGE_KEY + ':quarantine:0';

function good(override: Record<string, unknown> = {}) {
  return {
    exportFormat: 'bodyforge-manual-backup', exportSchemaVersion: 1,
    exportedAt: '2026-10-27T18:30:00.000Z', complete: true,
    sourcesChangedDuringRead: false,
    storedProfileRaw: JSON.stringify(source), storedBackupRaw: JSON.stringify(source),
    storageReadStatus: 'ready', journalReadStatus: 'ready',
    quarantineReadStatus: 'ready', profileQuarantineReadStatus: 'ready',
    durableReadStatus: 'ready',
    auxiliaryReadStatus: {
      avatarLook: 'ready', appearance: 'ready', manualSteps: 'ready', dailyPlan: 'ready',
    },
    storedAuxiliaryRaw: {
      avatarLook: '{corrupted settings', appearance: null, manualSteps: null, dailyPlan: null,
    },
    pendingResultOriginals: [{ key: journalKey, raw: '{"schemaVersion":1}' }],
    quarantinedResults: [{ key: quarantineKey, raw: 'broken original\n' }],
    storedProfileQuarantineRaw: [{ key: profileQuarantineKey, raw: '{broken original' }],
    durableResults: [{ key: journalKey, raw: '{"schemaVersion":1}',
      baseProfileRaw: JSON.stringify(source), state: 'settled' }],
    ...override,
  };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('local-only BODYFORGE backup inspection', () => {
  it('validates original raw evidence even when unrelated settings contain damaged bytes', () => {
    const json = JSON.stringify(good());
    const result = inspectProgressBackupJson(json);
    expect(result.state).toBe('readable');
    expect(result).toMatchObject({
      exportedAt: '2026-10-27T18:30:00.000Z',
      workouts: 1, durableRecords: 1, journalRecords: 1, quarantineRecords: 2,
    });
    expect(result.message).toContain('не восстанавливает');
    expect(result.message).not.toContain('original-session');
  });

  it('checks a real selected-file shape without reading or writing storage or using fetch', async () => {
    const getItem = vi.fn(() => { throw Error('forbidden storage read'); });
    const setItem = vi.fn(), fetch = vi.fn();
    vi.stubGlobal('localStorage', { getItem, setItem });
    vi.stubGlobal('fetch', fetch);
    const raw = JSON.stringify(good());
    const file = { size: new TextEncoder().encode(raw).length, text: vi.fn(async () => raw) };
    const output = await inspectProgressBackupFile(file);
    expect(output.state).toBe('readable');
    expect(file.text).toHaveBeenCalledOnce();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('marks incomplete storage, missing durable data or a changed concurrent snapshot as incomplete', () => {
    expect(inspectProgressBackupJson(JSON.stringify(good({ complete: false }))).state).toBe('incomplete');
    expect(inspectProgressBackupJson(JSON.stringify(good({ durableReadStatus: 'unavailable' }))).state).toBe('incomplete');
    expect(inspectProgressBackupJson(JSON.stringify(good({ storedProfileRaw: null }))).state).toBe('incomplete');
    const changed = inspectProgressBackupJson(JSON.stringify(good({ sourcesChangedDuringRead: true })));
    expect(changed.state).toBe('incomplete');
    expect(changed.message).toContain('изменялись');
  });

  it('retains damaged raw evidence but warns that it cannot validate the profile', () => {
    const result = inspectProgressBackupJson(JSON.stringify(good({
      storedProfileRaw: '{invalid saved profile',
    })));
    expect(result.state).toBe('incomplete');
    expect(result.message).toContain('повреждён');
    const damagedLedger = inspectProgressBackupJson(JSON.stringify(good({
      storedProfileRaw: JSON.stringify({ ...source, creditedWorkoutIds: null }),
    })));
    expect(damagedLedger.state).toBe('incomplete');
    expect(damagedLedger.message).toContain('наград');
  });

  it('refuses to certify an identified paid profile if its reward ledger is absent', () => {
    const { creditedWorkoutIds: _ledger, ...missing } = { ...source, profileId: 'identified-fighter' };
    const output = inspectProgressBackupJson(JSON.stringify(good({ storedProfileRaw: JSON.stringify(missing) })));
    expect(output.state).toBe('incomplete');
    expect(output.message).toContain('наград');
    const noHistory = inspectProgressBackupJson(JSON.stringify(good({
      storedProfileRaw: JSON.stringify({ ...missing, workouts: [] }),
    })));
    expect(noHistory.state).toBe('readable');
    const historicTotals = inspectProgressBackupJson(JSON.stringify(good({
      storedProfileRaw: JSON.stringify({ ...missing, workouts: [], totals: { workouts: 65 } }),
    })));
    expect(historicTotals.state).toBe('incomplete');
  });

  it('rejects unsupported format, changed version, malformed JSON and fake timestamps', () => {
    expect(inspectProgressBackupJson('not json').state).toBe('invalid');
    expect(inspectProgressBackupJson('null').state).toBe('invalid');
    expect(inspectProgressBackupJson(JSON.stringify(good({ exportFormat: 'other-service' }))).state).toBe('invalid');
    expect(inspectProgressBackupJson(JSON.stringify(good({ exportSchemaVersion: 2 }))).state).toBe('invalid');
    expect(inspectProgressBackupJson(JSON.stringify(good({ exportedAt: 'next-week' }))).state).toBe('invalid');
    expect(inspectProgressBackupJson(JSON.stringify(good({ complete: 'true' }))).state).toBe('invalid');
  });

  it('rejects malformed data sources, duplicate IDs and injected quarantine keys', () => {
    const invalidForms = [
      { auxiliaryReadStatus: { avatarLook: 'ready' } },
      { storedAuxiliaryRaw: { avatarLook: 123, appearance: null, dailyPlan: null, manualSteps: null } },
      { pendingResultOriginals: [{ key: 'foreign:credential', raw: 'a' }] },
      { pendingResultOriginals: [{ key: journalKey, raw: 'a' }, { key: journalKey, raw: 'b' }] },
      { storedProfileQuarantineRaw: [{ key: '../../credentials', raw: 'anything' }] },
      { quarantinedResults: [{ key: quarantineKey, raw: 7 }] },
      { durableResults: [{ key: journalKey, raw: '{}', baseProfileRaw: null, state: 'upgraded' }] },
      { sourcesChangedDuringRead: 'false' },
    ];
    invalidForms.forEach((form) => {
      expect(inspectProgressBackupJson(JSON.stringify(good(form))).state).toBe('invalid');
    });
  });

  it('limits file size before reading, handles empty file and blocked file reads', async () => {
    const text = vi.fn(async () => JSON.stringify(good()));
    expect((await inspectProgressBackupFile({ size: MAX_PROGRESS_BACKUP_BYTES + 1, text })).state).toBe('invalid');
    expect((await inspectProgressBackupFile({ size: 0, text })).state).toBe('invalid');
    expect(text).not.toHaveBeenCalled();
    expect((await inspectProgressBackupFile({
      size: 500, text: async () => { throw new Error('browser blocked file'); },
    })).state).toBe('invalid');
    expect(inspectProgressBackupJson(' '.repeat(MAX_PROGRESS_BACKUP_BYTES + 1)).state).toBe('invalid');
  });
});
