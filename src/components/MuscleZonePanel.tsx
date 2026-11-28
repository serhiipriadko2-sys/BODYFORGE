import { useState } from 'react';
import { Coins, Hammer, Eye } from 'lucide-react';
import type { Muscle } from '../lib/game';
import { ZONE_GROUPS, ZONE_POINT_COST, ZONE_POINT_MAX, TOTAL_ZONE_POINTS,
  zoneGroupPoints, zoneTotal, type MuscleZone, type ZoneLevels } from '../lib/muscleZones';
import './muscleZones.css';

interface Props {
  levels: ZoneLevels | null;
  coins: number;
  ready: boolean;
  busy: boolean;
  created: boolean;
  legacy: boolean;
  onUpgrade: (id: MuscleZone) => void;
  onView: (group: Muscle, zone?: MuscleZone) => void;
}

export default function MuscleZonePanel({levels,coins,ready,busy,created,legacy,onUpgrade,onView}: Props) {
  const [selected,setSelected] = useState<Muscle>('arms');
  const [focused,setFocused] = useState<MuscleZone|null>(null);
  const group=ZONE_GROUPS.find(g=>g.id===selected)!;
  return <section className="studio-muscle-panel zone-studio-panel" aria-label="Прокачка отдельных мышц" data-regional-muscles>
    <div className="forge-subheading"><Hammer size={18}/> ПРОКАЧКА МЫШЦ <span>{levels ? zoneTotal(levels) : '—'} / {TOTAL_ZONE_POINTS}</span></div>
    <p className="zone-intro">15 зон · 12 очков в каждой. Одно вложение усиливает объём и рельеф выбранной мышцы.</p>
    {legacy && levels && <p className="zone-note">Старые улучшения учтены пропорционально. Перенос сохранится при первой покупке; монеты и тренировки останутся на месте.</p>}
    {!levels ? <p className="zone-note" role="alert">Запись прокачки повреждена. Покупки заблокированы; сначала восстанови сохранение.</p> : <>
      <div className="zone-group-tabs" role="group" aria-label="Группа мышц">
        {ZONE_GROUPS.map(g=>{
          const {points,max}=zoneGroupPoints(levels,g.id);
          return <button type="button" key={g.id} data-zone-group={g.id} aria-pressed={selected===g.id}
            onClick={()=>{setSelected(g.id);setFocused(null);onView(g.id);}}>
            <span>{g.label}</span><strong>{points}/{max}</strong>
            <span className="zone-group-rail" aria-hidden="true"><i style={{width:100*points/max+'%'}}/></span>
          </button>;
        })}
      </div>
      {!ready && <p className="zone-note" role="status">Детальная 3D-модель пока не готова. Вложения доступны после её загрузки.</p>}
      <div className="zone-card-list" aria-label={group.label}>
        {group.zones.map(z=>{
          const level=levels[z.id],capped=level>=ZONE_POINT_MAX,enough=coins>=ZONE_POINT_COST;
          return <article className={'zone-card'+(focused===z.id?' zone-selected':'')} key={z.id} data-zone={z.id} data-zone-level={level}>
            <div className="zone-card-top"><div><h3>{z.label}</h3><p>{z.detail}</p></div><strong>{level}<small>/{ZONE_POINT_MAX}</small></strong></div>
            <div className="zone-pips" role="progressbar" aria-label={'Вложения: '+z.label} aria-valuenow={level} aria-valuemin={0} aria-valuemax={ZONE_POINT_MAX}>
              {Array.from({length:ZONE_POINT_MAX},(_,i)=><i key={i} className={i<level?'filled':''}/>)}
            </div>
            <div className="zone-card-actions">
              <button type="button" className="zone-view" data-zone-view={z.id} aria-label={'Показать: '+z.label}
                onClick={()=>{setFocused(z.id);onView(group.id,z.id);}}><Eye size={16}/> Вид</button>
              <button type="button" className="zone-buy" data-zone-upgrade={z.id}
                aria-label={'Вложить очко: '+z.label}
                disabled={!ready||busy||!created||capped||!enough}
                onClick={()=>{setFocused(z.id);onView(group.id,z.id);onUpgrade(z.id);}}>
                {capped?'МАКСИМУМ':<><Coins size={15}/> {ZONE_POINT_COST} · +1 ОЧКО</>}
              </button>
            </div>
          </article>;
        })}
      </div>
      <p className="zone-footnote">{coins < ZONE_POINT_COST ? 'Недостаточно монет. Заработай их тренировками.' : 'Объём растёт с каждым очком, рельеф усиливается постепенно.'}</p>
    </>}
  </section>;
}
