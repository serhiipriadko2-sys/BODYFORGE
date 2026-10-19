/**
 * BODYFORGE solo game rules. Everything here is local-only, not an online
 * authority: wallet, quests and recorded camera scores must be revalidated
 * by a server before any competitive use.
 */
import type { Profile } from './progression';

export type BodyBuild = 'lean' | 'solid';
export type Muscle = 'arms' | 'core' | 'legs' | 'back';
export type Outfit = 'base' | 'ember' | 'steel';
export type WorkoutMode = 'training' | 'tower' | 'ghost';

export const MUSCLES: ReadonlyArray<{ id: Muscle; label: string; description: string }> = [
  { id: 'arms', label: 'Руки', description: 'Бицепсы и трицепсы' },
  { id: 'core', label: 'Пресс', description: 'Мышцы корпуса' },
  { id: 'legs', label: 'Ноги', description: 'Сила приседа' },
  { id: 'back', label: 'Спина', description: 'Ширина и осанка' },
];

export const OUTFITS: ReadonlyArray<{ id: Outfit; label: string; price: number; detail: string }> = [
  { id: 'base', label: 'Стартовый комплект', price: 0, detail: 'Тренировочные шорты' },
  { id: 'ember', label: 'Огненный след', price: 60, detail: 'Форма с медными акцентами' },
  { id: 'steel', label: 'Холодная сталь', price: 100, detail: 'Тёмная металлическая форма' },
];

export const TOWER_FLOORS = [
  { floor: 1, name: 'Искра', bot: 'УЧЕНИК', targetMs: 110000 },
  { floor: 2, name: 'Уголь', bot: 'ПОДМАСТЕРЬЕ', targetMs: 100000 },
  { floor: 3, name: 'Молот', bot: 'КУЗНЕЦ', targetMs: 90000 },
  { floor: 4, name: 'Закалка', bot: 'МАСТЕР', targetMs: 80000 },
  { floor: 5, name: 'Сталь', bot: 'ЧЕМПИОН', targetMs: 70000 },
] as const;

export const LOGIN_COINS = 10;
export const QUEST_XP = 55;
export const QUEST_COINS = 20;
export const TOWER_XP = 65;
export const TOWER_COINS = 30;

export interface GameState {
  created: boolean;
  nickname: string;
  build: BodyBuild;
  muscles: Record<Muscle, number>;
  outfit: Outfit;
  ownedOutfits: Outfit[];
  lastLoginDay: string | null;
  lastQuestClaimDay: string | null;
  highestClearedFloor: number;
  bestGhost: { durationMs: number; splitsMs: number[] } | null;
}

