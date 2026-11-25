// BF-213 offline analysis helper. No field-data collection, network, or writes.
// Input is an explicitly selected, pseudonymized dataset. Outputs aggregate only.
// Synthetic tests exercise calculations, not detector accuracy or study approval.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const EXERCISES=new Set(['squat','pushup','lunge','jumping-jack','high-knees','crunch','leg-raise','plank']);
const VARIANTS=['baseline','candidate'];
const FAIL=(message)=>{throw new Error(message);};
const has=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const shape=(obj,keys,label)=>{
  if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).length!==keys.length||keys.some(k=>!has(obj,k)))FAIL(label+' fields invalid');
};
const number=(x,min,max,label)=>{if(!Number.isFinite(x)||x<min||x>max)FAIL(label+' invalid');return x;};
const integer=(x,min,max,label)=>{number(x,min,max,label);if(!Number.isInteger(x))FAIL(label+' not integer');return x;};
const oneOf=(x,values,label)=>{if(!values.includes(x))FAIL(label+' invalid');};
const bool=(x,label)=>{if(typeof x!=='boolean')FAIL(label+' not boolean');};
const array=(x,max,label)=>{if(!Array.isArray(x)||x.length>max)FAIL(label+' array invalid');};
const token=(x,re,label)=>{if(typeof x!=='string'||!re.test(x))FAIL(label+' token invalid');};
const ratio=(a,b)=>b>0?a/b:null;
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const percentile=(a,p)=>{
  if(!a.length)return null;
  const sorted=a.slice().sort((x,y)=>x-y);
  return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*p)-1))];
};
function times(xs,duration,label,unique=false){
  array(xs,300,label);
  let prev=-1;
  for(const x of xs){
    number(x,0,duration,label);
    if(x<prev||unique&&x===prev)FAIL(label+' order or duplicate invalid');
    prev=x;
  }
}
function intervals(xs,duration,label){
  array(xs,300,label);let prev=-1;
  for(const x of xs){
    if(!Array.isArray(x)||x.length!==2)FAIL(label+' interval invalid');
    const [a,b]=x;number(a,0,duration,label);number(b,0,duration,label);
    if(b<=a||a<prev)FAIL(label+' interval order or overlap invalid');
    prev=b;
  }
}
const span=xs=>xs.reduce((n,[a,b])=>n+b-a,0);
function overlap(a,b){
  let i=0,j=0,n=0;
  while(i<a.length&&j<b.length){
    n+=Math.max(0,Math.min(a[i][1],b[j][1])-Math.max(a[i][0],b[j][0]));
    if(a[i][1]<=b[j][1])i++;else j++;
  }
  return n;
}

/** Maximize one-to-one matches first; minimize total absolute time error second.
 * Sorted 1-D events admit a noncrossing optimum. Duplicate predictions remain FP.
 * No input mutation or nearest-first double matching.
 */
export function matchEvents(reference,predicted,toleranceMs){
  number(toleranceMs,0,60000,'matching tolerance');
  times(reference,Number.MAX_SAFE_INTEGER,'reference',true);
  times(predicted,Number.MAX_SAFE_INTEGER,'predicted');
  let counts=new Int32Array(predicted.length+1),costs=new Float64Array(predicted.length+1);
  const better=(c,d,bestC,bestD)=>c>bestC||c===bestC&&d<bestD;
  for(const ref of reference){
    const nextC=new Int32Array(counts.length),nextD=new Float64Array(costs.length);
    for(let j=1;j<counts.length;j++){
      let c=counts[j],d=costs[j];
      if(better(nextC[j-1],nextD[j-1],c,d)){c=nextC[j-1];d=nextD[j-1];}
      const delta=Math.abs(ref-predicted[j-1]);
      if(delta<=toleranceMs&&better(counts[j-1]+1,costs[j-1]+delta,c,d)){
        c=counts[j-1]+1;d=costs[j-1]+delta;
      }
      nextC[j]=c;nextD[j]=d;
    }
    counts=nextC;costs=nextD;
  }
  const tp=counts[predicted.length];
  return {tp,fp:predicted.length-tp,fn:reference.length-tp,totalMatchedErrorMs:costs[predicted.length]};
}

