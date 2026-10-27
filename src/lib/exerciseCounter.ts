import { type CounterFeedback, type CounterPhase, type CounterSnapshot, type KneeSide, type PosePoint } from './squatCounter';
import { type ExerciseId } from './trainingCatalog';

const CONFIDENCE = 0.5;
const LOST_MS = 750;
const READY_MS = 160;
const ENGAGED_MS = 100;
const RETURN_MS = 90;
const REP_MS = 390;
const HOLD_TARGET_SECONDS = 30;

type Side = KneeSide;
interface Reading { metric: number; ready: boolean; engaged: boolean; side: Side | null }
type LandmarkSet = PosePoint[];

const valid = (p: PosePoint | undefined): p is PosePoint =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
  p.x >= 0.01 && p.x <= 0.99 && p.y >= 0.01 && p.y <= 0.99 &&
  Number.isFinite(p.visibility ?? 1) && (p.visibility ?? 1) >= CONFIDENCE &&
  Number.isFinite(p.presence ?? 1) && (p.presence ?? 1) >= 0.45;
const visible = (p: LandmarkSet, ...indexes: number[]) => indexes.every((index) => valid(p[index]));
const xy = (p: PosePoint, ratio: number) => ({ x: p.x * ratio, y: p.y });
function angle(a: PosePoint, b: PosePoint, c: PosePoint, ratio: number): number {
  const aa = xy(a, ratio), bb = xy(b, ratio), cc = xy(c, ratio);
  const radians = Math.atan2(aa.y - bb.y, aa.x - bb.x) - Math.atan2(cc.y - bb.y, cc.x - bb.x);
  const degrees = Math.abs(radians * 180 / Math.PI);
  return degrees > 180 ? 360 - degrees : degrees;
}
function measuredAngle(p: LandmarkSet, a: number, b: number, c: number, ratio: number): number | null {
  if (!visible(p, a, b, c)) return null;
  const pa = p[a], pb = p[b], pc = p[c];
  if (Math.hypot((pa.x - pb.x) * ratio, pa.y - pb.y) < 0.065 ||
      Math.hypot((pc.x - pb.x) * ratio, pc.y - pb.y) < 0.065) return null;
  return angle(pa, pb, pc, ratio);
}
const sides = [
  { side: 'left' as Side, shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
  { side: 'right' as Side, shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 },
];
function horizontalBody(p: LandmarkSet, s: typeof sides[number], ratio: number) {
  if (!visible(p, s.shoulder, s.hip, s.ankle)) return false;
  const shoulder = p[s.shoulder], ankle = p[s.ankle];
  return Math.abs((shoulder.x - ankle.x) * ratio) > Math.abs(shoulder.y - ankle.y) * 1.35 &&
    (measuredAngle(p, s.shoulder, s.hip, s.ankle, ratio) ?? 0) >= 145;
}
function sidesReading(p: LandmarkSet, ratio: number, id: ExerciseId, locked: Side | null): Reading | null {
  const readings: Reading[] = [];
  for (const s of sides) {
    let value: number | null = null;
    if (id === 'lunge') value = measuredAngle(p, s.hip, s.knee, s.ankle, ratio);
    if (id === 'pushup') {
      if (!horizontalBody(p, s, ratio)) continue;
      value = measuredAngle(p, s.shoulder, s.elbow, s.wrist, ratio);
    }
    if (id === 'crunch') {
      const knee = measuredAngle(p, s.hip, s.knee, s.ankle, ratio);
      if (knee === null || knee < 45 || knee > 145) continue;
      value = measuredAngle(p, s.shoulder, s.hip, s.knee, ratio);
    }
    if (id === 'leg-raise') {
      if (!visible(p, s.shoulder, s.hip, s.knee, s.ankle)) continue;
      const shoulder = p[s.shoulder], hip = p[s.hip];
      if (Math.abs((shoulder.x - hip.x) * ratio) < Math.abs(shoulder.y - hip.y) * 1.15) continue;
      const knee = measuredAngle(p, s.hip, s.knee, s.ankle, ratio);
      if (knee === null || knee < 145) continue;
      value = measuredAngle(p, s.shoulder, s.hip, s.ankle, ratio);
    }
    if (value === null) continue;
    const readyThreshold = id === 'crunch' ? 132 : id === 'leg-raise' ? 150 : 151;
    const activeThreshold = id === 'crunch' ? 103 : id === 'leg-raise' ? 110 : id === 'lunge' ? 113 : 108;
    readings.push({ metric: value, ready: value >= readyThreshold, engaged: value <= activeThreshold, side: s.side });
  }
  if (id === 'lunge' && readings.length) {
    const allReady = readings.length === 2 && readings.every((r) => r.ready);
    const chosen = locked
      ? readings.find((r) => r.side === locked)
      : readings.find((r) => r.engaged) ?? readings[0];
    return chosen ? { ...chosen, ready: allReady } : null;
  }
  if (locked) return readings.find((r) => r.side === locked) ?? null;
  return readings.find((r) => r.engaged) ?? readings[0] ?? null;
}
function jackReading(p: LandmarkSet, ratio: number): Reading | null {
  if (!visible(p, 11, 12, 15, 16, 23, 24, 27, 28)) return null;
  const shoulderWidth = Math.abs(p[11].x - p[12].x) * ratio;
  if (shoulderWidth < 0.065) return null;
  const feet = Math.abs(p[27].x - p[28].x) * ratio / shoulderWidth;
  const shoulders = (p[11].y + p[12].y) / 2;
  const armsUp = p[15].y < shoulders - .095 && p[16].y < shoulders - .095;
  const armsDown = p[15].y > shoulders + .10 && p[16].y > shoulders + .10;
  return { metric: feet, ready: feet < 1.12 && armsDown, engaged: feet > 1.70 && armsUp, side: null };
}
function kneesReading(p: LandmarkSet): Reading | null {
  if (!visible(p, 23, 24, 25, 26, 27, 28)) return null;
  const leftUp = p[25].y - p[23].y < .10;
  const rightUp = p[26].y - p[24].y < .10;
  const leftDown = p[25].y - p[23].y > .18;
  const rightDown = p[26].y - p[24].y > .18;
  if (leftUp && rightDown) return { metric: Math.max(0, (p[23].y - p[25].y) * 100), ready: false, engaged: true, side: 'left' };
  if (rightUp && leftDown) return { metric: Math.max(0, (p[24].y - p[26].y) * 100), ready: false, engaged: true, side: 'right' };
  return { metric: 0, ready: leftDown && rightDown, engaged: false, side: null };
}
function plankReading(p: LandmarkSet, ratio: number): Reading | null {
  for (const s of sides) {
    if (!visible(p, s.shoulder, s.elbow, s.hip, s.ankle)) continue;
    const a = measuredAngle(p, s.shoulder, s.hip, s.ankle, ratio);
    const shoulder = p[s.shoulder], ankle = p[s.ankle], elbow = p[s.elbow];
    if (a === null) continue;
    const horizontal = Math.abs((shoulder.x - ankle.x) * ratio) >= Math.abs(shoulder.y - ankle.y) * 1.5;
    const support = elbow.y > shoulder.y + .025 &&
      Math.abs((elbow.x - shoulder.x) * ratio) < .27;
    return { metric: a, ready: horizontal && support && a >= 157, engaged: horizontal && support && a >= 157, side: s.side };
  }
  return null;
}

/** Geometric prototypes. They measure 2-D projections, not medically verified technique. */
export function measureExercise(
  id: ExerciseId, points: LandmarkSet, aspectRatio = 1, side: Side | null = null,
): Reading | null {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0 || aspectRatio > 5) return null;
  if (id === 'jumping-jack') return jackReading(points, aspectRatio);
  if (id === 'high-knees') return kneesReading(points);
  if (id === 'plank') return plankReading(points, aspectRatio);
  if (id === 'squat') return null; // The existing adaptive SquatCounter is authoritative.
  return sidesReading(points, aspectRatio, id, side);
}

