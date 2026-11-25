import { describe, expect, it } from 'vitest';
import { ExerciseMotionCounter, measureExercise } from './exerciseCounter';
import type { PosePoint } from './squatCounter';

type Side = 'left' | 'right';
type Pose = 'stand' | 'left' | 'right' | 'both' | 'step' | 'partial';
function frame(kind: Pose, ratio=1, scale=1): PosePoint[] {
  const p: PosePoint[] = Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
  const rows: Record<number,[number,number]> = {
    23:[.40,.35],25:[.40,.55],27:[.40,.75],24:[.60,.35],26:[.60,.55],28:[.60,.75],
  };
  if(kind==='left'||kind==='both') Object.assign(rows,{23:[.35,.49],25:[.52,.55],27:[.48,.73]});
  if(kind==='right'||kind==='both') Object.assign(rows,{24:[.65,.49],26:[.48,.55],28:[.52,.73]});
  if(kind==='step') Object.assign(rows,{23:[.30,.35],25:[.30,.55],27:[.30,.75]});
  if(kind==='partial') Object.assign(rows,{24:[.60,.35],26:[.60,.55],28:[.75,.68]});
  for(const [i,[x,y]] of Object.entries(rows)) p[Number(i)]={x:.5+(x-.5)*scale/ratio,y:.5+(y-.5)*scale,visibility:.99,presence:.99};
  return p;
}
function ready(c:ExerciseMotionCounter,start=0,ratio=1,scale=1) {
  c.update(frame('stand',ratio,scale),start,ratio);
  c.update(frame('stand',ratio,scale),start+100,ratio);
  return c.update(frame('stand',ratio,scale),start+200,ratio).snapshot;
}
function rep(c:ExerciseMotionCounter,side:Side,start=0,ratio=1,scale=1) {
  ready(c,start,ratio,scale);
  for(const [t,pose] of [[300,side],[430,side],[740,'stand'],[850,'stand']] as const)
    c.update(frame(pose,ratio,scale),start+t,ratio);
  return c.update(frame('stand',ratio,scale),start+950,ratio).snapshot;
}
function hidden(kind:Pose,index:number) {
  const p=frame(kind);
  p[index].visibility=0;
  return p;
}

describe('BF-204 lunge observation and side replay',()=>{
  it.each([23,24,25,26,27,28])('requires visible joints on both legs (missing %s)',index=>{
    expect(measureExercise('lunge',hidden('left',index))).toBeNull();
  });
  it.each(['visibility','presence'] as const)('rejects out-of-range %s on either leg',key=>{
    const p=frame('left');p[28][key]=1.01;
    expect(measureExercise('lunge',p)).toBeNull();
  });
  it('does not count a straight-legged step or an ambiguous simultaneous deep bend',()=>{
    const c=new ExerciseMotionCounter('lunge');ready(c);
    for(const [t,p] of [[300,'step'],[430,'step'],[740,'stand'],[850,'stand'],[1050,'both'],[1180,'both'],[1490,'stand'],[1600,'stand']] as const)
      c.update(frame(p),t);
    expect(c.update(frame('stand'),1700).snapshot.count).toBe(0);
  });
  it('requires uninterrupted two-leg calibration observations',()=>{
    const c=new ExerciseMotionCounter('lunge');
    c.update(frame('stand'),0);
    c.update(hidden('stand',28),100);
    expect(c.update(frame('stand'),200).snapshot.phase).toBe('calibrate');
    expect(c.update(frame('stand'),370).snapshot.phase).toBe('ready');
  });
  it('cannot start a lunge with one leg hidden and finish when it returns',()=>{
    const c=new ExerciseMotionCounter('lunge');ready(c);
    c.update(hidden('left',28),300);c.update(hidden('left',28),430);
    c.update(frame('stand'),740);
    expect(c.update(frame('stand'),850).snapshot.count).toBe(0);
  });
  it('cannot complete a partial movement by changing active legs',()=>{
    const c=new ExerciseMotionCounter('lunge');ready(c);
    c.update(frame('left'),300);c.update(frame('left'),430);
    c.update(frame('right'),550);c.update(frame('right'),680);
    c.update(frame('stand'),850);
    expect(c.update(frame('stand'),960).snapshot.count).toBe(0);
    expect(rep(c,'right',1100).count).toBe(1);
  });
  it('cannot combine two separate brief bends into one sustained active phase',()=>{
    const c=new ExerciseMotionCounter('lunge');ready(c);
    c.update(frame('left'),300);
    c.update(frame('partial'),370);
    c.update(frame('left'),430);
    c.update(frame('stand'),740);
    expect(c.update(frame('stand'),850).snapshot.count).toBe(0);
  });
  it.each([25,28])('invalidates an unfinished cycle on loss of joint %s at return',index=>{
    const c=new ExerciseMotionCounter('lunge');ready(c);
    c.update(frame('left'),300);c.update(frame('left'),430);
    c.update(frame('stand'),740);
    c.update(hidden('stand',index),800);
    expect(c.update(frame('stand'),900).snapshot.count).toBe(0);
    expect(c.update(frame('stand'),1100).snapshot.count).toBe(0);
    expect(rep(c,'left',1300).count).toBe(1);
  });
  it('requires both legs to return; a partial return is not credited',()=>{
    const c=new ExerciseMotionCounter('lunge');ready(c);
    c.update(frame('left'),300);c.update(frame('left'),430);
    c.update(frame('partial'),600);c.update(frame('partial'),750);
    expect(c.update(frame('partial'),900).snapshot.count).toBe(0);
    c.update(frame('stand'),1000);
    expect(c.update(frame('stand'),1110).snapshot.count).toBe(1);
  });
  it('preserves completed reps but discards an unobserved finish after the existing 400ms gap',()=>{
    const c=new ExerciseMotionCounter('lunge');
    expect(rep(c,'left').count).toBe(1);
    c.update(frame('right'),1050);c.update(frame('right'),1180);
    c.update(frame('stand'),1781);
    expect(c.update(frame('stand'),1891).snapshot.count).toBe(1);
    expect(rep(c,'right',2100).count).toBe(2);
  });
  it('rejects negative, repeated, backward and invalid timestamps',()=>{
    const c=new ExerciseMotionCounter('lunge');
    c.update(frame('stand'),-200);
    expect(c.update(frame('stand'),0).snapshot.phase).toBe('calibrate');
    ready(c,100);
    for(const t of [300,299,NaN,Infinity,-1]) expect(c.update(frame('left'),t).snapshot.phase).toBe('ready');
    expect(rep(c,'left',400).count).toBe(1);
  });
  it.each([9/16,1,16/9])('accepts complete cycles of either side without requiring alternation at aspect %s',ratio=>{
    for(const scale of [1,.55,.4]) {
      const c=new ExerciseMotionCounter('lunge');
      expect(rep(c,'left',0,ratio,scale).count).toBe(1);
      expect(rep(c,'left',1100,ratio,scale).count).toBe(2);
      expect(rep(c,'right',2200,ratio,scale).count).toBe(3);
      for(let i=0;i<10;i++) expect(c.update(frame('stand',ratio,scale),3300+i*100,ratio).snapshot.count).toBe(3);
    }
  });
  it('counts exactly 20 fully observed cycles, with both same-side and alternating repetitions',()=>{
    const c=new ExerciseMotionCounter('lunge');
    for(let i=0;i<20;i++) expect(rep(c,i%3===0?'right':'left',i*1100).count).toBe(i+1);
  });
});
