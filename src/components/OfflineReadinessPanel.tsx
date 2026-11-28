import { useEffect, useMemo, useRef, useState } from 'react';
import {
  browserOfflineEnvironment, createOfflineClient, OFFLINE_VERSION_LIMIT,
  type OfflineObservation,
} from '../lib/offlineClient';

const labels: Record<OfflineObservation['phase'], string> = {
  unobserved: 'Готовность ещё не проверена.',
  unsupported: 'Включение пока доступно только в локальной production-сборке. Dev-режим, Android WebView и публичный сайт не затрагиваются.',
  unprepared: 'Файлы для автономной игры ещё не подготовлены.',
  installing: 'Браузер подготавливает или активирует файлы. Проверь состояние после завершения загрузки.',
  'needs-reopen': 'Файлы проверены, но эта вкладка ещё не управляется автономным режимом. Заверши тренировку, сохрани прогресс, закрой и снова открой игру.',
  ready: 'Файлы этой версии проверены, текущая вкладка подключена к автономному режиму.',
  'repair-needed': 'Автономные файлы отсутствуют или повреждены. Для восстановления нужна сеть.',
  conflict: 'Обнаружен другой или несовместимый Service Worker. Ничего не изменено.',
  unknown: 'Не удалось подтвердить состояние. Проверь ещё раз; готовность не подтверждена.',
  'space-low': 'По оценке браузера свободного места недостаточно. Освободи место вне данных BODYFORGE и повтори проверку.',
  'space-unknown': 'Браузер не смог оценить свободное место. Подготовка не начата.',
  offline: 'Нет подключения к интернету. Подготовка не начата.',
  released: 'Запрос отключения принят. Заверши тренировку, закрой все вкладки и окна BODYFORGE, затем открой игру с интернетом. Сохранения и кэш не очищались.',
  busy: 'Другая операция уже выполняется или сейчас недоступна. Проверь состояние позже.',
};

