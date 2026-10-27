import { measureExercise, MIN_JACK_SHOULDER_WIDTH, MIN_JACK_TORSO_HEIGHT } from './exerciseCounter';
import type { PoseGuidance } from './poseGuidance';
import type { PosePoint } from './squatCounter';
import { exerciseGuide, type ExerciseId } from './trainingCatalog';

type MotionId = Exclude<ExerciseId, 'squat'>;
const SIDES = [
  { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
  { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 },
] as const;
const RELEVANT: Record<MotionId, readonly number[]> = {
  lunge: [23, 24, 25, 26, 27, 28],
  pushup: [11, 12, 13, 14, 15, 16, 23, 24, 27, 28],
  'jumping-jack': [11, 12, 15, 16, 23, 24, 27, 28],
  'high-knees': [23, 24, 25, 26, 27, 28],
  crunch: [11, 12, 23, 24, 25, 26, 27, 28],
  'leg-raise': [11, 12, 23, 24, 25, 26, 27, 28],
  plank: [11, 12, 13, 14, 23, 24, 27, 28],
};

function visible(point: PosePoint | undefined): point is PosePoint {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0.01 && point.x <= 0.99 && point.y >= 0.01 && point.y <= 0.99 &&
    Number.isFinite(point.visibility ?? 1) && (point.visibility ?? 1) >= .5 &&
    Number.isFinite(point.presence ?? 1) && (point.presence ?? 1) >= .45;
}

const hint = (
  kind: PoseGuidance['kind'], title: string, instruction: string,
  warning = true,
): PoseGuidance => ({ kind, title, instruction, warning });

const missing = (points: PosePoint[], ...joints: number[]) =>
  joints.some((index) => !visible(points[index]));

function requiredSide(id: MotionId, side: typeof SIDES[number]): readonly number[] {
  if (id === 'pushup') return [side.shoulder, side.elbow, side.wrist, side.hip, side.ankle];
  if (id === 'plank') return [side.shoulder, side.elbow, side.hip, side.ankle];
  return [side.shoulder, side.hip, side.knee, side.ankle]; // crunch / leg raises
}

/**
 * Feedback only: never influences counting, rewards or camera permissions.
 * Use exactly the joint groups the motion prototypes need. Video is not saved.
 */
export function assessExerciseFraming(
  id: MotionId, points: PosePoint[] | undefined, ratio = 1,
): PoseGuidance {
  const guide = exerciseGuide(id);
  if (!points?.length || ![11, 12, 23, 24].some((i) => visible(points[i]))) {
    return hint('no-person', 'НЕ ВИЖУ ТЕЛО',
      'Расположись перед камерой. ' + guide.placement[1]);
  }
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 5) {
    return hint('angle-unavailable', 'НЕТ РАЗМЕРОВ КАДРА',
      'Камера ещё настраивается. Не начинай движение до появления суставов.');
  }

  if (id === 'lunge') {
    if (missing(points, 25, 26)) return hint('knees-hidden', 'НЕ ВИЖУ ОБА КОЛЕНА', guide.placement[1]);
    if (missing(points, 27, 28)) return hint('feet-hidden', 'НЕ ВИЖУ ОБЕ СТОПЫ', guide.placement[1]);
    if (missing(points, 23, 24)) return hint('angle-unavailable', 'НЕ ВИЖУ ТАЗ', guide.placement[1]);
  } else if (id === 'high-knees') {
    if (missing(points, 25, 26)) return hint('knees-hidden', 'НЕ ВИЖУ ОБА КОЛЕНА', guide.placement[1]);
    if (missing(points, 27, 28)) return hint('feet-hidden', 'НЕ ВИЖУ ОБЕ СТОПЫ', guide.placement[1]);
    if (missing(points, 23, 24)) return hint('angle-unavailable', 'НЕ ВИЖУ ТАЗ', guide.placement[1]);
  } else if (id === 'jumping-jack') {
    if (missing(points, 15, 16)) return hint('angle-unavailable', 'НЕ ВИЖУ ОБЕ КИСТИ', guide.placement[1]);
    if (missing(points, 27, 28)) return hint('feet-hidden', 'НЕ ВИЖУ ОБЕ СТОПЫ', guide.placement[1]);
    if (missing(points, 11, 12, 23, 24))
      return hint('angle-unavailable', 'НЕ ВИЖУ ПЛЕЧИ И ТАЗ', guide.placement[1]);
    const shoulderWidth = Math.abs(points[11].x - points[12].x) * ratio;
    const torsoHeight = ((points[23].y + points[24].y) - (points[11].y + points[12].y)) / 2;
    if (shoulderWidth < MIN_JACK_SHOULDER_WIDTH || torsoHeight < MIN_JACK_TORSO_HEIGHT) {
      return hint('angle-unavailable', 'ПОДОЙДИ БЛИЖЕ К КАМЕРЕ',
        'Фигура слишком мала для надёжного подсчёта. Подойди ближе, оставляя кисти и стопы целиком в кадре.');
    }
  } else {
    const completeSide = SIDES.find((side) => requiredSide(id, side).every((i) => visible(points[i])));
    if (!completeSide) {
      if (id === 'pushup' && !SIDES.some((s) => visible(points[s.elbow]) && visible(points[s.wrist])))
        return hint('angle-unavailable', 'НЕ ВИЖУ ЛОКОТЬ И КИСТЬ', guide.placement[1]);
      if (id === 'plank' && !SIDES.some((s) => visible(points[s.elbow])))
        return hint('angle-unavailable', 'НЕ ВИЖУ ОПОРНЫЙ ЛОКОТЬ', guide.placement[1]);
      if (!SIDES.some((s) => visible(points[s.ankle])))
        return hint('feet-hidden', 'НЕ ВИЖУ СТОПЫ', guide.placement[1]);
      return hint('angle-unavailable', 'НЕ ВИЖУ ВСЕ НУЖНЫЕ СУСТАВЫ', guide.placement[1]);
    }
  }

  const relevant = RELEVANT[id].filter((index) => visible(points[index]));
  if (relevant.some((index) => {
    const p = points[index];
    return p.x < .035 || p.x > .965 || p.y < .035 || p.y > .965;
  })) {
    return hint('too-close', 'СУСТАВЫ У КРАЯ КАДРА',
      'Отодвинь телефон или включи отображение всего кадра, чтобы руки и ноги не обрезались.');
  }

  const reading = measureExercise(id, points, ratio);
  if (!reading) {
    return hint('angle-unavailable',
      id === 'pushup' || id === 'crunch' || id === 'leg-raise' ? 'ПОВЕРНИ ТЕЛЕФОН СБОКУ' : 'НЕ ОПРЕДЕЛЯЕТСЯ ДВИЖЕНИЕ',
      guide.placement[1]);
  }
  if (id === 'plank' && !reading.ready) {
    return hint('angle-unavailable', 'ВЫРОВНЯЙ ПОЛОЖЕНИЕ КОРПУСА',
      'Держи плечо, таз и стопу примерно на одной линии, чтобы таймер начал отсчёт.');
  }
  return hint('tracked', 'НУЖНЫЕ СУСТАВЫ В КАДРЕ',
    guide.coaching, false);
}

