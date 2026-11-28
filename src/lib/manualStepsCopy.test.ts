import { describe, expect, it } from 'vitest';
import { manualStepsCopy, type ManualStepsPrompt } from './manualStepsCopy';

describe('manual steps localization', () => {
  it('uses English for English browsers and Russian as the fallback', () => {
    expect(manualStepsCopy('en-GB').language).toBe('en');
    expect(manualStepsCopy('en').language).toBe('en');
    expect(manualStepsCopy('ru-RU').language).toBe('ru');
    expect(manualStepsCopy('fr-FR').language).toBe('ru');
    expect(manualStepsCopy().language).toBe('ru');
  });

  it.each([
    [0, '0 шагов', '0 steps'],
    [1, '1 шаг', '1 step'],
    [2, '2 шага', '2 steps'],
    [5, '5 шагов', '5 steps'],
    [11, '11 шагов', '11 steps'],
    [14, '14 шагов', '14 steps'],
    [21, '21 шаг', '21 steps'],
    [24, '24 шага', '24 steps'],
    [100_000, '100 000 шагов', '100,000 steps'],
  ])('formats %i with a localized count and unit', (count, ru, en) => {
    expect(manualStepsCopy('ru').count(count)).toBe(ru);
    expect(manualStepsCopy('en').count(count)).toBe(en);
  });

  it('formats the saved calendar date in both languages, including a leap day', () => {
    const date = '2028-02-29';
    expect(manualStepsCopy('ru').dateConflict(date)).toContain('29 февраля 2028');
    expect(manualStepsCopy('en').dateConflict(date)).toContain('February 29, 2028');
  });

  it('renders all feedback keys and the localized input limit', () => {
    const ru = manualStepsCopy('ru');
    const en = manualStepsCopy('en');
    const prompts: ManualStepsPrompt[] = ['otherTabDraft', 'otherTabUpdated', 'draftDayChanged',
      'dateRestored', 'staleDraft', 'invalidCount', 'saveConflict', 'writeFailed', 'saved'];
    for (const key of prompts) {
      expect(ru.prompt(key)).toMatch(/[а-я]/i);
      expect(en.prompt(key)).toMatch(/^[A-Z]/);
    }
    expect(ru.prompt('invalidCount')).toContain('100 000');
    expect(en.prompt('invalidCount')).toContain('100,000');
  });
});
