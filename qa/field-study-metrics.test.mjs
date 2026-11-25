import test from 'node:test';
import assert from 'node:assert/strict';
import {matchEvents,evaluateFieldStudy,validateDataset} from './field-study-metrics.mjs';

const protocol={protocolId:'protocol-abcdef12',baselineSha256:'a'.repeat(64),candidateSha256:'b'.repeat(64),matchToleranceMs:100,bootstrapSeed:123456,bootstrapSamples:100};
const reference=(eventsMs=[],finished=false)=>({eventsMs,intervalsMs:[],finished,adjudication:'agreed',observerCount:2});
const result=(eventsMs=[],finished=false)=>({eventsMs,intervalsMs:[],finished,trackingCancelled:false,observedMs:10000,latenciesMs:[10,20,30]});
function session(n=1,participant=1,overrides={}){
  return {sessionCode:'s-'+n.toString(16).padStart(8,'0'),participantCode:'p-'+participant.toString(16).padStart(8,'0'),
    split:'holdout',consentConfirmed:true,exerciseId:'squat',deviceClass:'mid',surface:'chrome',condition:'normal',durationMs:10000,
    reference:reference([1000,2000]),baseline:result([1000,3000]),candidate:result([1005,2005]),...overrides};
}
const dataset=(sessions,kind='synthetic')=>({schemaVersion:1,dataKind:kind,protocol:{...protocol},sessions});
test('maximum-cardinality matching does not reuse a prediction or choose nearest-first',()=>{
  assert.deepEqual(matchEvents([100,180],[20,160],80),{tp:2,fp:0,fn:0,totalMatchedErrorMs:100});
});
test('duplicates remain false positives and exact boundary matches',()=>{
  assert.deepEqual(matchEvents([100,300],[100,100,400],100),{tp:2,fp:1,fn:0,totalMatchedErrorMs:100});
});
test('matching minimizes total error among equal-cardinality matchings',()=>{
  assert.deepEqual(matchEvents([100,300],[90,101,302],100),{tp:2,fp:1,fn:0,totalMatchedErrorMs:3});
});
test('empty inputs and undefined denominators are explicit',()=>{
  assert.deepEqual(matchEvents([],[],100),{tp:0,fp:0,fn:0,totalMatchedErrorMs:0});
  const g=evaluateFieldStudy(dataset([session(1,1,{condition:'still',reference:reference(),baseline:result(),candidate:result()})])).groups[0];
  assert.equal(g.candidate.precision,null);assert.equal(g.candidate.recall,null);assert.equal(g.candidate.f1,null);
  assert.equal(g.candidate.falseRepsPerMinute,0);assert.equal(g.uncertainty.intervals,null);
});
test('count MAE does not conceal extra and missing events with equal count',()=>{
  const g=evaluateFieldStudy(dataset([session()])).groups[0];
  assert.equal(g.baseline.countMae,0);assert.equal(g.baseline.precision,.5);assert.equal(g.baseline.recall,.5);
  assert.equal(g.candidate.precision,1);assert.equal(g.candidate.recall,1);
  assert.equal(g.pairedDelta.precision,.5);
});
test('negative false rep rate, false finish, coverage, cancel and latency are separate',()=>{
  const g=evaluateFieldStudy(dataset([session(1,1,{condition:'partial',reference:reference(),
    baseline:{...result([1000,2000],true),observedMs:5000,trackingCancelled:true},candidate:result()})])).groups[0];
  assert.equal(g.baseline.falseRepsPerMinute,12);assert.equal(g.baseline.falseFinishes,1);
  assert.equal(g.baseline.falseFinishRate,1);assert.equal(g.baseline.trackingCancelRate,1);
  assert.equal(g.baseline.trackingCoverage,.5);assert.equal(g.baseline.latencyP95Ms,30);
});
test('plank reports interval overlap and duration error without rep precision',()=>{
  const s=session(1,1,{exerciseId:'plank',reference:{...reference(),intervalsMs:[[1000,5000]]},
    baseline:{...result(),intervalsMs:[[2000,6000]]},candidate:{...result(),intervalsMs:[[1000,4800]]}});
  const g=evaluateFieldStudy(dataset([s])).groups[0];
  assert.equal(g.baseline.plankMaeMs,0);assert.equal(g.baseline.plankIntervalIou,.6);
  assert.equal(g.candidate.plankMaeMs,200);assert.equal(g.candidate.precision,null);assert.equal(g.candidate.countMae,null);
});
test('ambiguous exclusions are reported, including completely excluded strata',()=>{
  const s=session(1,1,{reference:{...reference([1000]),adjudication:'ambiguous'}});
  const g=evaluateFieldStudy(dataset([s])).groups[0];
  assert.equal(g.excludedAmbiguous,1);assert.equal(g.excludedFraction,1);
  assert.equal(g.eligibleSessions,0);assert.equal(g.candidate.precision,null);assert.equal(g.participants,0);
});
test('participant split leakage and duplicate sessions are rejected',()=>{
  assert.throws(()=>validateDataset(dataset([session(),session(2,1,{split:'development'})])),/participant leakage/);
  assert.throws(()=>validateDataset(dataset([session(),session()])),/duplicate session/);
});
test('development and holdout and different device strata stay separate',()=>{
  const r=evaluateFieldStudy(dataset([session(1,1),session(2,2,{split:'development'}),session(3,3,{deviceClass:'low'})]));
  assert.equal(r.groups.length,3);assert.equal(r.groups.reduce((n,x)=>n+x.eligibleSessions,0),3);
});
test('real data requires consent and at least two observer attestations',()=>{
  assert.throws(()=>validateDataset(dataset([session(1,1,{consentConfirmed:false})],'field')),/consent/);
  assert.throws(()=>validateDataset(dataset([session(1,1,{reference:{...reference(),observerCount:1}})],'field')),/observer/);
});
test('unknown fields, invalid times, overlapping intervals and missing candidates fail closed',()=>{
  assert.throws(()=>validateDataset(dataset([{...session(),name:'unexpected'}])),/fields/);
  assert.throws(()=>validateDataset(dataset([session(1,1,{candidate:result([11000])})])),/invalid/);
  assert.throws(()=>validateDataset(dataset([session(1,1,{candidate:result([2000,1000])})])),/order/);
  assert.throws(()=>validateDataset(dataset([session(1,1,{exerciseId:'plank',reference:{...reference(),intervalsMs:[[1,5],[4,8]]}})])),/overlap/);
  const noCandidate=session();delete noCandidate.candidate;
  assert.throws(()=>validateDataset(dataset([noCandidate])),/fields/);
});
test('field input never automatically claims acceptance and synthetic output remains synthetic',()=>{
  for(const kind of ['synthetic','field']){
    const r=evaluateFieldStudy(dataset([session()],kind));
    assert.equal(r.acceptance,'NOT_EVALUATED');
    assert.equal(r.evidenceStatus,kind==='synthetic'?'SYNTHETIC_ONLY':'FIELD_INPUT_NOT_INDEPENDENTLY_VERIFIED');
  }
});
test('paired participant bootstrap is deterministic, keeps the participant as cluster, and reports missing CI denominators',()=>{
  const d=dataset([session(1,1),session(2,1),session(3,2)]);
  const a=evaluateFieldStudy(d),b=evaluateFieldStudy(d);
  assert.deepEqual(a,b);
  const u=a.groups[0].uncertainty;
  assert.equal(u.participants,2);assert.equal(u.resamples,100);
  assert.deepEqual(u.intervals.precision.delta,{nDefined:100,lower:.5,upper:.5});
  assert.deepEqual(u.intervals.plankMaeMs.delta,{nDefined:0,lower:null,upper:null});
  assert.equal(JSON.stringify(a).includes('p-00000001'),false);
});
test('analysis never mutates the input',()=>{
  const d=dataset([session()]);
  const before=JSON.stringify(d);
  evaluateFieldStudy(d);
  assert.equal(JSON.stringify(d),before);
});

