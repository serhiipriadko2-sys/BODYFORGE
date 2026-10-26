/** Appearance is a separate, optional preference; it never rewrites game saves. */
export const APPEARANCE_KEY = 'bodyforge:appearance:v1';
export const PALETTES = [
  { id: 'mint', label: 'Мята', color: '#65ead0' },
  { id: 'copper', label: 'Медь', color: '#ffbd87' },
  { id: 'violet', label: 'Неон', color: '#bca5ff' },
  { id: 'lime', label: 'Лайм', color: '#c5f85b' },
] as const;
export type Palette = typeof PALETTES[number]['id'] | 'custom';
export interface Appearance {
  version: 1;
  palette: Palette;
  customAccent: string;
  material: 'glass' | 'solid';
  highContrast: boolean;
}
export const DEFAULT_APPEARANCE: Appearance = { version: 1, palette: 'mint', customAccent: '#65ead0', material: 'glass', highContrast: false };
export const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export function parseAppearance(raw: string | null): Appearance | null {
  if (raw === null) return { ...DEFAULT_APPEARANCE };
  try {
    const value = JSON.parse(raw) as Partial<Appearance> | null;
    if (!value || value.version !== 1 || ![...PALETTES.map((p) => p.id), 'custom'].includes(value.palette ?? '') ||
        typeof value.customAccent !== 'string' || !isHexColor(value.customAccent) ||
        !['glass', 'solid'].includes(value.material ?? '') || typeof value.highContrast !== 'boolean') return null;
    return { version: 1, palette: value.palette!, customAccent: value.customAccent.toLowerCase(), material: value.material!, highContrast: value.highContrast };
  } catch { return null; }
}

export function loadAppearance(): { settings: Appearance; status: 'ready' | 'invalid' | 'unavailable' } {
  try {
    const parsed = parseAppearance(localStorage.getItem(APPEARANCE_KEY));
    return { settings: parsed ?? { ...DEFAULT_APPEARANCE }, status: parsed ? 'ready' : 'invalid' };
  } catch { return { settings: { ...DEFAULT_APPEARANCE }, status: 'unavailable' }; }
}
export function saveAppearance(settings: Appearance): boolean {
  const raw = JSON.stringify(settings);
  if (!parseAppearance(raw)) return false;
  try { localStorage.setItem(APPEARANCE_KEY, raw); return localStorage.getItem(APPEARANCE_KEY) === raw; }
  catch { return false; }
}

const rgb = (hex: string) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
const hex = (channels: number[]) => '#' + channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
function luminance(color: string): number {
  const channels = rgb(color).map((v) => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
/** WCAG relative luminance, for opaque sRGB pairs; not a whole-page audit. */
export function contrastRatio(first: string, second: string): number {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
export function appearanceColors(settings: Appearance) {
  const accent = settings.palette === 'custom' ? settings.customAccent : PALETTES.find((p) => p.id === settings.palette)!.color;
  const ink = contrastRatio(accent, '#000000') >= contrastRatio(accent, '#ffffff') ? '#000000' : '#ffffff';
  // A dark custom button color can still have readable labels/icons on panels.
  // The lightest permitted content surface is #303847; target exceeds AA text.
  let copy = accent;
  const channels = rgb(accent);
  for (let step = 1; contrastRatio(copy, '#303847') < (settings.highContrast ? 7 : 4.5) && step <= 100; step++) {
    copy = hex(channels.map((channel) => channel + (255 - channel) * step / 100));
  }
  return { accent, ink, copy, channels: rgb(accent).join(' ') };
}
export function applyAppearance(settings: Appearance): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement, colors = appearanceColors(settings);
  root.dataset.bfPalette = settings.palette;
  root.dataset.bfMaterial = settings.material;
  root.dataset.bfContrast = settings.highContrast ? 'high' : 'standard';
  root.style.setProperty('--bf-accent', colors.accent);
  root.style.setProperty('--bf-accent-ink', colors.ink);
  root.style.setProperty('--bf-accent-copy', colors.copy);
  root.style.setProperty('--bf-accent-rgb', colors.channels);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0a1018');
}
