import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APPEARANCE_KEY, DEFAULT_APPEARANCE, PALETTES, appearanceColors, contrastRatio,
  isHexColor, loadAppearance, parseAppearance, saveAppearance, type Appearance,
} from './appearance';
import { PROFILE_BACKUP_KEY, STORAGE_KEY } from './progression';
import { RESULT_JOURNAL_PREFIX } from './workoutJournal';

const reserved = new Map([
  [STORAGE_KEY, JSON.stringify({ profileId: 'appearance-owner', xp: 500, coins: 900, workouts: [] })],
  [PROFILE_BACKUP_KEY, '{"xp":315,"coins":845,"workouts":[]}'],
  [RESULT_JOURNAL_PREFIX + 'pending-session', JSON.stringify({
    schemaVersion: 1, profileId: 'appearance-owner', sessionId: 'pending-session',
    mode: 'tower', floor: 3, durationMs: 65000, repetitions: 20,
    finishedAt: '2026-10-26T10:00:00.000Z',
  })],
]);

function storage(raw?: string) {
  const values = new Map(reserved);
  if (raw !== undefined) values.set(APPEARANCE_KEY, raw);
  const getItem = vi.fn((key: string) => values.get(key) ?? null);
  const setItem = vi.fn((key: string, value: string) => { values.set(key, value); });
  const removeItem = vi.fn((key: string) => { values.delete(key); });
  vi.stubGlobal('localStorage', { getItem, setItem, removeItem });
  return { values, getItem, setItem, removeItem };
}