test('event matching agrees with independent exhaustive assignments on small inputs',()=>{
  const sets=Array.from({length:16},(_,mask)=>[0,1,2,3].filter(i=>mask&(1<<i)));
  const multisets=[[]];
  function extend(xs,minimum){
    if(xs.length===3)return;
    for(let i=minimum;i<4;i++){
      const ys=[...xs,i];multisets.push(ys);extend(ys,i);
    }
  }
  extend([],0);
  function oracle(ref,pred,tol){
    let best={count:-1,cost:Infinity};
    function search(i,used,count,cost){
      if(i===ref.length){
        if(count>best.count||count===best.count&&cost<best.cost)best={count,cost};
        return;
      }
      search(i+1,used,count,cost);
      pred.forEach((v,j)=>{
        const delta=Math.abs(ref[i]-v);
        if(!(used&(1<<j))&&delta<=tol)search(i+1,used|(1<<j),count+1,cost+delta);
      });
    }
    search(0,0,0,0);
    return {tp:best.count,fp:pred.length-best.count,fn:ref.length-best.count,totalMatchedErrorMs:best.cost};
  }
  let cases=0;
  for(const r of sets)for(const p of multisets)for(const t of [0,1,2,3]){
    assert.deepEqual(matchEvents(r,p,t),oracle(r,p,t),JSON.stringify({r,p,t}));cases++;
  }
  assert.equal(cases,2240);
});
