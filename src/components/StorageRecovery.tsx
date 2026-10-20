import { useState } from 'react';
import type { StorageStatus } from '../hooks/useProfileStorage';
import type { Profile } from '../lib/progression';

interface Props {
  status: Exclude<StorageStatus, 'ready'>;
  backupAvailable: boolean;
  profile: Profile;
  onRetry: () => void;
  onReload: () => void;
  onRecover: (source: 'backup' | 'empty') => void;
}

export default function StorageRecovery({ status, backupAvailable, profile, onRetry, onReload, onRecover }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const title = status === 'conflict' ? 'СОХРАНЕНИЕ ИЗМЕНИЛОСЬ'
    : status === 'recovery-required' ? 'ПРОГРЕСС НУЖНО ВОССТАНОВИТЬ' : 'НЕ УДАЛОСЬ СОХРАНИТЬ';
  function exportSession() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bodyforge-local-progress.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className="storage-recovery" data-storage-status={status}>
    <section className="storage-panel" aria-labelledby="storage-title">
      <span className="section-index">BODYFORGE / ЗАЩИТА ПРОГРЕССА</span>
      <h1 id="storage-title">{title}</h1>
      <p role="alert">{status === 'conflict'
        ? 'Другая вкладка изменила прогресс. Текущая тренировка остановлена: старые данные не перезаписали новый результат.'
        : status === 'recovery-required'
          ? 'В браузере уже есть сохранение, которое не удалось прочитать. Оно не удалено. Не создаём нового бойца поверх старого.'
          : 'Браузер не подтвердил запись прогресса. Новые изменения пока находятся только в памяти этой страницы. Не закрывай её до повторного сохранения или экспорта.'}</p>
      {status === 'recovery-required' && <>
        <button type="button" className="forge-solid-button" data-action="restore-backup" disabled={!backupAvailable}
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
      {status === 'unavailable' && <button type="button" className="forge-solid-button" data-action="retry-save" onClick={onRetry}>ПОВТОРИТЬ СОХРАНЕНИЕ</button>}
      <button type="button" data-action="export-session" onClick={exportSession} disabled={!profile.game.created}>Экспортировать данные этой страницы</button>
      <small>Данные остаются у тебя. Ничего не отправляется на сервер. Экспорт — локальный JSON для сохранения и восстановления вручную.</small>
    </section>
  </main>;
}
