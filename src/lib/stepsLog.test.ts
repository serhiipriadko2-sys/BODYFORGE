import { describe, expect, it } from 'vitest';
import { MANUAL_STEPS_KEY, MAX_MANUAL_STEPS, readManualSteps, saveManualSteps, validStepCount } from './stepsLog';

function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    raw: (value: string) => data.set(MANUAL_STEPS_KEY, value),
  };
}
describe('manual-only private step notes', () => {
  const today = new Date(2026, 9, 22, 12);
  it('never labels typed steps as synced or measured', () => {
    const s = storage();
    expect(saveManualSteps(today, 4310, s)).toBe(true);
    expect(readManualSteps(today, s)).toMatchObject({ status: 'ready', data: {
      day: '2026-10-22', count: 4310, source: 'manual', version: 1,
    } });
    const raw = s.getItem(MANUAL_STEPS_KEY) ?? '';
    expect(raw).not.toMatch(/health|sync|reward|xp|coins|person|device/i);
    expect(Object.keys(JSON.parse(raw))).toEqual(['version', 'day', 'count', 'source']);
  });
  it('does not carry yesterday into today or pay any in-game reward', () => {
    const s = storage();
    expect(saveManualSteps(today, 6000, s)).toBe(true);
    expect(readManualSteps(new Date(2026, 9, 23, 0, 1), s).data.count).toBe(0);
    expect(readManualSteps(today, s).data.count).toBe(6000);
  });
  it('preserves a valid later-dated note when the local calendar moves backwards', () => {
    const s = storage();
    const later = new Date(2026, 9, 23, 0, 1);
    expect(saveManualSteps(later, 8888, s)).toBe(true);
    const original = s.getItem(MANUAL_STEPS_KEY);
    let writes = 0;
    const observed = { getItem: s.getItem, setItem: (key: string, value: string) => {
      writes++; s.setItem(key, value);
    } };
    expect(readManualSteps(today, observed)).toMatchObject({ status: 'date-conflict',
      recordDay: '2026-10-23', data: { day: '2026-10-22', count: 0 } });
    expect(saveManualSteps(today, 7777, observed)).toBe(false);
    expect(saveManualSteps(today, 0, observed)).toBe(false);
    expect(writes).toBe(0);
    expect(s.getItem(MANUAL_STEPS_KEY)).toBe(original);
    // A correct date restores access without deleting or migrating the note.
    expect(readManualSteps(later, s)).toMatchObject({ status: 'ready', data: { count: 8888 } });
    expect(saveManualSteps(later, 9000, s)).toBe(true);
  });
  it('does not replace a note when the preservation preflight cannot read storage', () => {
    let writes = 0;
    const unreadable = { getItem: (): string => { throw Error('read denied'); },
      setItem: () => { writes++; } };
    expect(saveManualSteps(today, 4321, unreadable)).toBe(false);
    expect(writes).toBe(0);
  });
  it('rejects invalid counts, storage errors, and malformed saves', () => {
    const s = storage();
    for (const n of [-1, .5, MAX_MANUAL_STEPS + 1, NaN, Infinity]) {
      expect(validStepCount(n)).toBe(false);
      expect(saveManualSteps(today, n, s)).toBe(false);
    }
    expect(saveManualSteps(today, 0, s)).toBe(true);
    s.raw('{"version":1,"day":"2026-10-22","count":7,"source":"health-connect"}');
    expect(readManualSteps(today, s).status).toBe('invalid');
    s.raw('broken-json');
    expect(readManualSteps(today, s).status).toBe('invalid');
    s.raw('{"version":1,"day":"2026-02-31","count":5,"source":"manual"}');
    expect(readManualSteps(today, s).status).toBe('invalid');
    const throwing = { getItem: (_: string): string => { throw Error('disabled'); },
      setItem: (_: string, __: string) => { throw Error('disabled'); } };
    expect(readManualSteps(today, throwing).status).toBe('unavailable');
    expect(saveManualSteps(today, 99, throwing)).toBe(false);
  });
});