/** Debounce advisory messages only; raw landmarks still reach the counter unchanged. */
export class ExerciseFramingTracker {
  private id: MotionId | null = null;
  private current: PoseGuidance = hint('no-person', 'НЕ ВИЖУ ТЕЛО', 'Расположись перед камерой.');
  private pending: PoseGuidance | null = null;
  private pendingAt: number | null = null;
  private previousTime = Number.NEGATIVE_INFINITY;

  reset(id?: MotionId): PoseGuidance {
    this.id = id ?? null;
    this.current = id ? assessExerciseFraming(id, undefined) :
      hint('no-person', 'НЕ ВИЖУ ТЕЛО', 'Расположись перед камерой.');
    this.pending = null;
    this.pendingAt = null;
    this.previousTime = Number.NEGATIVE_INFINITY;
    return this.current;
  }

  update(id: MotionId, points: PosePoint[] | undefined, time: number, ratio = 1): PoseGuidance {
    if (id !== this.id) this.reset(id);
    if (!Number.isFinite(time) || time <= this.previousTime) return this.current;
    this.previousTime = time;
    const next = assessExerciseFraming(id, points, ratio);
    const same = (a: PoseGuidance, b: PoseGuidance) => a.kind === b.kind && a.title === b.title;
    if (same(next, this.current)) {
      // Preserve object identity for stable hints: React can skip a needless
      // camera-HUD re-render on each accepted video frame.
      if (next.instruction !== this.current.instruction || next.warning !== this.current.warning)
        this.current = next;
      this.pending = null;
      this.pendingAt = null;
    } else if (!this.pending || !same(this.pending, next)) {
      this.pending = next;
      this.pendingAt = time;
    } else if (this.pendingAt !== null && time - this.pendingAt >= 320) {
      this.current = next;
      this.pending = null;
      this.pendingAt = null;
    }
    return this.current;
  }
}
