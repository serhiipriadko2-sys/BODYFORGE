import { useState } from 'react';
import type { StorageStatus } from '../hooks/useProfileStorage';
import type { Profile } from '../lib/progression';
import type { ProfileWriteIssue } from '../lib/profileLock';
import type { CompletedWorkoutResult, JournalEntry } from '../lib/workoutJournal';
import { createProgressExport } from '../lib/progressExport';
import { readDurableJournal } from '../lib/durableJournal';

async function exportProgress(profile: Profile, pendingResult: CompletedWorkoutResult | null) {
  const durable = await readDurableJournal();
  const payload = { ...createProgressExport(profile, pendingResult), durableResults: durable.entries, durableReadStatus: durable.status };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bodyforge-local-progress.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ResultQuarantineNotice({ profile, count, unavailable }: { profile: Profile; count: number; unavailable: boolean }) {
  if (!count && !unavailable) return null;
  return <aside className="result-quarantine-notice" data-quarantined-results={count} aria-label="Отложенные результаты">
    <p>{unavailable ? 'Не удалось полностью прочитать отложенные результаты.' : `Отложенных результатов: ${count}. Исходные данные сохранены отдельно, награды за них не начисляются.`}</p>
    <button type="button" data-action="export-session" onClick={() => { void exportProgress(profile, null); }}>Экспортировать сохранённые данные</button>
  </aside>;
}

interface Props {
  status: Exclude<StorageStatus, 'ready'>;
  backupAvailable: boolean;
  writeIssue: ProfileWriteIssue | null;
  isSaving: boolean;
  profile: Profile;
  pendingResult: CompletedWorkoutResult | null;
  journalEntries: JournalEntry[];
  onOpenCurrent: () => void;
  onRetry: () => void;
  onReload: () => void;
  onRecover: (source: 'backup' | 'empty') => void;
  onQuarantine: (expected: readonly JournalEntry[]) => void;
}

export default function StorageRecovery({ status, backupAvailable, writeIssue, isSaving, profile, pendingResult, journalEntries,
  onOpenCurrent, onRetry, onReload, onRecover, onQuarantine }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [quarantineSnapshot, setQuarantineSnapshot] = useState<JournalEntry[] | null>(null);
  const title = status === 'checking' ? 'ПРОВЕРЯЕМ СОХРАНЕНИЕ' : status === 'pending-result' ? 'ТРЕНИРОВКА ОЖИДАЕТ ВОССТАНОВЛЕНИЯ' : status === 'conflict' ? 'СОХРАНЕНИЕ ИЗМЕНИЛОСЬ'
    : status === 'recovery-required' ? 'ПРОГРЕСС НУЖНО ВОССТАНОВИТЬ' : 'НЕ УДАЛОСЬ СОХРАНИТЬ';
  return <main className="storage-recovery" data-storage-status={status}>
    <section className="storage-panel" aria-labelledby="storage-title">
      <span className="section-index">BODYFORGE / ЗАЩИТА ПРОГРЕССА</span>
      <h1 id="storage-title">{title}</h1>
      <p role={status === 'checking' ? 'status' : 'alert'}>{status === 'checking'
        ? 'Проверяем локальный журнал и незавершённые результаты перед открытием прогресса.'
        : status === 'pending-result'
        ? 'Найден результат, который нельзя автоматически применить к текущему бойцу или этажу, либо журнал повреждён. Исходные данные сохранены. Экспортируй их для разбора: награда не переносится другому бойцу или на следующий этаж.'
        : status === 'conflict'
        ? 'Другая вкладка изменила прогресс. Текущая тренировка остановлена: старые данные не перезаписали новый результат.'
        : status === 'recovery-required'
          ? 'В браузере уже есть сохранение, которое не удалось прочитать. Оно не удалено. Не создаём нового бойца поверх старого.'
          : writeIssue === 'unsupported'
            ? 'Этот адрес или браузер не поддерживает безопасное сохранение между вкладками. Открой приложение по HTTPS в современном браузере; на компьютере можно использовать localhost. Изменения пока только в памяти страницы: сохрани их через экспорт.'
            : writeIssue === 'timeout'
              ? 'Не удалось дождаться записи другой вкладки. Закрой зависшую вкладку и повтори сохранение. Изменения пока только в памяти этой страницы; их можно экспортировать.'
              : journalEntries.length
                ? 'Результат находится в локальном журнале, но обработка не завершена. Повтори сохранение или экспортируй данные. Не очищай данные браузера до завершения восстановления.'
                : pendingResult
                  ? 'Браузер не подтвердил запись журнала. Результат пока только в памяти этой страницы. Не закрывай её до повторного сохранения или экспорта.'
              : 'Браузер не подтвердил запись прогресса. Новые изменения пока находятся только в памяти этой страницы. Не закрывай её до повторного сохранения или экспорта.'}</p>
      {isSaving && <p role="status">Ожидаем безопасную запись. Не закрывай страницу.</p>}
      {status === 'recovery-required' && <>
        <button type="button" className="forge-solid-button" data-action="restore-backup" disabled={!backupAvailable || isSaving}
          onClick={() => onRecover('backup')}>ВОССТАНОВИТЬ РЕЗЕРВНУЮ КОПИЮ</button>
        <p>{backupAvailable ? 'Копия проверена. Она может быть на одно действие старше последнего результата.' : 'Проверенной резервной копии пока нет.'}</p>
        {!confirmReset ? <button type="button" data-action="request-fresh" onClick={() => setConfirmReset(true)}>Начать заново…</button> :
          <div role="group" aria-label="Подтверждение нового профиля">
            <p>Текущий игровой прогресс будет заменён пустым. Неисправный исходник сохраняется отдельно в этом браузере для разбора.</p>
            <button type="button" data-action="confirm-fresh" onClick={() => { setConfirmReset(false); onRecover('empty'); }}>Подтверждаю новый профиль</button>
            <button type="button" onClick={() => setConfirmReset(false)}>Отмена</button>
          </div>}
      </>}
      {status === 'conflict' && <>
        <button type="button" className="forge-solid-button" data-action="load-latest" onClick={onReload}>ОТКРЫТЬ АКТУАЛЬНОЕ СОХРАНЕНИЕ</button>
        <p>Несохранённые изменения этой вкладки не объединяются автоматически. Их можно экспортировать перед открытием актуального профиля.</p>
      </>}
      {(status === 'unavailable' || status === 'pending-result') && <button type="button" className="forge-solid-button" data-action="retry-save" disabled={isSaving} onClick={onRetry}>ПОВТОРИТЬ СОХРАНЕНИЕ</button>}
      {status === 'pending-result' && <button type="button" data-action="open-current-profile" disabled={isSaving} onClick={onOpenCurrent}>Открыть текущий профиль без применения результата</button>}
      {status === 'pending-result' && journalEntries.length > 0 && (!quarantineSnapshot
        ? <button type="button" data-action="request-quarantine" disabled={isSaving} onClick={() => setQuarantineSnapshot(journalEntries.map((e) => ({ ...e })))}>Отложить эти результаты и продолжить…</button>
        : <div role="group" aria-label="Подтверждение отложенных результатов">
          <p>Отложить результатов: {quarantineSnapshot.length}. Они останутся в отдельном локальном карантине и экспорте. Награды за них не начислятся. Автоматический перенос в другого бойца или этаж не выполняется.</p>
          <button type="button" data-action="confirm-quarantine" disabled={isSaving} onClick={() => { onQuarantine(quarantineSnapshot); setQuarantineSnapshot(null); }}>Подтверждаю: сохранить отдельно и продолжить</button>
          <button type="button" disabled={isSaving} onClick={() => setQuarantineSnapshot(null)}>Отмена</button>
        </div>)}
      <button type="button" data-action="export-session" onClick={() => { void exportProgress(profile, pendingResult); }}>Экспортировать данные этой страницы</button>
      <small>Данные остаются у тебя. Ничего не отправляется на сервер. Экспорт — локальный JSON для сохранения и восстановления вручную.</small>
    </section>
  </main>;
}
