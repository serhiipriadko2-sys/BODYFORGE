/**
 * Side-view squat detector. Calibrates each person's visible standing angle
 * and counts only a down/up cycle with a meaningful bend and a complete return.
 * Projection angle is a game heuristic, NOT medical advice or form assessment.
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
  /** The measured angle when the player last stood straight. */
  standingAngle: number | null;
  /** A depth target based on the standing angle, never shallower than 128 degrees. */
  depthTarget: number | null;
  /** The minimum angle needed to recognize the return to standing. */
  returnTarget: number | null;
  /** Deepest angle within the current attempt; useful for user-facing diagnostics. */
  lowestAngle: number | null;
}

const MIN_STANDING_ANGLE = 140;
const CALIBRATION_MS = 145;
const DESCENT_DROP = 15;
const DEPTH_DROP = 36;
const MAX_DEPTH_ANGLE = 128;
const RETURN_TOLERANCE = 11;
const MIN_DESCENT_MS = 140;
const STAND_HOLD_MS = 85;
const MIN_BOTTOM_TO_STAND_MS = 210;
const MIN_REP_MS = 550;
const LOST_POSE_MS = 900;

export class SquatCounter {
  private phase: CounterPhase = 'calibrate';
  private count = 0;
  private filteredAngle: number | null = null;
  private standSince: number | null = null;
  private candidateStandingAngle: number | null = null;
  private standingAngle: number | null = null;
  private descentAt: number | null = null;
  private bottomAt: number | null = null;
  private lowestAngle: number | null = null;
  private lastRepAt = Number.NEGATIVE_INFINITY;
  private lastVisibleAt: number | null = null;
  private trackedSide: KneeSide | null = null;

  private resetPoseTracking(): void {
    // Preserve completed reps while ensuring an obscured rep cannot finish unseen.
    this.phase = 'calibrate';
    this.filteredAngle = null;
    this.standSince = null;
    this.candidateStandingAngle = null;
    this.standingAngle = null;
    this.descentAt = null;
    this.bottomAt = null;
    this.lowestAngle = null;
    this.trackedSide = null;
  }

  reset(): void {
    this.resetPoseTracking();
    this.count = 0;
    this.lastRepAt = Number.NEGATIVE_INFINITY;
    this.lastVisibleAt = null;
  }

  /** Switching lenses changes the projected knee angle. Recalibrate posture
   * without losing completed repetitions or counting an invisible half-rep. */
  recalibrate(): CounterSnapshot {
    this.resetPoseTracking();
    this.lastVisibleAt = null;
    return this.snapshot('stand', false);
  }

  private depthThreshold(): number | null {
    return this.standingAngle === null
      ? null
      : Math.min(MAX_DEPTH_ANGLE, this.standingAngle - DEPTH_DROP);
  }

  private returnThreshold(): number | null {
    return this.standingAngle === null
      ? null
      : Math.max(MIN_STANDING_ANGLE, this.standingAngle - RETURN_TOLERANCE);
  }

