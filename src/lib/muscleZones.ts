import type { BodyBuild, GameState, Muscle } from './game';

export const ZONE_POINT_MAX = 12;
export const ZONE_POINT_COST = 25;
export const ZONE_GROUPS = [
  { id: 'arms', label: 'Руки', zones: [
    { id: 'shoulders', label: 'Плечи', detail: 'Передние, средние и задние дельты' },
    { id: 'biceps', label: 'Бицепсы', detail: 'Передняя поверхность плеча' },
    { id: 'triceps', label: 'Трицепсы', detail: 'Задняя поверхность плеча' },
    { id: 'forearms', label: 'Предплечья', detail: 'Сгибатели и разгибатели' },
  ] },
  { id: 'core', label: 'Корпус', zones: [
    { id: 'chest', label: 'Грудь', detail: 'Грудные мышцы и их контуры' },
    { id: 'abs', label: 'Пресс', detail: 'Прямая мышца живота' },
    { id: 'obliques', label: 'Боковые мышцы', detail: 'Косые мышцы живота' },
  ] },
  { id: 'legs', label: 'Ноги', zones: [
    { id: 'quads', label: 'Квадрицепсы', detail: 'Передняя поверхность бедра' },
    { id: 'hamstrings', label: 'Задняя поверхность бедра', detail: 'Сгибатели колена' },
    { id: 'glutes', label: 'Ягодицы', detail: 'Ягодичная область' },
    { id: 'calves', label: 'Голени', detail: 'Икры и передняя поверхность голени' },
  ] },
  { id: 'back', label: 'Спина', zones: [
    { id: 'traps', label: 'Трапеции', detail: 'Верхняя часть спины' },
    { id: 'lats', label: 'Широчайшие', detail: 'Ширина и боковые контуры спины' },
    { id: 'midback', label: 'Межлопаточная зона', detail: 'Ромбовидные и прилегающие мышцы' },
    { id: 'lowerback', label: 'Поясница', detail: 'Разгибатели позвоночника' },
  ] },
] as const;

export type MuscleZone = typeof ZONE_GROUPS[number]['zones'][number]['id'];
export type ZoneLevels = Record<MuscleZone, number>;
export interface ZoneProgress { version: 1; levels: ZoneLevels }
export interface ZoneDefinition { id: MuscleZone; label: string; detail: string }
export const MUSCLE_ZONES: readonly ZoneDefinition[] = ZONE_GROUPS.flatMap(g => Array.from<ZoneDefinition>(g.zones));
export const ZONE_IDS = MUSCLE_ZONES.map(z => z.id);
export const TOTAL_ZONE_POINTS = ZONE_IDS.length * ZONE_POINT_MAX;

export function isMuscleZone(value: unknown): value is MuscleZone {
  return typeof value === 'string' && ZONE_IDS.includes(value as MuscleZone);
}
function validPoint(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= ZONE_POINT_MAX;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function normalizeZoneProgress(value: unknown): ZoneProgress | null {
  if (!record(value) || value.version !== 1 || !record(value.levels) ||
      Object.keys(value).length !== 2 || Object.keys(value.levels).length !== ZONE_IDS.length) return null;
  const levels = value.levels;
  if (!ZONE_IDS.every(id => Object.hasOwn(levels, id) && validPoint(levels[id]))) return null;
  return { version: 1, levels: Object.fromEntries(ZONE_IDS.map(id => [id, levels[id]])) as ZoneLevels };
}
export function emptyZoneLevels(): ZoneLevels {
  return Object.fromEntries(ZONE_IDS.map(id => [id, 0])) as ZoneLevels;
}
/** Legacy broad upgrades become equal normalized progress in their subzones.
 * No coins are created or charged, and a stored V1 zone record is never remigrated. */
export function legacyToZones(muscles: Partial<Record<Muscle, number>>): ZoneLevels {
  const levels = emptyZoneLevels();
  for (const group of ZONE_GROUPS) {
    const n = muscles[group.id];
    const value = typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 5
      ? Math.round(n * ZONE_POINT_MAX / 5) : 0;
    for (const zone of group.zones) levels[zone.id] = value;
  }
  return levels;
}
export function zoneGroupPoints(levels: ZoneLevels, groupId: Muscle): { points: number; max: number } {
  const group = ZONE_GROUPS.find(g => g.id === groupId)!;
  return { points: group.zones.reduce((sum,z) => sum + levels[z.id], 0), max: group.zones.length * ZONE_POINT_MAX };
}
export function zoneTotal(levels: ZoneLevels): number {
  return ZONE_IDS.reduce((sum,id) => sum + levels[id], 0);
}
/** Only the compatibility renderer and old storage clients use this coarse view. */
export function legacyProjection(levels: ZoneLevels): Record<Muscle, number> {
  return Object.fromEntries(ZONE_GROUPS.map(g => {
    const { points, max } = zoneGroupPoints(levels,g.id);
    return [g.id, Math.round(5 * points / max)];
  })) as Record<Muscle,number>;
}
export function zoneLevelsForGame(game: Pick<GameState,'muscles'|'zoneProgress'>): ZoneLevels | null {
  if (game.zoneProgress === undefined) return legacyToZones(game.muscles);
  return normalizeZoneProgress(game.zoneProgress)?.levels ?? null;
}
/** Review opt-in is local DEV only; no new model is sent to production. */
export function zonesReviewEnabled(): boolean {
  return import.meta.env.DEV && typeof window !== 'undefined' &&
    ['127.0.0.1','localhost'].includes(window.location.hostname) &&
    ['4','5','6','7','8','9','10','11','12','13','14','15','20','23','24','26','27','28'].includes(new URLSearchParams(window.location.search).get('avatarFoundation') ?? '');
}
export function zoneViewEnabled(game: Pick<GameState,'zoneProgress'>): boolean {
  return game.zoneProgress !== undefined || zonesReviewEnabled();
}
export function investmentSummary(game: Pick<GameState,'muscles'|'zoneProgress'>): { points: number; max: number } {
  const zones = zoneViewEnabled(game) ? zoneLevelsForGame(game) : null;
  return zones ? { points: zoneTotal(zones), max: TOTAL_ZONE_POINTS }
    : { points: Object.values(game.muscles).reduce((a,b) => a+b,0), max: 20 };
}
export function bodyBuildLabel(build: BodyBuild, regional: boolean): string {
  return build === 'full' ? 'ПОЛНЫЙ' : regional ? (build === 'lean' ? 'ХУДОЙ' : 'СРЕДНИЙ')
    : (build === 'lean' ? 'СТРОЙНЫЙ' : 'КРЕПКИЙ');
}
