import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Coins, Hammer, Minus, Plus, Target, Zap } from 'lucide-react';
import { completedSquatsToday, DAILY_PLAN_KEY, GOAL_INCREMENT, MAX_DAILY_REPS,
  readDailyPlan, saveDailyPlan } from '../lib/dailyPlan';
import type { Profile } from '../lib/progression';

interface Props { profile: Profile; now: Date; onTraining: () => void; }

export default function DailyPlanBoard({ profile, now, onTraining }: Props) {
  const [read, setRead] = useState(readDailyPlan);
  const [draft, setDraft] = useState(() => read.plan.targetReps);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const completed = completedSquatsToday(profile.workouts, now);
  const target = read.plan.targetReps;
  const percent = Math.min(100, Math.round((completed / target) * 100));
  const editor = useRef({ draft, target });
  editor.current = { draft, target };
  useEffect(() => {
    const sync = () => {
      const keepDraft = editor.current.draft !== editor.current.target;
      const next = readDailyPlan();
      setRead(next);
      if (keepDraft) {
        setMessage('Цель изменилась в другой вкладке. Твой черновик не заменён. Сохранение применит твой вариант вместо текущей цели.');
      } else {
        setDraft(next.plan.targetReps);
        setMessage('Цель обновлена из другой вкладки.');
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === DAILY_PLAN_KEY || event.key === null) sync();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function save() {
    if (!saveDailyPlan(draft)) {
      setMessage('Цель не сохранилась. Проверь доступность памяти браузера.');
      return;
    }
    // Acknowledge our own verified write. A later reader could already see
    // another tab's preference; its storage event will update this view.
    setRead({ status: 'ready', plan: { version: 1, targetReps: draft } });
    setEditing(false);
    setMessage('Цель сохранена на этом устройстве.');
  }

  return (
    <section className="forge-section bf-experience-section" id="daily-plan" aria-label="Личный план тренировок">
      <div className="bf-panel-heading"><span><Target size={18}/> ПЛАН НА СЕГОДНЯ</span><strong>ТВОИ ПОВТОРЕНИЯ</strong></div>
      <p className="bf-panel-description">Цель отдельна от игровых наград. Прогресс считается только по завершённым и сохранённым подходам камеры.</p>
      <div className="bf-goal-overview">
        <div><small>СОХРАНЕНО СЕГОДНЯ</small><strong data-goal-completed={completed}>{completed}</strong></div>
        <div className="bf-goal-divider" aria-hidden="true">/</div>
        <div><small>ЦЕЛЬ НА ДЕНЬ</small><strong data-goal-target={target}>{target}</strong></div>
        <div className="bf-goal-ring">{percent}%</div>
      </div>
      <div className="bf-goal-track" role="progressbar" aria-label="Выполнение плана" aria-valuemin={0}
        aria-valuemax={target} aria-valuenow={Math.min(completed, target)}>
        <div style={{ width: percent + '%' }}/>
      </div>
      <p className="bf-goal-status" role="status">{completed >= target
        ? 'Цель достигнута. Можно отдыхать или тренироваться дальше.'
        : 'Осталось ' + (target - completed) + ' повторений. Один камерный подход — 20 приседаний.'}</p>
      {editing && (
        <div className="bf-goal-editor" role="group" aria-label="Изменить цель на день">
          <button type="button" aria-label="Уменьшить цель на 20" disabled={draft <= GOAL_INCREMENT}
            onClick={() => setDraft((value) => Math.max(GOAL_INCREMENT, value - GOAL_INCREMENT))}><Minus size={21}/></button>
          <output aria-live="polite">{draft} <small>ПОВТОРОВ</small></output>
          <button type="button" aria-label="Увеличить цель на 20" disabled={draft >= MAX_DAILY_REPS}
            onClick={() => setDraft((value) => Math.min(MAX_DAILY_REPS, value + GOAL_INCREMENT))}><Plus size={21}/></button>
          <button type="button" className="bf-goal-save" onClick={save}>СОХРАНИТЬ ЦЕЛЬ</button>
          <button type="button" className="bf-goal-cancel" onClick={() => { setEditing(false); setDraft(target); setMessage(''); }}>ОТМЕНА</button>
        </div>
      )}
      {read.status !== 'ready' && <p className="bf-trust-note" role="alert">{read.status === 'invalid'
        ? 'Старая настройка цели повреждена. При сохранении новой она будет заменена.'
        : 'Хранилище браузера недоступно. Цель не гарантированно сохраняется.'}</p>}
      {message && <p className="bf-trust-note" role="status">{message}</p>}
      <div className="bf-goal-actions">
        <button type="button" className="bf-small-action" onClick={() => { setEditing((value) => !value); if (draft === target) setMessage(''); }}>
          {editing ? 'СКРЫТЬ РЕДАКТОР' : 'ИЗМЕНИТЬ ЦЕЛЬ'}
        </button>
        <button type="button" className="bf-gold-action" onClick={onTraining} disabled={!profile.game.created}>
          К ПРИСЕДАНИЯМ <ArrowRight size={17}/>
        </button>
      </div>
      <div className="bf-reward-flow" aria-label="Как работают награды">
        <span><Hammer size={16}/> 20 приседаний</span><ArrowRight size={14}/>
        <span><Zap size={16}/> +120 XP</span><ArrowRight size={14}/>
        <span><Coins size={16}/> +35 монет</span>
      </div>
    </section>
  );
}
