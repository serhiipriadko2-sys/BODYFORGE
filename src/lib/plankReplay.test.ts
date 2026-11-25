import { describe, expect, it } from 'vitest';
import { ExerciseMotionCounter, measureExercise } from './exerciseCounter';
import type { PosePoint } from './squatCounter';

type Side='left'|'right';
type Pose='valid'|'bent'|'upright'|'missing';
const required=[11,13,23,27];
function frame(kind:Pose='valid',side:Side='left',ratio=1,scale=1,mirror=false):PosePoint[]{
  const p:PosePoint[]=Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
  if(kind==='missing')return p;
  const rows:Record<number,[number,number]>={11:[.22,.55],13:[.24,.68],23:[.50,.56],27:[.80,.57]};
  if(kind==='bent')rows[23]=[.50,.83];
  if(kind==='upright')for(const [i,[x,y]] of Object.entries(rows))rows[Number(i)]=[y,1-x];
  for(const [i,[x,y]] of Object.entries(rows))p[Number(i)+(side==='right'?1:0)]={x:.5+(x-.5)*scale/ratio*(mirror?-1:1),y:.5+(y-.5)*scale,visibility:.99,presence:.99};
  return p;
}
function ready(c:ExerciseMotionCounter,side:Side='left',start=0){
  for(const t of [0,100,200])c.update(frame('valid',side),start+t);
  return c.update(frame('valid',side),start+300).snapshot;
}
function hold(c:ExerciseMotionCounter,until=3300){
  ready(c);
  for(let t=400;t<=until;t+=100)c.update(frame(),t);
  return c.update(frame(),until).snapshot;
}
describe('BF-210 plank observed hold time',()=>{
  it.each(required)('requires visible joint %s on the selected side',i=>{
    const p=frame();p[i].visibility=0;
    expect(measureExercise('plank',p)).toBeNull();
  });
  it.each(['visibility','presence'] as const)('rejects impossible confidence %s',key=>{
    const p=frame();p[13][key]=1.01;
    expect(measureExercise('plank',p)).toBeNull();
  });
  it.each(required)('rejects cropped joint %s',i=>{
    const p=frame();p[i].x=.976;
    expect(measureExercise('plank',p)).toBeNull();
  });
  it('rejects invalid dimensions and tiny or degenerate geometry',()=>{
    for(const ratio of [0,-1,NaN,Infinity,6])expect(measureExercise('plank',frame(),ratio)).toBeNull();
    expect(measureExercise('plank',frame('valid','left',1,.10))).toBeNull();
  });
  it('does not calibrate in a bent or upright position',()=>{
    const c=new ExerciseMotionCounter('plank');
    for(let t=0;t<=31000;t+=100)expect(c.update(frame(t%200===0?'bent':'upright'),t).snapshot.count).toBe(0);
  });
  it('does not borrow calibration time across an observation gap greater than 450ms',()=>{
    const c=new ExerciseMotionCounter('plank');
    c.update(frame(),0);
    expect(c.update(frame(),451).snapshot.calibrated).toBe(false);
    expect(c.update(frame(),751).snapshot.calibrated).toBe(true);
  });
  it('does not borrow calibration time across sides',()=>{
    const c=new ExerciseMotionCounter('plank');
    c.update(frame(),0);c.update(frame('valid','right'),150);
    expect(c.update(frame('valid','right'),300).snapshot.calibrated).toBe(false);
    expect(ready(c,'right',500).calibrated).toBe(true);
  });
  it('allows a good side when the opposite side is misaligned before calibration',()=>{
    const p=frame('bent');const right=frame('valid','right');
    for(const i of [12,14,24,28])p[i]=right[i];
    expect(measureExercise('plank',p)).toMatchObject({side:'right',ready:true});
  });
  it('keeps the observed side rather than transferring time to a replacement side',()=>{
    const c=new ExerciseMotionCounter('plank');expect(hold(c).count).toBe(3);
    c.update(frame('valid','right'),3400);
    expect(c.update(frame('valid','right'),3601).snapshot.count).toBe(0);
    expect(c.update(frame('valid','right'),3800).snapshot.calibrated).toBe(false);
  });
  it('continues the locked valid side if both sides are visible',()=>{
    const c=new ExerciseMotionCounter('plank');ready(c,'right');
    const p=frame('valid','right');const left=frame();
    for(const i of required)p[i]=left[i];
    expect(c.update(p,400).side).toBe('right');
    for(let t=500;t<=1300;t+=100)c.update(p,t);
    expect(c.update(p,1400).snapshot.count).toBe(1);
  });
  it('pauses on a short missing observation and excludes all unobserved time',()=>{
    const c=new ExerciseMotionCounter('plank');expect(hold(c).count).toBe(3);
    expect(c.update(frame('missing'),3400).snapshot.count).toBe(3);
    expect(c.update(frame(),3600).snapshot.count).toBe(3); // 300ms from last visible
    for(let t=3700;t<=4500;t+=100)expect(c.update(frame(),t).snapshot.count).toBe(3);
    expect(c.update(frame(),4600).snapshot.count).toBe(4);
  });
  it('resets when a valid frame returns after the 300ms loss grace',()=>{
    const c=new ExerciseMotionCounter('plank');expect(hold(c).count).toBe(3);
    c.update(frame('missing'),3400);
    const recovered=c.update(frame(),3601).snapshot;
    expect(recovered.count).toBe(0);expect(recovered.calibrated).toBe(false);
  });
  it('resets prolonged missing observations without a valid return',()=>{
    const c=new ExerciseMotionCounter('plank');hold(c);
    c.update(frame('missing'),3400);
    expect(c.update(frame('missing'),3601).snapshot.count).toBe(0);
  });
  it('does not finish with a missing final observation or after an expired grace',()=>{
    const c=new ExerciseMotionCounter('plank');expect(hold(c,30200).count).toBe(29);
    expect(c.update(frame('missing'),30300).snapshot.count).toBe(29);
    const recovered=c.update(frame(),30501).snapshot;
    expect(recovered.count).toBe(0);expect(recovered.counted).toBe(false);
  });
  it('resets immediately on a known invalid posture, not a short occlusion pause',()=>{
    const c=new ExerciseMotionCounter('plank');hold(c);
    expect(c.update(frame('bent'),3400).snapshot.count).toBe(0);
    expect(c.update(frame(),3500).snapshot.calibrated).toBe(false);
  });
  it('excludes offline time and resets a 451ms gap during a hold',()=>{
    const c=new ExerciseMotionCounter('plank');hold(c);
    expect(c.update(frame(),3751).snapshot.count).toBe(0);
  });
  it('keeps the existing conservative 180ms credit cap on a 450ms observation gap',()=>{
    const c=new ExerciseMotionCounter('plank');ready(c);
    c.update(frame(),750); // contributes 180ms, not 450ms
    for(let t=850;t<=1550;t+=100)c.update(frame(),t);
    expect(c.update(frame(),1650).snapshot.count).toBe(1);
    expect(c.update(frame(),1750).snapshot.count).toBe(1);
  });
  it('does not advance on duplicate, backward or invalid timestamps',()=>{
    const c=new ExerciseMotionCounter('plank');hold(c);
    for(const t of [3300,3299,NaN,Infinity,-1]){
      const s=c.update(frame(),t).snapshot;expect(s.count).toBe(3);expect(s.counted).toBe(false);
    }
    expect(c.update(frame(),3400).snapshot.count).toBe(3);
  });
  it('resets on explicit recalibration (camera resize/pause) and reset',()=>{
    const c=new ExerciseMotionCounter('plank');hold(c);
    expect(c.recalibrate().snapshot.count).toBe(0);
    expect(c.update(frame(),3400).snapshot.calibrated).toBe(false);
    expect(c.update(frame(),3700).snapshot.calibrated).toBe(true);
    c.reset();expect(ready(c).count).toBe(0);
  });
  it.each([33,50,100,150,180])('measures 30s within one frame interval at %s ms cadence',interval=>{
    const c=new ExerciseMotionCounter('plank');let at=0,started:number|null=null,finish:number|null=null;
    const credited:number[]=[];
    while(at<=32000){
      const s=c.update(frame(),at).snapshot;
      if(s.calibrated&&started===null)started=at;
      if(s.counted)credited.push(s.count);
      if(s.count===30){finish=at;break;}
      at+=interval;
    }
    expect(started).not.toBeNull();expect(finish).not.toBeNull();
    expect(finish!-started!).toBeGreaterThanOrEqual(30000);
    expect(finish!-started!).toBeLessThan(30000+interval+1);
    expect(credited).toEqual(Array.from({length:30},(_,i)=>i+1));
    expect(c.update(frame(),at+interval).snapshot.counted).toBe(false);
  });
  it.each([9/16,1,16/9])('supports mirrored same-side full-body views at aspect %s',ratio=>{
    for(const side of ['left','right'] as const)for(const scale of [.4,.55])for(const mirror of [true,false]){
      const p=frame('valid',side,ratio,scale,mirror);
      expect(measureExercise('plank',p,ratio)?.ready).toBe(true);
      const c=new ExerciseMotionCounter('plank');
      for(let t=0;t<=30300;t+=100)c.update(p,t,ratio);
      expect(c.update(p,30400,ratio).snapshot.count).toBe(30);
    }
  });
});
