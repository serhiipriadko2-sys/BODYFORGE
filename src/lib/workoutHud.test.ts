import { describe, expect, it } from 'vitest';
import { deriveWorkoutHud, deriveCompletionHud } from './workoutHud';
import { EXERCISE_GUIDES } from './trainingCatalog';
import type { CounterSnapshot } from './squatCounter';
import type { PoseGuidance } from './poseGuidance';
const snapshot=(patch:Partial<CounterSnapshot>={}):CounterSnapshot=>({
  count:0,phase:'calibrate',feedback:'stand',angle:170,counted:false,calibrated:false,
  standingAngle:null,depthTarget:null,returnTarget:null,lowestAngle:null,calibrationRemainingMs:null,...patch,
});
const tracked:PoseGuidance={kind:'tracked',title:'TRACKED',instruction:'tracked guidance',warning:false};
const stale:PoseGuidance={kind:'no-person',title:'NO PERSON',instruction:'stale warning',warning:true};
const cropped:PoseGuidance={kind:'too-close',title:'EDGE',instruction:'move away',warning:true};
describe('BF-211 camera HUD observation and payment boundaries',()=>{
  it.each(EXERCISE_GUIDES.map(g=>g.id))('%s separates preparation, observed calibration and ready/hold',id=>{
    expect(deriveWorkoutHud(id,snapshot(),tracked,true,false,null)).toMatchObject({state:'prepare',calibrationRemainingMs:null});
    expect(deriveWorkoutHud(id,snapshot({calibrationRemainingMs:120}),stale,true,false,null))
      .toMatchObject({state:'calibrate',calibrationRemainingMs:120,coach:null});
    expect(deriveWorkoutHud(id,snapshot({phase:id==='plank'?'bottom':'ready',calibrated:true}),stale,true,false,null))
      .toMatchObject({state:id==='plank'?'hold':'ready',calibrationRemainingMs:null,coach:null});
  });
  it('stalled stream wins over stale valid snapshots',()=>{
    expect(deriveWorkoutHud('plank',snapshot({phase:'bottom',calibrated:true,count:29}),tracked,true,true,'left'))
      .toMatchObject({state:'stalled',showMetric:false,calibrationRemainingMs:null,coach:{kind:'camera-stalled'}});
  });
  it('does not present stale tracked guidance as a valid observation',()=>{
    expect(deriveWorkoutHud('pushup',snapshot({angle:null,calibrationRemainingMs:80}),tracked,true,false,'left'))
      .toMatchObject({state:'lost',showMetric:false,calibrationRemainingMs:null,coach:{kind:'pose-unconfirmed'}});
  });
  it('gives a specific framing warning when the counter has no angle',()=>{
    expect(deriveWorkoutHud('leg-raise',snapshot({angle:null}),cropped,true,false,null))
      .toMatchObject({state:'lost',coach:{kind:'too-close',title:'EDGE',instruction:'move away'}});
  });
  it('immediately handles no pose without carrying an unrelated old warning',()=>{
    expect(deriveWorkoutHud('squat',snapshot({angle:null}),cropped,false,false,null))
      .toMatchObject({state:'lost',showMetric:false,coach:{kind:'no-person'}});
  });
  it('keeps the existing squat crop warning advisory for a valid angle',()=>{
    expect(deriveWorkoutHud('squat',snapshot({phase:'ready',calibrated:true}),cropped,true,false,'left'))
      .toMatchObject({state:'ready',showMetric:true,coach:{kind:'too-close'}});
  });
  it('does not borrow a countdown from invalid or already calibrated state',()=>{
    for(const ms of [NaN,Infinity,-1,0,undefined]){
      expect(deriveWorkoutHud('crunch',snapshot({calibrationRemainingMs:ms}),tracked,true,false,null).calibrationRemainingMs).toBeNull();
    }
    expect(deriveWorkoutHud('crunch',snapshot({phase:'ready',calibrated:true,calibrationRemainingMs:100}),tracked,true,false,null).calibrationRemainingMs).toBeNull();
  });
  it('does not render non-finite angle as an observed pose',()=>{
    expect(deriveWorkoutHud('squat',snapshot({angle:NaN}),tracked,true,false,null)).toMatchObject({state:'lost',showMetric:false});
  });
  it('renders a lost plank as paused rather than holding',()=>{
    const hud=deriveWorkoutHud('plank',snapshot({phase:'bottom',calibrated:true,count:29,angle:null}),tracked,true,false,'left');
    expect(hud.state).toBe('lost');expect(hud.title).toContain('ПРИОСТАНОВЛЕН');
  });
  it('retains adaptive squat targets',()=>{
    const s=snapshot({phase:'descending',calibrated:true,depthTarget:115,returnTarget:160});
    expect(deriveWorkoutHud('squat',s,tracked,true,false,'right')).toMatchObject({state:'move',target:'ПРИСЕСТЬ ≤ 115°',focus:'ПРАВАЯ НОГА'});
    expect(deriveWorkoutHud('squat',{...s,phase:'bottom'},tracked,true,false,'right')).toMatchObject({state:'return',target:'ВСТАТЬ ≥ 160°'});
  });
  it('presentation does not mutate snapshots or guidance',()=>{
    const s=Object.freeze(snapshot({calibrationRemainingMs:100})),g=Object.freeze(tracked);
    expect(deriveWorkoutHud('lunge',s,g,true,false,null).state).toBe('calibrate');
    expect(s.calibrationRemainingMs).toBe(100);
  });
  it.each(['idle','saving-result','durable-pending','quarantined'] as const)('never shows paid reward in %s',phase=>{
    const hud=deriveCompletionHud(phase,'plank');
    expect(hud.showReward).toBe(false);
    expect(hud.feedback).not.toContain('Герой стал сильнее');
    expect(hud.status).not.toContain('30 СЕКУНД УДЕРЖАНИЯ');
  });
  it('shows paid success only for credited results with the correct unit',()=>{
    expect(deriveCompletionHud('credited','plank')).toMatchObject({showReward:true,status:'30 СЕКУНД УДЕРЖАНИЯ'});
    expect(deriveCompletionHud('credited','pushup')).toMatchObject({showReward:true,status:'20 ЗАСЧИТАННЫХ ПОВТОРЕНИЙ'});
  });
});

describe('BF-211 localized display integrity',()=>{
  const readable=(text:string)=>{
    expect(text).toMatch(/[\u0400-\u04ff]/);
    expect(text).not.toMatch(/\?{2,}|\ufffd/);
  };
  it.each(EXERCISE_GUIDES.map(g=>g.id))('%s renders readable instructions',id=>{
    for(const s of [
      snapshot(),snapshot({calibrationRemainingMs:120}),
      snapshot({phase:'ready',calibrated:true}),
      snapshot({phase:'descending',calibrated:true}),
      snapshot({phase:'bottom',calibrated:true}),
      snapshot({angle:null}),
    ]){
      const h=deriveWorkoutHud(id,s,tracked,true,false,'left');
      for(const value of [h.title,h.target,h.instruction,h.focus])readable(value);
      if(h.coach){readable(h.coach.title);readable(h.coach.instruction)}
    }
    for(const phase of ['idle','saving-result','durable-pending','quarantined','credited'] as const){
      const h=deriveCompletionHud(phase,id);
      for(const value of [h.title,h.status,h.feedback])readable(value);
    }
  });
});
