import { describe, expect, it } from 'vitest';
import { ExerciseMotionCounter, measureExercise } from './exerciseCounter';
import { assessExerciseFraming } from './exerciseFraming';
import type { PosePoint } from './squatCounter';

type Side = 'left' | 'right';
type Pose = 'rest' | 'lift' | 'partial' | 'head' | 'legs' | 'upright';
const joints = [11,23,25,27];
function frame(kind: Pose, side: Side='left', ratio=1, scale=1, mirror=false): PosePoint[] {
  const p: PosePoint[] = Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
  const rows: Record<number,[number,number]> = {11:[.29,.69],23:[.52,.69],25:[.68,.55],27:[.74,.75]};
  if (kind==='lift') rows[11]=[.46,.42];
  if (kind==='partial') rows[11]=[.35,.57];
  if (kind==='head') rows[0]=[.37,.45];
  if (kind==='legs') Object.assign(rows,{25:[.54,.49],27:[.73,.61]});
  if (kind==='upright') for (const [i,[x,y]] of Object.entries(rows)) rows[Number(i)]=[1-y,x];
  for (const [i,[x,y]] of Object.entries(rows)) p[Number(i)+(i==='0'||side==='left'?0:1)] =
    {x:.5+(x-.5)*scale/ratio*(mirror?-1:1),y:.5+(y-.5)*scale,visibility:.99,presence:.99};
  return p;
}
function missing(kind:Pose,i:number){const p=frame(kind);p[i].visibility=0;return p;}
function ready(c:ExerciseMotionCounter,start=0,side:Side='left'){
  for(const t of [0,100])c.update(frame('rest',side),start+t);
  return c.update(frame('rest',side),start+200).snapshot;
}
function rep(c:ExerciseMotionCounter,start=0,side:Side='left',ratio=1,scale=1,mirror=false,tempo=1){
  let last=c.update(frame('rest',side,ratio,scale,mirror),start,ratio);
  for(const [t,p] of [[100,'rest'],[200,'rest'],[300,'lift'],[430,'lift'],[620,'lift'],[740,'rest'],[850,'rest'],[950,'rest']] as const)
    last=c.update(frame(p,side,ratio,scale,mirror),start+t*tempo,ratio);
  return last.snapshot;
}
describe('BF-208 crunch torso and continuity replay',()=>{
  it.each(joints)('requires visible joint %s on the measured side',i=>{
    expect(measureExercise('crunch',missing('rest',i))).toBeNull();
    expect(measureExercise('crunch',missing('lift',i))).toBeNull();
  });
  it.each(['visibility','presence'] as const)('rejects impossible %s',key=>{
    const p=frame('lift');p[11][key]=1.01;
    expect(measureExercise('crunch',p)).toBeNull();
  });
  it.each(joints)('rejects cropped joint %s using framing margin',i=>{
    const p=frame('lift');p[i].x=.976;
    expect(assessExerciseFraming('crunch',p)).toMatchObject({kind:'too-close',warning:true});
    expect(measureExercise('crunch',p)).toBeNull();
  });
  it('requires actual torso elevation, not a changed angle caused only by leg motion',()=>{
    expect(measureExercise('crunch',frame('legs'))?.engaged).toBe(false);
    const c=new ExerciseMotionCounter('crunch');ready(c);
    for(const [t,p] of [[300,'legs'],[430,'legs'],[620,'legs'],[740,'rest'],[850,'rest']] as const)c.update(frame(p),t);
    expect(c.update(frame('rest'),950).snapshot.count).toBe(0);
  });
  it('never counts head movement alone',()=>{
    const c=new ExerciseMotionCounter('crunch');ready(c);
    for(let i=0;i<25;i++)expect(c.update(frame(i%2?'head':'rest'),300+i*100).snapshot.count).toBe(0);
  });
  it('rejects a rotated floor pose as an observed starting position',()=>{
    expect(measureExercise('crunch',frame('upright'))).toBeNull();
  });
  it('requires a visible bent leg with the knee above its hip and ankle',()=>{
    const p=frame('rest');p[25].y=.88;
    expect(measureExercise('crunch',p)).toBeNull();
  });
  it('does not combine disconnected raised phases',()=>{
    const c=new ExerciseMotionCounter('crunch');ready(c);
    c.update(frame('lift'),300);c.update(frame('partial'),370);c.update(frame('lift'),430);
    c.update(frame('rest'),740);expect(c.update(frame('rest'),850).snapshot.count).toBe(0);
  });
  it('requires uninterrupted visible calibration',()=>{
    const c=new ExerciseMotionCounter('crunch');
    c.update(frame('rest'),0);c.update(missing('rest',11),100);
    expect(c.update(frame('rest'),200).snapshot.phase).toBe('calibrate');
    expect(c.update(frame('rest'),380).snapshot.phase).toBe('ready');
  });
  it('cannot assemble calibration across two sides',()=>{
    const c=new ExerciseMotionCounter('crunch');
    c.update(frame('rest'),0);
    expect(c.update(frame('rest','right'),200).snapshot.phase).toBe('calibrate');
    expect(ready(c,400,'right').phase).toBe('ready');
  });
  it('cannot calibrate one side and begin a repetition on another',()=>{
    const c=new ExerciseMotionCounter('crunch');ready(c);
    c.update(frame('lift','right'),300);c.update(frame('lift','right'),430);
    c.update(frame('rest','right'),740);
    expect(c.update(frame('rest','right'),850).snapshot.count).toBe(0);
    expect(rep(c,1100,'right').count).toBe(1);
  });
  it.each(joints)('abandons pending completion on loss of joint %s',i=>{
    const c=new ExerciseMotionCounter('crunch');ready(c);
    c.update(frame('lift'),300);c.update(frame('lift'),430);c.update(frame('rest'),740);
    c.update(missing('rest',i),800);
    expect(c.update(frame('rest'),900).snapshot.count).toBe(0);
    expect(c.update(frame('rest'),1100).snapshot.count).toBe(0);
    expect(rep(c,1300).count).toBe(1);
  });
  it('cannot finish a partial motion by hiding the tracked side',()=>{
    const c=new ExerciseMotionCounter('crunch');ready(c);
    c.update(frame('lift'),300);c.update(frame('lift'),430);
    c.update(frame('lift','right'),550);c.update(frame('rest'),740);
    expect(c.update(frame('rest'),850).snapshot.count).toBe(0);
  });
  it('cannot borrow the ready state across an unobserved start',()=>{
    const c=new ExerciseMotionCounter('crunch');ready(c);
    c.update(frame('lift'),750);c.update(frame('lift'),880);c.update(frame('rest'),1190);
    expect(c.update(frame('rest'),1300).snapshot.count).toBe(0);
  });
  it('requires observed return instead of a partial lowered torso',()=>{
    const c=new ExerciseMotionCounter('crunch');ready(c);
    c.update(frame('lift'),300);c.update(frame('lift'),430);
    for(const t of [600,750,900])expect(c.update(frame('partial'),t).snapshot.count).toBe(0);
    c.update(frame('rest'),1000);expect(c.update(frame('rest'),1110).snapshot.count).toBe(1);
  });
  it('preserves finished repetitions but discards partial state on orientation recalibration',()=>{
    const c=new ExerciseMotionCounter('crunch');expect(rep(c).count).toBe(1);
    c.update(frame('lift'),1050);c.update(frame('lift'),1180);c.recalibrate();
    expect(c.update(frame('rest','right',16/9,.55,true),1300,16/9).snapshot.count).toBe(1);
    expect(c.update(frame('rest','right',16/9,.55,true),1500,16/9).snapshot.count).toBe(1);
    expect(rep(c,1700,'right',16/9,.55,true).count).toBe(2);
  });
  it('rejects duplicate and invalid timestamps',()=>{
    const c=new ExerciseMotionCounter('crunch');ready(c);
    for(const t of [200,199,NaN,Infinity,-1])expect(c.update(frame('lift'),t).snapshot.phase).toBe('ready');
    expect(rep(c,400).count).toBe(1);
  });
  it.each([9/16,1,16/9])('recognizes complete cycles in mirrored views and varying scales (aspect %s)',ratio=>{
    for(const side of ['left','right'] as const) for(const scale of [.4,.55]) for(const mirror of [false,true]){
      const c=new ExerciseMotionCounter('crunch');
      expect(rep(c,0,side,ratio,scale,mirror).count).toBe(1);
      for(let t=1100;t<=1700;t+=100)expect(c.update(frame('rest',side,ratio,scale,mirror),t,ratio).snapshot.count).toBe(1);
    }
  });
  it('counts exactly twenty complete cycles at two controlled tempos',()=>{
    for(const tempo of [1,1.25]){
      const c=new ExerciseMotionCounter('crunch');
      for(let i=0;i<20;i++)expect(rep(c,i*1100*tempo,'left',16/9,.55,false,tempo).count).toBe(i+1);
    }
  });
});
