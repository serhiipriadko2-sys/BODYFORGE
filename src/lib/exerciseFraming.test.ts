import { describe, expect, it } from 'vitest';
import { assessExerciseFraming, ExerciseFramingTracker } from './exerciseFraming';
import { ExerciseMotionCounter } from './exerciseCounter';
import type { PosePoint } from './squatCounter';
import type { ExerciseId } from './trainingCatalog';

type Mode = Exclude<ExerciseId, 'squat'>;
const blank = (): PosePoint[] =>
  Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0, presence: 0 }));
function assign(points: PosePoint[], data: Record<number, [number, number]>) {
  for (const [id, [x, y]] of Object.entries(data)) {
    points[Number(id)] = { x, y, visibility: .99, presence: .99 };
  }
  return points;
}
function ready(id: Mode): PosePoint[] {
  const p = blank();
  switch (id) {
    case 'lunge':
      return assign(p, { 23:[.4,.35],25:[.4,.55],27:[.4,.75],
        24:[.6,.35],26:[.6,.55],28:[.6,.75] });
    case 'pushup':
      return assign(p, { 11:[.23,.45],13:[.25,.60],15:[.27,.75],
        23:[.5,.5],27:[.78,.56] });
    case 'jumping-jack':
      return assign(p, { 11:[.42,.27],12:[.58,.27],23:[.43,.5],24:[.57,.5],
        15:[.43,.58],16:[.57,.58],27:[.45,.85],28:[.55,.85] });
    case 'high-knees':
      return assign(p, { 23:[.43,.45],24:[.57,.45],25:[.43,.64],26:[.57,.64],
        27:[.43,.82],28:[.57,.82] });
    case 'crunch':
      return assign(p, { 11:[.29,.69],23:[.52,.69],25:[.68,.55],27:[.74,.75] });
    case 'leg-raise':
      return assign(p, { 11:[.25,.65],23:[.48,.65],25:[.65,.65],27:[.78,.65] });
    case 'plank':
      return assign(p, { 11:[.22,.55],13:[.24,.68],23:[.5,.56],27:[.8,.57] });
  }
}
describe('exercise-specific framing advice (never affects rewards)', () => {
  it.each(['lunge','pushup','jumping-jack','high-knees','crunch','leg-raise','plank'] as Mode[])(
    '%s reports visible joints without claiming to judge technique', (id) => {
      const report = assessExerciseFraming(id, ready(id));
      expect(report).toMatchObject({kind:'tracked',warning:false});
      expect(report.title).toContain('СУСТАВЫ');
    },
  );
  it('explains which landmarks are missing instead of showing a generic camera error', () => {
    const examples: [Mode, number, string][] = [
      ['lunge',27,'ОБЕ СТОПЫ'], ['pushup',13,'ЛОКОТЬ И КИСТЬ'],
      ['jumping-jack',15,'ОБЕ КИСТИ'], ['high-knees',25,'ОБА КОЛЕНА'],
      ['crunch',27,'СТОПЫ'], ['leg-raise',25,'СУСТАВЫ'],
      ['plank',13,'ОПОРНЫЙ ЛОКОТЬ'],
    ];
    for (const [id, joint, expected] of examples) {
      const p = ready(id);
      p[joint] = { ...p[joint], visibility: .01 };
      const report = assessExerciseFraming(id, p);
      expect(report.warning, id).toBe(true);
      expect(report.title, id).toContain(expected);
      expect(report.instruction.length, id).toBeGreaterThan(15);
    }
  });
  it('does not mix a left-side elbow with a right-side wrist to declare a complete pushup', () => {
    const p = ready('pushup');
    assign(p, {12:[.25,.45],14:[.27,.6],24:[.55,.5],28:[.79,.56]});
    p[13].visibility = 0; // left has shoulder+wrist; right has shoulder+elbow but no wrist
    expect(assessExerciseFraming('pushup', p).warning).toBe(true);
  });
  it('warns about cropped feet and a wrong angle rather than counting hidden movement', () => {
    const edge = ready('plank');
    edge[27].x = .976;
    expect(assessExerciseFraming('plank',edge)).toMatchObject({kind:'too-close',warning:true});
    const front = ready('pushup');
    front[27].x = .24;
    expect(assessExerciseFraming('pushup',front)).toMatchObject({
      kind:'angle-unavailable',warning:true,title:'ПОВЕРНИ ТЕЛЕФОН СБОКУ',
    });
    expect(assessExerciseFraming('plank',undefined).kind).toBe('no-person');
    expect(assessExerciseFraming('plank',ready('plank'),0).kind).toBe('angle-unavailable');
  });
  it('warns when an otherwise visible plank body is not aligned', () => {
    const p = ready('plank');
    p[23].y = .83;
    expect(assessExerciseFraming('plank',p)).toMatchObject({
      title:'ВЫРОВНЯЙ ПОЛОЖЕНИЕ КОРПУСА', warning:true,
    });
  });
  it('debounces noisy frames and resets when the user switches exercise', () => {
    const tracker = new ExerciseFramingTracker();
    const visible = ready('pushup');
    expect(tracker.update('pushup',visible,0).kind).toBe('no-person');
    expect(tracker.update('pushup',visible,180).kind).toBe('no-person');
    const stable = tracker.update('pushup',visible,360);
    expect(stable.kind).toBe('tracked');
    expect(tracker.update('pushup',visible,390)).toBe(stable);
    const incomplete = ready('pushup');
    incomplete[13].visibility = 0;
    expect(tracker.update('pushup',incomplete,460).kind).toBe('tracked');
    expect(tracker.update('pushup',visible,500).kind).toBe('tracked');
    expect(tracker.update('pushup',incomplete,600).kind).toBe('tracked');
    expect(tracker.update('pushup',incomplete,940).warning).toBe(true);
    expect(tracker.update('pushup',visible,900).warning).toBe(true); // stale timestamps ignored
    expect(tracker.update('plank',ready('plank'),1000).kind).toBe('no-person');
    expect(tracker.update('plank',ready('plank'),1400).kind).toBe('tracked');
  });
  it('never touches or rewards the underlying pose counters', () => {
    const counter = new ExerciseMotionCounter('pushup');
    const p = ready('pushup');
    for (let time=0;time<=1400;time+=100) {
      assessExerciseFraming('pushup',p);
      counter.update(p,time);
    }
    expect(counter.update(p,1500).snapshot.count).toBe(0);
  });
});
