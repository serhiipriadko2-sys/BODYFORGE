import { useEffect, useState } from 'react';
import { BookOpen, Footprints, Smartphone } from 'lucide-react';
import { localDay } from '../lib/game';
import { MANUAL_STEPS_KEY, MAX_MANUAL_STEPS, readManualSteps, saveManualSteps } from '../lib/stepsLog';

interface Props { now: Date }
export default function StepsBoard({ now }: Props) {
  const [state, setState] = useState(() => readManualSteps(now));
  const [draft, setDraft] = useState(() => String(readManualSteps(now).data.count));
  const [message, setMessage] = useState('');
  const day = localDay(now);

  useEffect(() => {
    const refresh = () => {
      const next = readManualSteps(new Date());
      setState(next);
      setDraft(String(next.data.count));
    };
    refresh();
    const changed = (event: StorageEvent) => {
      if (event.key === MANUAL_STEPS_KEY || event.key === null) refresh();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [day]);

  function save() {
    if (!/^\d{1,6}$/.test(draft) || !Number.isSafeInteger(Number(draft)) ||
      Number(draft) > MAX_MANUAL_STEPS) {
      setMessage('Введи целое количество от 0 до 100 000.');
      return;
    }
    if (!saveManualSteps(new Date(), Number(draft))) {
      setMessage('Запись не сохранилась. Проверь память браузера.');
      return;
    }
    setState(readManualSteps(new Date()));
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
          value={draft} onChange={(event) => setDraft(event.target.value)}
          aria-describedby="bf-steps-privacy" />
        <button type="button" onClick={save}>ЗАПИСАТЬ</button>
      </div>
      {message && <p className="bf-trust-note" role="status">{message}</p>}
      {state.status !== 'ready' && <p className="bf-trust-note" role="alert">{state.status === 'invalid'
        ? 'Предыдущая запись повреждена. Только явное сохранение заменит её.'
        : 'Память браузера недоступна; шаги могут не сохраняться.'}</p>}
      <p className="bf-panel-description" id="bf-steps-privacy">Шаги не синхронизируются автоматически, не отправляются на сервер и <strong>не дают XP, монет или ресурсов</strong>. Завтра дневной счётчик обнулится. Это личная заметка, а не проверенный результат.</p>
      <div className="bf-step-android"><Smartphone size={18}/><div><strong>HEALTH CONNECT · ЕЩЁ НЕ ПОДКЛЮЧЁН</strong>
        <span>Для автоматических шагов понадобится отдельная Android-версия и твоё разрешение на чтение шагов. В веб-приложении доступен только ручной ввод.</span></div></div>
    </section>
  );
}
