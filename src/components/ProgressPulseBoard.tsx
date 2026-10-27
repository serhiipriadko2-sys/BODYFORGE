import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowUpRight, ChartNoAxesCombined, ChevronDown, Dumbbell, Footprints,
  Gauge, Shield, Target, TrendingUp, Zap,
} from 'lucide-react';
import { getLevel, getLevelProgress, type Profile } from '../lib/progression';
import { fighterSkillMeters, fighterUpgradeFraction, weeklySessionLine } from '../lib/dashboardDisplay';
import { comparePulsePeriods, type PulseRange } from '../lib/progressPulse';

const RINGS = [76, 56, 36] as const;
const RING_COLORS = ['#baff38', '#29c9ff', '#d27aff'];
const icons = { core: Target, back: Shield, arms: Dumbbell, legs: Footprints } as const;

export default function ProgressPulseBoard({ profile, now, onTraining, onAvatar }: {
  profile: Profile; now: Date; onTraining: () => void; onAvatar: () => void;
}) {
  const [range, setRange] = useState<PulseRange>(7);
  const [selectedDate, setSelectedDate] = useState('');
  const dateStrip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The 30-day strip has horizontal scroll; show today's chip on switching.
    if (range === 30 && dateStrip.current) dateStrip.current.scrollLeft = dateStrip.current.scrollWidth;
  }, [range]);
  const { current: trend, previous, deltaSessions, historyLimited } =
    comparePulsePeriods(profile.workouts, now, range);
  const chart = weeklySessionLine(trend.days);
  const selected = trend.days.find(day => day.date === selectedDate) ?? trend.days.at(-1);
  const changeLabel = historyLimited
    ? 'Сравнение недоступно: видимая история ограничена'
    : trend.sessions === 0 && previous.sessions === 0
      ? 'Нет завершённых подходов в обоих периодах'
      : deltaSessions === 0
        ? 'Столько же подходов, сколько в прошлом периоде'
        : `${deltaSessions > 0 ? '+' : ''}${deltaSessions} подходов к прошлому периоду`;
  const muscles = fighterSkillMeters(profile.game.muscles);
  const overall = fighterUpgradeFraction(profile.game.muscles);
  const upgradePercent = Math.round(overall * 100);
  const xp = Math.max(0, profile.xp);
  const level = getLevel(xp);
  const levelProgress = getLevelProgress(xp);
  const levelPercent = Math.round(levelProgress * 100);

  return (
    <section id="pulse-progress" className="pulse-dashboard" aria-label="Достоверный прогресс BODYFORGE">
      <header className="pulse-head">
        <div>
          <span className="pulse-eyebrow"><i aria-hidden="true"/> ТВОЙ ПУЛЬС · BODYFORGE</span>
          <h2>ПРОГРЕСС <em>БОЙЦА</em></h2>
          <p>Развитие героя по игровым улучшениям и подтверждённым тренировкам.</p>
        </div>
        <span className="pulse-head-mark"><TrendingUp size={16}/> LIVE DATA</span>
      </header>

      <article className="pulse-ring-card" aria-label="Игровые улучшения тела">
        <div className="pulse-card-heading"><Gauge size={19}/> ОБЩИЙ ПРОГРЕСС <span className="pulse-heading-side">УЛУЧШЕНИЯ / 20</span></div>
        <div className="pulse-ring-layout">
          <div className="pulse-gauge" role="img" data-pulse-percent={upgradePercent}
            aria-label={`Приобретено ${muscles.reduce((a,m)=>a+m.level,0)} из 20 улучшений. Корпус ${muscles[0].level} из 5, спина ${muscles[1].level} из 5, руки ${muscles[2].level} из 5`}>
            <svg viewBox="0 0 220 220" aria-hidden="true">
              <defs>
                <filter id="pulse-halo" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="4" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              {RINGS.map((r,index)=>{
                const progress=muscles[index].progress;
                const c=2*Math.PI*r;
                return <g key={r}>
                  <circle cx="110" cy="110" r={r} fill="none" stroke="#253449"
                    strokeWidth={index === 0 ? 12 : 11} opacity=".9"/>
                  {progress>0 && <circle cx="110" cy="110" r={r} fill="none"
                    stroke={RING_COLORS[index]} strokeWidth={index === 0 ? 12 : 11}
                    strokeDasharray={c} strokeDashoffset={c*(1-progress)}
                    transform="rotate(-90 110 110)" strokeLinecap="round" filter="url(#pulse-halo)"/>}
                </g>;
              })}
            </svg>
            <div className="pulse-gauge-label">
              <strong>{upgradePercent}<span>%</span></strong>
              <small>УСИЛЕНИЯ</small>
              <span>{muscles.reduce((sum,m)=>sum+m.level,0)} / 20</span>
            </div>
          </div>
          <div className="pulse-muscle-list" aria-label="Развитие мышц">
            {muscles.map(meter=>{
              const Icon=icons[meter.id];
              return <div className="pulse-muscle" key={meter.id} data-muscle={meter.id}
                data-muscle-level={meter.level}>
                <span className="pulse-muscle-icon" style={{'--muscle-color':meter.color} as React.CSSProperties}><Icon size={19}/></span>
                <div className="pulse-muscle-detail">
                  <div className="pulse-muscle-top">
                    <strong>{meter.label}</strong>
                    <span>{Math.round(meter.progress*100)}%</span>
                  </div>
                  <div className="pulse-muscle-bottom"><small>Ур. {meter.level} из 5</small></div>
                  <div className="pulse-muscle-rail" role="progressbar"
                    aria-label={`Усиление: ${meter.label}`} aria-valuenow={meter.level}
                    aria-valuemin={0} aria-valuemax={5}>
                    <span style={{width:`${meter.progress*100}%`,backgroundColor:meter.color}}/>
                  </div>
                </div>
              </div>;
            })}
          </div>
        </div>
        <p className="pulse-disclaimer">Индикаторы отражают игровые улучшения, а не медицинскую оценку мышц.</p>
      </article>

      <article className="pulse-trend-card" aria-label="Активность тренировок">
        <div className="pulse-card-heading pulse-trend-heading">
          <ChartNoAxesCombined size={20}/> АКТИВНОСТЬ ТРЕНИРОВОК
          <label className="pulse-range-control">
            <span className="sr-only">Период активности</span>
            <select id="pulse-activity-range" aria-label="Период активности"
              data-pulse-range={range} value={range}
              onChange={event => {
                setRange(event.target.value === '30' ? 30 : 7);
                setSelectedDate('');
              }}>
              <option value="7">За последние 7 дней</option>
              <option value="30">За последние 30 дней</option>
            </select>
            <ChevronDown size={16} aria-hidden="true"/>
          </label>
        </div>
        <div className="pulse-chart-summary" data-period-sessions={trend.sessions}
          data-weekly-sessions={range === 7 ? trend.sessions : undefined}>
          <strong>{trend.sessions}</strong>
          <span>{trend.sessions === 1 ? 'полный подход' : 'полных подходов'} · {trend.reps} повторений{trend.holdSeconds ? ` · ${trend.holdSeconds} сек. планки` : ''}</span>
        </div>
        <div className="pulse-comparison" data-pulse-delta={historyLimited ? 'unavailable' : deltaSessions}
          data-prior-sessions={previous.sessions} aria-label={changeLabel}>
          <TrendingUp size={14} aria-hidden="true"/>
          <span>{changeLabel}</span>
        </div>
        <div className="pulse-linechart" role="img" data-chart-points={chart.points.length}
          aria-label={`Активность за ${range} дней. Всего ${trend.sessions} завершённых подходов. Выбери дату под графиком для подробностей.`}>
          <svg viewBox="0 0 800 215" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="pulse-chart-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#adff33" stopOpacity=".27"/>
                <stop offset="95%" stopColor="#adff33" stopOpacity="0"/>
              </linearGradient>
            </defs>
            {chart.ticks.map((tick,i)=>{
              const y=26+(i*149/2);
              return <g key={tick}>
                <line x1="42" x2="760" y1={y} y2={y} stroke="#395169"
                  strokeDasharray="3 7" strokeOpacity=".55"/>
                <text x="5" y={y+5} fill="#9bafc4" fontSize="16">{tick}</text>
              </g>;
            })}
            {chart.points.filter(p => p.tick).map(p=><line key={p.date} x1={p.x} x2={p.x} y1="26" y2="175"
              stroke="#436077" strokeDasharray="3 8" opacity=".42"/>)}
            {chart.area && <path d={chart.area} fill="url(#pulse-chart-fill)" />}
            {chart.path && <path d={chart.path} fill="none" stroke="#b7ff3f"
              strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
              filter="drop-shadow(0px 0px 5px #aaff3755)" />}
            {chart.points.map(p=><circle key={p.date} cx={p.x} cy={p.y}
              r={selected?.date === p.date ? 7 : range === 30 ? 3.6 : 5.5}
              stroke={selected?.date === p.date ? '#ffffff' : '#e2ff9c'}
              strokeWidth={selected?.date === p.date ? 3 : 1.8} fill="#beff43"/>)}
            {chart.points.filter(p => p.tick).map(p=><text key={p.date} x={p.x} y="205" fill="#b6c5d8"
              fontSize="16" textAnchor="middle">{p.tick}</text>)}
          </svg>
        </div>
        <div className="pulse-date-strip" role="group" aria-label="Выбрать день графика"
          data-period={range} ref={dateStrip}>
          {trend.days.map(day => (
            <button type="button" key={day.date} data-pulse-date={day.date}
              className={`pulse-date-button${selected?.date === day.date ? ' is-selected' : ''}`}
              aria-pressed={selected?.date === day.date}
              aria-label={`${day.date.split('-').reverse().join('.')}: ${day.sessions} завершённых подходов`}
              onClick={() => setSelectedDate(day.date)}>
              <span>{day.label}</span>
              <small>{day.date.slice(8, 10)}<span>.{day.date.slice(5, 7)}</span></small>
            </button>
          ))}
        </div>
        <div className="pulse-day-detail" role="status" aria-live="polite" aria-atomic="true"
          data-selected-day={selected?.date ?? ''}>
          <div><span>ВЫБРАННЫЙ ДЕНЬ</span>
            <strong>{selected ? selected.date.split('-').reverse().join('.') : '—'}</strong>
          </div>
          <div className="pulse-day-values">
            <strong data-selected-sessions={selected?.sessions ?? 0}>{selected?.sessions ?? 0} подходов</strong>
            <span>{selected?.reps ?? 0} повторений{selected?.holdSeconds ? ` · ${selected.holdSeconds} сек. планки` : ''}</span>
          </div>
        </div>
        <p className="pulse-data-note">{trend.sessions === 0
          ? 'Записанных подходов пока нет — график показывает ноль.'
          : 'График строится только по завершённым и сохранённым подходам.'}
          {historyLimited ? ' · История ограничена последними 60 тренировками; сравнение периодов отключено.' : ''}
        </p>
      </article>

      <article className="pulse-xp-card" aria-label={`Уровень ${level}, ${levelPercent}% опыта до следующего уровня`}>
        <div className="pulse-xp-top">
          <div className="pulse-level-medal"><span>{level}</span></div>
          <div className="pulse-xp-heading">
            <strong>Уровень {level}</strong>
            <span>Опыт: {xp%250} / 250 XP</span>
          </div>
          <span className="pulse-xp-legend">ТВОЯ СЛЕДУЮЩАЯ ЗАКАЛКА <ArrowUpRight size={16}/></span>
        </div>
        <div className="pulse-xp-track" role="progressbar" aria-valuenow={xp%250}
          aria-valuemax={250} aria-valuemin={0} aria-label="Опыт до следующего уровня">
          <span style={{width:`${levelProgress*100}%`}}/>
        </div>
      </article>

      <div className="pulse-metric-grid">
        <div className="pulse-metric"><Dumbbell size={18}/><span>ПОВТОРОВ ЗА {range} ДНЕЙ</span>
          <strong data-period-reps={trend.reps} data-weekly-reps={range === 7 ? trend.reps : undefined}>
            {trend.reps}
          </strong>{trend.holdSeconds > 0 && <small data-period-plank-seconds={trend.holdSeconds}>{trend.holdSeconds} сек. планки</small>}</div>
        <div className="pulse-metric"><Activity size={18}/><span>АКТИВНЫХ ДНЕЙ</span>
          <strong data-active-days={trend.activeDays}>{trend.activeDays}<small>/{range}</small></strong></div>
        <div className="pulse-metric pulse-metric-action"><Zap size={18}/><span>СЛЕДУЮЩИЙ ШАГ</span>
          <button type="button" onClick={onTraining}>Тренировка <ArrowUpRight size={15}/></button>
          <button type="button" onClick={onAvatar}>Герой <ArrowUpRight size={15}/></button>
        </div>
      </div>
    </section>
  );
}
