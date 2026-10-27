import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseProfile, PROFILE_BACKUP_KEY, STORAGE_KEY } from './progression';
import { AVATAR_LOOK_KEY } from './avatarLook';
import { APPEARANCE_KEY } from './appearance';
import { MANUAL_STEPS_KEY } from './stepsLog';
import { DAILY_PLAN_KEY } from './dailyPlan';
import { readDurableJournal } from './durableJournal';
import { prepareProgressBackup, requestProgressBackupDownload } from './progressBackup';

vi.mock('./durableJournal', () => ({ readDurableJournal: vi.fn() }));

const original = {
  profile: '{"xp":200,"coins":51,"workouts":[]}',
  avatar: '{"version":2,"unknown":"raw future data"}',
  appearance: '{damaged appearance',
  steps: '{"version":1,"day":"2026-10-27","count":2000,"source":"manual"}',
  plan: '{"version":3,"future":true}',
};
let values: Map<string, string>;
let setItem: ReturnType<typeof vi.fn>;
let removeItem: ReturnType<typeof vi.fn>;

beforeEach(() => {
  values = new Map([
    [STORAGE_KEY, original.profile],
    [PROFILE_BACKUP_KEY, original.profile],
    [AVATAR_LOOK_KEY, original.avatar],
    [APPEARANCE_KEY, original.appearance],
    [MANUAL_STEPS_KEY, original.steps],
    [DAILY_PLAN_KEY, original.plan],
  ]);
  setItem = vi.fn();
  removeItem = vi.fn();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem, removeItem,
    key: (i: number) => [...values.keys()][i] ?? null,
    get length() { return values.size; },
  });
  vi.mocked(readDurableJournal).mockResolvedValue({ status: 'ready', entries: [] });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('manual BODYFORGE backup without changing game state', () => {
  it('prepares a complete raw snapshot with profile, appearance, look, steps and plan', async () => {
    const before = [...values];
    const now = new Date('2026-10-27T18:30:00.000Z');
    const prepared = await prepareProgressBackup(parseProfile(null), null, now);
    const payload = JSON.parse(prepared.json);
    expect(prepared.complete).toBe(true);
    expect(prepared.filename).toBe('bodyforge-backup-2026-10-27T18-30-00-000Z.json');
    expect(payload).toMatchObject({
      exportFormat: 'bodyforge-manual-backup', exportSchemaVersion: 1,
      exportedAt: now.toISOString(), durableReadStatus: 'ready',
      storedProfileRaw: original.profile,
      storedAuxiliaryRaw: {
        avatarLook: original.avatar, appearance: original.appearance,
        manualSteps: original.steps, dailyPlan: original.plan,
      },
    });
    expect([...values]).toEqual(before);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('marks blocked IndexedDB or settings as incomplete, never invents missing data', async () => {
    vi.mocked(readDurableJournal).mockResolvedValue({ status: 'unavailable', entries: [] });
    const originalStore = globalThis.localStorage;
    vi.stubGlobal('localStorage', {
      ...originalStore,
      getItem: (key: string) => {
        if (key === AVATAR_LOOK_KEY) throw new DOMException('blocked', 'SecurityError');
        return values.get(key) ?? null;
      },
      key: (i: number) => [...values.keys()][i] ?? null,
      get length() { return values.size; },
    });
    const prepared = await prepareProgressBackup(parseProfile(null), null);
    const payload = JSON.parse(prepared.json);
    expect(prepared.complete).toBe(false);
    expect(payload.complete).toBe(false);
    expect(payload.durableReadStatus).toBe('unavailable');
    expect(payload.storedAuxiliaryRaw.avatarLook).toBeNull();
    expect(payload.auxiliaryReadStatus.avatarLook).toBe('unavailable');
    expect(payload.storedAuxiliaryRaw.manualSteps).toBe(original.steps);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('does not label a RAM-only profile as a complete durable backup', async () => {
    values.delete(STORAGE_KEY);
    const prepared = await prepareProgressBackup(parseProfile(null), null);
    const payload = JSON.parse(prepared.json);
    expect(prepared.complete).toBe(false);
    expect(payload.complete).toBe(false);
    expect(payload.storedProfileRaw).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('requests a local JSON download directly from a click, without sending data', async () => {
    const link = { href: '', download: '', style: { display: '' }, click: vi.fn(), remove: vi.fn() };
    const appendChild = vi.fn();
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:bodyforge-local');
    const revokeObjectURL = vi.fn();
    const setTimeout = vi.fn();
    vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { appendChild } });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('window', { setTimeout });
    const prepared = { json: '{"xp":7}', filename: 'bodyforge-backup-test.json', complete: true };
    requestProgressBackupDownload(prepared);
    expect(link.download).toBe(prepared.filename);
    expect(link.href).toBe('blob:bodyforge-local');
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 60000);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(await (createObjectURL.mock.calls[0][0] as Blob).text()).toBe(prepared.json);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('revokes a failed download attempt rather than leaking a blob URL', () => {
    const link = { href: '', download: '', style: { display: '' }, click: vi.fn(() => { throw Error('blocked'); }), remove: vi.fn() };
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('document', { createElement: () => link, body: { appendChild: vi.fn() } });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:blocked', revokeObjectURL });
    vi.stubGlobal('window', { setTimeout: vi.fn() });
    expect(() => requestProgressBackupDownload({
      json: '{"xp":7}', filename: 'bodyforge-backup.json', complete: false,
    })).toThrow('blocked');
    expect(link.remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:blocked');
    expect(setItem).not.toHaveBeenCalled();
  });
});