function expectGameUnchanged(values: Map<string, string>) {
  for (const [key, raw] of reserved) expect(values.get(key), key).toBe(raw);
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('appearance validation without game-save mutations', () => {
  it('uses an independent default object when no preference exists', () => {
    const { values, setItem } = storage();
    const parsed = parseAppearance(null)!;
    expect(parsed).toEqual(DEFAULT_APPEARANCE);
    expect(parsed).not.toBe(DEFAULT_APPEARANCE);
    parsed.material = 'solid';
    expect(DEFAULT_APPEARANCE.material).toBe('glass');
    expect(loadAppearance()).toEqual({ settings: DEFAULT_APPEARANCE, status: 'ready' });
    expect(values.has(APPEARANCE_KEY)).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expectGameUnchanged(values);
  });

  it.each(PALETTES)('accepts the $id preset', ({ id }) => {
    expect(parseAppearance(JSON.stringify({ ...DEFAULT_APPEARANCE, palette: id })))
      .toEqual({ ...DEFAULT_APPEARANCE, palette: id });
  });

  it('normalizes a valid custom hex color and keeps the requested material', () => {
    expect(parseAppearance(JSON.stringify({
      ...DEFAULT_APPEARANCE, palette: 'custom', customAccent: '#A0B2FF', material: 'solid', highContrast: true,
    }))).toEqual({
      version: 1, palette: 'custom', customAccent: '#a0b2ff', material: 'solid', highContrast: true,
    });
  });

  const invalid = [
    { label: 'malformed JSON', raw: '{' },
    { label: 'null value', raw: 'null' },
    { label: 'array', raw: '[]' },
    { label: 'primitive', raw: '42' },
    { label: 'incomplete object', raw: '{}' },
    { label: 'future version', value: { ...DEFAULT_APPEARANCE, version: 2 } },
    { label: 'string version', value: { ...DEFAULT_APPEARANCE, version: '1' } },
    { label: 'unknown palette', value: { ...DEFAULT_APPEARANCE, palette: 'rainbow' } },
    { label: 'missing palette', value: { ...DEFAULT_APPEARANCE, palette: undefined } },
    { label: 'non-string color', value: { ...DEFAULT_APPEARANCE, customAccent: 123456 } },
    { label: 'short hex', value: { ...DEFAULT_APPEARANCE, customAccent: '#abc' } },
    { label: 'alpha hex', value: { ...DEFAULT_APPEARANCE, customAccent: '#12345678' } },
    { label: 'invalid hex digits', value: { ...DEFAULT_APPEARANCE, customAccent: '#12gg56' } },
    { label: 'CSS injection', value: { ...DEFAULT_APPEARANCE, customAccent: '#123456; color:red' } },
    { label: 'unsupported material', value: { ...DEFAULT_APPEARANCE, material: 'hologram' } },
    { label: 'missing material', value: { ...DEFAULT_APPEARANCE, material: undefined } },
    { label: 'non-boolean contrast', value: { ...DEFAULT_APPEARANCE, highContrast: 'false' } },
  ];
  it.each(invalid)('rejects $label and preserves the original bytes', ({ raw, value }) => {
    const serialized = raw ?? JSON.stringify(value);
    const { values, setItem, removeItem } = storage(serialized);
    expect(parseAppearance(serialized)).toBeNull();
    expect(loadAppearance()).toEqual({ settings: DEFAULT_APPEARANCE, status: 'invalid' });
    expect(values.get(APPEARANCE_KEY)).toBe(serialized);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expectGameUnchanged(values);
  });

  it.each(['#000000', '#ffffff', '#ABCDEF', '#123456'])('accepts six-digit opaque %s', (color) => {
    expect(isHexColor(color)).toBe(true);
  });

  it.each(['123456', '#fff', '#ffffff00', 'red', ' #123456', '#123456\n', 'var(--accent)'])
    ('rejects noncanonical color %j', (color) => { expect(isHexColor(color)).toBe(false); });
});

describe('optional appearance persistence', () => {
  it('reports unavailable reads without changing a preference or any game data', () => {
    const raw = JSON.stringify(DEFAULT_APPEARANCE);
    const { values, getItem, setItem } = storage(raw);
    getItem.mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(loadAppearance()).toEqual({ settings: DEFAULT_APPEARANCE, status: 'unavailable' });
    expect(setItem).not.toHaveBeenCalled();
    expect(values.get(APPEARANCE_KEY)).toBe(raw);
    expectGameUnchanged(values);
  });

  it('writes and verifies only its own key, then restores custom settings after reload', () => {
    const { values, setItem, getItem, removeItem } = storage();
    const settings: Appearance = {
      version: 1, palette: 'custom', customAccent: '#123456', material: 'solid', highContrast: true,
    };
    expect(saveAppearance(settings)).toBe(true);
    expect(setItem.mock.calls).toEqual([[APPEARANCE_KEY, JSON.stringify(settings)]]);
    expect(getItem.mock.calls).toEqual([[APPEARANCE_KEY]]);
    expect(loadAppearance()).toEqual({ settings, status: 'ready' });
    expect(removeItem).not.toHaveBeenCalled();
    expect(values.size).toBe(reserved.size + 1);
    expectGameUnchanged(values);
  });

  it.each([
    { ...DEFAULT_APPEARANCE, version: 2 },
    { ...DEFAULT_APPEARANCE, customAccent: 'red' },
    { ...DEFAULT_APPEARANCE, material: 'hologram' },
  ])('refuses invalid runtime settings before writing', (settings) => {
    const { values, setItem, getItem } = storage();
    expect(saveAppearance(settings as Appearance)).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expectGameUnchanged(values);
  });

  it('reports quota failure and retains the previous preference', () => {
    const raw = JSON.stringify(DEFAULT_APPEARANCE);
    const { values, setItem } = storage(raw);
    setItem.mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    expect(saveAppearance({ ...DEFAULT_APPEARANCE, palette: 'lime' })).toBe(false);
    expect(values.get(APPEARANCE_KEY)).toBe(raw);
    expectGameUnchanged(values);
  });

  it('detects a silently ignored write rather than claiming persistence', () => {
    const raw = JSON.stringify(DEFAULT_APPEARANCE);
    const { values, setItem } = storage(raw);
    setItem.mockImplementation(() => {});
    expect(saveAppearance({ ...DEFAULT_APPEARANCE, palette: 'violet' })).toBe(false);
    expect(values.get(APPEARANCE_KEY)).toBe(raw);
    expectGameUnchanged(values);
  });

  it('does not acknowledge a write when read-back throws', () => {
    const { values, getItem } = storage();
    getItem.mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(saveAppearance(DEFAULT_APPEARANCE)).toBe(false);
    expectGameUnchanged(values);
  });

  it('does not acknowledge different read-back bytes', () => {
    const { values, getItem } = storage();
    getItem.mockReturnValue('{"different":"value"}');
    expect(saveAppearance(DEFAULT_APPEARANCE)).toBe(false);
    expectGameUnchanged(values);
  });
});

describe('opaque sRGB palette contrast; not a rendered-page WCAG audit', () => {
  it('matches independent reference pairs and is symmetric', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#ffffff', '#000000')).toBe(21);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
    expect(contrastRatio('#777777', '#000000')).toBeCloseTo(4.68949989000882, 10);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.478089453577214, 10);
    expect(contrastRatio('#ff0000', '#000000')).toBeCloseTo(5.252, 10);
  });

  it.each(PALETTES)('keeps preset $id readable in both contrast modes', ({ id, color }) => {
    for (const highContrast of [false, true]) {
      const colors = appearanceColors({ ...DEFAULT_APPEARANCE, palette: id, highContrast });
      expect(colors.accent).toBe(color);
      expect(contrastRatio(colors.ink, colors.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.copy, '#303847')).toBeGreaterThanOrEqual(highContrast ? 7 : 4.5);
    }
  });

  it.each([false, true])('maintains readable custom colors on a 4096-color RGB grid, highContrast=%s', (highContrast) => {
    // All combinations of 16 evenly spaced levels include both extrema and gray/colored interiors.
    // This tests safety properties rather than reproducing the color-adjustment algorithm.
    for (let red = 0; red <= 255; red += 17) {
      for (let green = 0; green <= 255; green += 17) {
        for (let blue = 0; blue <= 255; blue += 17) {
          const customAccent = '#' + [red, green, blue].map((n) => n.toString(16).padStart(2, '0')).join('');
          const colors = appearanceColors({ ...DEFAULT_APPEARANCE, palette: 'custom', customAccent, highContrast });
          expect(colors.accent, customAccent).toBe(customAccent);
          expect(isHexColor(colors.copy), customAccent).toBe(true);
          expect(contrastRatio(colors.ink, customAccent), customAccent).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(colors.copy, '#303847'), customAccent).toBeGreaterThanOrEqual(highContrast ? 7 : 4.5);
        }
      }
    }
  });
});
