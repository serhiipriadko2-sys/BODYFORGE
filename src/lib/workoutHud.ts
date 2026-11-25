import { exerciseGuide, type ExerciseId } from './trainingCatalog';
import type { CounterSnapshot, KneeSide } from './squatCounter';
import type { PoseGuidance, PoseGuidanceKind } from './poseGuidance';
import type { CompletionPhase } from './completionPersistence';

type HudState = 'stalled' | 'lost' | 'prepare' | 'calibrate' | 'ready' | 'move' | 'return' | 'hold';
interface Coach { kind: PoseGuidanceKind | 'camera-stalled' | 'pose-unconfirmed'; title: string; instruction: string }
export interface WorkoutHud {
  state: HudState;
  title: string;
  target: string;
  instruction: string;
  focus: string;
  showMetric: boolean;
  calibrationRemainingMs: number | null;
  coach: Coach | null;
}
const cues: Record<ExerciseId, { motion: string; finish: string; focus: string }> = {
  squat: { motion: 'Сгибай колени.', finish: 'Встань прямо.', focus: 'НОГА В КАДРЕ' },
  lunge: { motion: 'Выполни выпад.', finish: 'Вернись в стойку.', focus: 'ОБЕ НОГИ' },
  pushup: { motion: 'Сгибай локти.', finish: 'Выпрями руки.', focus: 'РУКИ, ТАЗ И СТОПА' },
  'jumping-jack': { motion: 'Ноги врозь, руки вверх.', finish: 'Ноги вместе, руки вниз.', focus: 'РУКИ И НОГИ' },
  'high-knees': { motion: 'Подними колено.', finish: 'Опусти ноги и смени сторону.', focus: 'ОБЕ НОГИ' },
  crunch: { motion: 'Подними плечи.', finish: 'Опусти плечи.', focus: 'ПЛЕЧО, ТАЗ И КОЛЕНО' },
  'leg-raise': { motion: 'Подними ноги.', finish: 'Опусти ноги.', focus: 'ТАЗ, КОЛЕНО И СТОПА' },
  plank: { motion: 'Удерживай позу.', finish: 'Удерживай позу.', focus: 'ПЛЕЧО, ЛОКОТЬ, ТАЗ И СТОПА' },
};

