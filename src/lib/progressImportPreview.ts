import { getProfileTotals, type Profile } from './progression';
import { inspectProgressBackupJson, MAX_PROGRESS_BACKUP_BYTES, type BackupInspection } from './progressBackupInspector';
import { previewReceiptMigration, type ReceiptMigrationPreview } from './receiptCompatibility';

/** BF-106: local comparison only. No persistence or grant authority. */
export interface ImportProfileSummary {
  readonly xp: number;
  readonly coins: number;
  readonly workouts: number;
  readonly availableWorkouts: number;
  readonly repetitions: number;
  readonly holdSeconds: number;
  readonly towerFloor: number;
  readonly ownedOutfits: number;
}
export interface ProgressImportPreview {
  readonly state: 'preview-ready' | 'blocked' | 'invalid';
  readonly inspection: BackupInspection;
  readonly current: ImportProfileSummary;
  readonly incoming: ImportProfileSummary | null;
  readonly identity: 'same' | 'different' | 'unknown';
  readonly recordedGrants: number;
  readonly warnings: readonly string[];
  readonly applyAuthorized: false;
}

function summary(profile: Profile, availableWorkouts = profile.workouts.length): ImportProfileSummary {
  const totals = getProfileTotals(profile);
  return { xp: profile.xp, coins: profile.coins, workouts: totals.workouts, availableWorkouts,
    repetitions: totals.repetitions, holdSeconds: totals.holdSeconds ?? 0,
    towerFloor: profile.game.highestClearedFloor, ownedOutfits: profile.game.ownedOutfits.length };
}
function invalid(current: ImportProfileSummary, message: string): ProgressImportPreview {
  return { state: 'invalid', inspection: { state: 'invalid', message, exportedAt: null, workouts: 0,
    durableRecords: 0, journalRecords: 0, quarantineRecords: 0 }, current, incoming: null,
    identity: 'unknown', recordedGrants: 0, warnings: [], applyAuthorized: false };
}