export default function OfflineReadinessPanel({ disabled }: { disabled: boolean }) {
  const client = useMemo(() => createOfflineClient(browserOfflineEnvironment()), []);
  const [observation, setObservation] = useState<OfflineObservation>({ phase: client.supported ? 'unobserved' : 'unsupported' });
  const [working, setWorking] = useState(false);
  const [confirm, setConfirm] = useState<'disable' | 'cleanup' | null>(null);
  const mounted = useRef(false);
  const running = useRef(false);
  const blocked = useRef(disabled);
  blocked.current = disabled;

  useEffect(() => {
    mounted.current = true;
    if (!client.supported) return () => { mounted.current = false; };
    const invalidate = () => {
      if (!running.current) {
        setObservation(previous => previous.phase === 'released' ? previous : { phase: 'unobserved' });
        setConfirm(null);
      }
    };
    const service = navigator.serviceWorker;
    service.addEventListener('controllerchange', invalidate);
    document.addEventListener('visibilitychange', invalidate);
    window.addEventListener('online', invalidate);
    window.addEventListener('offline', invalidate);
    return () => {
      mounted.current = false;
      service.removeEventListener('controllerchange', invalidate);
      document.removeEventListener('visibilitychange', invalidate);
      window.removeEventListener('online', invalidate);
      window.removeEventListener('offline', invalidate);
    };
  }, [client]);

  // Display an observation, not a durable promise. Cache eviction can occur
  // without a browser event, so expire a positive observation while open.
  useEffect(() => {
    if (!observation.observedAt) return;
    const timer = window.setTimeout(() => {
      if (!running.current) {
        setObservation(previous => previous === observation ? { phase: 'unobserved' } : previous);
        setConfirm(null);
      }
    }, Math.max(0, observation.observedAt + 60000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [observation]);

  async function run(action: 'check' | 'prepare' | 'repair' | 'disable' | 'cleanup') {
    if (running.current || blocked.current || !client.supported) return;
    const permitted = () => mounted.current && !blocked.current && document.visibilityState === 'visible';
    if (!permitted()) return;
    running.current = true;
    setWorking(true);
    setConfirm(null);
    setObservation({ phase: 'unobserved' });
    try {
      const next = action === 'check' ? await client.inspect() : await client.act(action, permitted);
      if (mounted.current) setObservation(next);
    } finally {
      running.current = false;
      if (mounted.current) setWorking(false);
    }
  }

  const phase = observation.phase;
  const locked = disabled || working || !client.supported;
  const canDisable = ['ready', 'needs-reopen', 'repair-needed', 'unknown'].includes(phase) && !observation.updatePending;
  const capacity = observation.capacity;
  const canCleanup = phase === 'ready' && !observation.updatePending && !!capacity?.currentPresent && capacity.count > 1;
  return (
    <details className="bf-faq-item" data-help-topic="offline-readiness"
      data-offline-state={working ? 'working' : phase}>
      <summary>Автономная игра / без интернета</summary>
      <p>Экспериментальный локальный режим. Файлы игры, модели и распознавания движений проверяются до использования. Включение не отправляет сохранения или видео.</p>
      <p>Для подготовки требуется интернет и не менее 144 МиБ свободного места по оценке браузера. Браузер может удалить автономные файлы или данные сайта; отдельно храни резервную копию прогресса.</p>
      <p role="status" aria-live="polite">
        <strong>{working ? 'Выполняется проверка или подготовка…' : labels[phase]}</strong>
        {!working && observation.cache && <>
          {' '}{observation.cache.count} файлов, {(observation.cache.bytes / (1024 * 1024)).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МиБ.
          {' '}Проверено сейчас; статус обновляется вручную и истекает через минуту.
        </>}
      </p>
      {!working && observation.updatePending && <p data-offline-update="pending">Новая версия устанавливается или ожидает закрытия старых вкладок. Заверши тренировку и сохрани прогресс перед закрытием. Принудительного обновления нет.</p>}
      {!working && capacity && <p data-offline-capacity={capacity.count >= OFFLINE_VERSION_LIMIT ? 'full' : 'available'}>
        {"Найдено кэшей с именами версий BODYFORGE: "}{capacity.count}.
        {capacity.count >= OFFLINE_VERSION_LIMIT && <> {' ' }{"Лимит создания новых версий достигнут. Неопознанные или повреждённые кэши не удаляются. Не очищай данные сайта: сначала сохрани и проверь резервную копию."}</>}
      </p>}
      {!working && observation.cleanup && <p role="status" data-offline-cleanup={observation.cleanup.state}>
        {observation.cleanup.state === 'complete' ? "Других кэшей с именами версий больше не обнаружено." :
          observation.cleanup.state === 'partial' ? "Неподтверждённые версии сохранены." :
          observation.cleanup.state === 'blocked' ? "Очистка остановлена. Закрой другие окна игры, проверь активную версию." : "Результат очистки не подтверждён."}
        {typeof observation.cleanup.removed === 'number' && <> {' ' }{"Удалено: "}{observation.cleanup.removed}. {' ' }{"Осталось: "}{observation.cleanup.remaining}.</>}
      </p>}
      {client.supported && <>
        <p className="bf-goal-actions">
          <button type="button" className="bf-small-action" data-action="offline-check" disabled={locked} onClick={() => void run('check')}>Проверить состояние</button>
          {phase === 'unprepared' && <button type="button" className="bf-small-action" data-action="offline-prepare" disabled={locked} onClick={() => void run('prepare')}>Подготовить файлы</button>}
          {phase === 'repair-needed' && !observation.updatePending && <button type="button" className="bf-small-action" data-action="offline-repair" disabled={locked} onClick={() => void run('repair')}>Восстановить файлы</button>}
          {canCleanup && !confirm && <button type="button" className="bf-small-action" data-action="offline-cleanup" disabled={locked} onClick={() => setConfirm('cleanup')}>Очистить проверенные старые версии</button>}
          {canDisable && !confirm && <button type="button" className="bf-small-action" data-action="offline-disable" disabled={locked} onClick={() => setConfirm('disable')}>Отключить режим</button>}
        </p>
        {confirm === 'cleanup' && <>
          <p>Удаляются только старые кэши, чья версия подтверждена файлами. Сохранения и текущая версия не затрагиваются. Закрой другие окна игры.</p>
          <p className="bf-goal-actions">
            <button type="button" className="bf-small-action" data-action="offline-confirm-cleanup" disabled={locked || !canCleanup} onClick={() => void run('cleanup')}>Подтвердить очистку</button>
            <button type="button" className="bf-small-action" data-action="offline-cancel-cleanup" disabled={working} onClick={() => setConfirm(null)}>Отмена</button>
          </p>
        </>}
        {confirm === 'disable' && <>
          <p>Отключение не удаляет сохранения и файлы кэша. После подтверждения потребуется закрыть все окна игры.</p>
          <p className="bf-goal-actions">
            <button type="button" className="bf-small-action" data-action="offline-confirm-disable" disabled={locked} onClick={() => void run('disable')}>Подтвердить отключение</button>
            <button type="button" className="bf-small-action" data-action="offline-cancel-disable" disabled={working} onClick={() => setConfirm(null)}>Отмена</button>
          </p>
        </>}
      </>}
    </details>
  );
}