export function freshGame(): GameState {
  return {
    created: false,
    nickname: 'НОВЫЙ БОЕЦ',
    build: 'lean',
    muscles: { arms: 0, core: 0, legs: 0, back: 0 },
    outfit: 'base',
    ownedOutfits: ['base'],
    lastLoginDay: null,
    lastQuestClaimDay: null,
    highestClearedFloor: 0,
    bestGhost: null,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const validDay = (v: unknown): string | null =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
const validBuild = (v: unknown): v is BodyBuild => v === 'lean' || v === 'solid';
const validOutfit = (v: unknown): v is Outfit => v === 'base' || v === 'ember' || v === 'steel';
export const MAX_MUSCLE_LEVEL = 5;
const muscleLevel = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_MUSCLE_LEVEL ? value : 0;

export function normalizeGame(value: unknown): GameState {
  const base = freshGame();
  if (!isRecord(value)) return base;
  const rawMuscles = isRecord(value.muscles) ? value.muscles : {};
  const owned: Outfit[] = Array.isArray(value.ownedOutfits)
    ? value.ownedOutfits.filter((item): item is Outfit => validOutfit(item)) : [];
  const ownedOutfits: Outfit[] = Array.from(new Set<Outfit>(['base', ...owned]));
  const rawGhost = isRecord(value.bestGhost) ? value.bestGhost : null;
  const duration = rawGhost?.durationMs;
  const splits: unknown[] = rawGhost && Array.isArray(rawGhost.splitsMs) ? rawGhost.splitsMs : [];
  const bestGhost = typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    && splits.length === 20
    && splits.every((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 && ms <= duration)
    && splits.every((ms, index) => typeof ms === 'number' && (index === 0 || (typeof splits[index - 1] === 'number' && ms >= (splits[index - 1] as number))))
    ? { durationMs: duration, splitsMs: [...splits] as number[] } : null;

  return {
    created: value.created === true,
    nickname: typeof value.nickname === 'string' && value.nickname.trim().length > 0
      ? value.nickname.trim().slice(0, 20) : base.nickname,
    build: validBuild(value.build) ? value.build : base.build,
    muscles: {
      arms: muscleLevel(rawMuscles.arms),
      core: muscleLevel(rawMuscles.core),
      legs: muscleLevel(rawMuscles.legs),
      back: muscleLevel(rawMuscles.back),
    },
    ownedOutfits,
    outfit: validOutfit(value.outfit) && ownedOutfits.includes(value.outfit) ? value.outfit : 'base',
    lastLoginDay: validDay(value.lastLoginDay),
    lastQuestClaimDay: validDay(value.lastQuestClaimDay),
    highestClearedFloor: typeof value.highestClearedFloor === 'number'
      && Number.isInteger(value.highestClearedFloor)
      ? Math.min(TOWER_FLOORS.length, Math.max(0, value.highestClearedFloor)) : 0,
    bestGhost,
  };
}

export function localDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function muscleCost(currentLevel: number): number {
  return 25 + Math.max(0, currentLevel) * 25;
}

export function createFighter(profile: Profile, build: BodyBuild, nickname: string): Profile {
  const name = nickname.trim().slice(0, 20);
  if (profile.game.created || name.length < 2) return profile;
  return { ...profile, game: { ...profile.game, created: true, build, nickname: name } };
}

export function upgradeMuscle(profile: Profile, muscle: Muscle): Profile {
  const currentLevel = profile.game.muscles[muscle];
  if (!profile.game.created || currentLevel >= MAX_MUSCLE_LEVEL) return profile;
  const cost = muscleCost(currentLevel);
  if (profile.coins < cost) return profile;
  return {
    ...profile,
    coins: profile.coins - cost,
    game: {
      ...profile.game,
      muscles: { ...profile.game.muscles, [muscle]: currentLevel + 1 },
    },
  };
}

export function buyOrEquipOutfit(profile: Profile, outfit: Outfit): Profile {
  if (!profile.game.created) return profile;
  const definition = OUTFITS.find((item) => item.id === outfit);
  if (!definition) return profile;
  const alreadyOwned = profile.game.ownedOutfits.includes(outfit);
  if (!alreadyOwned && profile.coins < definition.price) return profile;
  return {
    ...profile,
    coins: alreadyOwned ? profile.coins : profile.coins - definition.price,
    game: {
      ...profile.game,
      outfit,
      ownedOutfits: alreadyOwned
        ? profile.game.ownedOutfits
        : [...profile.game.ownedOutfits, outfit],
    },
  };
}

export function claimLogin(profile: Profile, now = new Date()): Profile {
  const day = localDay(now);
  if (!profile.game.created || profile.game.lastLoginDay === day) return profile;
  return {
    ...profile,
    coins: profile.coins + LOGIN_COINS,
    game: { ...profile.game, lastLoginDay: day },
  };
}

export function canClaimQuest(profile: Profile, now = new Date()): boolean {
  const day = localDay(now);
  return profile.game.created && profile.game.lastQuestClaimDay !== day
    && profile.workouts.some((workout) => localDay(new Date(workout.finishedAt)) === day);
}

export function claimDailyQuest(profile: Profile, now = new Date()): Profile {
  if (!canClaimQuest(profile, now)) return profile;
  return {
    ...profile,
    xp: profile.xp + QUEST_XP,
    coins: profile.coins + QUEST_COINS,
    game: { ...profile.game, lastQuestClaimDay: localDay(now) },
  };
}

export function nextTowerFloor(game: GameState) {
  return TOWER_FLOORS[Math.min(game.highestClearedFloor, TOWER_FLOORS.length - 1)];
}

export function beatTowerFloor(profile: Profile, durationMs: number): Profile {
  const floor = nextTowerFloor(profile.game);
  if (profile.game.highestClearedFloor >= TOWER_FLOORS.length || durationMs > floor.targetMs) return profile;
  return {
    ...profile,
    xp: profile.xp + TOWER_XP,
    coins: profile.coins + TOWER_COINS,
    game: { ...profile.game, highestClearedFloor: floor.floor },
  };
}

export function storeGhost(profile: Profile, durationMs: number, splitsMs: number[]): Profile {
  if (!Array.isArray(splitsMs) || splitsMs.length !== 20) return profile;
  if (!Number.isFinite(durationMs) || durationMs <= 0 || splitsMs.some((ms, index) =>
    !Number.isFinite(ms) || ms < 0 || ms > durationMs || (index !== 0 && ms < splitsMs[index - 1]))) return profile;
  if (profile.game.bestGhost && profile.game.bestGhost.durationMs <= durationMs) return profile;
  return {
    ...profile,
    game: { ...profile.game, bestGhost: { durationMs, splitsMs: [...splitsMs] } },
  };
}

export function ghostRepetitions(splitsMs: number[], elapsedMs: number): number {
  return splitsMs.filter((ms) => ms <= elapsedMs).length;
}
