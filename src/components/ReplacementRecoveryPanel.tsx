import { useEffect, useRef, useState, type ReactNode } from 'react';
import { readReplacementRecovery, restoreInterruptedReplacement, downloadReplacementEvidence,
  type ReplacementRecoveryView } from '../lib/profileReplacementRecovery';

interface Props { disabled: boolean; onResolved: () => void; exportSession: ReactNode }

/** Only recovery of an existing marker. Forward import is deliberately absent. */
export default function ReplacementRecoveryPanel({ disabled, onResolved, exportSession }: Props) {
  const [view, setView] = useState<ReplacementRecoveryView | null>(null);
  const [confirm, setConfirm] = useState<{ marker: string; action: 'keep' | 'rollback' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  function begin() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    return { controller, request: ++generation.current };
  }
  useEffect(() => {
    if (disabled) {
      setConfirm(null);
      setBusy(false);
      setView(null);
      return;
    }
    const { controller, request } = begin();
    void readReplacementRecovery(controller.signal).then(result => {
      if (generation.current === request && !controller.signal.aborted) setView(result);
    });
    return () => { generation.current++; active.current?.abort(); };
  }, [disabled]);
  async function refresh() {
    if (disabled) return;
    setConfirm(null);setMessage('');setBusy(true);
    const { controller, request } = begin();
    const result = await readReplacementRecovery(controller.signal);
    if (request !== generation.current || controller.signal.aborted) return;
    setView(result);setBusy(false);
  }
  async function restore() {
    if (disabled || busy || confirm === null || confirm.marker !== view?.marker) return;
    const expected = confirm;
    const { controller, request } = begin();
    setConfirm(null);setBusy(true);setMessage('');
    const result = await restoreInterruptedReplacement(expected.marker, expected.action, controller.signal);
    if (request !== generation.current || controller.signal.aborted) return;
    setBusy(false);
    if (result.status === 'rolled-back' || result.status === 'finalized') {
      setView({state:'none',marker:null});
      setMessage(result.status === 'finalized' ? 'Новая копия принята. Теперь можно открыть игру.' : 'Исходный профиль и резервная копия восстановлены. Теперь можно открыть игру.');
      return;
    }
    setView(null);
    setMessage('Операция не подтверждена. Сохрани исходные данные для разбора. Проверь состояние ещё раз.');
  }
  const canRestore = view?.marker != null && (view.state === 'staged' || view.state === 'applied');
  return <main className="storage-recovery" data-storage-status="unavailable" data-replacement-recovery={view?.state ?? 'checking'}>
    <section className="storage-panel" aria-labelledby="replacement-title">
      <span className="section-index">BODYFORGE / ЗАЩИТА ПРОГРЕССА</span>
      <h1 id="replacement-title">НЕЗАВЕРШЁННАЯ ЗАМЕНА СОХРАНЕНИЯ</h1>
      <p role="status">Обычные тренировки и запись прогресса приостановлены. Можно вернуть профиль и резервную копию к состоянию до замены. Полностью записанную копию можно оставить после проверки истории наград.</p>
      {disabled && <p role="alert">Есть незавершённая запись тренировки или другая операция. Сначала сохрани данные этой страницы. Откат пока заблокирован.</p>}
      {view?.state === 'conflict' && <p role="alert">Запись повреждена, данные изменились или журнал не пуст. Автоматического исправления нет. Сохрани исходные данные для разбора.</p>}
      {view?.state === 'unavailable' && <p role="alert">Не удалось проверить локальные хранилища. Не удаляй данные браузера.</p>}
      {message && <p role="status" data-replacement-message>{message}</p>}
      {view?.marker != null && <button type="button" data-action="export-replacement-evidence" disabled={busy}
        onClick={() => { try { downloadReplacementEvidence(view.marker!); setMessage('Запрос скачивания передан браузеру. Проверь папку загрузок.'); }
          catch { setMessage('Не удалось запросить скачивание.'); } }}>СКАЧАТЬ ИСХОДНЫЕ ДАННЫЕ ЗАМЕНЫ</button>}
      {canRestore && (confirm === null
        ? <><button type="button" className="forge-solid-button" data-action="request-replacement-rollback" disabled={disabled || busy}
          onClick={() => setConfirm({ marker: view!.marker!, action: 'rollback' })}>ВЕРНУТЬ СОХРАНЕНИЕ ДО ЗАМЕНЫ…</button>
          {view?.state === 'applied' && <button type="button" disabled={disabled || busy} data-action="request-replacement-keep"
            onClick={() => setConfirm({ marker: view.marker!, action: 'keep' })}>ОСТАВИТЬ НОВУЮ КОПИЮ…</button>}</>
        : <div role="group" aria-label="Подтверждение выбора сохранения">
          <p>{confirm.action === 'keep' ? 'Игра откроется с новой копией. Возможность вернуть прежний профиль с этого экрана будет удалена.' : 'Будут восстановлены точные исходные данные до импорта. Новая копия не будет принята; файл на устройстве не изменится.'}</p>
          <button type="button" data-action={`confirm-replacement-${confirm.action}`} disabled={disabled || busy}
            onClick={() => { void restore(); }}>{confirm.action === 'keep' ? 'ПРИНЯТЬ НОВУЮ КОПИЮ' : 'ПОДТВЕРЖДАЮ ОТКАТ'}</button>
          <button type="button" data-action={`cancel-replacement-${confirm.action}`} disabled={busy} onClick={() => setConfirm(null)}>Отмена</button>
        </div>)}
      {view?.state === 'none'
        ? <button type="button" className="forge-solid-button" data-action="open-restored-profile" disabled={disabled || busy} onClick={onResolved}>ОТКРЫТЬ СОХРАНЕНИЕ</button>
        : <button type="button" data-action="refresh-replacement-recovery" disabled={disabled || busy} onClick={() => { void refresh(); }}>Проверить состояние ещё раз</button>}
      {exportSession}
      <small>Данные остаются на устройстве. Не очищай хранилище браузера.</small>
    </section>
  </main>;
}
