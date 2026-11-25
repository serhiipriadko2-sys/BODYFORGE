import { describe, expect, it } from 'vitest';
import { SquatCounter, type PosePoint } from './squatCounter';
import { ExerciseMotionCounter } from './exerciseCounter';
import type { ExerciseId } from './trainingCatalog';

type MotionId=Exclude<ExerciseId,'squat'>;
function readyPose(id:MotionId):PosePoint[]{
  const p:PosePoint[]=Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
  const rows:Record<MotionId,Record<number,[number,number]>>={
    lunge:{23:[.4,.35],25:[.4,.55],27:[.4,.75],24:[.6,.35],26:[.6,.55],28:[.6,.75]},
    pushup:{11:[.23,.45],13:[.25,.60],15:[.27,.75],23:[.5,.5],27:[.78,.56]},
    'jumping-jack':{11:[.42,.27],12:[.58,.27],23:[.43,.5],24:[.57,.5],15:[.43,.58],16:[.57,.58],27:[.45,.85],28:[.55,.85]},
    'high-knees':{23:[.43,.45],24:[.57,.45],25:[.43,.64],26:[.57,.64],27:[.43,.82],28:[.57,.82]},
    crunch:{11:[.29,.69],23:[.52,.69],25:[.68,.55],27:[.74,.75]},
    'leg-raise':{11:[.25,.65],23:[.48,.65],25:[.65,.65],27:[.78,.65]},
    plank:{11:[.22,.55],13:[.24,.68],23:[.50,.56],27:[.80,.57]},
  };
  for(const [i,[x,y]] of Object.entries(rows[id]))p[Number(i)]={x,y,visibility:.99,presence:.99};
  return p;
}
describe('BF-211 calibration is observation-driven',()=>{
  it('exposes only the existing squat calibration duration, never a fabricated countdown',()=>{
    const c=new SquatCounter();
    expect(c.update(170,0).calibrationRemainingMs).toBe(145);
    expect(c.update(170,80).calibrationRemainingMs).toBe(65);
    expect(c.update(170,80).calibrationRemainingMs).toBeNull();
    expect(c.update(170,145).calibrationRemainingMs).toBeNull();
    expect(c.recalibrate().calibrationRemainingMs).toBeNull();
  });
  it('clears the squat countdown on loss and starts fresh when the pose returns',()=>{
    const c=new SquatCounter();
    expect(c.update(170,0).calibrationRemainingMs).toBe(145);
    expect(c.update(null,80).calibrationRemainingMs).toBeNull();
    expect(c.update(170,100).calibrationRemainingMs).toBe(145);
    expect(c.update(170,245).calibrated).toBe(true);
  });
  it.each(['lunge','pushup','jumping-jack','high-knees','crunch','leg-raise','plank'] as MotionId[])('%s reports remaining time from valid observations',id=>{
    const c=new ExerciseMotionCounter(id),p=readyPose(id),duration=id==='plank'?300:160;
    expect(c.update(p,0).snapshot.calibrationRemainingMs).toBe(duration);
    expect(c.update(p,80).snapshot.calibrationRemainingMs).toBe(duration-80);
    expect(c.update(p,80).snapshot.calibrationRemainingMs).toBeNull();
    expect(c.update([],90).snapshot.calibrationRemainingMs).toBeNull();
    expect(c.update(p,100).snapshot.calibrationRemainingMs).toBe(duration);
    const ready=c.update(p,100+duration).snapshot;
    expect(ready.calibrated).toBe(true);
    expect(ready.calibrationRemainingMs).toBeNull();
    expect(c.recalibrate().snapshot.calibrationRemainingMs).toBeNull();
  });
  it('does not display a countdown for an observed but misaligned plank',()=>{
    const c=new ExerciseMotionCounter('plank'),p=readyPose('plank');p[23].y=.83;
    const s=c.update(p,0).snapshot;
    expect(s.angle).not.toBeNull();expect(s.calibrationRemainingMs).toBeNull();expect(s.calibrated).toBe(false);
  });
});
