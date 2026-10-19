import type { PosePoint } from './squatCounter';

export type PoseGuidanceKind =
  | 'no-person'
  | 'knees-hidden'
  | 'feet-hidden'
  | 'too-close'
  | 'angle-unavailable'
  | 'tracked';

export interface PoseGuidance {
  kind: PoseGuidanceKind;
  title: string;
  instruction: string;
  warning: boolean;
}

const messages: Record<PoseGuidanceKind, Omit<PoseGuidance, 'kind'>> = {
  'no-person': {
    title: 'НАЙДИ СЕБЯ В КАДРЕ',
    instruction: 'Отойди от телефона. Камера должна видеть таз, колени и стопы.',
    warning: true,
  },
  'knees-hidden': {
    title: 'КОЛЕНИ НЕ ВИДНЫ',
    instruction: 'Опусти камеру чуть ниже или отойди. Повернись боком для точного подсчёта.',
    warning: true,
  },
  'feet-hidden': {
    title: 'НЕ ВИДНЫ ЛОДЫЖКИ',
    instruction: 'Сними препятствия перед ногами. Умести ноги и стопы в кадр.',
    warning: true,
  },
  'too-close': {
    title: 'СТОПЫ У КРАЯ КАДРА',
    instruction: 'Отодвинь телефон дальше или включи широкую камеру, если доступна.',
    warning: true,
  },
  'angle-unavailable': {
    title: 'УГОЛ НЕ ОПРЕДЕЛЯЕТСЯ',
    instruction: 'Встань боком к телефону и держи ноги в кадре. Счётчик ждёт суставы.',
    warning: true,
  },
  tracked: {
    title: 'СУСТАВЫ В КАДРЕ',
    instruction: 'Камера видит ногу. Повернись боком, чтобы угол сгибания был точнее.',
    warning: false,
  },
};

/** Lightweight, advisory feedback. Does NOT change the squat counter or
 * claim that exercise technique is correct. Works entirely on-device. */
export function assessPoseGuidance(points: PosePoint[] | undefined, kneeAngle: number | null): PoseGuidance {
  const hint = (kind: PoseGuidanceKind): PoseGuidance => ({ kind, ...messages[kind] });
  if (!points?.length) return hint('no-person');
  const visible = (index: number): boolean => {
    const point = points[index];
    return !!point &&
      Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 &&
      (point.visibility ?? 1) >= .42 && (point.presence ?? 1) >= .4;
  };
  const torsoSeen = [11, 12, 23, 24].filter(visible).length >= 2;
  if (!torsoSeen) return hint('no-person');

  const completeLegs = ([
    [23, 25, 27], [24, 26, 28],
  ] as const).filter(([hip, knee, ankle]) => visible(hip) && visible(knee) && visible(ankle));
  if (completeLegs.length === 0) {
    if (![25, 26].some(visible)) return hint('knees-hidden');
    if (![27, 28].some(visible)) return hint('feet-hidden');
    // A knee and an ankle may belong to different legs and cannot form
    // a trustworthy angle. Do not imply they are a complete tracked leg.
    return hint('angle-unavailable');
  }

  // Even if a knee angle is measurable, a foot at the physical image edge
  // is easy to lose when descending. Warn before the counter drops out.
  const feetAtBottomEdge = completeLegs.every(([, , ankle]) => points[ankle].y >= .94);
  if (feetAtBottomEdge) return hint('too-close');
  if (kneeAngle === null || !Number.isFinite(kneeAngle)) return hint('angle-unavailable');
  return hint('tracked');
}

/** Avoid flashing an intrusive message when landmark confidence drops for
 * one or two frames (common at the bottom of a squat). */
export class PoseGuidanceTracker {
  private displayed: PoseGuidance = assessPoseGuidance(undefined, null);
  private pending: PoseGuidance | null = null;
  private pendingAt: number | null = null;
  private readonly waitMs = 380;

  reset(): PoseGuidance {
    this.displayed = assessPoseGuidance(undefined, null);
    this.pending = null;
    this.pendingAt = null;
    return this.displayed;
  }

  update(points: PosePoint[] | undefined, kneeAngle: number | null, time: number): PoseGuidance {
    const next = assessPoseGuidance(points, kneeAngle);
    if (next.kind === this.displayed.kind) {
      this.pending = null;
      this.pendingAt = null;
    } else if (this.pending?.kind !== next.kind) {
      this.pending = next;
      this.pendingAt = time;
    } else if (this.pendingAt !== null && time - this.pendingAt >= this.waitMs) {
      this.displayed = next;
      this.pending = null;
      this.pendingAt = null;
    }
    return this.displayed;
  }
}