// Reject duplicate decoded property names, dangerous keys and excessive nesting.
// A bounded lexical preflight; JSON.parse still validates the grammar.
function unambiguousJson(json: string): boolean {
  const stack: (Set<string> | null)[] = [];
  let tokens = 0;
  const space = (c: string | undefined) => c === ' ' || c === '\t' || c === '\r' || c === '\n';
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (space(c)) continue;
    if (++tokens > 500_000) return false;
    if (c === '"') {
      const start = i;
      for (i++; i < json.length && json[i] !== '"'; i++) if (json[i] === '\\') i++;
      if (i >= json.length) return false;
      let next = i + 1;
      while (space(json[next])) next++;
      if (json[next] === ':') {
        const keys = stack[stack.length - 1];
        if (!keys) return false;
        let key: string;
        try { key = JSON.parse(json.slice(start, i + 1)); } catch { return false; }
        if (keys.has(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
        keys.add(key);
      }
    } else if (c === '{' || c === '[') {
      stack.push(c === '{' ? new Set<string>() : null);
      if (stack.length > 32) return false;
    } else if (c === '}' || c === ']') {
      if (!stack.length || (c === '}') !== (stack[stack.length - 1] !== null)) return false;
      stack.pop();
    } else if (c !== ':' && c !== ',') {
      while (i + 1 < json.length && !space(json[i + 1]) && !',]}:{["'.includes(json[i + 1])) i++;
    }
  }
  return stack.length === 0;
}
export function inspectImportProfile(raw: unknown): ReceiptMigrationPreview | null {
  if (typeof raw !== 'string' || !unambiguousJson(raw)) return null;
  const result = previewReceiptMigration(raw);
  return result.status === 'preview-ready' ? result : null;
}

/** Compare the exact stored primary, never the export's display mirror.
 * Only summaries are returned to the UI. Replacement needs a separate gate. */
export function previewProgressImportJson(json: string, currentProfile: Profile): ProgressImportPreview {
  return compare(json, summary(currentProfile), currentProfile.profileId);
}
function compare(json: string, current: ImportProfileSummary, currentId?: string): ProgressImportPreview {
  if (typeof json !== 'string' || json.length > MAX_PROGRESS_BACKUP_BYTES ||
      new TextEncoder().encode(json).byteLength > MAX_PROGRESS_BACKUP_BYTES) {
    return invalid(current, 'Файл слишком большой (максимум 16 МБ).');
  }
  if (!unambiguousJson(json)) {
    return invalid(current, 'Неоднозначная или слишком сложная структура JSON. Прогресс не изменён.');
  }
  const inspection = inspectProgressBackupJson(json);
  const base = { inspection, current, incoming: null, identity: 'unknown' as const,
    recordedGrants: 0, applyAuthorized: false as const };
  if (inspection.state === 'invalid') return { ...base, state: 'invalid', warnings: [] };
  const data = JSON.parse(json) as Record<string, unknown>;
  const primary = inspectImportProfile(data.storedProfileRaw);
  if (!primary) {
    return { ...base, state: 'blocked', warnings: ['Основной профиль не прошёл строгую проверку совместимости.'] };
  }
  const incoming = summary(primary.profile, primary.receipts.length);
  const identity = currentId && primary.profile.profileId
    ? currentId === primary.profile.profileId ? 'same' as const : 'different' as const : 'unknown' as const;
  const warnings: string[] = [];
  if (inspection.state !== 'readable') warnings.push('Копия неполная или несогласованная.');
  const fallbackInvalid = data.storedBackupRaw !== null && !inspectImportProfile(data.storedBackupRaw);
  if (fallbackInvalid) warnings.push('Резервный профиль повреждён или несовместим.');
  if (identity === 'different') warnings.push('Копия относится к другому бойцу. Объединение прогресса не предусмотрено.');
  if (identity === 'unknown') warnings.push('Не удалось подтвердить совпадение идентификаторов бойцов.');
  if (primary.ledgerEvidence === 'legacy-unproven') warnings.push('Исторические идентификаторы наград не подтверждены старым форматом.');
  if (primary.receipts.some(row => row.receiptEvidence === 'opaque')) warnings.push('Есть непрозрачные квитанции: их нельзя считать проверенными начислениями.');
  if (incoming.xp < current.xp || incoming.coins < current.coins || incoming.workouts < current.workouts ||
      incoming.towerFloor < current.towerFloor || incoming.ownedOutfits < current.ownedOutfits ||
      incoming.repetitions < current.repetitions || incoming.holdSeconds < current.holdSeconds) {
    warnings.push('В копии часть показателей меньше текущих. Замена может потерять прогресс.');
  }
  if (inspection.journalRecords || inspection.quarantineRecords ||
      (Array.isArray(data.durableResults) && data.durableResults.some(row => row.state !== 'settled')) || data.pendingResult != null ||
      (Array.isArray(data.pendingResults) && data.pendingResults.length > 0)) {
    warnings.push('Журнал и карантин требуют отдельного плана восстановления; выплаты не воспроизводятся.');
  }
  const aux = data.storedAuxiliaryRaw as Record<string, unknown>;
  if (Object.values(aux).some(value => value !== null)) warnings.push('Внешность и настройки есть в файле, но этим просмотром не восстанавливаются.');
  return { ...base, state: inspection.state !== 'readable' || fallbackInvalid ? 'blocked' : 'preview-ready',
    incoming, identity, recordedGrants: primary.recordedGrants.length, warnings };
}

/** Reject oversize before reading, and invalid UTF-8 instead of replacing bytes. */
export async function previewProgressImportFile(
  file: Pick<File, 'size' | 'arrayBuffer'>, currentProfile: Profile,
  onComparable?: (validatedJson: string) => void,
): Promise<ProgressImportPreview> {
  const current = summary(currentProfile);
  const currentId = currentProfile.profileId;
  const size = file.size;
  if (!Number.isSafeInteger(size) || size < 1) return invalid(current, 'Выбран пустой или недоступный файл.');
  if (size > MAX_PROGRESS_BACKUP_BYTES) return invalid(current, 'Файл больше 16 МБ. Чтение не начато.');
  try {
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength !== size || bytes.byteLength > MAX_PROGRESS_BACKUP_BYTES) {
      return invalid(current, 'Размер прочитанного файла не совпадает с выбранным.');
    }
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const preview = compare(json, current, currentId);
    if (preview.state === 'preview-ready') onComparable?.(json);
    return preview;
  } catch {
    return invalid(current, 'Не удалось прочитать файл как корректный UTF-8 JSON.');
  }
}
