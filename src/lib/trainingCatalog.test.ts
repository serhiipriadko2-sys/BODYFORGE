import { describe, expect, it } from 'vitest';
import { canStartCameraExercise, EXERCISE_GUIDES, exerciseGuide, exerciseCameraLayout, exerciseTargetLabel, isExerciseId } from './trainingCatalog';

describe('exercise catalogue capability boundaries', () => {
  it('offers eight distinct experimental camera exercise paths, including a timed plank', () => {
    expect(EXERCISE_GUIDES).toHaveLength(8);
    expect(new Set(EXERCISE_GUIDES.map((g) => g.id)).size).toBe(8);
    expect(EXERCISE_GUIDES.every((g) => canStartCameraExercise(g.id))).toBe(true);
    expect(EXERCISE_GUIDES.every((g) => g.placement.length === 3 && g.camera.length > 0)).toBe(true);
    expect(EXERCISE_GUIDES.filter((g) => g.recognition === 'camera-experimental')).toHaveLength(7);
    expect(EXERCISE_GUIDES.find((g) => g.id === 'plank')).toMatchObject({ target: 30, unit: 'seconds' });
    expect(EXERCISE_GUIDES.filter((g) => g.id !== 'plank').every((g) => g.target === 20 && g.unit === 'reps')).toBe(true);
  });
  it('has one explicit orientation contract for cameras and guides', () => {
    const landscape = EXERCISE_GUIDES.filter((g) => exerciseCameraLayout(g.id) === 'landscape');
    expect(landscape.map((g) => g.id)).toEqual(['pushup','crunch','leg-raise','plank']);
    expect(EXERCISE_GUIDES.filter((g) => exerciseCameraLayout(g.id) === 'portrait'))
      .toHaveLength(4);
  });
  it('uses grammatically correct labels for every numeric exercise target', () => {
    const expected = [
      'ПРИСЕДАНИЙ', 'ВЫПАДОВ', 'ОТЖИМАНИЙ', 'ПРЫЖКОВ С РАЗВЕДЕНИЕМ',
      'ПОДЪЁМОВ КОЛЕНЕЙ', 'ПОДЪЁМОВ КОРПУСА', 'ПОДЪЁМОВ НОГ', 'СЕКУНД ПЛАНКИ',
    ];
    expect(EXERCISE_GUIDES.map((g) => exerciseTargetLabel(g.id))).toEqual(expected);
  });
  it('never labels new unverified physical camera modes as camera-tested', () => {
    for (const guide of EXERCISE_GUIDES.filter((g) => g.id !== 'squat')) {
      expect(guide.recognition).toBe('camera-experimental');
      expect(guide.coaching).toMatch(/Экспериментал/);
    }
    expect(exerciseGuide('squat').name).toBe('Приседания');
  });
  it('rejects all unknown runtime identifiers, without using display fallback for entitlement', () => {
    const identifiers: unknown[] = ['run', 'future-exercise', '', 'SQUAT', ' squat', null,
      undefined, 0, true, {}, [], ['squat']];
    for (const id of identifiers) {
      expect(isExerciseId(id), String(id)).toBe(false);
      expect(canStartCameraExercise(id), String(id)).toBe(false);
    }
    expect(exerciseGuide('future-exercise' as Parameters<typeof exerciseGuide>[0]).id).toBe('squat');
  });
});