  update(rawAngle: number | null, now: number, side: KneeSide | null = null): CounterSnapshot {
    if (this.lastVisibleAt !== null && now - this.lastVisibleAt > LOST_POSE_MS) {
      this.resetPoseTracking();
      this.lastVisibleAt = null;
    }

    if (rawAngle === null || !Number.isFinite(rawAngle) || rawAngle < 45 || rawAngle > 180) {
      return this.snapshot('find-body', false);
    }

    // A cycle must belong to one leg. A brief missing observation keeps that
    // identity; a real side change discards only the unfinished attempt.
    if (side !== null && this.trackedSide !== null && side !== this.trackedSide) {
      this.resetPoseTracking();
    }
    if (side !== null) this.trackedSide = side;

    this.lastVisibleAt = now;
    // Quick enough for a squat whose lowest point is visible for only a few frames.
    this.filteredAngle = this.filteredAngle === null
      ? rawAngle
      : this.filteredAngle * 0.28 + rawAngle * 0.72;
    const angle = this.filteredAngle;
    let counted = false;
    let feedback: CounterFeedback = 'stand';

    switch (this.phase) {
      case 'calibrate':
        if (angle >= MIN_STANDING_ANGLE) {
          this.standSince ??= now;
          this.candidateStandingAngle = Math.max(angle, this.candidateStandingAngle ?? angle);
          if (now - this.standSince >= CALIBRATION_MS) {
            this.standingAngle = this.candidateStandingAngle;
            this.standSince = null;
            this.phase = 'ready';
          }
        } else {
          this.standSince = null;
          this.candidateStandingAngle = null;
        }
        feedback = this.phase === 'ready' ? 'go-down' : 'stand';
        break;
      case 'ready':
        feedback = 'go-down';
        if (this.standingAngle !== null && angle <= this.standingAngle - DESCENT_DROP) {
          this.phase = 'descending';
          this.descentAt = now;
          this.lowestAngle = angle;
          feedback = 'lower';
        }
        break;
      case 'descending':
        feedback = 'lower';
        this.lowestAngle = Math.min(angle, this.lowestAngle ?? angle);
        if (this.depthThreshold() !== null &&
            angle <= this.depthThreshold()! &&
            this.descentAt !== null &&
            now - this.descentAt >= MIN_DESCENT_MS) {
          this.phase = 'bottom';
          this.bottomAt = now;
          this.standSince = null;
          feedback = 'rise';
        } else if (this.returnThreshold() !== null && angle >= this.returnThreshold()!) {
          // Started a bend but never reached depth: discard it.
          this.phase = 'ready';
          this.descentAt = null;
          this.lowestAngle = null;
          feedback = 'go-down';
        }
        break;
      case 'bottom':
        feedback = 'rise';
        this.lowestAngle = Math.min(angle, this.lowestAngle ?? angle);
        if (this.returnThreshold() !== null && angle >= this.returnThreshold()!) {
          this.standSince ??= now;
          if (now - this.standSince >= STAND_HOLD_MS &&
              this.bottomAt !== null && now - this.bottomAt >= MIN_BOTTOM_TO_STAND_MS &&
              now - this.lastRepAt >= MIN_REP_MS) {
            this.count += 1;
            this.lastRepAt = now;
            this.phase = 'ready';
            this.descentAt = null;
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
      // Don't show a stale angle while the person is out of frame.
      angle: feedback === 'find-body' || this.filteredAngle === null ? null : Math.round(this.filteredAngle),
      feedback,
      counted,
      calibrated: this.phase !== 'calibrate',
      standingAngle: this.standingAngle === null ? null : Math.round(this.standingAngle),
      depthTarget: this.depthThreshold() === null ? null : Math.round(this.depthThreshold()!),
      returnTarget: this.returnThreshold() === null ? null : Math.round(this.returnThreshold()!),
      lowestAngle: this.lowestAngle === null ? null : Math.round(this.lowestAngle),
    };
  }
}

export interface PosePoint {
  x: number;
  y: number;
  visibility?: number;
  presence?: number;
}

export type KneeSide = 'left' | 'right';
interface KneeCandidate { angle: number; confidence: number; side: KneeSide }

function jointAngle(a: PosePoint, b: PosePoint, c: PosePoint, frameAspectRatio: number): number {
  // MediaPipe normalizes x by video width and y by video height. Restore
  // equal image units before measuring; the CSS viewport may have another ratio.
  const radians = Math.atan2(c.y - b.y, (c.x - b.x) * frameAspectRatio)
    - Math.atan2(a.y - b.y, (a.x - b.x) * frameAspectRatio);
  const degrees = Math.abs(radians * 180 / Math.PI);
  return degrees > 180 ? 360 - degrees : degrees;
}

function validSegment(a: PosePoint, b: PosePoint): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) > 0.022;
}

/** MediaPipe normalized landmarks: left 23/25/27; right 24/26/28. */
function kneeCandidates(landmarks: PosePoint[], frameAspectRatio: number): KneeCandidate[] {
  if (!Number.isFinite(frameAspectRatio) || frameAspectRatio <= 0) return [];
  const candidates: KneeCandidate[] = [];
  for (const [side, hip, knee, ankle] of [
    ['left', 23, 25, 27],
    ['right', 24, 26, 28],
  ] as const) {
    const a = landmarks[hip];
    const b = landmarks[knee];
    const c = landmarks[ankle];
    if (!a || !b || !c) continue;
    const confidence = Math.min(...[a, b, c].map((p) => p.visibility ?? 1));
    if (confidence < 0.42) continue;
    if (![a, b, c].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) &&
        p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 &&
        (p.presence ?? 1) >= 0.4)) continue;
    if (!validSegment(a, b) || !validSegment(b, c)) continue;
    const angle = jointAngle(a, b, c, frameAspectRatio);
    if (Number.isFinite(angle) && angle >= 45 && angle <= 180) {
      candidates.push({ angle, confidence, side });
    }
  }
  return candidates;
}

/** Use intrinsic videoWidth / videoHeight, not the displayed camera frame.
 * The default preserves callers with square/equal-unit coordinates. */
export function getKneeAngle(landmarks: PosePoint[], frameAspectRatio = 1): number | null {
  const sorted = kneeCandidates(landmarks, frameAspectRatio).sort((a, b) => b.confidence - a.confidence);
  return sorted[0]?.angle ?? null;
}

/** Avoid switching between the two projected knees on every noisy frame. */
export class StableKneeTracker {
  private preferred: KneeSide | null = null;
  reset(): void { this.preferred = null; }

  update(landmarks: PosePoint[], frameAspectRatio = 1): { angle: number | null; side: KneeSide | null } {
    const candidates = kneeCandidates(landmarks, frameAspectRatio);
    const previous = candidates.find((entry) => entry.side === this.preferred);
    const chosen = previous ?? candidates.sort((a, b) => b.confidence - a.confidence)[0];
    if (!chosen) return { angle: null, side: null };
    this.preferred = chosen.side;
    return { angle: chosen.angle, side: chosen.side };
  }
}
