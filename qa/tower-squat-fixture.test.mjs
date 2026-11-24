import test from 'node:test';
import assert from 'node:assert/strict';
import { createTowerSquatFixture } from './tower-squat-fixture.mjs';
import { SquatCounter, StableKneeTracker } from '../src/lib/squatCounter.ts';

function points(angle, ratio) {
  const r = (180 - angle) * Math.PI / 180;
  const p = Array.from({length:33}, () => ({x:.5,y:.5,visibility:0}));
  p[23] = {x:.5,y:.30,visibility:.98};
  p[25] = {x:.5,y:.51,visibility:.98};
  p[27] = {x:.5+.22*Math.sin(r)/ratio,y:.51+.22*Math.cos(r),visibility:.98};
  return p;
}
function exercise(intervals, ratio) {
  const f = createTowerSquatFixture(), c = new SquatCounter(), tracker = new StableKneeTracker();
  let time = 0, count = 0, doneAt = null, started = null;
  for (let i=0; i<1200; i++) {
    time += intervals[i%intervals.length];
    const reading = tracker.update(points(f.sample(time),ratio),ratio);
    const s = c.update(reading.angle,time,reading.side);
    if(s.calibrated && started === null) started=time;
    count=s.count;
    if(count===20 && doneAt===null) doneAt=time-started;
    if(f.diagnostics().phase==='done' && i>500) break;
  }
  assert.equal(f.diagnostics().failure,null);
  assert.equal(f.diagnostics().cycles,20);
  assert.equal(count,20,'finite fixture must produce exactly 20 credited repetitions');
  assert.ok(doneAt!==null && doneAt<=70000, 'fixture fits final-floor budget under declared frame schedules');
  return doneAt;
}
for (const intervals of [[90],[100],[160],[250],[330],[97,323,125,441,91,200],[180,500,95,340,210,130]]) {
  test('finite fixture counts exactly 20 under cadence '+intervals.join('/'),()=>{
    for(const ratio of [4/3,9/16,16/9]) exercise(intervals,ratio);
  });
}
test('rejects broken time and long gaps instead of hiding interrupted motion',()=>{
  const f=createTowerSquatFixture();
  f.sample(100); f.sample(200); f.sample(1200);
  assert.match(f.diagnostics().failure,/gap/);
  assert.equal(f.sample(1300),174);
  const b=createTowerSquatFixture(); b.sample(100); b.sample(100);
  assert.match(b.diagnostics().failure,/non-monotonic/);
});
test('never emits more than the requested complete cycles',()=>{
  const f=createTowerSquatFixture(1);
  for(let t=0;t<10000;t+=100) f.sample(t);
  assert.equal(f.diagnostics().cycles,1);
  assert.equal(f.diagnostics().phase,'done');
  assert.equal(f.sample(10100),174);
});
