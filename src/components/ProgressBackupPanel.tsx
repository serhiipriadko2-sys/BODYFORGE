import { useEffect, useRef, useState } from 'react';
import type { Profile } from '../lib/progression';
import type { CompletedWorkoutResult } from '../lib/workoutJournal';
import { prepareProgressBackup, requestProgressBackupDownload, type PreparedProgressBackup } from '../lib/progressBackup';
import './progressBackup.css';

interface Props {
  profile: Profile;
  pendingResult: CompletedWorkoutResult | null;
  disabled: boolean;
}

/** Manual, read-only device backup. Always require a fresh direct click to
 * download; never automatically upload, overwrite or restore game progress.
 */
export default function ProgressBackupPanel({ profile, pendingResult, disabled }: Props) {
  const [status, setStatus] = useState<'idle' | 'preparing' | 'ready' | 'error'>('idle');
  const [prepared, setPrepared] = useState<PreparedProgressBackup | null>(null);
  const [message, setMessage] = useState('');
  const generation = useRef(0);

  // A new profile revision invalidates any snapshot prepared from old data.
  useEffect(() => {
    generation.current++;
    setPrepared(null);
    setStatus('idle');
    setMessage('');
  }, [profile, pendingResult]);

  useEffect(() => {
    if (!disabled) return;
    generation.current++;
    setPrepared(null);
    setStatus('idle');
  }, [disabled]);

  useEffect(() => {
    const changedElsewhere = (event: StorageEvent) => {
      // Another tab can update avatar look or preferences without changing the
      // React profile object. Never offer a now-stale backup as current data.
      if (event.key !== null && !event.key.startsWith('bodyforge:')) return;
      generation.current++;
      setPrepared(null);
      setStatus('idle');
      setMessage('Данные изменились в другой вкладке. Подготовь новую копию.');
    };
    window.addEventListener('storage', changedElsewhere);
    return () => window.removeEventListener('storage', changedElsewhere);
  }, []);

  useEffect(() => () => { generation.current++; }, []);

  async function prepare() {
    if (disabled || status === 'preparing') return;
    const request = ++generation.current;
    setPrepared(null);
    setStatus('preparing');
    setMessage('');
    try {
      const backup = await prepareProgressBackup(profile, pendingResult);
      if (request !== generation.current) return;
      setPrepared(backup);
      setStatus('ready');
      setMessage(backup.complete
        ? 'Данные подготовлены. Нажми «Скачать» и проверь файл в загрузках.'
        : 'Копия подготовлена частично: не все хранилища доступны. Сохрани файл для разбора, но не считай его полной резервной копией.');
    } catch {
      if (request !== generation.current) return;
      setStatus('error');
      setMessage('Не удалось подготовить файл. Проверь место и разрешения браузера, затем повтори попытку.');
    }
  }

  function download() {
    if (disabled || status !== 'ready' || !prepared) return;
    try {
      requestProgressBackupDownload(prepared);
      setStatus('idle');
      setPrepared(null);
      setMessage('Запрос скачивания передан браузеру. Проверь папку «Загрузки» — сам факт сохранения ещё не подтверждён.');
    } catch {
      setMessage('Браузер заблокировал скачивание. Попробуй снова из этого окна.');
    }
  }

  return (
    <section id="progress-backup" className="progress-backup-card" data-backup-stage={status}
      aria-label="Локальная резервная копия прогресса">
      <div>
        <span className="section-index">ЗАЩИТА ПРОГРЕССА · ЛОКАЛЬНО</span>
        <h3>СОХРАНИ СВОЕГО БОЙЦА</h3>
        <p>Тренировки, XP, покупки, внешность и настройки хранятся в браузере. Перед очисткой данных или сменой телефона сохрани копию в JSON.</p>
        <small>Файл может содержать имя бойца и историю тренировок. Никуда не отправляется. Автоматического импорта пока нет — копия предназначена для хранения и технического восстановления.</small>
        <details className="progress-install-help">
          <summary>КАК УСТАНОВИТЬ BODYFORGE НА ТЕЛЕФОН</summary>
          <p><strong>Android / Chrome:</strong> меню браузера → «Установить приложение» или «Добавить на главный экран».</p>
          <p><strong>iPhone / Safari:</strong> «Поделиться» → «На экран „Домой“».</p>
          <small>Камере нужен HTTPS; первая загрузка модели требует интернет. Копия прогресса не переносится на другое устройство автоматически.</small>
        </details>
      </div>
      <div className="progress-backup-actions">
        {status === 'ready'
          ? <button type="button" data-action="download-progress" disabled={disabled} onClick={download}>
              СКАЧАТЬ ПОДГОТОВЛЕННЫЙ JSON
            </button>
          : <button type="button" data-action="prepare-progress" disabled={disabled || status === 'preparing'}
              onClick={() => { void prepare(); }}>
              {status === 'preparing' ? 'ЧИТАЕМ СОХРАНЕНИЯ…' : 'ПОДГОТОВИТЬ РЕЗЕРВНУЮ КОПИЮ'}
            </button>}
        <p role="status" aria-live="polite" data-backup-status={status}>{message}</p>
      </div>
    </section>
  );
}