function validateResult(x,s,label,isReference){
  shape(x,isReference?['eventsMs','intervalsMs','finished','adjudication','observerCount']:
    ['eventsMs','intervalsMs','finished','trackingCancelled','observedMs','latenciesMs'],label);
  times(x.eventsMs,s.durationMs,label+' events',isReference);
  intervals(x.intervalsMs,s.durationMs,label+' holds');
  bool(x.finished,label+' finish');
  if(s.exerciseId==='plank'&&x.eventsMs.length||s.exerciseId!=='plank'&&x.intervalsMs.length)FAIL(label+' inconsistent exercise unit');
  if(isReference){
    oneOf(x.adjudication,['agreed','resolved','ambiguous'],label+' adjudication');
    integer(x.observerCount,2,3,label+' observer count');
    if((s.condition==='still'||s.condition==='partial')&&x.adjudication!=='ambiguous'&&
      (x.eventsMs.length||x.intervalsMs.length||x.finished))FAIL(label+' negative condition has positive reference');
  }else{
    bool(x.trackingCancelled,label+' trackingCancelled');
    number(x.observedMs,0,s.durationMs,label+' observed time');
    array(x.latenciesMs,10000,label+' latency');
    for(const t of x.latenciesMs)number(t,0,60000,label+' latency');
  }
}
export function validateDataset(data){
  shape(data,['schemaVersion','dataKind','protocol','sessions'],'dataset');
  if(data.schemaVersion!==1)FAIL('schemaVersion invalid');
  oneOf(data.dataKind,['synthetic','field'],'dataKind');
  const p=data.protocol;
  shape(p,['protocolId','baselineSha256','candidateSha256','matchToleranceMs','bootstrapSeed','bootstrapSamples'],'protocol');
  token(p.protocolId,/^protocol-[a-f0-9]{8,64}$/,'protocol');
  token(p.baselineSha256,/^[a-f0-9]{64}$/,'baseline hash');
  token(p.candidateSha256,/^[a-f0-9]{64}$/,'candidate hash');
  number(p.matchToleranceMs,0,60000,'matching tolerance');
  integer(p.bootstrapSeed,1,0xffffffff,'bootstrap seed');
  integer(p.bootstrapSamples,100,5000,'bootstrap samples');
  array(data.sessions,1000,'sessions');
  if(!data.sessions.length)FAIL('no sessions: evidence unavailable');
  const participantSplit=new Map(),ids=new Set();
  for(const s of data.sessions){
    shape(s,['sessionCode','participantCode','split','consentConfirmed','exerciseId','deviceClass','surface','condition','durationMs','reference','baseline','candidate'],'session');
    token(s.sessionCode,/^s-[a-f0-9]{8,64}$/,'session code');
    token(s.participantCode,/^p-[a-f0-9]{8,64}$/,'participant code');
    if(ids.has(s.sessionCode))FAIL('duplicate session code');ids.add(s.sessionCode);
    oneOf(s.split,['development','holdout'],'split');
    if(participantSplit.has(s.participantCode)&&participantSplit.get(s.participantCode)!==s.split)FAIL('participant leakage across development and holdout');
    participantSplit.set(s.participantCode,s.split);
    bool(s.consentConfirmed,'consent');
    if(data.dataKind==='field'&&!s.consentConfirmed)FAIL('consent not confirmed');
    if(!EXERCISES.has(s.exerciseId))FAIL('exercise invalid');
    oneOf(s.deviceClass,['low','mid','high','desktop'],'device class');
    oneOf(s.surface,['chrome','android-webview','safari','other'],'surface');
    oneOf(s.condition,['normal','slow','partial','still','occlusion','frame-drop'],'condition');
    number(s.durationMs,1,3600000,'session duration');
    validateResult(s.reference,s,'reference',true);
    for(const v of VARIANTS)validateResult(s[v],s,v,false);
  }
  return data;
}

