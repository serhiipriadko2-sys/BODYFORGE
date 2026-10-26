import type { GameState, Muscle } from './game';
import type { PulseDay } from './progressPulse';

export type SkillMeter = {
  id: Muscle; label: string; level: number; progress: number;
  color: string; short: string;
};
const SKILLS: ReadonlyArray<{ id: Muscle; label: string; color: string; short: string }> = [
  { id: 'core', label: 'Корпус', short: 'CORE', color: '#bbfa38' },
  { id: 'back', label: 'Спина', short: 'BACK', color: '#34c9fa' },
  { id: 'arms', label: 'Руки', short: 'ARMS', color: '#cb70fa' },
  { id: 'legs', label: 'Ноги', short: 'LEGS', color: '#bacadd' },
];
export function fighterSkillMeters(muscles: GameState['muscles']): SkillMeter[] {
  return SKILLS.map(({ id, label, color, short }) => {
    const value = muscles[id];
    const level = Number.isInteger(value) ? Math.max(0, Math.min(5, value)) : 0;
    return { id, label, color, short, level, progress: level / 5 };
  });
}

/**
 * This is the fraction of *purchased in-game muscle upgrades*, NOT
 * physiological fitness, medical strength, body composition or active calories.
 */
export function fighterUpgradeFraction(muscles: GameState['muscles']): number {
  return fighterSkillMeters(muscles).reduce((total, meter) => total + meter.level, 0) / 20;
}

export type PulsePoint = { date: string; label: string; sessions: number; x: number; y: number };
export type PulseLine = {
  points: PulsePoint[]; path: string; area: string; axisMax: number; ticks: number[];
};

/** A chart is always seven truthful samples; 0 workouts => a FLAT zero line. */
export function weeklySessionLine(days: readonly PulseDay[]): PulseLine {
  const values = days.slice(-7).filter(d => Number.isSafeInteger(d.sessions) && d.sessions >= 0);
  const peak = Math.max(0, ...values.map(d => d.sessions));
  const axisMax = peak <= 4 ? 4 : Math.ceil(peak / 4) * 4;
  const left = 42, right = 760, top = 26, bottom = 175;
  const points = values.map((day, i) => ({
    date: day.date, label: day.label, sessions: day.sessions,
    x: left + (values.length === 1 ? 0 : i * (right - left) / (values.length - 1)),
    y: bottom - (day.sessions / axisMax) * (bottom - top),
  }));
  // Actual vertices are at the sample values. Rendering does not invent
  // intermediate counts with over-shooting interpolation.
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  const area = points.length
    ? `${path} L${points[points.length - 1].x.toFixed(2)} ${bottom} L${points[0].x.toFixed(2)} ${bottom} Z`
    : '';
  return { points, path, area, axisMax, ticks: [axisMax, axisMax / 2, 0] };
}
