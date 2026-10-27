import { STORAGE_KEY } from './progression';
import { RESULT_JOURNAL_PREFIX, RESULT_QUARANTINE_PREFIX } from './workoutJournal';

/** Read-only inspection. This is NOT a signature check, save import, or proof
 * that a user actually earned rewards. Files are never sent over the network.
 */
export const MAX_PROGRESS_BACKUP_BYTES = 16 * 1024 * 1024;
export type BackupInspectionState = 'readable' | 'incomplete' | 'invalid';
export interface BackupInspection {
  state: BackupInspectionState;
  message: string;
  exportedAt: string | null;
  workouts: number;
  durableRecords: number;
  journalRecords: number;
  quarantineRecords: number;
}

const AUXILIARY_KEYS = ['avatarLook', 'appearance', 'manualSteps', 'dailyPlan'] as const;
const STATUSES = ['ready', 'unavailable'] as const;
type ObjectRecord = Record<string, unknown>;
const record = (value: unknown): value is ObjectRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStatus = (value: unknown): value is typeof STATUSES[number] =>
  value === 'ready' || value === 'unavailable';

function invalid(message: string): BackupInspection {
  return { state: 'invalid', message, exportedAt: null, workouts: 0,
    durableRecords: 0, journalRecords: 0, quarantineRecords: 0 };
}

