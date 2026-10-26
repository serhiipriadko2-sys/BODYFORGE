import { ArrowUpRight, CalendarCheck2, Dumbbell, Shield, Sparkles, Target } from 'lucide-react';
import { nextTowerFloor, TOWER_FLOORS } from '../lib/game';
import type { Profile } from '../lib/progression';

interface Props {
  profile: Profile;
  disabled?: boolean;
  onTraining: () => void;
  onAvatar: () => void;
  onTower: () => void;
  onDaily: () => void;
}

/** Real destinations, rather than fantasy workouts not implemented by MediaPipe. */
export default function ForgeQuickDeck({ profile, disabled, onTraining, onAvatar, onTower, onDaily }: Props) {
  const skillTotal = Object.values(profile.game.muscles).reduce((a,b)=>a+b,0);
  const towerDone = Math.min(profile.game.highestClearedFloor, TOWER_FLOORS.length);
  const tower = nextTowerFloor(profile.game);
  const tiles = [
    { id: 'training', title: 'Приседания', subtitle: '20 повторений', kicker: 'КАМЕРА · ТРЕНИРОВКА',
      meta: 'Подсчёт движений', action: onTraining, glyph: Dumbbell, hint: 'Перейти к тренировке' },
    { id: 'hero', title: 'Герой', subtitle: 'Улучшай бойца', kicker: 'РАЗВИТИЕ · 3D',
      meta: `${skillTotal} / 20 улучшений`, action: onAvatar, glyph: Sparkles, hint: 'Открыть героя' },
    { id: 'tower', title: 'Башня', subtitle: towerDone === TOWER_FLOORS.length ? 'Этажи пройдены' : `Следующий: ${tower.floor}`,
      kicker: 'ИСПЫТАНИЯ', meta: `${towerDone} / ${TOWER_FLOORS.length} этажей`, action: onTower,
      glyph: Shield, hint: 'Открыть башню' },
    { id: 'daily', title: 'Цели дня', subtitle: 'Задачи и награды', kicker: 'ТВОЙ ПЛАН',
      meta: 'Проверить прогресс', action: onDaily, glyph: CalendarCheck2, hint: 'Перейти к целям дня' },
  ] as const;

  return <section className="forge-quick-deck" id="forge-quick-deck" aria-label="Разделы BODYFORGE">
    <div className="forge-quick-heading">
      <div><span><Target size={15}/> ВЫБЕРИ СВОЙ ПУТЬ</span><h2>СЕГОДНЯ В <em>КУЗНЕ</em></h2></div>
      <p>Все карточки открывают действующие функции приложения.</p>
    </div>
    <div className="forge-quick-grid">
      {tiles.map(({ id, title, subtitle, kicker, meta, action, glyph: Glyph, hint })=>
        <button type="button" key={id} className={`forge-quick-tile forge-quick-${id}`}
          data-quick-action={id} disabled={disabled} onClick={action} aria-label={hint}>
          <span className="forge-quick-ornament" aria-hidden="true"><Glyph size={91} strokeWidth={.75}/></span>
          <span className="forge-quick-tile-top">
            <span className="forge-quick-tile-glyph"><Glyph size={23}/></span>
            <span className="forge-quick-tile-kicker">{kicker}</span>
          </span>
          <span className="forge-quick-tile-body">
            <strong>{title}</strong><span>{subtitle}</span>
          </span>
          <span className="forge-quick-tile-footer">
            <small>{meta}</small><span className="forge-quick-arrow"><ArrowUpRight size={18}/></span>
          </span>
        </button>)}
    </div>
  </section>;
}
