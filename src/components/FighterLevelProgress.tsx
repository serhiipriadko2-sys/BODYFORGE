import { ArrowUpRight } from 'lucide-react';
import { getLevel, getLevelProgress } from '../lib/progression';

/** The existing level/XP card, now part of the fighter's Forge header. */
export default function FighterLevelProgress({ xp }: { xp: number }) {
  const earned = Number.isFinite(xp) ? Math.max(0, Math.trunc(xp)) : 0;
  const level = getLevel(earned);
  const levelProgress = getLevelProgress(earned);
  const levelXp = earned % 250;

  return (
    <article className="pulse-xp-card fighter-xp-card"
      aria-label={`Уровень ${level}, ${Math.round(levelProgress * 100)}% опыта до следующего уровня`}>
      <div className="pulse-xp-top">
        <div className="pulse-level-medal"><span>{level}</span></div>
        <div className="pulse-xp-heading">
          <strong>Уровень {level}</strong>
          <span>Опыт: {levelXp} / 250 XP</span>
        </div>
        <span className="pulse-xp-legend">ТВОЯ СЛЕДУЮЩАЯ ЗАКАЛКА <ArrowUpRight size={16}/></span>
      </div>
      <div className="pulse-xp-track" role="progressbar" aria-valuenow={levelXp}
        aria-valuemax={250} aria-valuemin={0} aria-label="Опыт до следующего уровня">
        <span style={{width:`${Math.round(levelProgress * 100)}%`}}/>
      </div>
    </article>
  );
}
