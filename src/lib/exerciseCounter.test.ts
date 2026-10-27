import { describe, expect, it } from 'vitest';
import { ExerciseMotionCounter, measureExercise } from './exerciseCounter';
import type { PosePoint } from './squatCounter';
import type { ExerciseId } from './trainingCatalog';

type Kind = Exclude<ExerciseId, 'squat'>;
const hidden = (): PosePoint[] => Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }));
const assign = (p: PosePoint[], entries: Record<number, [number, number]>) => {
  for (const [key, [x, y]] of Object.entries(entries)) p[Number(key)] = { x, y, visibility: .99, presence: .99 };
  return p;
};
function frame(id: Kind, state: 'ready' | 'active', side: 'left' | 'right' = 'left'): PosePoint[] {
  const p = hidden();
  if (id === 'lunge') {
    assign(p, { 23: [.40,.35], 25: [.40,.55], 27: [.40,.75],
                24: [.60,.35], 26: [.60,.55], 28: [.60,.75] });
    if (state === 'active') {
      if (side === 'left') assign(p, {23:[.35,.49],25:[.52,.55],27:[.48,.73]});
      else assign(p, {24:[.65,.49],26:[.48,.55],28:[.52,.73]});
    }
  }
  if (id === 'pushup') {
    assign(p, {11:[.23,.45],13:[.25,.60],15:[.27,.75],23:[.50,.50],27:[.78,.56]});
    if (state === 'active') assign(p,{13:[.38,.53],15:[.29,.67]});
  }
  if (id === 'jumping-jack') {
    assign(p, {11:[.42,.27],12:[.58,.27],23:[.43,.50],24:[.57,.50],
      15: state === 'ready' ? [.43,.58] : [.28,.08],
      16: state === 'ready' ? [.57,.58] : [.72,.08],
      27: state === 'ready' ? [.45,.85] : [.25,.83],
      28: state === 'ready' ? [.55,.85] : [.75,.83]});
  }
  if (id === 'high-knees') {
    assign(p, {23:[.43,.45],24:[.57,.45],25:[.43,.64],26:[.57,.64],27:[.43,.82],28:[.57,.82]});
    if (state === 'active') {
      if (side === 'left') assign(p,{25:[.44,.44],27:[.46,.66]});
      else assign(p,{26:[.56,.44],28:[.54,.66]});
    }
  }
  if (id === 'crunch') {
    assign(p, {11: state === 'ready' ? [.29,.69] : [.46,.42],
      23:[.52,.69],25:[.68,.55],27:[.74,.75]});
  }
  if (id === 'leg-raise') {
    assign(p, {11:[.25,.65],23:[.48,.65],
      25: state === 'ready' ? [.65,.65] : [.535,.45],
      27: state === 'ready' ? [.78,.65] : [.59,.25]});
  }
  if (id === 'plank') {
    assign(p, {11:[.22,.55],13:[.24,.68],23:[.50,.56],27:[.80,.57]});
    if (state === 'active') assign(p,{23:[.50,.83]});
  }
  return p;
}
function runRep(counter: ExerciseMotionCounter, id: Kind, start: number, side: 'left'|'right'='left') {
  let output = counter.update(frame(id,'ready'),start);
  output = counter.update(frame(id,'ready'),start+100);
  output = counter.update(frame(id,'ready'),start+200);
  output = counter.update(frame(id,'active',side),start+300);
  output = counter.update(frame(id,'active',side),start+430);
  output = counter.update(frame(id,'ready'),start+740);
  output = counter.update(frame(id,'ready'),start+850);
  return output;
}

describe('geometric camera recognizers (synthetic landmark fixtures)', () => {
  it.each(['lunge','pushup','jumping-jack','high-knees','crunch','leg-raise'] as Kind[])(
    'counts one complete %s, rejects half cycle and stationary pose', (id) => {
      const ready = measureExercise(id, frame(id,'ready'));
      const active = measureExercise(id, frame(id,'active'));
      expect(ready?.ready, id + ' ready').toBe(true);
      expect(active?.engaged, id + ' engaged').toBe(true);
      const counter = new ExerciseMotionCounter(id);
      expect(runRep(counter,id,0).snapshot.count).toBe(1);
      for (let time=900;time<=1800;time+=100) {
        expect(counter.update(frame(id,'ready'),time).snapshot.count).toBe(1);
      }
      const shallow = new ExerciseMotionCounter(id);
      shallow.update(frame(id,'ready'),0);
      shallow.update(frame(id,'ready'),180);
      shallow.update(frame(id,'active'),280);
      shallow.update(frame(id,'ready'),330);
      shallow.update(frame(id,'ready'),430);
      expect(shallow.update(frame(id,'ready'),700).snapshot.count).toBe(0);
    }
  );
  it('counts alternating raised knees but not repeated pulses of the same knee', () => {
    const c = new ExerciseMotionCounter('high-knees');
    expect(runRep(c,'high-knees',0,'left').snapshot.count).toBe(1);
    expect(runRep(c,'high-knees',950,'left').snapshot.count).toBe(1);
    expect(runRep(c,'high-knees',1900,'right').snapshot.count).toBe(2);
  });
  it('keeps completed reps but discards an unfinished move after loss of tracking', () => {
    const c = new ExerciseMotionCounter('pushup');
    expect(runRep(c,'pushup',0).snapshot.count).toBe(1);
    c.update(frame('pushup','active'),1100);
    c.update(hidden(),2100);
    expect(c.update(frame('pushup','ready'),2300).snapshot.count).toBe(1);
    expect(c.update(frame('pushup','ready'),2500).snapshot.phase).toBe('ready');
  });
  it('does not count when the wrong joints or invalid coordinates are supplied', () => {
    const c = new ExerciseMotionCounter('pushup');
    expect(c.update(hidden(),100).snapshot.count).toBe(0);
    const bad = frame('pushup','active');
    bad[13] = { x: Number.NaN, y: .53, visibility: 1 };
    expect(measureExercise('pushup',bad)).toBeNull();
    expect(c.update(bad,200).tracking).toBe(false);
  });
  it('requires a continuous aligned 30-second plank with actual frame updates', () => {
    const c = new ExerciseMotionCounter('plank');
    let result = c.update(frame('plank','ready'),0);
    for (let t=100;t<31400;t+=100) result=c.update(frame('plank','ready'),t);
    expect(result.snapshot.count).toBe(30);
    const frozen = c.update(frame('plank','ready'),31400);
    expect(frozen.snapshot.count).toBe(30);
    const broken = c.update(frame('plank','active'),31500);
    expect(broken.snapshot.count).toBe(0);
  });
  it('blocks a held plank after a long timestamp gap (no offline credit)', () => {
    const c = new ExerciseMotionCounter('plank');
    c.update(frame('plank','ready'),0);
    c.update(frame('plank','ready'),400);
    c.update(frame('plank','ready'),500);
    expect(c.update(frame('plank','ready'),1200).snapshot.count).toBe(0);
  });
});