function rawRecords(value: unknown, prefix: string): value is Array<{ key: string; raw: string }> {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  return value.every((item) => {
    if (!record(item) || typeof item.key !== 'string' ||
        !item.key.startsWith(prefix) || item.key.length <= prefix.length ||
        typeof item.raw !== 'string' || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

function durableRecords(value: unknown): value is Array<{ key: string; raw: string }> {
  if (!rawRecords(value, RESULT_JOURNAL_PREFIX)) return false;
  return (value as unknown[]).every((item) => record(item) &&
    (item.baseProfileRaw === null || typeof item.baseProfileRaw === 'string') &&
    (item.state === 'active' || item.state === 'settled' || item.state === 'quarantined'));
}

function parseProfileForInspection(raw: string): { workouts: number; ambiguousRewards: boolean } | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || !Number.isFinite(value.xp) || typeof value.xp !== 'number' || value.xp < 0 ||
        !Number.isFinite(value.coins) || typeof value.coins !== 'number' || value.coins < 0 ||
        !Array.isArray(value.workouts)) return null;
    // Unknown future schemas are preserved in the exported raw string; the
    // inspector does not parse them as an authorization to replay rewards.
    const ledger = value.creditedWorkoutIds;
    const ambiguousRewards = 'creditedWorkoutIds' in value &&
      (!Array.isArray(ledger) || !ledger.every((id: unknown) =>
        typeof id === 'string' && id.trim().length > 0 && id.length <= 128));
    return { workouts: value.workouts.length, ambiguousRewards };
  } catch { return null; }
}

/** Inspect only exact BODYFORGE manual-backup v1 evidence and its read statuses.
 * No storage APIs, network calls, or normalization of raw data are used here.
 */
export function inspectProgressBackupJson(json: string): BackupInspection {
  if (json.length > MAX_PROGRESS_BACKUP_BYTES) {
    return invalid('Файл слишком большой для локальной проверки (максимум 16 МБ).');
  }
  let decoded: unknown;
  try { decoded = JSON.parse(json); } catch {
    return invalid('Файл не является корректным JSON. Не очищай данные браузера.');
  }
  if (!record(decoded) || decoded.exportFormat !== 'bodyforge-manual-backup' ||
      decoded.exportSchemaVersion !== 1) {
    return invalid('Неподдерживаемый формат или версия резервной копии BODYFORGE.');
  }
  const date = decoded.exportedAt;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(date) ||
      !Number.isFinite(Date.parse(date)) || typeof decoded.complete !== 'boolean') {
    return invalid('В файле отсутствует корректная дата или признак полноты экспорта.');
  }
  const statusFields = ['storageReadStatus', 'journalReadStatus', 'quarantineReadStatus',
    'profileQuarantineReadStatus', 'durableReadStatus'] as const;
  const auxiliaryReadStatus = decoded.auxiliaryReadStatus;
  if (!statusFields.every((key) => isStatus(decoded[key])) ||
      !record(auxiliaryReadStatus) ||
      !AUXILIARY_KEYS.every((key) => isStatus(auxiliaryReadStatus[key]))) {
    return invalid('Отсутствуют сведения о доступности хранилищ. Полноту файла проверить нельзя.');
  }
  const storedAuxiliaryRaw = decoded.storedAuxiliaryRaw;
  if (!record(storedAuxiliaryRaw) ||
      !AUXILIARY_KEYS.every((key) =>
        storedAuxiliaryRaw[key] === null || typeof storedAuxiliaryRaw[key] === 'string') ||
      (decoded.storedProfileRaw !== null && typeof decoded.storedProfileRaw !== 'string') ||
      (decoded.storedBackupRaw !== null && typeof decoded.storedBackupRaw !== 'string')) {
    return invalid('Некорректные поля локальных сохранений в JSON.');
  }
  if (!rawRecords(decoded.pendingResultOriginals, RESULT_JOURNAL_PREFIX) ||
      !rawRecords(decoded.quarantinedResults, RESULT_QUARANTINE_PREFIX) ||
      !rawRecords(decoded.storedProfileQuarantineRaw, `${STORAGE_KEY}:quarantine:`) ||
      !durableRecords(decoded.durableResults)) {
    return invalid('Нарушена структура журнала или карантина сохранений.');
  }
  if (decoded.sourcesChangedDuringRead !== undefined &&
      typeof decoded.sourcesChangedDuringRead !== 'boolean') {
    return invalid('Некорректная отметка согласованности данных.');
  }
  const profile = typeof decoded.storedProfileRaw === 'string'
    ? parseProfileForInspection(decoded.storedProfileRaw) : null;
  const completeSources = decoded.storedProfileRaw !== null &&
    statusFields.every((key) => decoded[key] === 'ready') &&
    AUXILIARY_KEYS.every((key) => auxiliaryReadStatus[key] === 'ready');
  const isComplete = decoded.complete && completeSources && profile !== null &&
    !profile.ambiguousRewards && decoded.sourcesChangedDuringRead !== true;

  const summary = {
    exportedAt: date,
    workouts: profile?.workouts ?? 0,
    durableRecords: decoded.durableResults.length,
    journalRecords: decoded.pendingResultOriginals.length,
    quarantineRecords: decoded.quarantinedResults.length + decoded.storedProfileQuarantineRaw.length,
  };
  if (!isComplete) {
    const reason = decoded.sourcesChangedDuringRead === true
      ? 'Данные изменялись во время экспорта.'
      : profile === null ? 'Основной профиль отсутствует или повреждён.'
      : profile.ambiguousRewards ? 'Журнал защиты наград требует восстановления.'
      : 'Часть хранилищ была недоступна или экспорт отмечен неполным.';
    return { state: 'incomplete', ...summary, message:
      `Файл BODYFORGE читается, но копия неполная. ${reason} Не удаляй исходный прогресс.` };
  }
  return { state: 'readable', ...summary,
    message: 'Структура резервной копии BODYFORGE проверена. Это не подтверждает подлинность наград и не восстанавливает данные.' };
}

/** Explicit local file selection, not an upload. Reject size before file.text. */
export async function inspectProgressBackupFile(file: Pick<File, 'size' | 'text'>): Promise<BackupInspection> {
  if (!Number.isSafeInteger(file.size) || file.size < 1) {
    return invalid('Выбран пустой или недоступный файл.');
  }
  if (file.size > MAX_PROGRESS_BACKUP_BYTES) {
    return invalid('Файл больше 16 МБ. Не загружаем его в память для проверки.');
  }
  try { return inspectProgressBackupJson(await file.text()); }
  catch { return invalid('Браузер не смог прочитать выбранный файл.'); }
}