export interface ExerciseReading {
  snapshot: CounterSnapshot;
  side: Side | null;
  metricName: string;
  metricUnit: string;
  tracking: boolean;
}
const metricNames: Record<Exclude<ExerciseId, 'squat'>, string> = {
  lunge: 'КОЛЕНО', pushup: 'ЛОКОТЬ', 'jumping-jack': 'РАЗВОДКА',
  'high-knees': 'ПОДЪЁМ', crunch: 'КОРПУС', 'leg-raise': 'ТАЗ', plank: 'КОРПУС',
};
const metricUnits: Record<Exclude<ExerciseId, 'squat'>, string> = {
  lunge: '°', pushup: '°', 'jumping-jack': '×', 'high-knees': '',
  crunch: '°', 'leg-raise': '°', plank: '°',
};

export function exerciseMetric(id: ExerciseId): { name: string; unit: string } {
  return id === 'squat' ? { name: 'КОЛЕНО', unit: '°' }
    : { name: metricNames[id], unit: metricUnits[id] };
}

export class ExerciseMotionCounter {
  private phase: CounterPhase = 'calibrate';
  private count = 0;
  private readyAt: number | null = null;
  private engagedAt: number | null = null;
  private returnAt: number | null = null;
  private lastVisibleAt: number | null = null;
  private lastRepAt = Number.NEGATIVE_INFINITY;
  private lockedSide: Side | null = null;
  private previousKnee: Side | null = null;
  private holdMs = 0;
  private holdAt: number | null = null;
  private lastTime = Number.NEGATIVE_INFINITY;
  constructor(readonly id: Exclude<ExerciseId, 'squat'>) {}

