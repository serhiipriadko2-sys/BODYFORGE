import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadProfileState, type Profile } from '../lib/progression';
import type { CompletedWorkoutResult } from '../lib/workoutJournal';
import { prepareProgressBackup, requestProgressBackupDownload, requestLocalBackupDownload, type PreparedProgressBackup } from '../lib/progressBackup';
import { previewProgressImportFile, type ProgressImportPreview } from '../lib/progressImportPreview';
import { readProfileEpoch } from '../lib/profileEpoch';
import type { ReplacementPlan } from '../lib/profileReplacement';
import { prepareFileReplacement, stageFileReplacement } from '../lib/profileReplacementRecovery';
import { formatStorageBytes, readStorageCapacity, type StorageCapacity } from '../lib/storageCapacity';
import { prepareBackupArchive, type PreparedBackupArchive } from '../lib/backupArchive';
import { previewCheckpointBatch, type CheckpointPreview } from '../lib/journalCheckpointBatch';
import './progressBackup.css';

interface Props {
  profile: Profile;
  pendingResult: CompletedWorkoutResult | null;
  disabled: boolean;
}

/** Preview and confirmation share the same immutable replacement plan. */
export default function ProgressBackupPanel({ profile, pendingResult, disabled }: Props) {
  const [status, setStatus] = useState<'idle' | 'preparing' | 'ready' | 'error'>('idle');
  const [prepared, setPrepared] = useState<PreparedProgressBackup | null>(null);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<ProgressImportPreview | null>(null);
  const inspection = preview?.inspection;
  const [inspecting, setInspecting] = useState(false);
  const generation = useRef(0);
  const inspectionGeneration = useRef(0);
  const operation = useRef<AbortController | null>(null);
  const [plan, setPlan] = useState<ReplacementPlan | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [staging, setStaging] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [capacity, setCapacity] = useState<StorageCapacity | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const capacityGeneration = useRef(0);
  const [archive, setArchive] = useState<Extract<PreparedBackupArchive, { status: 'ready' }> | null>(null);
  const [compressing, setCompressing] = useState(false);
  const archiveOperation = useRef<AbortController | null>(null);
  const checkpointOperation = useRef<AbortController | null>(null);
  const [checkpointPreview, setCheckpointPreview] = useState<CheckpointPreview | null>(null);
  const [checkingCheckpoints, setCheckingCheckpoints] = useState(false);

  async function estimateCheckpoints() {
    if (!prepared || disabled || checkpointOperation.current) return;
    const controller = new AbortController();
    checkpointOperation.current = controller;
    setCheckingCheckpoints(true);
    setCheckpointPreview(null);
    const result = await previewCheckpointBatch(prepared.json, controller.signal);
    if (controller.signal.aborted || checkpointOperation.current !== controller) return;
    checkpointOperation.current = null;
    setCheckingCheckpoints(false);
    setCheckpointPreview(result);
  }

  function clearPrepared() {
    checkpointOperation.current?.abort();
    checkpointOperation.current = null;
    setCheckpointPreview(null);
    setCheckingCheckpoints(false);
    archiveOperation.current?.abort();
    archiveOperation.current = null;
    setArchive(null);
    setCompressing(false);
    setPrepared(null);
  }

  async function prepareArchive() {
    if (disabled || !prepared || archiveOperation.current || archive) return;
    const controller = new AbortController();
    archiveOperation.current = controller;
    setCompressing(true);
    const packed = await prepareBackupArchive(prepared.json, prepared.filename, controller.signal)
      .catch(() => ({ status: 'unavailable' } as const));
    if (controller.signal.aborted || archiveOperation.current !== controller) return;
    archiveOperation.current = null;
    setCompressing(false);
    if (packed.status === 'ready') {
      setArchive(packed);
      setMessage(packed.inspectableSize && prepared.complete
        ? 'Архив подготовлен, распаковка проверена. Выбери файл для скачивания.'
        : 'Архив подготовлен для разбора. Полнота или размер исходного JSON ограничивают проверку. Не очищай данные.');
    } else {
      setMessage(packed.status === 'too-large' ? 'Для сжатия в браузере исходный JSON слишком большой. Скачай обычный JSON.'
        : packed.status === 'unsupported' ? 'Этот браузер не поддерживает GZIP. Скачай обычный JSON.'
        : packed.status === 'not-smaller' ? 'Сжатие не уменьшило файл. Скачай обычный JSON.'
        : 'Не удалось проверить сжатый архив. Обычный JSON по-прежнему доступен.');
    }
  }

  function downloadArchive() {
    if (disabled || !archive || !prepared || status !== 'ready') return;
    try {
      requestLocalBackupDownload(archive.blob, archive.filename);
      setStatus('idle');
      clearPrepared();
      setMessage(archive.inspectableSize && prepared.complete
        ? 'Запрос скачивания GZIP передан браузеру. Проверь файл в загрузках.'
        : 'Запрос скачивания GZIP для разбора передан браузеру. Проверка исходных данных ограничена. Не очищай данные.');
    } catch { setMessage('Браузер не подтвердил запрос скачивания. Попробуй ещё раз.'); }
  }

  function invalidateCapacity() {
    capacityGeneration.current++;
    setCapacity(null);
    setMeasuring(false);
  }

  async function measureCapacity() {
    if (disabled || measuring) return;
    const request = ++capacityGeneration.current;
    setMeasuring(true);
    setCapacity(null);
    const observed = await readStorageCapacity();
    if (request !== capacityGeneration.current) return;
    setCapacity(observed);
    setMeasuring(false);
  }

  function invalidateImport() {
    inspectionGeneration.current++;
    operation.current?.abort();
    operation.current = null;
    setPlan(null);
    setConfirming(false);
    setStaging(false);
    setImportMessage('');
    setPreview(null);
    setInspecting(false);
  }

  // A new profile revision invalidates any snapshot prepared from old data.
  useLayoutEffect(() => {
    generation.current++;
    invalidateImport();
    invalidateCapacity();
    clearPrepared();
    setStatus('idle');
    setMessage('');
  }, [profile, pendingResult]);

  useLayoutEffect(() => {
    if (!disabled) return;
    generation.current++;
    invalidateImport();
    invalidateCapacity();
    clearPrepared();
    setStatus('idle');
  }, [disabled]);

  useEffect(() => {
    const changedElsewhere = (event: StorageEvent) => {
      // Another tab can update avatar look or preferences without changing the
      // React profile object. Never offer a now-stale backup as current data.
      invalidateCapacity();
      if (event.key !== null && !event.key.startsWith('bodyforge:')) return;
      generation.current++;
      invalidateImport();
      clearPrepared();
      setStatus('idle');
      setMessage('Данные изменились в другой вкладке. Подготовь новую копию.');
    };
    window.addEventListener('storage', changedElsewhere);
    return () => window.removeEventListener('storage', changedElsewhere);
  }, []);

  useLayoutEffect(() => {
    const pageHidden = () => { generation.current++; invalidateImport(); invalidateCapacity(); clearPrepared(); setStatus('idle'); };
    window.addEventListener('pagehide', pageHidden);
    return () => {
      window.removeEventListener('pagehide', pageHidden);
      generation.current++;
      inspectionGeneration.current++;
      capacityGeneration.current++;
      operation.current?.abort();
      archiveOperation.current?.abort();
      checkpointOperation.current?.abort();
    };
  }, []);

  async function prepare() {
    if (disabled || status === 'preparing') return;
    const request = ++generation.current;
    clearPrepared();
    setStatus('preparing');
    setMessage('');
    try {
      const backup = await prepareProgressBackup(profile, pendingResult);
      if (request !== generation.current) return;
      setPrepared(backup);
      setStatus('ready');
      setMessage(backup.capacity === 'oversize'
        ? 'Файл превышает 16 МиБ. Можно скачать исходные данные для разбора, но встроенная проверка и замена такого файла недоступны. Не очищай хранилище.'
        : backup.complete
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
      clearPrepared();
      setMessage(prepared.capacity === 'oversize'
        ? 'Запрошено скачивание большого JSON для разбора. Встроенная проверка недоступна. Не очищай данные браузера.'
        : 'Запрос скачивания передан браузеру. Проверь папку «Загрузки» — сам факт сохранения ещё не подтверждён.');
    } catch {
      setMessage('Браузер заблокировал скачивание. Попробуй снова из этого окна.');
    }
  }

  async function inspectFile(file: File) {
    if (disabled) return;
    invalidateImport();
    const request = inspectionGeneration.current;
    const controller = new AbortController();
    operation.current = controller;
    setInspecting(true);
    const current = loadProfileState();
    let epoch: string | null | undefined;
    try { epoch = readProfileEpoch(); } catch { /* Comparison remains available. */ }
    let json: string | undefined;
    const result = await previewProgressImportFile(file, current.status === 'ready' ? current.profile : profile,
      raw => { json = raw; }, controller.signal);
    if (controller.signal.aborted) return;
    const replacement = json && !pendingResult && current.status === 'ready' && current.revision !== null && epoch !== undefined
      ? await prepareFileReplacement(json, current.revision, epoch, controller.signal) : null;
    if (controller.signal.aborted || request !== inspectionGeneration.current) return;
    setPlan(replacement);
    setPreview(result);
    setInspecting(false);
    if (result.state === 'preview-ready' && !replacement) {
      setImportMessage('Доступен только просмотр. Для замены нужны тот же боец, совместимая история наград, совпадающие настройки и одинаковые журналы без ожидающих или отложенных результатов.');
    }
  }

  async function confirmReplacement() {
    const controller = operation.current;
    if (!controller || controller.signal.aborted || disabled || pendingResult || !plan || !confirming || staging) return;
    setStaging(true);
    const result = await stageFileReplacement(plan, controller.signal);
    if (result?.status === 'applied-pending-finalization' || result?.status === 'recovery-required') {
      window.location.reload();
      return;
    }
    if (controller.signal.aborted) return;
    invalidateImport();
    setImportMessage(result?.status === 'unchanged' ? 'Эта копия уже сохранена на устройстве.'
      : 'Замена не подтверждена. Выбери файл заново, чтобы сравнить его с актуальным сохранением.');
  }

  return (
    <section id="progress-backup" className="progress-backup-card" data-backup-stage={status}
      aria-label="Локальная резервная копия прогресса">
      <div>
        <span className="section-index">ЗАЩИТА ПРОГРЕССА · ЛОКАЛЬНО</span>
        <h3>СОХРАНИ СВОЕГО БОЙЦА</h3>
        <p>Тренировки, XP, покупки, внешность и настройки хранятся в браузере. Перед очисткой данных или сменой телефона сохрани копию в JSON.</p>
        <small>Файл может содержать имя бойца и историю тренировок. Никуда не отправляется. Сначала сравни прогресс. Для совместимой копии можно подтвердить замену.</small>
        <details className="progress-storage-capacity" data-storage-capacity={measuring ? 'checking' : capacity?.local.state ?? 'idle'}>
          <summary>МЕСТО ДЛЯ СОХРАНЕНИЙ</summary>
          <p>Проверка только читает объём данных. Ничего не удаляет и не запрашивает разрешения.</p>
          <button type="button" className="progress-import-cancel" data-action="measure-storage-capacity"
            disabled={disabled || measuring} onClick={() => { void measureCapacity(); }}>
            {measuring ? 'Проверяем…' : 'Проверить объём'}
          </button>
          {capacity && <div role="status" data-capacity-warning={capacity.local.state === 'observed'
            ? (capacity.local.warning ? 'advisory' : 'none') : 'unknown'}
            data-local-storage-bytes={capacity.local.state === 'observed' ? capacity.local.estimatedBytes : undefined}>
            <p>{capacity.local.state === 'observed'
              ? 'Локальные записи этого адреса: около ' + formatStorageBytes(capacity.local.estimatedBytes) + ' (оценка по строкам на момент проверки).'
              : 'Объём локальных записей определить не удалось.'}</p>
            {capacity.local.state === 'observed' && capacity.local.warning &&
              <p>Локальные записи занимают много места. Скачай свежую копию. Если запись не проходит, не удаляй исходные данные.</p>}
            <p>{capacity.origin ? 'Оценка общего хранилища браузера: ' + formatStorageBytes(capacity.origin.usage)
              + ' из ' + formatStorageBytes(capacity.origin.quota) + '.' : 'Общая оценка хранилища недоступна.'}</p>
            <p>{capacity.persistent === true ? 'Браузер сообщает о постоянном режиме хранения.'
              : capacity.persistent === false ? 'Браузер может освободить данные при нехватке места.'
              : 'Режим постоянного хранения неизвестен.'}</p>
            <small>Это не точный остаток localStorage и не гарантия следующей записи. Даже постоянный режим не заменяет файл резервной копии.</small>
          </div>}
        </details>
        <details className="progress-install-help">
          <summary>КАК УСТАНОВИТЬ BODYFORGE НА ТЕЛЕФОН</summary>
          <p><strong>Android / Chrome:</strong> меню браузера → «Установить приложение» или «Добавить на главный экран».</p>
          <p><strong>iPhone / Safari:</strong> «Поделиться» → «На экран „Домой“».</p>
          <small>Камере нужен HTTPS; первая загрузка модели требует интернет. Копия прогресса не переносится на другое устройство автоматически.</small>
        </details>
        <details className="progress-backup-file-checker"
          data-inspection-state={inspecting ? 'checking' : inspection?.state ?? 'idle'}>
          <summary>ПРОВЕРИТЬ СКАЧАННЫЙ JSON / GZIP</summary>
          <label htmlFor="bf-verify-local-backup">Выбери резервную копию с устройства. Файл останется в этом браузере.</label>
          <input id="bf-verify-local-backup" data-action="inspect-progress-file"
            type="file" accept=".json,.gz,application/json,application/gzip" disabled={disabled || inspecting || staging}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void inspectFile(file);
            }}/>
          <p role="status" aria-live="polite" data-inspection-result={inspection?.state ?? 'idle'}>
            {inspecting ? 'Проверяем структуру файла без отправки…'
              : inspection?.message ?? 'Проверка только читает JSON: текущий прогресс не изменяется.'}
          </p>
          {inspection && inspection.state !== 'invalid' && (
            <small>Дата копии: {inspection.exportedAt ? new Date(inspection.exportedAt).toLocaleString('ru-RU') : '—'}.
              Записей тренировок: {inspection.workouts}; журнал: {inspection.journalRecords};
              долговременное хранилище: {inspection.durableRecords}; карантин: {inspection.quarantineRecords}.</small>
          )}
          {preview?.incoming && (
            <div className="progress-import-preview" data-import-preview={preview.state}>
              <p role="status">{preview.state === 'blocked'
                ? 'Копия требует дополнительного разбора. Замена недоступна.'
                : 'Предварительный просмотр готов. Текущий прогресс не изменён.'}</p>
              <table aria-label="Сравнение текущего прогресса и резервной копии">
                <thead><tr><th scope="col">Показатель</th><th scope="col">Сейчас</th><th scope="col">В копии</th></tr></thead>
                <tbody>
                  {([
                    ['XP', 'xp'], ['Монеты', 'coins'], ['Всего тренировок', 'workouts'],
                    ['Записей в истории', 'availableWorkouts'], ['Повторения', 'repetitions'],
                    ['Планка, сек.', 'holdSeconds'], ['Этаж Башни', 'towerFloor'], ['Костюмы', 'ownedOutfits'],
                  ] as const).map(([label, field]) => (
                    <tr key={field}><th scope="row">{label}</th><td>{preview.current[field].toLocaleString('ru-RU')}</td>
                      <td>{preview.incoming![field].toLocaleString('ru-RU')}</td></tr>
                  ))}
                </tbody>
              </table>
              <small>Совпадение бойца: {preview.identity === 'same' ? 'по локальному ID'
                : preview.identity === 'different' ? 'другой ID' : 'не установлено'}.
                Записанных квитанций выплат: {preview.recordedGrants}.</small>
            </div>
          )}
          {preview && preview.warnings.length > 0 && (
            <ul className="progress-import-warnings" data-import-warnings>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
          )}
          {plan && <div className="progress-backup-actions">
            {!confirming ? <button type="button" data-action="request-file-replacement" disabled={disabled}
            onClick={() => setConfirming(true)}>Перейти к замене…</button> : <div role="group" aria-label="Подтверждение замены">
            <p>Основной профиль и резервная копия будут заменены данными выбранного файла. На следующем экране можно оставить новую копию или вернуть обе прежние.</p>
            <button type="button" data-action="confirm-file-replacement" disabled={disabled || staging}
              onClick={() => { void confirmReplacement(); }}>{staging ? 'Проверяем сохранение…' : 'Подтвердить замену'}</button>
            </div>}
          </div>}
          {importMessage && <p role="status">{importMessage}</p>}
          {(inspecting || preview) && <button type="button" className="progress-import-cancel"
            data-action="cancel-import-preview" onClick={invalidateImport}>ОТМЕНИТЬ ПРОСМОТР</button>}
          <small>Просмотр файла сам по себе не изменяет прогресс.
            Не удаляй данные браузера без проверенной полной копии и плана восстановления.</small>
        </details>
      </div>
      <div className="progress-backup-actions">
        {status === 'ready'
          ? <button type="button" data-action="download-progress" disabled={disabled} onClick={download}>
              {prepared?.capacity === 'oversize' ? 'СКАЧАТЬ JSON ДЛЯ РАЗБОРА' : 'СКАЧАТЬ ПОДГОТОВЛЕННЫЙ JSON'}
            </button>
          : <button type="button" data-action="prepare-progress" disabled={disabled || status === 'preparing'}
              onClick={() => { void prepare(); }}>
              {status === 'preparing' ? 'ЧИТАЕМ СОХРАНЕНИЯ…' : 'ПОДГОТОВИТЬ РЕЗЕРВНУЮ КОПИЮ'}
            </button>}
        {prepared && <div data-archive-stage={archive ? 'ready' : compressing ? 'preparing' : 'idle'}>
          {archive ? <>
            <button type="button" data-action="download-progress-archive" disabled={disabled} onClick={downloadArchive}>
              {archive.inspectableSize ? 'СКАЧАТЬ GZIP' : 'СКАЧАТЬ GZIP ДЛЯ РАЗБОРА'}
            </button>
            <small data-archive-bytes={archive.blob.size}>
              Архив: {formatStorageBytes(archive.blob.size)} вместо {formatStorageBytes(archive.sourceBytes)}.
              {' '}{archive.inspectableSize ? 'Размер распакованного JSON допустим для проверки.'
                : 'Распакованный JSON больше 16 МиБ; встроенная проверка недоступна.'}
            </small>
          </> : <button type="button" data-action="prepare-progress-archive" disabled={disabled || compressing}
            onClick={() => { void prepareArchive(); }}>{compressing ? 'СЖИМАЕМ И ПРОВЕРЯЕМ…' : 'ПОДГОТОВИТЬ GZIP'}</button>}
        </div>}
        {prepared && <details className="progress-checkpoint-preview" data-checkpoint-preview={checkingCheckpoints ? 'checking' : checkpointPreview?.status ?? 'idle'}>
          <summary>ОЦЕНКА СЖАТИЯ ЖУРНАЛА</summary>
          <small>Проверка до 64 завершённых записей из подготовленного JSON. Ничего не меняет в базе.</small>
          <button type="button" data-action="estimate-journal-checkpoints" disabled={disabled || checkingCheckpoints || !prepared.complete}
            onClick={() => { void estimateCheckpoints(); }}>
            {checkingCheckpoints ? 'ПРОВЕРЯЕМ…' : 'ОЦЕНИТЬ СЖАТИЕ'}
          </button>
          {checkpointPreview && <div role="status">
            {checkpointPreview.status === 'ready' || checkpointPreview.status === 'not-smaller' ? <>
              <p data-checkpoint-sample={checkpointPreview.sampleCount}>
                Проверено {checkpointPreview.sampleCount} из {checkpointPreview.settledCount} завершённых записей.
              </p>
              <p data-checkpoint-original={checkpointPreview.originalBytes} data-checkpoint-packed={checkpointPreview.packedBytes}>
                Исходный объём: {formatStorageBytes(checkpointPreview.originalBytes)}.
                {' '}Компактное представление: {formatStorageBytes(checkpointPreview.packedBytes)}.
              </p>
              <small>{checkpointPreview.status === 'ready' ? 'Исходные данные восстановлены без потерь.'
                : 'Для этой выборки заметной экономии нет.'} Это сравнение форматов, не свободное место на устройстве.</small>
            </> : <small>{checkpointPreview.status === 'empty' ? 'В копии пока нет завершённых записей журнала.'
              : checkpointPreview.status === 'too-large' ? 'Выборка превышает безопасный объём проверки.'
              : 'Оценка недоступна. Исходные сохранения не изменены.'}</small>}
          </div>}
        </details>}
        {prepared && <small data-backup-capacity={prepared.capacity} data-backup-bytes={prepared.byteLength}>
          Размер JSON: {formatStorageBytes(prepared.byteLength)}. {prepared.capacity === 'near-limit'
            ? 'Приближается к пределу встроенной проверки 16 МиБ.' : prepared.capacity === 'oversize'
              ? 'Встроенная проверка недоступна.' : 'В пределах ограничения размера проверки.'}
          {!prepared.complete && ' Не все источники прочитаны согласованно.'}
        </small>}
        <p role="status" aria-live="polite" data-backup-status={status}>{message}</p>
      </div>
    </section>
  );
}
