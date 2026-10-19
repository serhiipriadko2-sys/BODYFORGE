/**
 * Deterministic knee-angle counter. A repetition is counted only after:
 * standing calibration -> descent -> stable depth -> return to full standing.
 * This is a prototype form heuristic, NOT a medical assessment of safe form.
 */

export type CounterPhase = 'calibrate' | 'ready' | 'descending' | 'bottom';
export type CounterFeedback = 'find-body' | 'stand' | 'go-down' | 'lower' | 'rise' | 'great';

export interface CounterSnapshot {
  count: number;
  phase: CounterPhase;
  feedback: CounterFeedback;
  angle: number | null;
  counted: boolean;
  calibrated: boolean;
}

const STAND_ANGLE = 157;
const DESCENT_ANGLE = 135;
const DEPTH_ANGLE = 108;
const CALIBRATION_MS = 110;
const HOLD_DEPTH_MS = 90;
const HOLD_STAND_MS = 100;
const MIN_REP_MS = 550;
const MIN_BOTTOM_TO_STAND_MS = 240;
const LOST_POSE_MS = 900;

export class SquatCounter {
  private phase: CounterPhase = 'calibrate';
  private count = 0;
  private filteredAngle: number | null = null;
  private standSince: number | null = null;
  private deepSince: number | null = null;
  private bottomAt: number | null = null;
  private lastRepAt = Number.NEGATIVE_INFINITY;
  private lastVisibleAt: number | null = null;

  reset(): void {
    this.phase = 'calibrate';
    this.count = 0;
    this.filteredAngle = null;
    this.standSince = null;
    this.deepSince = null;
    this.bottomAt = null;
    this.lastRepAt = Number.NEGATIVE_INFINITY;
    this.lastVisibleAt = null;
  }

  update(rawAngle: number | null, now: number): CounterSnapshot {
    if (rawAngle === null || !Number.isFinite(rawAngle) || rawAngle < 45 || rawAngle > 180) {
      if (this.lastVisibleAt !== null && now - this.lastVisibleAt > LOST_POSE_MS) {
        this.phase = 'calibrate';
        this.filteredAngle = null;
        this.standSince = null;
        this.deepSince = null;
        this.bottomAt = null;
        this.lastVisibleAt = null;
      }
      return this.snapshot('find-body', false);
    }

    this.lastVisibleAt = now;
    this.filteredAngle = this.filteredAngle === null
      ? rawAngle
      : this.filteredAngle * 0.40 + rawAngle * 0.60;
    const angle = this.filteredAngle;
    let counted = false;
    let feedback: CounterFeedback = 'stand';

    switch (this.phase) {
      case 'calibrate':
        if (angle >= STAND_ANGLE) {
          this.standSince ??= now;
          if (now - this.standSince >= CALIBRATION_MS) {
            this.phase = 'ready';
            this.standSince = null;
          }
        } else {
          this.standSince = null;
        }
        feedback = this.phase === 'ready' ? 'go-down' : 'stand';
        break;
      case 'ready':
        feedback = 'go-down';
        if (angle < DESCENT_ANGLE) {
          this.phase = 'descending';
          this.deepSince = null;
          feedback = 'lower';
        }
        break;
      case 'descending':
        feedback = 'lower';
        if (angle <= DEPTH_ANGLE) {
          this.deepSince ??= now;
          if (now - this.deepSince >= HOLD_DEPTH_MS) {
            this.phase = 'bottom';
            this.bottomAt = now;
            this.standSince = null;
            feedback = 'rise';
          }
        } else {
          this.deepSince = null;
        }
        // Shallow reps do not count, even if the person stands up.
        if (angle >= STAND_ANGLE) {
          this.phase = 'ready';
          this.deepSince = null;
          feedback = 'go-down';
        }
        break;
      case 'bottom':
        feedback = 'rise';
        if (angle >= STAND_ANGLE) {
          this.standSince ??= now;
          if (now - this.standSince >= HOLD_STAND_MS &&
              this.bottomAt !== null && now - this.bottomAt >= MIN_BOTTOM_TO_STAND_MS &&
              now - this.lastRepAt >= MIN_REP_MS) {
            this.count++;
            this.lastRepAt = now;
            this.phase = 'ready';
            this.deepSince = null;
            this.bottomAt = null;
            this.standSince = null;
            feedback = 'great';
            counted = true;
          }
        } else {
          this.standSince = null;
        }
        break;
    }

    return this.snapshot(feedback, counted);
  }

  private snapshot(feedback: CounterFeedback, counted: boolean): CounterSnapshot {
    return {
      count: this.count,
      phase: this.phase,
      angle: this.filteredAngle === null ? null : Math.round(this.filteredAngle),
      feedback,
      counted,
      calibrated: this.phase !== 'calibrate',
    };
  }
}

export interface PosePoint {
  x: number;
  y: number;
  visibility?: number;
}

function jointAngle(a: PosePoint, b: PosePoint, c: PosePoint): number {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  const degrees = Math.abs(radians * 180 / Math.PI);
  return degrees > 180 ? 360 - degrees : degrees;
}

/** MediaPipe landmarks: left hip/knee/ankle 23/25/27; right 24/26/28. */
export function getKneeAngle(landmarks: PosePoint[]): number | null {
  const candidates: Array<{ angle: number; confidence: number }> = [];
  for (const [hip, knee, ankle] of [[23, 25, 27], [24, 26, 28]]) {
    const a = landmarks[hip];
    const b = landmarks[knee];
    const c = landmarks[ankle];
    if (!a || !b || !c) continue;
    const confidence = Math.min(a.visibility ?? 1, b.visibility ?? 1, c.visibility ?? 1);
    if (confidence < 0.55) continue;
    if (![a, b, c].every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) &&
          point.x >= 0.01 && point.x <= 0.99 && point.y >= 0.01 && point.y <= 0.99)) continue;
    const angle = jointAngle(a, b, c);
    if (Number.isFinite(angle)) candidates.push({ angle, confidence });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0].angle;
}
