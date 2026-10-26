import { localDay } from './game';

/**
 * Explicit MANUAL estimate, not measured pedometer data. It is NEVER passed
 * to profile/progression and cannot award XP, coins, equipment or streaks.
 */
export const MANUAL_STEPS_KEY = 'bodyforge:manual-steps:v1';
export const MAX_MANUAL_STEPS = 100_000;
export interface ManualSteps { version: 1; day: string; count: number; source: 'manual' }
export type StepsRead = { status: 'ready' | 'unavailable' | 'invalid'; data: ManualSteps }
  | { status: 'date-conflict'; data: ManualSteps; recordDay: string };
const empty = (day: string): ManualSteps => ({ version: 1, day, count: 0, source: 'manual' });

export function validStepCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_MANUAL_STEPS;
}
const validCalendarDay = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const checked = new Date(value + 'T12:00:00Z');
  return Number.isFinite(checked.getTime()) && checked.toISOString().slice(0, 10) === value;
};

function parseManualSteps(raw: string): ManualSteps | null {
  try {
    const record: unknown = JSON.parse(raw);
    if (typeof record !== 'object' || record === null) return null;
    const r = record as Record<string, unknown>;
    if (r.version !== 1 || r.source !== 'manual' || !validCalendarDay(r.day) ||
      !validStepCount(r.count)) return null;
    return { version: 1, day: r.day, count: r.count, source: 'manual' };
  } catch { return null; }
}

export function readManualSteps(now: Date, storage?: Pick<Storage, 'getItem'>): StepsRead {
  const day = localDay(now);
  try {
    const store = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    if (!store) return { status: 'unavailable', data: empty(day) };
    const raw = store.getItem(MANUAL_STEPS_KEY);
    if (raw === null) return { status: 'ready', data: empty(day) };
    const record = parseManualSteps(raw);
    if (!record) return { status: 'invalid', data: empty(day) };
    if (record.day > day) return { status: 'date-conflict', data: empty(day), recordDay: record.day };
    // Only today's explicit number counts. Yesterday is never carried forward.
    return { status: 'ready', data: record.day === day ? record : empty(day) };
  } catch { return { status: 'unavailable', data: empty(day) }; }
}

export function saveManualSteps(now: Date, count: number, storage?: Pick<Storage, 'setItem' | 'getItem'>): boolean {
  if (!Number.isFinite(now.getTime()) || !validStepCount(count)) return false;
  try {
    const store = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    if (!store) return false;
    // Preserve a known valid later-dated note after a clock/timezone rollback.
    // This preflight is not a transaction against concurrent or older writers.
    const priorRaw = store.getItem(MANUAL_STEPS_KEY);
    const prior = priorRaw === null ? null : parseManualSteps(priorRaw);
    if (prior && prior.day > localDay(now)) return false;
    const raw = JSON.stringify({ version: 1, day: localDay(now), count, source: 'manual' });
    store.setItem(MANUAL_STEPS_KEY, raw);
    return store.getItem(MANUAL_STEPS_KEY) === raw;
  } catch { return false; }
}