function row(s,key,tol){
  const ref=s.reference,p=s[key],plank=s.exerciseId==='plank';
  const matches=plank?null:matchEvents(ref.eventsMs,p.eventsMs,tol);
  const refHold=plank?span(ref.intervalsMs):null,predHold=plank?span(p.intervalsMs):null;
  return {matches,repError:plank?null:p.eventsMs.length-ref.eventsMs.length,
    holdErrorMs:plank?Math.abs(predHold-refHold):null,
    holdOverlapMs:plank?overlap(ref.intervalsMs,p.intervalsMs):null,
    holdUnionMs:plank?refHold+predHold-overlap(ref.intervalsMs,p.intervalsMs):null,
    negative:s.condition==='still'||s.condition==='partial',
    falseFinish:!ref.finished&&p.finished,eligibleFalseFinish:!ref.finished,
    trackingCancelled:p.trackingCancelled,observedMs:p.observedMs,durationMs:s.durationMs,latenciesMs:p.latenciesMs};
}
function aggregate(rows,detail=true){
  const reps=rows.filter(r=>r.matches!==null),holds=rows.filter(r=>r.holdErrorMs!==null);
  const sum=(xs,f)=>xs.reduce((n,x)=>n+f(x),0);
  const tp=sum(reps,r=>r.matches.tp),fp=sum(reps,r=>r.matches.fp),fn=sum(reps,r=>r.matches.fn);
  const negative=reps.filter(r=>r.negative),errors=reps.map(r=>r.repError),bias=mean(errors);
  const m={precision:ratio(tp,tp+fp),recall:ratio(tp,tp+fn),f1:ratio(2*tp,2*tp+fp+fn),
    countMae:mean(errors.map(Math.abs)),countBias:bias,
    countErrorSampleSd:errors.length>1?Math.sqrt(sum(errors,e=>(e-bias)**2)/(errors.length-1)):null,
    plankMaeMs:mean(holds.map(r=>r.holdErrorMs)),plankIntervalIou:ratio(sum(holds,r=>r.holdOverlapMs),sum(holds,r=>r.holdUnionMs)),
    falseFinishRate:ratio(sum(rows,r=>Number(r.falseFinish)),sum(rows,r=>Number(r.eligibleFalseFinish))),
    falseRepsPerMinute:ratio(sum(negative,r=>r.matches.fp),sum(negative,r=>r.durationMs)/60000),
    trackingCancelRate:ratio(sum(rows,r=>Number(r.trackingCancelled)),rows.length),
    trackingCoverage:ratio(sum(rows,r=>r.observedMs),sum(rows,r=>r.durationMs))};
  if(!detail)return m;
  const lat=rows.flatMap(r=>r.latenciesMs);
  return {...m,sessions:rows.length,repSessions:reps.length,holdSessions:holds.length,tp,fp,fn,
    matchedTimingMeanErrorMs:ratio(sum(reps,r=>r.matches.totalMatchedErrorMs),tp),
    negativeSessionCount:negative.length,negativeDurationMs:sum(negative,r=>r.durationMs),
    falseFinishes:sum(rows,r=>Number(r.falseFinish)),falseFinishEligible:sum(rows,r=>Number(r.eligibleFalseFinish)),
    trackingCancels:sum(rows,r=>Number(r.trackingCancelled)),
    latencySamples:lat.length,latencyP50Ms:percentile(lat,.5),latencyP95Ms:percentile(lat,.95)};
}
function rng(seed){
  let x=seed>>>0;
  return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};
}
const BOOT_METRICS=['precision','recall','countMae','plankMaeMs','falseFinishRate'];
function pairedBootstrap(clusters,p){
  if(clusters.length<2)return {status:'insufficient_participants',participants:clusters.length,intervals:null};
  const rand=rng(p.bootstrapSeed),all={};
  for(const key of BOOT_METRICS)all[key]={baseline:[],candidate:[],delta:[]};
  for(let i=0;i<p.bootstrapSamples;i++){
    const sampled=Array.from({length:clusters.length},()=>clusters[Math.floor(rand()*clusters.length)]);
    const b=aggregate(sampled.flatMap(x=>x.baseline),false),c=aggregate(sampled.flatMap(x=>x.candidate),false);
    for(const key of BOOT_METRICS){
      if(b[key]!==null)all[key].baseline.push(b[key]);
      if(c[key]!==null)all[key].candidate.push(c[key]);
      if(b[key]!==null&&c[key]!==null)all[key].delta.push(c[key]-b[key]);
    }
  }
  const ci=v=>({nDefined:v.length,lower:percentile(v,.025),upper:percentile(v,.975)});
  return {status:'descriptive_cluster_bootstrap',participants:clusters.length,resamples:p.bootstrapSamples,
    intervals:Object.fromEntries(BOOT_METRICS.map(k=>[k,Object.fromEntries(['baseline','candidate','delta'].map(v=>[v,ci(all[k][v])]))]))};
}
export function evaluateFieldStudy(input){
  const data=validateDataset(input),p=data.protocol,groups=new Map();
  for(const s of data.sessions){
    const key=[s.split,s.exerciseId,s.deviceClass,s.surface].join('|');
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);
  }
  const result=[];
  for(const [stratum,sessions] of [...groups.entries()].sort(([a],[b])=>a.localeCompare(b))){
    const accepted=sessions.filter(s=>s.reference.adjudication!=='ambiguous');
    const clusters=new Map();
    for(const s of accepted){
      if(!clusters.has(s.participantCode))clusters.set(s.participantCode,{baseline:[],candidate:[]});
      const c=clusters.get(s.participantCode);
      for(const key of VARIANTS)c[key].push(row(s,key,p.matchToleranceMs));
    }
    const cs=[...clusters.values()],b=aggregate(cs.flatMap(c=>c.baseline)),c=aggregate(cs.flatMap(c=>c.candidate));
    const delta=Object.fromEntries(BOOT_METRICS.map(k=>[k,b[k]!==null&&c[k]!==null?c[k]-b[k]:null]));
    const [split,exerciseId,deviceClass,surface]=stratum.split('|');
    result.push({split,exerciseId,deviceClass,surface,totalSessions:sessions.length,eligibleSessions:accepted.length,
      excludedAmbiguous:sessions.length-accepted.length,excludedFraction:(sessions.length-accepted.length)/sessions.length,
      participants:cs.length,baseline:b,candidate:c,pairedDelta:delta,uncertainty:pairedBootstrap(cs,p)});
  }
  return {schemaVersion:1,dataKind:data.dataKind,protocolId:p.protocolId,baselineSha256:p.baselineSha256,
    candidateSha256:p.candidateSha256,matchToleranceMs:p.matchToleranceMs,bootstrapSeed:p.bootstrapSeed,
    bootstrapSamples:p.bootstrapSamples,sessionCount:data.sessions.length,groups:result,
    evidenceStatus:data.dataKind==='synthetic'?'SYNTHETIC_ONLY':'FIELD_INPUT_NOT_INDEPENDENTLY_VERIFIED',
    acceptance:'NOT_EVALUATED',notes:[
      'No pooled accuracy, no cross-split aggregation, no threshold or power claim.',
      'Null means an undefined denominator or no relevant observations.',
      'Participant-cluster bootstrap intervals are descriptive; pilot and preregistered gates are still required.',
      'Field consent/adjudication flags are input attestations, not independent verification.',
    ]};
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    if(process.argv.length!==3)FAIL('usage: node qa/field-study-metrics.mjs <explicit pseudonymized JSON path>');
    const p=path.resolve(process.argv[2]),st=fs.lstatSync(p);
    if(!st.isFile()||st.isSymbolicLink()||st.size>8*1024*1024)FAIL('input must be a regular JSON file <= 8 MiB');
    const data=JSON.parse(fs.readFileSync(p,'utf8'));
    process.stdout.write(JSON.stringify(evaluateFieldStudy(data),null,2)+'\n');
  }catch(error){process.stderr.write('BF213_INPUT_REJECTED: '+(error instanceof SyntaxError?'invalid JSON':String(error.message))+'\n');process.exitCode=2;}
}
