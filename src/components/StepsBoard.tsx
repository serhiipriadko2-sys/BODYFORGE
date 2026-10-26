import { useEffect, useRef, useState } from 'react';
import { BookOpen, Footprints, Smartphone } from 'lucide-react';
import { localDay } from '../lib/game';
import { MANUAL_STEPS_KEY, MAX_MANUAL_STEPS, readManualSteps, saveManualSteps } from '../lib/stepsLog';

interface Props { now: Date }
export default function StepsBoard({ now }: Props) {
  const [state, setState] = useState(() => readManualSteps(now));
  const [draft, setDraft] = useState(() => ({ value: String(state.data.count), day: state.data.day }));
  const [message, setMessage] = useState('');
  const day = localDay(now);
  const editor = useRef({ draft, count: state.data.count, status: state.status });
  editor.current = { draft, count: state.data.count, status: state.status };

  useEffect(() => {
    const refresh = (external = false) => {
      const next = readManualSteps(new Date());
      const sameDay = editor.current.draft.day === next.data.day;
      const dirty = editor.current.draft.value !== String(editor.current.count);
      const keepDraft = next.status !== 'date-conflict' && sameDay && dirty;
      setState(next);
      if (!keepDraft) setDraft({ value: String(next.data.count), day: next.data.day });
      if (next.status === 'date-conflict') setMessage('');
      else if (external) setMessage(keepDraft
        ? 'Запись изменилась в другой вкладке. Твой ввод не заменён. Нажми «Записать», только если хочешь заменить текущее значение.'
        : 'Запись обновлена из другой вкладки.');
      else if (!sameDay && dirty) setMessage('Местная дата изменилась. Несохранённый ввод за другой день не перенесён в сегодняшний счётчик.');
      else if (editor.current.status === 'date-conflict') setMessage('Дата проверена. Запись шагов снова доступна.');
    };
    refresh();
    const changed = (event: StorageEvent) => {
      if (event.key === MANUAL_STEPS_KEY || event.key === null) refresh(true);
    };
    window.addEventListener('storage', changed);
    // The editor can discover a clock change before App's day observer. Refresh
    // on return even if the parent still holds the same observed calendar key.
    const visible = () => { if (!document.hidden) refresh(); };
    const resumed = () => refresh();
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', resumed);
    window.addEventListener('pageshow', resumed);
    return () => {
      window.removeEventListener('storage', changed);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', resumed);
      window.removeEventListener('pageshow', resumed);
    };
  }, [day]);

  function save() {
    const savedAt = new Date();
    if (draft.day !== localDay(savedAt)) {
      const next = readManualSteps(savedAt);
      setState(next);
      setDraft({ value: String(next.data.count), day: next.data.day });
      setMessage('Местная дата изменилась. Запись за другой день не сохранена. Проверь дату и введи число заново для текущего дня.');
      return;
    }
    if (!/^\d{1,6}$/.test(draft.value) || !Number.isSafeInteger(Number(draft.value)) ||
      Number(draft.value) > MAX_MANUAL_STEPS) {
      setMessage('Введи целое количество от 0 до 100 000.');
      return;
    }
    if (!saveManualSteps(savedAt, Number(draft.value))) {
      const next = readManualSteps(savedAt);
      setState(next);
      setMessage(next.status === 'date-conflict'
        ? 'Сохранена запись с более поздней датой. Проверь дату и часовой пояс устройства; существующее число не заменено.'
        : 'Запись не сохранилась. Проверь память браузера.');
      return;
    }
    setState({ status: 'ready', data: { version: 1, day: localDay(savedAt), count: Number(draft.value), source: 'manual' } });
    setDraft({ value: String(Number(draft.value)), day: localDay(savedAt) });
    setMessage('Ручная запись обновлена только в этом браузере.');
  }

  return (
    <section className="forge-section bf-experience-section" id="step-log" aria-label="Ручной журнал шагов">
      <div className="bf-panel-heading"><span><Footprints size={18}/> ШАГИ / ПУТЬ БОЙЦА</span><strong>ДНЕВНИК ДВИЖЕНИЯ</strong></div>
      <div className="bf-step-summary">
        <div><small>СЕГОДНЯ · РУЧНАЯ ЗАПИСЬ</small><strong data-manual-steps={state.data.count}>{state.data.count.toLocaleString('ru-RU')}</strong><span>шагов, указанных тобой</span></div>
        <span className="bf-manual-label"><BookOpen size={14}/> НЕ АВТОЗАМЕР</span>
      </div>
      <label className="bf-step-label" htmlFor="bf-steps-today">Сколько шагов показывает телефон или часы?</label>
      <div className="bf-step-input-row">
        <input id="bf-steps-today" inputMode="numeric" type="number" min="0" max={MAX_MANUAL_STEPS}
          value={draft.value} onChange={(event) => setDraft({ value: event.target.value, day: state.data.day })}
          readOnly={state.status === 'date-conflict'}
          aria-describedby="bf-steps-privacy" />
        <button type="button" onClick={save} disabled={state.status === 'date-conflict'}>ЗАПИСАТЬ</button>
      </div>
      {message && <p className="bf-trust-note" role="status">{message}</p>}
      {state.status !== 'ready' && <p className="bf-trust-note" role="alert">{state.status === 'date-conflict'
        ? 'Сохранена запись за ' + state.recordDay + ', позже местной даты устройства. Она не удалена. Проверь дату и часовой пояс; запись шагов временно недоступна.'
        : state.status === 'invalid' ? 'Предыдущая запись повреждена. Только явное сохранение заменит её.'
        : 'Память браузера недоступна; шаги могут не сохраняться.'}</p>}
      <p className="bf-panel-description" id="bf-steps-privacy">Шаги не синхронизируются автоматически, не отправляются на сервер и <strong>не дают XP, монет или ресурсов</strong>. Завтра дневной счётчик обнулится. Это личная заметка, а не проверенный результат.</p>
      <div className="bf-step-android"><Smartphone size={18}/><div><strong>HEALTH CONNECT · ЕЩЁ НЕ ПОДКЛЮЧЁН</strong>
        <span>Для автоматических шагов понадобится отдельная Android-версия и твоё разрешение на чтение шагов. В веб-приложении доступен только ручной ввод.</span></div></div>
    </section>
  );
}
