import { describe, expect, it } from 'vitest';
import { ExerciseMotionCounter, measureExercise } from './exerciseCounter';
import { assessExerciseFraming } from './exerciseFraming';
import type { PosePoint } from './squatCounter';

type Side = 'left' | 'right';
type Pose = 'rest' | 'lift' | 'partial' | 'bent' | 'downward' | 'torso-rest' | 'torso-moved';
const joints = [11,23,25,27];
function frame(kind:Pose, side:Side='left', ratio=1, scale=1, mirror=false):PosePoint[] {
  const p:PosePoint[]=Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
  const rows:Record<number,[number,number]>={11:[.25,.65],23:[.48,.65],25:[.65,.65],27:[.78,.65]};
  if (kind==='lift') Object.assign(rows,{25:[.535,.45],27:[.59,.25]});
  if (kind==='partial') Object.assign(rows,{25:[.62,.55],27:[.76,.45]});
  if (kind==='bent') Object.assign(rows,{25:[.535,.45],27:[.72,.46]});
  if (kind==='downward') Object.assign(rows,{25:[.535,.76],27:[.59,.87],11:[.25,.65]});
  if (kind==='torso-rest'||kind==='torso-moved') {
    // Identical leg/hip positions; only the shoulder rotates. Both torso
    // orientations satisfy the existing floor-view horizontal ratio.
    Object.assign(rows,{25:[.62,.552],27:[.76,.454],11:kind==='torso-rest'?[.25,.811]:[.25,.46]});
  }
  for(const [i,[x,y]] of Object.entries(rows))p[Number(i)+(side==='right'?1:0)]=
    {x:.5+(x-.5)*scale/ratio*(mirror?-1:1),y:.5+(y-.5)*scale,visibility:.99,presence:.99};
  return p;
}
const missing=(kind:Pose,i:number)=>{const p=frame(kind);p[i].visibility=0;return p;};
function ready(c:ExerciseMotionCounter,start=0,side:Side='left'){
  for(const t of [0,100])c.update(frame('rest',side),start+t);
  return c.update(frame('rest',side),start+200).snapshot;
}
function rep(c:ExerciseMotionCounter,start=0,side:Side='left',ratio=1,scale=1,mirror=false,tempo=1){
  let r=c.update(frame('rest',side,ratio,scale,mirror),start,ratio);
  for(const [t,p] of [[100,'rest'],[200,'rest'],[300,'lift'],[430,'lift'],[620,'lift'],[740,'rest'],[850,'rest'],[950,'rest']] as const)
    r=c.update(frame(p,side,ratio,scale,mirror),start+t*tempo,ratio);
  return r.snapshot;
}
describe('BF-209 leg raise observation replay',()=>{
  it.each(joints)('requires joint %s on the observed side',i=>{
    expect(measureExercise('leg-raise',missing('rest',i))).toBeNull();
    expect(measureExercise('leg-raise',missing('lift',i))).toBeNull();
  });
  it.each(['visibility','presence'] as const)('rejects impossible %s',key=>{
    const p=frame('lift');p[27][key]=1.01;
    expect(measureExercise('leg-raise',p)).toBeNull();
  });
  it.each(joints)('rejects cropped joint %s using existing framing margin',i=>{
    const p=frame('lift');p[i].y=.024;
    expect(assessExerciseFraming('leg-raise',p)).toMatchObject({kind:'too-close',warning:true});
    expect(measureExercise('leg-raise',p)).toBeNull();
  });
  it('does not treat a stationary leg and changing torso angle as a leg raise',()=>{
    const c=new ExerciseMotionCounter('leg-raise');
    for(const [t,p] of [[0,'torso-rest'],[100,'torso-rest'],[200,'torso-rest'],[300,'torso-moved'],[430,'torso-moved'],[740,'torso-rest'],[850,'torso-rest']] as const)c.update(frame(p),t);
    expect(c.update(frame('torso-rest'),950).snapshot.count).toBe(0);
  });
  it('does not count a downward leg swing as a raise',()=>{
    const p=frame('lift','left',1,.55);
    for(const i of [25,27])p[i].y=2*p[23].y-p[i].y;
    // Match the image scale of the observed downward swing.
    expect(p[27].y).toBeLessThan(.965);
    expect(measureExercise('leg-raise',p)?.engaged).toBe(false);
    const c=new ExerciseMotionCounter('leg-raise');ready(c);
    c.update(p,300);c.update(p,430);c.update(frame('rest'),740);
    expect(c.update(frame('rest'),850).snapshot.count).toBe(0);
  });
  it('rejects bending the knee instead of raising the straight leg',()=>{
    expect(measureExercise('leg-raise',frame('bent'))).toBeNull();
    const c=new ExerciseMotionCounter('leg-raise');ready(c);
    c.update(frame('bent'),300);c.update(frame('bent'),430);c.update(frame('rest'),740);
    expect(c.update(frame('rest'),850).snapshot.count).toBe(0);
  });
  it('cancels a partial cycle when a bent knee replaces a visible straight leg',()=>{
    const c=new ExerciseMotionCounter('leg-raise');ready(c);
    c.update(frame('lift'),300);c.update(frame('lift'),430);
    c.update(frame('bent'),550);c.update(frame('rest'),740);
    expect(c.update(frame('rest'),850).snapshot.count).toBe(0);
  });
  it('does not combine two disconnected raised phases',()=>{
    const c=new ExerciseMotionCounter('leg-raise');ready(c);
    c.update(frame('lift'),300);c.update(frame('partial'),370);c.update(frame('lift'),430);
    c.update(frame('rest'),740);expect(c.update(frame('rest'),850).snapshot.count).toBe(0);
  });
  it('requires consecutive visible calibration',()=>{
    const c=new ExerciseMotionCounter('leg-raise');
    c.update(frame('rest'),0);c.update(missing('rest',27),100);
    expect(c.update(frame('rest'),200).snapshot.phase).toBe('calibrate');
    expect(c.update(frame('rest'),380).snapshot.phase).toBe('ready');
  });
  it('does not assemble calibration across opposite sides',()=>{
    const c=new ExerciseMotionCounter('leg-raise');
    c.update(frame('rest'),0);
    expect(c.update(frame('rest','right'),200).snapshot.phase).toBe('calibrate');
    expect(ready(c,400,'right').phase).toBe('ready');
  });
  it('does not start on the opposite side before fresh calibration',()=>{
    const c=new ExerciseMotionCounter('leg-raise');ready(c);
    c.update(frame('lift','right'),300);c.update(frame('lift','right'),430);
    c.update(frame('rest','right'),740);expect(c.update(frame('rest','right'),850).snapshot.count).toBe(0);
    expect(rep(c,1100,'right').count).toBe(1);
  });
  it.each(joints)('rejects pending completion on loss of joint %s during return',i=>{
    const c=new ExerciseMotionCounter('leg-raise');ready(c);
    c.update(frame('lift'),300);c.update(frame('lift'),430);c.update(frame('rest'),740);
    c.update(missing('rest',i),800);
    expect(c.update(frame('rest'),900).snapshot.count).toBe(0);
    expect(c.update(frame('rest'),1100).snapshot.count).toBe(0);
    expect(rep(c,1300).count).toBe(1);
  });
  it('does not finish after the tracked side disappears midcycle',()=>{
    const c=new ExerciseMotionCounter('leg-raise');ready(c);
    c.update(frame('lift'),300);c.update(frame('lift'),430);c.update(frame('lift','right'),550);
    c.update(frame('rest'),740);expect(c.update(frame('rest'),850).snapshot.count).toBe(0);
  });
  it('cannot borrow a ready pose across an unobserved start',()=>{
    const c=new ExerciseMotionCounter('leg-raise');ready(c);
    c.update(frame('lift'),750);c.update(frame('lift'),880);c.update(frame('rest'),1190);
    expect(c.update(frame('rest'),1300).snapshot.count).toBe(0);
  });
  it('requires the lowered phase, not a stationary partially lifted leg',()=>{
    const c=new ExerciseMotionCounter('leg-raise');ready(c);
    c.update(frame('lift'),300);c.update(frame('lift'),430);
    for(const t of [600,750,900])expect(c.update(frame('partial'),t).snapshot.count).toBe(0);
    c.update(frame('rest'),1000);expect(c.update(frame('rest'),1110).snapshot.count).toBe(1);
  });
  it('preserves completed repetitions across a long gap and recalibration',()=>{
    const c=new ExerciseMotionCounter('leg-raise');expect(rep(c).count).toBe(1);
    c.update(frame('lift'),1050);c.update(frame('lift'),1180);
    c.update(frame('rest'),1781);expect(c.update(frame('rest'),1891).snapshot.count).toBe(1);
    expect(c.recalibrate().snapshot.count).toBe(1);
    expect(rep(c,2100,'right').count).toBe(2);
    c.reset();expect(rep(c).count).toBe(1);
  });
  it('rejects stale and invalid timestamps',()=>{
    const c=new ExerciseMotionCounter('leg-raise');ready(c);
    for(const t of [200,199,NaN,Infinity,-1])expect(c.update(frame('lift'),t).snapshot.phase).toBe('ready');
    expect(rep(c,400).count).toBe(1);
  });
  it('rejects tiny or degenerate geometry and invalid frame dimensions',()=>{
    const p=frame('lift');p[25]={...p[23]};
    expect(measureExercise('leg-raise',p)).toBeNull();
    expect(measureExercise('leg-raise',frame('lift','left',1,.12))).toBeNull();
    for(const ratio of [0,-1,NaN,Infinity,6])expect(measureExercise('leg-raise',frame('lift'),ratio)).toBeNull();
  });
  it.each([9/16,1,16/9])('accepts complete cycles on either side at aspect %s',ratio=>{
    for(const side of ['left','right'] as const)for(const scale of [.4,.55])for(const mirror of [false,true]){
      const c=new ExerciseMotionCounter('leg-raise');
      expect(rep(c,0,side,ratio,scale,mirror).count).toBe(1);
      for(let t=1100;t<=1700;t+=100)expect(c.update(frame('rest',side,ratio,scale,mirror),t,ratio).snapshot.count).toBe(1);
    }
  });
  it('counts exactly twenty complete cycles at two tempos',()=>{
    for(const tempo of [1,1.25]){
      const c=new ExerciseMotionCounter('leg-raise');
      for(let i=0;i<20;i++)expect(rep(c,i*1100*tempo,'left',16/9,.55,false,tempo).count).toBe(i+1);
    }
  });
});
