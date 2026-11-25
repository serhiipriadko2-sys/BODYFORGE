import { useEffect, useRef, useState } from 'react';
import type { Profile } from '../lib/progression';
import type { CompletedWorkoutResult } from '../lib/workoutJournal';
import { prepareProgressBackup, requestProgressBackupDownload, type PreparedProgressBackup } from '../lib/progressBackup';
import { inspectProgressBackupFile, type BackupInspection } from '../lib/progressBackupInspector';
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
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const generation = useRef(0);
  const inspectionGeneration = useRef(0);

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
    inspectionGeneration.current++;
    setPrepared(null);
    setStatus('idle');
    setInspecting(false);
    setInspection(null);
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

  useEffect(() => () => { generation.current++; inspectionGeneration.current++; }, []);

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
        : backup.sourcesChangedDuringRead
          ? 'Прогресс изменился во время подготовки. Копия неполная — подготовь новую перед очисткой данных браузера.'
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

  async function inspectFile(file: File) {
    if (disabled) return;
    const request = ++inspectionGeneration.current;
    setInspection(null);
    setInspecting(true);
    const result = await inspectProgressBackupFile(file);
    if (request !== inspectionGeneration.current) return;
    setInspection(result);
    setInspecting(false);
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
        <details className="progress-backup-file-checker"
          data-inspection-state={inspecting ? 'checking' : inspection?.state ?? 'idle'}>
          <summary>ПРОВЕРИТЬ СКАЧАННЫЙ JSON</summary>
          <label htmlFor="bf-verify-local-backup">Выбери резервную копию с устройства. Файл останется в этом браузере.</label>
          <input id="bf-verify-local-backup" data-action="inspect-progress-file"
            type="file" accept=".json,application/json" disabled={disabled || inspecting}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void inspectFile(file);
            }}/>
          <p role="status" aria-live="polite" data-inspection-result={inspection?.state ?? 'idle'}>
            {inspecting ? 'Проверяем структуру JSON без отправки файла…'
              : inspection?.message ?? 'Проверка только читает JSON: текущий прогресс не изменяется.'}
          </p>
          {inspection && inspection.state !== 'invalid' && (
            <small>Дата копии: {inspection.exportedAt ? new Date(inspection.exportedAt).toLocaleString('ru-RU') : '—'}.
              Записей тренировок: {inspection.workouts}; журнал: {inspection.journalRecords};
              долговременное хранилище: {inspection.durableRecords}; карантин: {inspection.quarantineRecords}.</small>
          )}
          <small>Это проверка структуры файла, не доказательство подлинности наград и не импорт.
            Не удаляй данные браузера без проверенной полной копии и плана восстановления.</small>
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
