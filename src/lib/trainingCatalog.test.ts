import { describe, expect, it } from 'vitest';
import { canStartCameraExercise, EXERCISE_GUIDES, exerciseGuide } from './trainingCatalog';

describe('exercise capability truth', () => {
  it('supports camera counting only for tested squats', () => {
    expect(EXERCISE_GUIDES).toHaveLength(8);
    expect(EXERCISE_GUIDES.map((g) => g.id).length)
      .toBe(new Set(EXERCISE_GUIDES.map((g) => g.id)).size);
    expect(EXERCISE_GUIDES.filter((g) => canStartCameraExercise(g.id)).map((g) => g.id)).toEqual(['squat']);
    expect(EXERCISE_GUIDES.every((g) => g.placement.length === 3 && g.camera.length > 0)).toBe(true);
  });
  it('does not report unsupported guides as implemented detectors', () => {
    for (const guide of EXERCISE_GUIDES.filter((g) => g.id !== 'squat')) {
      expect(guide.recognition).toBe('guide-only');
      expect(guide.coaching).toMatch(/не считает|не распознаёт|не измеряет/);
    }
    expect(exerciseGuide('squat').name).toBe('Приседания');
  });
});
