import { describe, expect, it } from 'vitest';
import { fighterSkillMeters, fighterUpgradeFraction, weeklySessionLine } from './dashboardDisplay';
import type { GameState } from './game';
import type { PulseDay } from './progressPulse';

describe('Aurora neon view-model: no invented progress or activity', () => {
  const newMuscles: GameState['muscles'] = { arms: 0, back: 0, core: 0, legs: 0 };
  const oneWeek: PulseDay[] = Array.from({length:7},(_,i)=>({
    date:'2026-10-'+String(i+19),label:['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'][i],sessions:0,reps:0,
  }));

  it('shows zero ring progress and four actual purchased muscle levels for a new fighter',()=>{
    const m=fighterSkillMeters(newMuscles);
    expect(m).toHaveLength(4);
    expect(m.map(x=>x.progress)).toEqual([0,0,0,0]);
    expect(fighterUpgradeFraction(newMuscles)).toBe(0);
  });

  it('bounds all four muscle levels and reports combined progress without fabricated strength',()=>{
    const values={core:4,arms:3,back:2,legs:1} as GameState['muscles'];
    const meters=fighterSkillMeters(values);
    expect(meters.map(x=>x.id)).toEqual(['core','back','arms','legs']);
    expect(meters.map(x=>x.level)).toEqual([4,2,3,1]);
    expect(fighterUpgradeFraction(values)).toBe(.5);
    const invalid={core:Infinity,arms:-2,back:5,legs:2.1} as GameState['muscles'];
    expect(fighterSkillMeters(invalid).map(x=>x.level)).toEqual([0,5,0,0]);
  });

  it('never creates imaginary activity values in an empty seven-day chart',()=>{
    const plot=weeklySessionLine(oneWeek);
    expect(plot.points).toHaveLength(7);
    expect(plot.axisMax).toBe(4);
    expect(plot.ticks).toEqual([4,2,0]);
    expect(plot.points.every(p=>p.sessions===0 && p.y===175)).toBe(true);
  });

  it('positions every chart vertex exactly at its recorded session value',()=>{
    const data=oneWeek.map((x,i)=>({...x,sessions:[0,1,4,2,0,3,1][i]}));
    const chart=weeklySessionLine(data);
    expect(chart.axisMax).toBe(4);
    expect(chart.points[2].y).toBe(26);
    expect(chart.points[0].y).toBe(175);
    expect(chart.points[1].y).toBeCloseTo(137.75);
    expect(chart.path.match(/L/g)).toHaveLength(6);
    expect(chart.area.endsWith('Z')).toBe(true);
  });
});
