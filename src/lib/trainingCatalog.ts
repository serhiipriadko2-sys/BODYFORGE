/**
 * What the current BODYFORGE pose recognizer can actually count.
 * Listing an exercise never means its detector is operational.
 * Only "squat" is eligible for saved workout rewards in this release.
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
  /** Camera capture and crediting are enabled only for tested detectors. */
  recognition: 'camera-tested' | 'guide-only';
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
    coaching: 'Медленно присядь, затем выпрямись. Камера засчитывает только полный цикл после калибровки.',
    recognition: 'camera-tested',
  },
  {
    id: 'lunge', name: 'Выпады', focus: 'Ноги и баланс',
    camera: 'Сбоку · вертикальный кадр',
    placement: ['Телефон на устойчивой опоре сбоку.', 'Обе ноги должны полностью попадать в кадр.', 'Держись рядом с опорой, если теряешь равновесие.'],
    coaching: 'Пока доступен только гид: BODYFORGE не считает выпады камерой.',
    recognition: 'guide-only',
  },
  {
    id: 'pushup', name: 'Отжимания', focus: 'Руки и грудь',
    camera: 'Сбоку · телефон невысоко над полом, горизонтальный кадр',
    placement: ['Поставь телефон устойчиво сбоку у пола.', 'В кадре должны быть плечи, бёдра и стопы.', 'Оставь пространство по краям для движений.'],
    coaching: 'Пока доступен только гид: BODYFORGE не считает отжимания камерой.',
    recognition: 'guide-only',
  },
  {
    id: 'jumping-jack', name: 'Прыжки с разведением', focus: 'Кардио',
    camera: 'Спереди · вертикальный кадр',
    placement: ['Поставь телефон вертикально перед собой.', 'В кадре должны оставаться обе руки над головой и обе стопы.', 'Убедись, что вокруг достаточно свободного места.'],
    coaching: 'Пока доступен только гид: BODYFORGE не распознаёт эти прыжки.',
    recognition: 'guide-only',
  },
  {
    id: 'high-knees', name: 'Высокие колени', focus: 'Кардио и координация',
    camera: 'Под углом 45° · вертикальный кадр',
    placement: ['Установи телефон вертикально и устойчиво.', 'В кадре должны оставаться обе ноги и корпус.', 'Держись на расстоянии от мебели.'],
    coaching: 'Пока доступен только гид: BODYFORGE не считает подъёмы колен камерой.',
    recognition: 'guide-only',
  },
  {
    id: 'crunch', name: 'Подъёмы корпуса', focus: 'Пресс',
    camera: 'Сбоку · горизонтальный кадр',
    placement: ['Положи телефон на устойчивую опору сбоку.', 'Плечи, таз и колени должны оставаться в кадре.', 'Подложи коврик и не сгибай шею резко.'],
    coaching: 'Пока доступен только гид: BODYFORGE не считает подъёмы корпуса камерой.',
    recognition: 'guide-only',
  },
  {
    id: 'leg-raise', name: 'Подъёмы ног', focus: 'Пресс и таз',
    camera: 'Сбоку · горизонтальный кадр',
    placement: ['Телефон сбоку на низкой устойчивой опоре.', 'В кадре должны быть таз, колени и стопы.', 'Выбери безопасную амплитуду без боли в пояснице.'],
    coaching: 'Пока доступен только гид: BODYFORGE не считает подъёмы ног камерой.',
    recognition: 'guide-only',
  },
  {
    id: 'plank', name: 'Планка', focus: 'Корпус и выносливость',
    camera: 'Сбоку · горизонтальный кадр',
    placement: ['Поставь телефон сбоку на устойчивую опору.', 'В кадре должны быть плечи, таз и стопы.', 'Не задерживай дыхание и прекрати при боли.'],
    coaching: 'Пока доступен только гид: BODYFORGE не измеряет длительность планки.',
    recognition: 'guide-only',
  },
] as const;

export function exerciseGuide(id: ExerciseId): ExerciseGuide {
  return EXERCISE_GUIDES.find((item) => item.id === id) ?? EXERCISE_GUIDES[0];
}

export function canStartCameraExercise(id: ExerciseId): boolean {
  return exerciseGuide(id).recognition === 'camera-tested';
}
