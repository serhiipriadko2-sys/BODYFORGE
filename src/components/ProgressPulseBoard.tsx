import { Activity, ArrowUpRight, Bolt, CalendarDays, Dumbbell, Gauge, TrendingUp } from 'lucide-react';
import { getLevel, getLevelProgress, type Profile } from '../lib/progression';
import { weeklyPulse } from '../lib/progressPulse';

const RADIUS = 66;
const PERIMETER = 2 * Math.PI * RADIUS;

export default function ProgressPulseBoard({ profile, now, onTraining, onAvatar }: {
  profile: Profile; now: Date; onTraining: () => void; onAvatar: () => void;
}) {
  const trend = weeklyPulse(profile.workouts, now);
  const progress = Math.max(0, Math.min(1, getLevelProgress(profile.xp)));
  const percent = Math.round(progress * 100);
  const lvl = getLevel(profile.xp);
  return (
    <section id="pulse-progress" className="pulse-dashboard" aria-label="Аналитика сохранённых тренировок">
      <div className="pulse-head">
        <div>
          <span className="pulse-eyebrow"><i aria-hidden="true"/> LIVE PROFILE · VERIFIED DATA</span>
          <h2>ТВОЙ <em>РИТМ.</em></h2>
          <p>Только сохранённые тренировки. Никаких придуманных измерений.</p>
        </div>
        <span className="pulse-head-mark"><TrendingUp size={19}/> 07 ДНЕЙ</span>
      </div>

      <div className="pulse-top-grid">
        <article className="pulse-ring-card">
          <div className="pulse-card-heading"><Gauge size={17}/> ПРОГРЕСС УРОВНЯ</div>
          <div className="pulse-ring-layout">
            <div className="pulse-gauge" data-pulse-percent={percent} role="img"
              aria-label={'Уровень ' + lvl + ', ' + percent + '% опыта до следующего уровня'}>
              <svg viewBox="0 0 168 168" aria-hidden="true">
                <circle cx="84" cy="84" r={RADIUS} fill="none" stroke="#253241" strokeWidth="15"/>
                <circle cx="84" cy="84" r={RADIUS} fill="none" stroke="var(--pulse-electric)" strokeWidth="15"
                  strokeDasharray={PERIMETER} strokeDashoffset={PERIMETER * (1 - progress)}
                  strokeLinecap="round" transform="rotate(-90 84 84)" />
                <circle cx="84" cy="84" r="48" fill="none" stroke="#567283" strokeWidth="1" strokeDasharray="3 9" opacity=".5"/>
              </svg>
              <div className="pulse-gauge-label"><small>LEVEL {String(lvl).padStart(2, '0')}</small><strong>{percent}<span>%</span></strong><small>{profile.xp % 250}/250 XP</small></div>
            </div>
            <div className="pulse-ring-copy"><strong>Сильнее с каждым подходом</strong>
              <p>До следующего уровня осталось {250 - (profile.xp % 250)} XP.</p>
              <button type="button" className="pulse-inline-link" onClick={onTraining}>
                К тренировке <ArrowUpRight size={17}/>
              </button>
            </div>
          </div>
        </article>

        <article className="pulse-trend-card">
          <div className="pulse-card-heading"><Activity size={17}/> НЕДЕЛЬНАЯ ДИНАМИКА</div>
          <div className="pulse-trend-total" data-weekly-sessions={trend.sessions}>
            <strong>{trend.sessions}</strong><span>полных подходов за 7 дней</span>
          </div>
          <div className="pulse-chart" role="img" aria-label={trend.days.map((d) =>
            d.date + ': ' + d.sessions + ' подходов, ' + d.reps + ' повторений').join('; ')}>
            {trend.days.map((day) =>
              <div className="pulse-chart-day" key={day.date} data-day={day.date} data-sessions={day.sessions}>
                <div className="pulse-chart-rail">
                  <span style={{ height: day.sessions ? Math.max(9, Math.round(day.sessions / Math.max(trend.peak, 1) * 100)) + '%' : '3px' }}
                    className={day.sessions ? 'pulse-chart-bar active' : 'pulse-chart-bar'} />
                </div>
                <small>{day.label}</small>
              </div>)}
          </div>
          <span className="pulse-data-note">История подтверждённых подходов{profile.workouts.length >= 60 ? ' · последние 60 записей' : ''}.</span>
        </article>
      </div>
      <div className="pulse-metric-grid">
        <article className="pulse-metric"><Dumbbell size={19}/><span>ПОВТОРОВ ЗА НЕДЕЛЮ</span>
          <strong data-weekly-reps={trend.reps}>{trend.reps}</strong><small>приседаний · подтверждено</small></article>
        <article className="pulse-metric"><CalendarDays size={19}/><span>АКТИВНЫХ ДНЕЙ</span>
          <strong data-active-days={trend.activeDays}>{trend.activeDays}<small> / 7</small></strong><small>по сохранённым сессиям</small></article>
        <article className="pulse-metric"><Bolt size={19}/><span>АРСЕНАЛ БОЙЦА</span>
          <strong className="pulse-avatar-cta">3D</strong>
          <button type="button" onClick={onAvatar}>Открыть редактор <ArrowUpRight size={15}/></button></article>
      </div>
    </section>
  );
}
