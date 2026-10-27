/**
 * Each exercise has a real 2-D landmark prototype in exerciseCounter.ts.
 * A working algorithm is NOT proof of accuracy on different humans or cameras.
 * Squats retain their separately validated adaptive counter; new modes are experimental.
 */
export type ExerciseId =
  | 'squat' | 'lunge' | 'pushup' | 'jumping-jack'
  | 'high-knees' | 'crunch' | 'leg-raise' | 'plank';

export interface ExerciseGuide {
  id: ExerciseId;
  name: string;
  focus: string;
  camera: string;
  placement: readonly string[];
  coaching: string;
  recognition: 'camera-tested' | 'camera-experimental';
  target: number;
  unit: 'reps' | 'seconds';
}

export const EXERCISE_GUIDES: readonly ExerciseGuide[] = [
  {
    id: 'squat', name: 'Приседания', focus: 'Ноги и корпус',
    camera: 'Сбоку или под углом около 45° · вертикальный кадр',
    placement: [
      'Поставь телефон вертикально на устойчивую опору. Не держи его в руке.',
      'Встань боком или под углом около 45°. Камера должна видеть плечо, таз, колено и стопу одной ноги.',
      'Отойди так, чтобы тело от головы до стоп оставалось в кадре при приседании. Начни стоя прямо.',
    ],
    coaching: 'Полный присед: калибровка стойки, заметное сгибание и полное выпрямление.',
    recognition: 'camera-tested', target: 20, unit: 'reps',
  },
  {
    id: 'lunge', name: 'Выпады', focus: 'Ноги и баланс',
    camera: 'Сбоку или под углом · вертикальный кадр',
    placement: ['Телефон на устойчивой опоре немного сбоку.', 'Обе ноги должны полностью попадать в кадр.', 'Сначала выпрями обе ноги; после каждого выпада возвращайся в стойку.'],
    coaching: 'Экспериментальный подсчёт по коленям: сгибание одной ноги и возврат обеих ног в стойку. Требуется видимость обеих ног.',
    recognition: 'camera-experimental', target: 20, unit: 'reps',
  },
  {
    id: 'pushup', name: 'Отжимания', focus: 'Руки и грудь',
    camera: 'Сбоку · телефон невысоко над полом, горизонтальный кадр',
    placement: ['Поставь телефон устойчиво сбоку у пола.', 'В кадре должны быть плечо, локоть, кисть, таз и стопа.', 'Начни с прямых рук и ровного корпуса, затем сгибай локти.'],
    coaching: 'Экспериментальный подсчёт по углу локтя при горизонтальном положении тела.',
    recognition: 'camera-experimental', target: 20, unit: 'reps',
  },
  {
    id: 'jumping-jack', name: 'Прыжки с разведением', focus: 'Кардио',
    camera: 'Спереди · вертикальный кадр',
    placement: ['Поставь телефон вертикально перед собой.', 'Обе руки над головой и стопы должны оставаться в кадре.', 'Сначала ноги вместе и руки вниз; затем ноги в стороны и руки вверх.'],
    coaching: 'Экспериментальный подсчёт только при одновременном разведении ног и подъёме обеих рук.',
    recognition: 'camera-experimental', target: 20, unit: 'reps',
  },
  {
    id: 'high-knees', name: 'Высокие колени', focus: 'Кардио и координация',
    camera: 'Спереди или под углом 45° · вертикальный кадр',
    placement: ['Установи телефон вертикально и устойчиво.', 'В кадре должны оставаться таз, обе ноги и стопы.', 'Чередуй ноги, поднимая колено к уровню таза и опуская обратно.'],
    coaching: 'Экспериментальный подсчёт только попеременных полных подъёмов колена.',
    recognition: 'camera-experimental', target: 20, unit: 'reps',
  },
  {
    id: 'crunch', name: 'Подъёмы корпуса', focus: 'Пресс',
    camera: 'Сбоку · горизонтальный кадр',
    placement: ['Положи телефон на устойчивую опору сбоку.', 'Плечо, таз, колено и стопа одной стороны должны быть в кадре.', 'Ляг на спину, согни колени; приподними плечи и опусти обратно.'],
    coaching: 'Экспериментальный подсчёт по сгибанию корпуса при согнутых коленях; без оценки безопасности техники.',
    recognition: 'camera-experimental', target: 20, unit: 'reps',
  },
  {
    id: 'leg-raise', name: 'Подъёмы ног', focus: 'Пресс и таз',
    camera: 'Сбоку · горизонтальный кадр',
    placement: ['Телефон сбоку на низкой устойчивой опоре.', 'В кадре должны быть плечо, таз, колено и стопа.', 'Ляг, вытяни ноги; подними их и медленно опусти.'],
    coaching: 'Экспериментальный подсчёт по углу в тазу при выпрямленных коленях.',
    recognition: 'camera-experimental', target: 20, unit: 'reps',
  },
  {
    id: 'plank', name: 'Планка', focus: 'Корпус и выносливость',
    camera: 'Сбоку · горизонтальный кадр',
    placement: ['Поставь телефон сбоку на устойчивую опору.', 'Плечо, локоть, таз и стопа должны быть видны.', 'Держи линию плечо — таз — стопы без сильного прогиба.'],
    coaching: 'Экспериментальное удержание 30 секунд; при потере позы таймер удержания сбрасывается.',
    recognition: 'camera-experimental', target: 30, unit: 'seconds',
  },
];

export function exerciseGuide(id: ExerciseId): ExerciseGuide {
  return EXERCISE_GUIDES.find((item) => item.id === id) ?? EXERCISE_GUIDES[0];
}

export function isExerciseId(value: unknown): value is ExerciseId {
  return typeof value === 'string' && EXERCISE_GUIDES.some((guide) => guide.id === value);
}

/** User-facing genitive form: «20 приседаний», not «20 приседания». */
export function exerciseTargetLabel(id: ExerciseId): string {
  const labels: Record<ExerciseId, string> = {
    squat: 'ПРИСЕДАНИЙ',
    lunge: 'ВЫПАДОВ',
    pushup: 'ОТЖИМАНИЙ',
    'jumping-jack': 'ПРЫЖКОВ С РАЗВЕДЕНИЕМ',
    'high-knees': 'ПОДЪЁМОВ КОЛЕНЕЙ',
    crunch: 'ПОДЪЁМОВ КОРПУСА',
    'leg-raise': 'ПОДЪЁМОВ НОГ',
    plank: 'СЕКУНД ПЛАНКИ',
  };
  return labels[id];
}

/** Stable camera layout contract; do not infer capability from translated guide text. */
const LANDSCAPE_EXERCISES: ReadonlySet<ExerciseId> = new Set([
  'pushup', 'crunch', 'leg-raise', 'plank',
]);
export function exerciseCameraLayout(id: ExerciseId): 'portrait' | 'landscape' {
  return LANDSCAPE_EXERCISES.has(id) ? 'landscape' : 'portrait';
}

export function canStartCameraExercise(id: unknown): boolean {
  return isExerciseId(id);
}