/** Presentation only: no timers, transitions, reward writes or recognition thresholds. */
export function deriveWorkoutHud(
  id: ExerciseId, snapshot: CounterSnapshot, guidance: PoseGuidance,
  poseFound: boolean, frameStalled: boolean, side: KneeSide | null,
): WorkoutHud {
  const guide = exerciseGuide(id), cue = cues[id];
  const focus = id === 'squat' || id === 'lunge'
    ? side === 'left' ? 'ЛЕВАЯ НОГА' : side === 'right' ? 'ПРАВАЯ НОГА' : cue.focus
    : cue.focus;
  const observed = poseFound && snapshot.angle !== null && Number.isFinite(snapshot.angle);
  const base = { focus, showMetric: observed, calibrationRemainingMs: null, coach: null };
  if (frameStalled) {
    const coach: Coach = { kind: 'camera-stalled', title: 'КАДР КАМЕРЫ ЗАВИС',
      instruction: 'Новые изображения не поступают. Дождись восстановления потока или останови тренировку. Это не оценка твоей позы.' };
    return { ...base, state: 'stalled', title: 'ПОТОК ПРИОСТАНОВЛЕН', target: 'ДОЖДИСЬ КАДРА', instruction: coach.instruction, showMetric: false, coach };
  }
  if (!observed) {
    // Debounced advice is not proof that a current observation was accepted.
    const specific = poseFound && guidance.warning && guidance.kind !== 'tracked' && guidance.kind !== 'no-person';
    const coach: Coach = !poseFound
      ? { kind: 'no-person', title: 'НЕ ВИЖУ ТЕЛО', instruction: guide.placement[1] }
      : specific
        ? { kind: guidance.kind, title: guidance.title, instruction: guidance.instruction }
        : { kind: 'pose-unconfirmed', title: 'ПОЗА НЕ ПОДТВЕРЖДЕНА', instruction: guide.placement[1] + ' Вернись в исходное положение.' };
    return { ...base, state: 'lost',
      title: id === 'plank' && snapshot.calibrated ? 'ОТСЧЁТ ПРИОСТАНОВЛЕН' : 'ПОЗА НЕ ПОДТВЕРЖДЕНА',
      target: 'ПОПРАВЬ КАДР', instruction: coach.instruction, showMetric: false, coach };
  }
  if (!snapshot.calibrated || snapshot.phase === 'calibrate') {
    const remaining = snapshot.calibrationRemainingMs;
    if (typeof remaining === 'number' && Number.isFinite(remaining) && remaining > 0) {
      return { ...base, state: 'calibrate', title: 'КАЛИБРОВКА', target: 'УДЕРЖИВАЙ ПОЗУ',
        instruction: 'Удерживай исходное положение до подтверждения.', calibrationRemainingMs: remaining };
    }
    return { ...base, state: 'prepare', title: 'ИСХОДНАЯ ПОЗА', target: 'ПОДГОТОВЬСЯ', instruction: guide.placement[2] };
  }
  const coach: Coach | null = id === 'squat' && guidance.warning && guidance.kind === 'too-close'
    ? { kind: guidance.kind, title: guidance.title, instruction: guidance.instruction } : null;
  if (id === 'plank') {
    return { ...base, state: 'hold', title: 'УДЕРЖИВАЙ ПЛАНКУ', target: 'ДЕРЖИ ПОЛОЖЕНИЕ',
      instruction: 'Время идёт по подтверждённым наблюдениям.', coach };
  }
  if (snapshot.phase === 'bottom') {
    return { ...base, state: 'return', title: 'ВЕРНИСЬ В НАЧАЛО',
      target: id === 'squat' && snapshot.returnTarget !== null ? 'ВСТАТЬ ≥ ' + snapshot.returnTarget + '°' : 'ПОЛНЫЙ ВОЗВРАТ',
      instruction: cue.finish, coach };
  }
  if (snapshot.phase === 'descending') {
    return { ...base, state: 'move', title: 'ДВИЖЕНИЕ',
      target: id === 'squat' && snapshot.depthTarget !== null ? 'ПРИСЕСТЬ ≤ ' + snapshot.depthTarget + '°' : 'ЗАВЕРШИ ДВИЖЕНИЕ',
      instruction: cue.motion, coach };
  }
  return { ...base, state: 'ready', title: 'ГОТОВ К ДВИЖЕНИЮ',
    target: id === 'squat' && snapshot.depthTarget !== null ? 'ПРИСЕСТЬ ≤ ' + snapshot.depthTarget + '°' : 'НАЧНИ ДВИЖЕНИЕ',
    instruction: snapshot.counted ? 'Засчитано! ' + cue.motion : cue.motion, coach };
}

export interface CompletionHud { title: string; status: string; feedback: string; showReward: boolean }
export function deriveCompletionHud(phase: CompletionPhase, id: ExerciseId): CompletionHud {
  const title = 'УПРАЖНЕНИЕ ЗАВЕРШЕНО';
  switch (phase) {
    case 'credited': return { title: 'ЗАКАЛКА ЗАВЕРШЕНА!',
      status: exerciseGuide(id).unit === 'seconds' ? '30 СЕКУНД УДЕРЖАНИЯ' : '20 ЗАСЧИТАННЫХ ПОВТОРЕНИЙ',
      feedback: 'Всё засчитано. Герой стал сильнее!', showReward: true };
    case 'saving-result': return { title, status: 'СОХРАНЯЕМ РЕЗУЛЬТАТ, НЕ ЗАКРЫВАЙ ПРИЛОЖЕНИЕ',
      feedback: 'Цель достигнута. Дождись сохранения результата.', showReward: false };
    case 'durable-pending': return { title, status: 'РЕЗУЛЬТАТ СОХРАНЁН. ОЖИДАЕМ НАЧИСЛЕНИЯ НАГРАДЫ',
      feedback: 'Результат сохранён. Награда ещё не подтверждена.', showReward: false };
    case 'quarantined': return { title, status: 'РЕЗУЛЬТАТ ОТЛОЖЕН. НАГРАДА НЕ НАЧИСЛЕНА',
      feedback: 'Результат требует проверки. Награда не начислена.', showReward: false };
    case 'idle': return { title, status: 'ПРОВЕРЯЕМ СОХРАНЕНИЕ. НАГРАДА ЕЩЁ НЕ ПОДТВЕРЖДЕНА',
      feedback: 'Цель достигнута. Проверяем сохранение.', showReward: false };
  }
}
