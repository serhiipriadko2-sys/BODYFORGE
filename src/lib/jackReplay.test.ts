import { describe, expect, it } from 'vitest';
import { ExerciseMotionCounter, measureExercise } from './exerciseCounter';
import { assessExerciseFraming } from './exerciseFraming';
import type { PosePoint } from './squatCounter';

type Pose = 'closed' | 'open' | 'arms-only' | 'legs-only' | 'one-arm' | 'mixed-return' | 'inverted';
const required = [11,12,15,16,23,24,27,28];
function frame(kind:Pose, ratio=1, scale=1, mirror=false):PosePoint[] {
  const p:PosePoint[]=Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
  const rows:Record<number,[number,number]>={11:[.42,.27],12:[.58,.27],23:[.43,.50],24:[.57,.50],
    15:[.43,.58],16:[.57,.58],27:[.45,.85],28:[.55,.85]};
  if(['open','arms-only'].includes(kind)) Object.assign(rows,{15:[.28,.08],16:[.72,.08]});
  if(['open','legs-only','one-arm','mixed-return','inverted'].includes(kind)) Object.assign(rows,{27:[.25,.83],28:[.75,.83]});
  if(kind==='one-arm') rows[15]=[.28,.08];
  if(kind==='mixed-return') rows[16]=[.72,.08];
  if(kind==='inverted') Object.assign(rows,{15:[.28,.08],16:[.72,.08],27:[.25,.40],28:[.75,.40]});
  for(const [i,[x,y]] of Object.entries(rows)) p[Number(i)]={x:.5+(x-.5)*scale/ratio*(mirror?-1:1),y:.5+(y-.5)*scale,visibility:.99,presence:.99};
  return p;
}
const hidden=(kind:Pose,index:number)=>{const p=frame(kind);p[index].visibility=0;return p;};
function ready(c:ExerciseMotionCounter,start=0,ratio=1,scale=1,mirror=false){
  for(const t of [0,100]) c.update(frame('closed',ratio,scale,mirror),start+t,ratio);
  return c.update(frame('closed',ratio,scale,mirror),start+200,ratio).snapshot;
}
function rep(c:ExerciseMotionCounter,start=0,ratio=1,scale=1,mirror=false){
  ready(c,start,ratio,scale,mirror);
  for(const [t,pose] of [[300,'open'],[430,'open'],[740,'closed'],[850,'closed']] as const)
    c.update(frame(pose,ratio,scale,mirror),start+t,ratio);
  return c.update(frame('closed',ratio,scale,mirror),start+950,ratio).snapshot;
}
describe('BF-206 coordinated jumping-jack replay',()=>{
  it.each(required)('requires the visible joint %s in both phases',i=>{
    expect(measureExercise('jumping-jack',hidden('closed',i))).toBeNull();
    expect(measureExercise('jumping-jack',hidden('open',i))).toBeNull();
  });
  it.each(['visibility','presence'] as const)('rejects impossible %s',key=>{
    const p=frame('open');p[16][key]=1.01;
    expect(measureExercise('jumping-jack',p)).toBeNull();
  });
  it.each([15,16,27,28])('shares the existing cropped-joint margin for joint %s',i=>{
    const p=frame('open');p[i].x=.976;
    expect(assessExerciseFraming('jumping-jack',p)).toMatchObject({kind:'too-close',warning:true});
    expect(measureExercise('jumping-jack',p)).toBeNull();
  });
  it('requires both feet below their hips in the upright projection',()=>{
    expect(measureExercise('jumping-jack',frame('inverted'))).toBeNull();
  });
  it.each(['arms-only','legs-only','one-arm','mixed-return'] as const)('does not count %s without simultaneous opening',pose=>{
    const c=new ExerciseMotionCounter('jumping-jack');ready(c);
    for(const [t,p] of [[300,pose],[430,pose],[740,'closed'],[850,'closed']] as const) c.update(frame(p),t);
    expect(c.update(frame('closed'),950).snapshot.count).toBe(0);
  });
  it('does not combine arms-only and legs-only into one open phase',()=>{
    const c=new ExerciseMotionCounter('jumping-jack');ready(c);
    for(const [t,p] of [[300,'arms-only'],[430,'legs-only'],[550,'arms-only'],[680,'legs-only'],[850,'closed'],[960,'closed']] as const)
      c.update(frame(p),t);
    expect(c.update(frame('closed'),1060).snapshot.count).toBe(0);
  });
  it('does not combine two disconnected brief open phases',()=>{
    const c=new ExerciseMotionCounter('jumping-jack');ready(c);
    c.update(frame('open'),300);c.update(frame('arms-only'),370);c.update(frame('open'),430);
    c.update(frame('closed'),740);
    expect(c.update(frame('closed'),850).snapshot.count).toBe(0);
  });
  it('requires visible closed calibration without borrowing missing time',()=>{
    const c=new ExerciseMotionCounter('jumping-jack');
    c.update(frame('closed'),0);c.update(hidden('closed',16),100);
    expect(c.update(frame('closed'),200).snapshot.phase).toBe('calibrate');
    expect(c.update(frame('closed'),380).snapshot.phase).toBe('ready');
  });
  it.each([15,16,27,28])('cancels partial completion on loss of joint %s during return',i=>{
    const c=new ExerciseMotionCounter('jumping-jack');ready(c);
    c.update(frame('open'),300);c.update(frame('open'),430);c.update(frame('closed'),740);
    c.update(hidden('closed',i),800);
    expect(c.update(frame('closed'),900).snapshot.count).toBe(0);
    expect(c.update(frame('closed'),1100).snapshot.count).toBe(0);
    expect(rep(c,1300).count).toBe(1);
  });
  it('rejects cropped open observations before they can arm a repetition',()=>{
    const c=new ExerciseMotionCounter('jumping-jack');ready(c);
    const p=frame('open');p[15].y=.02;
    c.update(p,300);c.update(p,430);c.update(frame('closed'),740);
    expect(c.update(frame('closed'),850).snapshot.count).toBe(0);
  });
  it('requires both arms and both legs to close before crediting the repetition',()=>{
    const c=new ExerciseMotionCounter('jumping-jack');ready(c);
    c.update(frame('open'),300);c.update(frame('open'),430);
    c.update(frame('legs-only'),600);c.update(frame('arms-only'),750);
    expect(c.update(frame('mixed-return'),900).snapshot.count).toBe(0);
    c.update(frame('closed'),1000);
    expect(c.update(frame('closed'),1110).snapshot.count).toBe(1);
  });
  it('rejects an unobserved start after a long idle gap',()=>{
    const c=new ExerciseMotionCounter('jumping-jack');ready(c);
    c.update(frame('open'),750);c.update(frame('open'),880);c.update(frame('closed'),1190);
    expect(c.update(frame('closed'),1300).snapshot.count).toBe(0);
  });
  it('preserves prior repetitions across a long partial gap or recalibration',()=>{
    const c=new ExerciseMotionCounter('jumping-jack');expect(rep(c).count).toBe(1);
    c.update(frame('open'),1050);c.update(frame('open'),1180);
    c.update(frame('closed'),1781);
    expect(c.update(frame('closed'),1891).snapshot.count).toBe(1);
    expect(c.recalibrate().snapshot.count).toBe(1);
    expect(rep(c,2100).count).toBe(2);
  });
  it('rejects invalid or duplicate time observations',()=>{
    const c=new ExerciseMotionCounter('jumping-jack');ready(c);
    for(const t of [200,199,NaN,Infinity,-1]) expect(c.update(frame('open'),t).snapshot.phase).toBe('ready');
    expect(rep(c,400).count).toBe(1);
  });
  it('rejects invalid frame geometry and undersized silhouettes',()=>{
    for(const ratio of [0,-1,NaN,Infinity,6]) expect(measureExercise('jumping-jack',frame('open'),ratio)).toBeNull();
    expect(measureExercise('jumping-jack',frame('open',1,.12))).toBeNull();
  });
  it.each([9/16,1,16/9])('accepts full cycles at different scales and mirrored views, ratio %s',ratio=>{
    for(const scale of [.55,.4]) for(const mirror of [false,true]){
      const c=new ExerciseMotionCounter('jumping-jack');
      expect(rep(c,0,ratio,scale,mirror).count).toBe(1);
      for(let t=1100;t<=1900;t+=100) expect(c.update(frame('closed',ratio,scale,mirror),t,ratio).snapshot.count).toBe(1);
    }
  });
  it('counts exactly twenty coordinated full cycles, never a static open pose',()=>{
    const c=new ExerciseMotionCounter('jumping-jack');
    for(let i=0;i<20;i++) expect(rep(c,i*1100).count).toBe(i+1);
    const staticPose=new ExerciseMotionCounter('jumping-jack');
    for(let i=0;i<30;i++) expect(staticPose.update(frame('open'),i*100).snapshot.count).toBe(0);
  });
});
