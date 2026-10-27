import { describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from './progression';
import { readProfileQuarantine } from './profileQuarantineExport';

function fake(records: Map<string, string>) {
  const getItem = vi.fn((key: string) => records.get(key) ?? null);
  const setItem = vi.fn();
  return {
    store: { getItem, setItem, key: (index: number) => [...records.keys()][index] ?? null,
      get length() { return records.size; } },
    getItem, setItem,
  };
}

describe('read-only damaged-profile quarantine export', () => {
  it('retains exact corrupt bytes and sorts only BODYFORGE profile quarantine keys', () => {
    const one = `${STORAGE_KEY}:quarantine:1`;
    const two = `${STORAGE_KEY}:quarantine:2`;
    const records = new Map([
      [two, '{damaged original\n'],
      ['firebase:authUser', 'must never leave browser'],
      [one, ' \n{ \"schemaVersion\":42 }  '],
      [STORAGE_KEY, '{\"xp\":500}'],
    ]);
    const before = [...records];
    const { store, setItem } = fake(records);
    const output = readProfileQuarantine(store);
    expect(output.status).toBe('ready');
    expect(output.entries).toEqual([
      { key: one, raw: records.get(one) },
      { key: two, raw: records.get(two) },
    ]);
    expect(JSON.stringify(output)).not.toContain('firebase:authUser');
    expect([...records]).toEqual(before);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('keeps readable originals and reports partially blocked reads', () => {
    const one = `${STORAGE_KEY}:quarantine:0`;
    const two = `${STORAGE_KEY}:quarantine:1`;
    const records = new Map([[one, '{broken original'], [two, 'future opaque bytes']]);
    const { store, getItem, setItem } = fake(records);
    getItem.mockImplementation((key) => {
      if (key === two) throw new DOMException('blocked', 'SecurityError');
      return records.get(key) ?? null;
    });
    expect(readProfileQuarantine(store)).toEqual({
      status: 'unavailable', entries: [{ key: one, raw: '{broken original' }],
    });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('returns unavailable rather than claiming empty when storage enumeration fails', () => {
    const store = {
      key: (_: number) => null,
      getItem: (_: string) => null,
      get length(): number { throw new Error('storage denied'); },
    };
    expect(readProfileQuarantine(store)).toEqual({ status: 'unavailable', entries: [] });
  });
});
