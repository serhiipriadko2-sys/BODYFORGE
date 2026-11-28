import { MAX_MANUAL_STEPS } from './stepsLog';

type StepsLanguage = 'ru' | 'en';

const locales = { ru: 'ru-RU', en: 'en-US' } as const;

const copy = {
  ru: {
    section: 'Шаги и синхронизация',
    today: 'Шаги сегодня',
    session: 'За сеанс',
    sensor: 'Датчик телефона',
    options: 'Настройки шагов',
    source: 'Веб · нет синхронизации',
    privacy: 'Автосчёт доступен в Android-приложении. Ручная запись хранится только в браузере и не даёт наград.',
    manualToday: 'Ручная запись за сегодня',
    save: 'ЗАПИСАТЬ',
    otherTabDraft: 'Запись изменилась в другой вкладке. Твой ввод не заменён. Нажми «Записать», только если хочешь заменить текущее значение.',
    otherTabUpdated: 'Запись обновлена из другой вкладки.',
    draftDayChanged: 'Местная дата изменилась. Несохранённый ввод за другой день не перенесён в сегодняшний счётчик.',
    dateRestored: 'Дата проверена. Запись шагов снова доступна.',
    staleDraft: 'Местная дата изменилась. Запись за другой день не сохранена. Проверь дату и введи число заново для текущего дня.',
    invalidCount: (limit: string) => `Введи целое количество от 0 до ${limit}.`,
    saveConflict: 'Сохранена запись с более поздней датой. Проверь дату и часовой пояс устройства. Существующее число не заменено.',
    writeFailed: 'Запись не сохранилась. Проверь память браузера.',
    saved: 'Ручная запись обновлена только в этом браузере.',
    dateConflict: (date: string) => `Сохранена запись за ${date}, позже местной даты устройства. Она не удалена. Проверь дату и часовой пояс. Запись шагов временно недоступна.`,
    invalidRecord: 'Предыдущая запись повреждена. Только явное сохранение заменит её.',
    readFailed: 'Память браузера недоступна. Шаги могут не сохраниться.',
  },
  en: {
    section: 'Steps and sync',
    today: 'Steps today',
    session: 'This session',
    sensor: 'Phone sensor',
    options: 'Step settings',
    source: 'Web · no sync',
    privacy: 'Automatic counting is available in the Android app. Manual entries are stored in this browser and earn no rewards.',
    manualToday: 'Manual entry for today',
    save: 'SAVE',
    otherTabDraft: 'Another tab changed the entry. Your draft is still here. Select Save to replace the current entry.',
    otherTabUpdated: 'The entry was updated from another tab.',
    draftDayChanged: 'The local date changed. The unsaved draft from another day was cleared.',
    dateRestored: 'The date was verified. You can log steps again.',
    staleDraft: 'The local date changed. Your draft was not saved. Check the date and enter a new count for today.',
    invalidCount: (limit: string) => `Enter a whole number from 0 to ${limit}.`,
    saveConflict: 'A later entry is already saved. Check the date and time zone on your device. The existing entry was kept.',
    writeFailed: 'The entry could not be saved. Check browser storage.',
    saved: 'Manual entry saved in this browser.',
    dateConflict: (date: string) => `The entry for ${date} is later than your device’s local date. It was kept. Check the date and time zone to resume logging steps.`,
    invalidRecord: 'The previous entry is damaged. It will be replaced only when you save.',
    readFailed: 'Browser storage is unavailable. Your changes may not be saved.',
  },
};

export type ManualStepsPrompt = 'otherTabDraft' | 'otherTabUpdated' | 'draftDayChanged' | 'dateRestored' |
  'staleDraft' | 'invalidCount' | 'saveConflict' | 'writeFailed' | 'saved';

const stepUnits: Record<StepsLanguage, Record<Intl.LDMLPluralRule, string>> = {
  ru: { zero: 'шагов', one: 'шаг', two: 'шага', few: 'шага', many: 'шагов', other: 'шага' },
  en: { zero: 'steps', one: 'step', two: 'steps', few: 'steps', many: 'steps', other: 'steps' },
};

export function manualStepsCopy(browserLanguage = 'ru') {
  const language: StepsLanguage = /^en(?:-|$)/i.test(browserLanguage) ? 'en' : 'ru';
  const text = copy[language];
  const locale = locales[language];
  const number = new Intl.NumberFormat(locale);
  const plural = new Intl.PluralRules(locale);
  // The stored key represents a calendar date. Keep the date stable across time zones.
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' });
  return {
    ...text,
    language,
    count: (steps: number) => `${number.format(steps)} ${stepUnits[language][plural.select(steps)]}`,
    prompt: (key: ManualStepsPrompt) => key === 'invalidCount' ? text.invalidCount(number.format(MAX_MANUAL_STEPS)) : text[key],
    dateConflict: (day: string) => text.dateConflict(date.format(new Date(`${day}T12:00:00Z`))),
  };
}
