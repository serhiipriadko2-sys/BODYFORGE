/**
 * BODYFORGE's visual-only character choices. Neither coins nor workouts are
 * touched. This is an origin-local preference, not owned equipment.
 * Do not couple this schema to the profile journal or the reward ledger.
 */
export const AVATAR_LOOK_KEY = 'bodyforge:avatar-look:v1';

export const SKIN_TONES = [
  { id: 'porcelain', label: 'Светлый', color: '#e4bda1' },
  { id: 'sand', label: 'Песочный', color: '#c59473' },
  { id: 'amber', label: 'Янтарный', color: '#a8785c' },
  { id: 'umber', label: 'Умбра', color: '#84543e' },
  { id: 'deep', label: 'Глубокий', color: '#50372f' },
] as const;
export const HAIR_TONES = [
  { id: 'ink', label: 'Графит', color: '#181a21' },
  { id: 'walnut', label: 'Каштан', color: '#543b34' },
  { id: 'silver', label: 'Серебро', color: '#b7c1cd' },
  { id: 'plum', label: 'Аметист', color: '#665180' },
] as const;
export const HAIR_STYLES = [
  { id: 'crop', label: 'Кроп', description: 'Аккуратная текстура' },
  { id: 'buzz', label: 'Ёжик', description: 'Минимальная длина' },
  { id: 'swept', label: 'Набок', description: 'Выразительный объём' },
] as const;
export const TRIM_TONES = [
  { id: 'glacier', label: 'Ледник', color: '#55e3f2' },
  { id: 'voltage', label: 'Вольтаж', color: '#cbfa55' },
  { id: 'pulse', label: 'Импульс', color: '#bd8eff' },
  { id: 'flare', label: 'Искра', color: '#ffc37e' },
] as const;

export type SkinTone = (typeof SKIN_TONES)[number]['id'];
export type HairTone = (typeof HAIR_TONES)[number]['id'];
export type HairStyle = (typeof HAIR_STYLES)[number]['id'];
export type TrimTone = (typeof TRIM_TONES)[number]['id'];
export interface AvatarLook {
  version: 1;
  skin: SkinTone;
  hair: HairTone;
  /** Optional in v1: legacy saved looks have no haircut key. */
  hairStyle?: HairStyle;
  trim: TrimTone;
  visor: boolean;
}
export const DEFAULT_AVATAR_LOOK: Readonly<AvatarLook> = Object.freeze({
  version: 1, skin: 'sand', hair: 'ink', trim: 'glacier', visor: false, hairStyle: 'crop',
});
const includesId = <T extends { id: string }>(options: readonly T[], value: unknown): value is T['id'] =>
  typeof value === 'string' && options.some((option) => option.id === value);

/** Malformed or newer versions are never overwritten automatically. */
export function parseAvatarLook(raw: string | null): AvatarLook | null {
  if (raw === null) return { ...DEFAULT_AVATAR_LOOK };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const v = value as Record<string, unknown>;
    if (v.version !== 1 || !includesId(SKIN_TONES, v.skin) ||
        !includesId(HAIR_TONES, v.hair) || !includesId(TRIM_TONES, v.trim) ||
        (v.hairStyle !== undefined && !includesId(HAIR_STYLES, v.hairStyle)) ||
        typeof v.visor !== 'boolean') return null;
    return { version: 1, skin: v.skin as SkinTone, hair: v.hair as HairTone,
      trim: v.trim as TrimTone, visor: v.visor,
      ...(v.hairStyle === undefined ? {} : { hairStyle: v.hairStyle as HairStyle }), };
  } catch { return null; }
}
export type LookRead = { status: 'ready' | 'invalid' | 'unavailable'; look: AvatarLook };
export function readAvatarLook(store?: Pick<Storage, 'getItem'>): LookRead {
  try {
    const storage = store ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    if (!storage) return { status: 'unavailable', look: { ...DEFAULT_AVATAR_LOOK } };
    const look = parseAvatarLook(storage.getItem(AVATAR_LOOK_KEY));
    return look
      ? { status: 'ready', look }
      : { status: 'invalid', look: { ...DEFAULT_AVATAR_LOOK } };
  } catch { return { status: 'unavailable', look: { ...DEFAULT_AVATAR_LOOK } }; }
}
export function saveAvatarLook(look: AvatarLook, store?: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  const raw = JSON.stringify(look);
  const valid = parseAvatarLook(raw);
  if (!valid || JSON.stringify(valid) !== raw) return false;
  try {
    const storage = store ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    if (!storage) return false;
    storage.setItem(AVATAR_LOOK_KEY, raw);
    return storage.getItem(AVATAR_LOOK_KEY) === raw;
  } catch { return false; }
}
/** Every material receives a validated, finite six-digit color. */
export function lookColors(look: AvatarLook) {
  return {
    skin: SKIN_TONES.find((x) => x.id === look.skin)?.color ?? SKIN_TONES[1].color,
    hair: HAIR_TONES.find((x) => x.id === look.hair)?.color ?? HAIR_TONES[0].color,
    trim: TRIM_TONES.find((x) => x.id === look.trim)?.color ?? TRIM_TONES[0].color,
  };
}
