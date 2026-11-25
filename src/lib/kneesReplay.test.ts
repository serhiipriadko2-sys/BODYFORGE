import { describe, expect, it } from 'vitest';
import { ExerciseMotionCounter, measureExercise } from './exerciseCounter';
import { assessExerciseFraming } from './exerciseFraming';
import type { PosePoint } from './squatCounter';
type Side='left'|'right';
type Pose='stand'|Side|'low'|'both'|'bad-support';
function frame(kind:Pose,ratio=1,scale=1,mirror=false):PosePoint[]{
  const p:PosePoint[]=Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
  const rows:Record<number,[number,number]>={23:[.43,.45],24:[.57,.45],25:[.43,.64],26:[.57,.64],27:[.43,.82],28:[.57,.82]};
  if(kind==='left'||kind==='both'||kind==='bad-support') Object.assign(rows,{25:[.44,.44],27:[.46,.66]});
  if(kind==='right'||kind==='both') Object.assign(rows,{26:[.56,.44],28:[.54,.66]});
  if(kind==='low') Object.assign(rows,{25:[.44,.56],27:[.46,.78]});
  if(kind==='bad-support') rows[26]=[.57,.90];
  for(const [i,[x,y]] of Object.entries(rows)) p[Number(i)]={x:.5+(x-.5)*scale/ratio*(mirror?-1:1),y:.5+(y-.5)*scale,visibility:.99,presence:.99};
  return p;
}
const missing=(kind:Pose,i:number)=>{const p=frame(kind);p[i].visibility=0;return p;};
function ready(c:ExerciseMotionCounter,start=0){
  for(const t of [0,100]) c.update(frame('stand'),start+t);
  return c.update(frame('stand'),start+200).snapshot;
}
function rep(c:ExerciseMotionCounter,side:Side,start=0,ratio=1,scale=1,mirror=false,tempo=1){
  let result=c.update(frame('stand',ratio,scale,mirror),start,ratio);
  for(const [t,p] of [[100,'stand'],[200,'stand'],[300,side],[430,side],[620,side],[740,'stand'],[850,'stand'],[950,'stand']] as const)
    result=c.update(frame(p,ratio,scale,mirror),start+t*tempo,ratio);
  return result.snapshot;
}
describe('BF-207 alternating knee observation replay',()=>{
  it.each([23,24,25,26,27,28])('requires joint %s in both phases',i=>{
    expect(measureExercise('high-knees',missing('stand',i))).toBeNull();
    expect(measureExercise('high-knees',missing('left',i))).toBeNull();
  });
  it.each(['visibility','presence'] as const)('rejects impossible %s',key=>{
    const p=frame('left');p[28][key]=1.01;expect(measureExercise('high-knees',p)).toBeNull();
  });
  it.each([23,24,25,26,27,28])('rejects cropped joint %s using the framing margin',i=>{
    const p=frame('left');p[i].x=.976;
    expect(assessExerciseFraming('high-knees',p)).toMatchObject({kind:'too-close',warning:true});
    expect(measureExercise('high-knees',p)).toBeNull();
  });
  it('rejects inverted or degenerate lower-leg geometry rather than accepting a supporting leg',()=>{
    expect(measureExercise('high-knees',frame('bad-support'))).toBeNull();
    const p=frame('left');p[27].y=p[25].y;expect(measureExercise('high-knees',p)).toBeNull();
  });
  it('does not accept an ambiguous two-knee raised pose',()=>{
    expect(measureExercise('high-knees',frame('both'))).toBeNull();
  });
  it('rejects low marches, small jitter, and stationary poses',()=>{
    const c=new ExerciseMotionCounter('high-knees');ready(c);
    for(let i=0;i<40;i++){const p=frame(i%2?'low':'stand');p[25].y+=i%3*.001;expect(c.update(p,300+i*100).snapshot.count).toBe(0);}
  });
  it('does not combine two disconnected brief lifts',()=>{
    const c=new ExerciseMotionCounter('high-knees');ready(c);
    c.update(frame('left'),300);c.update(frame('low'),370);c.update(frame('left'),430);
    c.update(frame('stand'),740);expect(c.update(frame('stand'),850).snapshot.count).toBe(0);
  });
  it('requires consecutive observed calibration frames',()=>{
    const c=new ExerciseMotionCounter('high-knees');
    c.update(frame('stand'),0);c.update(missing('stand',25),100);
    expect(c.update(frame('stand'),200).snapshot.phase).toBe('calibrate');
    expect(c.update(frame('stand'),380).snapshot.phase).toBe('ready');
  });
  it.each([25,26,27,28])('abandons a pending return on loss of joint %s',i=>{
    const c=new ExerciseMotionCounter('high-knees');ready(c);
    c.update(frame('left'),300);c.update(frame('left'),430);c.update(frame('stand'),740);
    c.update(missing('stand',i),800);
    expect(c.update(frame('stand'),900).snapshot.count).toBe(0);
    expect(c.update(frame('stand'),1100).snapshot.count).toBe(0);
    expect(rep(c,'left',1300).count).toBe(1);
  });
  it.each([430,550])('does not substitute the other leg midcycle at %s ms',t=>{
    const c=new ExerciseMotionCounter('high-knees');ready(c);
    c.update(frame('left'),300);if(t===550)c.update(frame('left'),430);
    c.update(frame('right'),t);c.update(frame('stand'),740);
    expect(c.update(frame('stand'),850).snapshot.count).toBe(0);
  });
  it('does not borrow ready state across an unobserved start',()=>{
    const c=new ExerciseMotionCounter('high-knees');ready(c);
    c.update(frame('left'),750);c.update(frame('left'),880);c.update(frame('stand'),1190);
    expect(c.update(frame('stand'),1300).snapshot.count).toBe(0);
  });
  it('requires both knees lowered on return',()=>{
    const c=new ExerciseMotionCounter('high-knees');ready(c);
    c.update(frame('left'),300);c.update(frame('left'),430);
    for(const t of [600,750,900])expect(c.update(frame('low'),t).snapshot.count).toBe(0);
    c.update(frame('stand'),1000);expect(c.update(frame('stand'),1110).snapshot.count).toBe(1);
  });
  it('preserves alternation and count through tracking loss, gap, and recalibration',()=>{
    const c=new ExerciseMotionCounter('high-knees');expect(rep(c,'left').count).toBe(1);
    expect(rep(c,'left',1100).count).toBe(1);
    c.update(missing('stand',28),2200);c.recalibrate();
    expect(rep(c,'left',2400).count).toBe(1);
    expect(rep(c,'right',5000).count).toBe(2);
    expect(rep(c,'right',6100).count).toBe(2);
    expect(rep(c,'left',7200).count).toBe(3);
    c.reset();expect(rep(c,'left').count).toBe(1);
  });
  it('rejects missing observations without incrementing on a hidden march',()=>{
    const c=new ExerciseMotionCounter('high-knees');ready(c);
    c.update(missing('left',28),300);c.update(missing('left',28),430);
    c.update(frame('stand'),740);expect(c.update(frame('stand'),850).snapshot.count).toBe(0);
  });
  it('rejects stale, backwards and nonfinite time',()=>{
    const c=new ExerciseMotionCounter('high-knees');ready(c);
    for(const t of [200,199,NaN,Infinity,-1]) expect(c.update(frame('left'),t).snapshot.phase).toBe('ready');
    expect(rep(c,'left',400).count).toBe(1);
  });
  it.each([9/16,1,16/9])('accepts twenty alternating cycles at varied scales and mirrored views (ratio %s)',ratio=>{
    for(const scale of [.38,.55,1])for(const mirror of [false,true])for(const tempo of [1,1.25]){
      const c=new ExerciseMotionCounter('high-knees');
      for(let i=0;i<20;i++)expect(rep(c,i%2?'right':'left',i*1100*tempo,ratio,scale,mirror,tempo).count).toBe(i+1);
    }
  });
});