  private forgetPartial(): void {
    this.phase = 'calibrate';
    this.readyAt = null;
    this.engagedAt = null;
    this.returnAt = null;
    this.lockedSide = null;
    this.holdAt = null;
    if (this.id === 'plank') { this.holdMs = 0; this.count = 0; }
  }
  reset(): void {
    this.forgetPartial();
    this.count = 0;
    this.lastVisibleAt = null;
    this.lastRepAt = Number.NEGATIVE_INFINITY;
    this.previousKnee = null;
    this.lastTime = Number.NEGATIVE_INFINITY;
  }
  recalibrate(): ExerciseReading {
    this.forgetPartial();
    this.lastVisibleAt = null;
    return this.result('stand', false, null);
  }
  private result(feedback: CounterFeedback, counted: boolean, metric: number | null): ExerciseReading {
    const snapshot: CounterSnapshot = {
      count: this.count, phase: this.phase, feedback, angle: metric === null ? null : Math.round(metric * 10) / 10,
      counted, calibrated: this.phase !== 'calibrate', standingAngle: null, depthTarget: null,
      returnTarget: null, lowestAngle: null,
    };
    return {
      snapshot, side: this.lockedSide, metricName: metricNames[this.id], metricUnit: metricUnits[this.id],
      tracking: metric !== null,
    };
  }
  update(points: LandmarkSet, now: number, ratio = 1): ExerciseReading {
    if (!Number.isFinite(now) || now <= this.lastTime) return this.result('find-body', false, null);
    this.lastTime = now;
    if (this.lastVisibleAt !== null && now - this.lastVisibleAt > LOST_MS) this.forgetPartial();
    const reading = measureExercise(this.id, points, ratio, this.id === 'high-knees' || this.id === 'plank' ? null : this.lockedSide);
    if (!reading) {
      if (this.id === 'plank') this.forgetPartial();
      return this.result('find-body', false, null);
    }
    this.lastVisibleAt = now;
    if (this.id === 'plank') {
      if (!reading.ready) {
        this.forgetPartial();
        return this.result('stand', false, reading.metric);
      }
      if (this.phase === 'calibrate') {
        this.readyAt ??= now;
        if (now - this.readyAt >= 300) { this.phase = 'bottom'; this.holdAt = now; }
        return this.result('stand', false, reading.metric);
      }
      // Only fresh validated video frames can advance a continuous hold.
      if (this.holdAt !== null && now - this.holdAt > 450) {
        this.forgetPartial();
        return this.result('stand', false, reading.metric);
      }
      this.holdMs += Math.max(0, Math.min(180, now - (this.holdAt ?? now)));
      this.holdAt = now;
      const before = this.count;
      this.count = Math.min(HOLD_TARGET_SECONDS, Math.floor(this.holdMs / 1000));
      return this.result('rise', this.count > before, reading.metric);
    }

    let feedback: CounterFeedback = 'stand';
    let counted = false;
    switch (this.phase) {
      case 'calibrate':
        if (reading.ready) {
          this.readyAt ??= now;
          if (now - this.readyAt >= READY_MS) this.phase = 'ready';
        } else { this.readyAt = null; }
        feedback = this.phase === 'ready' ? 'go-down' : 'stand';
        break;
      case 'ready':
        feedback = 'go-down';
        if (reading.engaged && !(this.id === 'high-knees' && reading.side === this.previousKnee)) {
          this.phase = 'descending';
          this.engagedAt = now;
          this.lockedSide = reading.side;
          feedback = 'lower';
        }
        break;
      case 'descending':
        feedback = 'lower';
        if (reading.engaged && this.engagedAt !== null && now - this.engagedAt >= ENGAGED_MS) {
          this.phase = 'bottom';
          this.returnAt = null;
          feedback = 'rise';
        } else if (reading.ready) {
          this.phase = 'ready'; this.engagedAt = null; this.lockedSide = null;
        }
        break;
      case 'bottom':
        feedback = 'rise';
        if (reading.ready) {
          this.returnAt ??= now;
          if (now - this.returnAt >= RETURN_MS &&
              this.engagedAt !== null && now - this.engagedAt >= REP_MS &&
              now - this.lastRepAt >= REP_MS) {
            this.count++;
            this.lastRepAt = now;
            if (this.id === 'high-knees') this.previousKnee = this.lockedSide;
            this.phase = 'ready';
            this.engagedAt = null; this.returnAt = null; this.lockedSide = null;
            counted = true; feedback = 'great';
          }
        } else this.returnAt = null;
        break;
    }
    return this.result(feedback, counted, reading.metric);
  }
}
