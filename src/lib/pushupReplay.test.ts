import { describe, expect, it } from 'vitest';
import { ExerciseMotionCounter, measureExercise } from './exerciseCounter';
import { assessExerciseFraming } from './exerciseFraming';
import type { PosePoint } from './squatCounter';

type Side = 'left' | 'right';
type Pose = 'ready' | 'active' | 'partial' | 'upright' | 'hips' | 'raised-wrist' | 'head';
const blank = (): PosePoint[] => Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
function frame(kind:Pose, side:Side='left', ratio=1, scale=1, mirrored=false):PosePoint[] {
  const p=blank(), offset=side==='right'?1:0;
  const rows:Record<number,[number,number]>={11:[.23,.45],13:[.25,.60],15:[.27,.75],23:[.50,.50],27:[.78,.56]};
  if(kind==='active') Object.assign(rows,{13:[.38,.53],15:[.29,.67]});
  if(kind==='partial') Object.assign(rows,{13:[.34,.60]});
  if(kind==='upright') Object.assign(rows,{11:[.45,.15],13:[.45,.3],15:[.45,.45],23:[.45,.52],27:[.45,.85]});
  if(kind==='hips') Object.assign(rows,{23:[.50,.85]});
  if(kind==='raised-wrist') Object.assign(rows,{13:[.38,.53],15:[.29,.31]});
  if(kind==='head') Object.assign(rows,{0:[.20,.36]});
  for(const [i,[x,y]] of Object.entries(rows)) p[Number(i)+(i==='0'?0:offset)]={
    x:.5+(x-.5)*scale/ratio*(mirrored?-1:1),y:.5+(y-.5)*scale,visibility:.99,presence:.99,
  };
  return p;
}
function hide(kind:Pose,index:number,side:Side='left') {
  const p=frame(kind,side);p[index].visibility=0;return p;
}
function ready(c:ExerciseMotionCounter,start=0,side:Side='left',ratio=1,scale=1,mirrored=false) {
  for(const t of [0,100]) c.update(frame('ready',side,ratio,scale,mirrored),start+t,ratio);
  return c.update(frame('ready',side,ratio,scale,mirrored),start+200,ratio).snapshot;
}
function rep(c:ExerciseMotionCounter,start=0,side:Side='left',ratio=1,scale=1,mirrored=false) {
  ready(c,start,side,ratio,scale,mirrored);
  for(const [t,pose] of [[300,'active'],[430,'active'],[740,'ready'],[850,'ready']] as const)
    c.update(frame(pose,side,ratio,scale,mirrored),start+t,ratio);
  return c.update(frame('ready',side,ratio,scale,mirrored),start+950,ratio).snapshot;
}
describe('BF-205 pushup observation replay',()=>{
  it.each([11,13,15,23,27])('requires a complete visible side (missing %s)',i=>{
    expect(measureExercise('pushup',hide('active',i))).toBeNull();
  });
  it.each(['visibility','presence'] as const)('rejects impossible %s for the measured side',key=>{
    const p=frame('active');p[15][key]=1.01;
    expect(measureExercise('pushup',p)).toBeNull();
  });
  it('rejects a raised wrist in a horizontal pose rather than treating an arm gesture as a pushup',()=>{
    expect(measureExercise('pushup',frame('raised-wrist'))).toBeNull();
  });
  it('shares the existing cropped-joint margin with framing advice',()=>{
    const p=frame('active');p[27].x=.976;
    expect(assessExerciseFraming('pushup',p)).toMatchObject({kind:'too-close',warning:true});
    expect(measureExercise('pushup',p)).toBeNull();
  });
  it('rejects a vertical or severely bent body and invalid camera dimensions',()=>{
    expect(measureExercise('pushup',frame('upright'))).toBeNull();
    expect(measureExercise('pushup',frame('hips'))).toBeNull();
    for(const ratio of [0,-1,NaN,Infinity,6]) expect(measureExercise('pushup',frame('active'),ratio)).toBeNull();
  });
  it('does not count movement of head or hips alone, even with repeated standing frames',()=>{
    const c=new ExerciseMotionCounter('pushup');ready(c);
    for(let t=300;t<=1500;t+=100) c.update(frame(t%300===0?'hips':'head'),t);
    expect(c.update(frame('ready'),1600).snapshot.count).toBe(0);
  });
  it('cannot accumulate calibration time across opposite body sides',()=>{
    const c=new ExerciseMotionCounter('pushup');
    c.update(frame('ready','left'),0);
    expect(c.update(frame('ready','right'),200).snapshot.phase).toBe('calibrate');
    expect(ready(c,300,'right').phase).toBe('ready');
  });
  it('cannot begin with one side calibrated and count the other side already bent',()=>{
    const c=new ExerciseMotionCounter('pushup');ready(c);
    c.update(frame('active','right'),300);c.update(frame('active','right'),430);
    c.update(frame('ready','right'),740);
    expect(c.update(frame('ready','right'),850).snapshot.count).toBe(0);
    expect(rep(c,1100,'right').count).toBe(1);
  });
  it('does not join an interrupted descent with a return after switching visible side',()=>{
    const c=new ExerciseMotionCounter('pushup');ready(c);
    c.update(frame('active'),300);c.update(frame('active'),430);
    c.update(frame('active','right'),550);
    c.update(frame('ready'),740);
    expect(c.update(frame('ready'),850).snapshot.count).toBe(0);
    expect(rep(c,1100).count).toBe(1);
  });
  it('requires consecutive valid calibration frames',()=>{
    const c=new ExerciseMotionCounter('pushup');
    c.update(frame('ready'),0);c.update(hide('ready',15),100);
    expect(c.update(frame('ready'),200).snapshot.phase).toBe('calibrate');
    expect(c.update(frame('ready'),380).snapshot.phase).toBe('ready');
  });
  it('does not join two disconnected short bends into a sustained lower phase',()=>{
    const c=new ExerciseMotionCounter('pushup');ready(c);
    c.update(frame('active'),300);c.update(frame('partial'),370);
    c.update(frame('active'),430);c.update(frame('ready'),740);
    expect(c.update(frame('ready'),850).snapshot.count).toBe(0);
  });
  it.each([13,15,27])('cancels an unfinished cycle when joint %s disappears at return',index=>{
    const c=new ExerciseMotionCounter('pushup');ready(c);
    c.update(frame('active'),300);c.update(frame('active'),430);
    c.update(frame('ready'),740);c.update(hide('ready',index),800);
    expect(c.update(frame('ready'),900).snapshot.count).toBe(0);
    expect(c.update(frame('ready'),1100).snapshot.count).toBe(0);
    expect(rep(c,1300).count).toBe(1);
  });
  it('does not complete an unfinished cycle if the body is no longer horizontal',()=>{
    const c=new ExerciseMotionCounter('pushup');ready(c);
    c.update(frame('active'),300);c.update(frame('active'),430);
    c.update(frame('upright'),550);c.update(frame('ready'),740);
    expect(c.update(frame('ready'),850).snapshot.count).toBe(0);
  });
  it('does not advance phases on invalid or duplicate timestamps',()=>{
    const c=new ExerciseMotionCounter('pushup');ready(c);
    for(const t of [200,199,NaN,Infinity,-1]) expect(c.update(frame('active'),t).snapshot.phase).toBe('ready');
    expect(rep(c,400).count).toBe(1);
  });
  it('preserves completed repetitions but rejects an unfinished movement across a long gap',()=>{
    const c=new ExerciseMotionCounter('pushup');expect(rep(c).count).toBe(1);
    c.update(frame('active'),1050);c.update(frame('active'),1180);
    c.update(frame('ready'),1781);
    expect(c.update(frame('ready'),1891).snapshot.count).toBe(1);
    expect(rep(c,2100).count).toBe(2);
  });
  it('recalibrates after a long idle observation gap rather than borrowing an old ready pose',()=>{
    const c=new ExerciseMotionCounter('pushup');ready(c);
    c.update(frame('active'),750);c.update(frame('active'),880);
    c.update(frame('ready'),1190);
    expect(c.update(frame('ready'),1300).snapshot.count).toBe(0);
  });
  it.each([1,16/9,9/16])('accepts complete cycles on either visible side and mirrored views at aspect %s',ratio=>{
    for(const scale of [.55,.4]) for(const side of ['left','right'] as const) for(const mirrored of [false,true]){
      const c=new ExerciseMotionCounter('pushup');
      expect(rep(c,0,side,ratio,scale,mirrored).count).toBe(1);
      for(let t=1100;t<=1900;t+=100)
        expect(c.update(frame('ready',side,ratio,scale,mirrored),t,ratio).snapshot.count).toBe(1);
    }
  });
  it('counts exactly twenty complete repetitions while preserving their side identity',()=>{
    const c=new ExerciseMotionCounter('pushup');
    for(let i=0;i<20;i++) expect(rep(c,i*1100).count).toBe(i+1);
  });
});
