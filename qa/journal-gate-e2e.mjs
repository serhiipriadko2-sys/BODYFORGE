// Real two-tab journal/recovery scheduling on a disposable origin. No owner data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { requireDevOrigin, waitForOwnedBrowser, newOwnedPage, cleanupOwnedChrome } from './owned-chrome.mjs';
const origin=process.env.BODYFORGE_QA_ORIGIN;
const gate='bodyforge:pilot:v1:durable-write', profileLock='bodyforge:pilot:v1:write';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let profile,chrome,browser,assertions=0;const clients=[],errors=[];
function check(ok,label){if(!ok)throw Error('FAIL '+label);assertions++;console.log('PASS',label)}
class Client {
  constructor(target){
    this.socket=new WebSocket(target.webSocketDebuggerUrl);this.pending=new Map();this.seq=0;this.paused=false;
    this.ready=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('CDP open timeout')),3000);
      this.socket.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});
      this.socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP open error'))},{once:true});
    });
    this.socket.addEventListener('message',event=>{
      const m=JSON.parse(event.data.toString()),r=this.pending.get(m.id);
      if(r){clearTimeout(r.timer);this.pending.delete(m.id);m.error?r.reject(Error(JSON.stringify(m.error))):r.resolve(m.result)}
      if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
      if(m.method==='Debugger.paused')this.paused=true;
      if(m.method==='Fetch.requestPaused')void this.cdp('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,
        responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}],body:Buffer.from('<!doctype html><title>Journal gate QA</title>').toString('base64')}).catch(e=>errors.push(e.message));
    });
    this.socket.addEventListener('close',()=>this.reject());clients.push(this);
  }
  reject(){for(const r of this.pending.values()){clearTimeout(r.timer);r.reject(Error('CDP closed'))}this.pending.clear()}
  async cdp(method,params={}){
    await this.ready;
    return new Promise((resolve,reject)=>{const id=++this.seq;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout '+method))},15000);
      this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});
  }
  async js(expression){const r=await this.cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
  async until(expression,label){const end=Date.now()+10000;while(Date.now()<end){if(await this.js(expression))return;await sleep(30)}throw Error('TIMEOUT '+label)}
  dispose(){this.reject();this.socket.close()}
}
async function tab(){
  const c=new Client(await newOwnedPage(browser));
  await c.cdp('Runtime.enable');await c.cdp('Page.enable');
  await c.cdp('Fetch.enable',{patterns:[{urlPattern:origin+'/?gate-observer',resourceType:'Document',requestStage:'Request'}]});
  await c.cdp('Page.navigate',{url:origin+'/?gate-observer'});
  await c.until("document.title==='Journal gate QA' && location.origin==="+JSON.stringify(origin),'owned origin');
  await c.js("(async()=>{window.d=await import('/src/lib/durableJournal.ts');window.g=await import('/src/lib/durableJournalGate.ts');window.p=await import('/src/lib/progression.ts');window.l=await import('/src/lib/profileLock.ts');window.r=await import('/src/lib/profileReplacement.ts');window.recovery=await import('/src/lib/profileReplacementRecovery.ts');window.j=await import('/src/lib/workoutJournal.ts');window.dw=await import('/src/lib/durableWorkout.ts');return true})()");
  return c;
}
async function hold(c,name,mode){
  await c.js("(()=>{window.lockHeld=false;window.lockDone=false;const wait=new Promise(resolve=>window.releaseLock=resolve);window.lockFlight=navigator.locks.request("+JSON.stringify(name)+",{mode:"+JSON.stringify(mode)+"},async()=>{window.lockHeld=true;await wait});void window.lockFlight.then(()=>window.lockDone=true);return true})()");
  await c.until('window.lockHeld','lock held');
}
async function release(c){await c.js('window.releaseLock();true');await c.until('window.lockDone','lock released')}
async function pending(c,name,mode){await c.until("navigator.locks.query().then(q=>q.pending.some(x=>x.name==="+JSON.stringify(name)+"&&x.mode==="+JSON.stringify(mode)+"))",'pending '+mode+' '+name)}
async function startStage(c,id,signal=false){
  await c.js("(()=>{window.stageDone=false;window.stageResult=null;window.abort=new AbortController();const result={schemaVersion:1,profileId:'gate-fighter',sessionId:"+JSON.stringify(id)+",mode:'training',floor:null,exerciseId:'squat',repetitions:20,durationMs:32000,finishedAt:'2026-11-25T12:00:00.000Z'};window.entry=j.resultJournalEntry(result);window.stageFlight=d.stageDurableResults([entry],window.originalRaw,"+(signal?'abort.signal':'undefined')+");void stageFlight.then(x=>{window.stageResult=x;window.stageDone=true});return true})()");
}
async function clearFixture(c){
  // Only this process-created disposable origin; no owner storage is connected.
  await c.js("(async()=>{await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(d.DURABLE_JOURNAL_DATABASE);request.onsuccess=()=>resolve();request.onerror=request.onblocked=()=>reject(Error('fixture deletion blocked'))});return true})()");
}
async function seedMarker(c){
  return c.js("(async()=>{const {freshGame}=await import('/src/lib/game.ts');const value=p.parseProfile({profileId:'gate-fighter',xp:0,coins:0,creditedWorkoutIds:[],workouts:[],game:{...freshGame(),created:true}});window.originalRaw=JSON.stringify(value,null,2);const backup=JSON.stringify(value)+'\\n';const aux={avatarLook:null,appearance:null,manualSteps:null,dailyPlan:null};const port={observe:()=>({epoch:localStorage.getItem('bodyforge:pilot:v1:epoch'),pair:{primary:localStorage.getItem(p.STORAGE_KEY),backup:localStorage.getItem(p.PROFILE_BACKUP_KEY)},auxiliary:aux,sourcesReady:true,pendingRecords:0,durableRecords:0,quarantineRecords:0}),getMarker:()=>localStorage.getItem(p.PROFILE_REPLACEMENT_MARKER_KEY),set:(k,v)=>v===null?localStorage.removeItem(k):localStorage.setItem(k,v)};const output=await l.withProfileWriteLock(()=>g.withDurableJournalGate('exclusive',()=>{localStorage.setItem(p.STORAGE_KEY,originalRaw);localStorage.setItem(p.PROFILE_BACKUP_KEY,backup);const envelope={exportFormat:'bodyforge-manual-backup',exportSchemaVersion:1,exportedAt:'2026-11-25T12:00:00Z',complete:true,sourcesChangedDuringRead:false,storedProfileRaw:JSON.stringify({...value,xp:10,coins:5}),storedBackupRaw:originalRaw,storageReadStatus:'ready',journalReadStatus:'ready',quarantineReadStatus:'ready',profileQuarantineReadStatus:'ready',durableReadStatus:'ready',auxiliaryReadStatus:{avatarLook:'ready',appearance:'ready',manualSteps:'ready',dailyPlan:'ready'},storedAuxiliaryRaw:aux,pendingResultOriginals:[],quarantinedResults:[],storedProfileQuarantineRaw:[],durableResults:[]};const plan=r.planProfileReplacement(JSON.stringify(envelope),port.observe());if(plan.status!=='planned')throw Error(plan.reason);return r.executeProfileReplacement(port,plan.plan,'replace')}));window.marker=port.getMarker();return {output,marker,primary:originalRaw,backup}})()");
}
try{
  await requireDevOrigin(origin);
  profile=fs.mkdtempSync(path.join(os.tmpdir(),'bf-journal-gate-'));
  chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new','--disable-webgl','--no-first-run','--no-default-browser-check','--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  browser=await waitForOwnedBrowser(profile,chrome);
  const a=await tab(),b=await tab();
  check(await a.js('localStorage.length===0'),'disposable storage empty');
  const seed=await seedMarker(a);
  check(seed.output.value.value.status==='applied-pending-finalization','fixture staged under profile then exclusive journal gate');
  await b.js('window.originalRaw='+JSON.stringify(seed.primary));
  // A shared journal holder must delay recovery even though profile lock is free.
  await hold(a,gate,'shared');
  await b.js('window.recovered=false;window.recoveryFlight=recovery.restoreInterruptedReplacement('+JSON.stringify(seed.marker)+",'rollback');void recoveryFlight.then(x=>{window.recoveryResult=x;window.recovered=true});true");
  await pending(a,gate,'exclusive');
  check(await b.js('!window.recovered'),'rollback waits for existing journal writer');
  check(await a.js('localStorage.getItem(p.PROFILE_REPLACEMENT_MARKER_KEY)')===seed.marker,'no marker removal while shared journal work is held');
  await release(a);await b.until('window.recovered','rollback finished');
  check(await b.js("recoveryResult.status==='rolled-back' && localStorage.getItem(p.STORAGE_KEY)===originalRaw"),'rollback verified after shared work released');
  // Ordinary result capture must still work while another tab holds the wallet.
  await hold(a,profileLock,'exclusive');await startStage(b,'independent');
  await b.until('window.stageDone','durable stage independent of profile lock');
  check(await b.js("stageResult.status==='saved' && stageResult.entries[0].baseProfileRaw===originalRaw"),'stage commits exact result without acquiring wallet lock');
  check(await a.js('window.lockHeld && !window.lockDone'),'wallet lock remains held independently');
  await release(a);await clearFixture(a);
  // Exclusive replacement observation blocks both inserts and state changes.
  await hold(a,gate,'exclusive');await startStage(b,'queued');await pending(a,gate,'shared');
  await b.js("window.immutableRaw=entry.raw;entry.raw='caller-mutated-while-queued';true");
  check(await b.js('!stageDone'),'new stage cannot cross an exclusive snapshot');
  check((await a.js('d.readDurableJournal()')).entries.length===0,'journal remains empty until exclusive release');
  await release(a);await b.until('window.stageDone','queued stage finished');
  check(await b.js("stageResult.status==='saved' && stageResult.entries[0].raw===immutableRaw"),'queued result preserves original payload despite caller mutation');
  await b.js('entry.raw=immutableRaw;true');
  await hold(a,gate,'exclusive');
  await b.js("window.markDone=false;void d.markDurableResults([entry],'settled').then(x=>{window.markResult=x;window.markDone=true});true");
  await pending(a,gate,'shared');check(!await b.js('window.markDone'),'settlement also waits for exclusive gate');
  check((await a.js('d.readDurableJournal()')).entries[0].state==='active','snapshot retains active state before release');
  await release(a);await b.until('window.markDone','settlement finished');
  check(await b.js("markResult.status==='saved'&&markResult.entries[0].state==='settled'"),'settlement read-back verified');
  await clearFixture(a);
  // Abort only while queued; no later write once the owner releases its lock.
  await hold(a,gate,'exclusive');await startStage(b,'cancelled',true);await pending(a,gate,'shared');
  await b.js('window.abort.abort();true');await b.until('window.stageDone','cancelled stage finished');
  check(await b.js("stageResult.status==='unavailable'"),'cancelled stage cannot acknowledge a save');
  await release(a);check((await a.js('d.readDurableJournal()')).entries.length===0,'cancelled queued write leaves no record');
  // Pause after strict commit, before independent read-back: gate stays held.
  await b.cdp('Debugger.enable');b.paused=false;
  await b.js("(()=>{const real=IDBDatabase.prototype.transaction;let committedWrite=false;IDBDatabase.prototype.transaction=function(...args){if(this.name===d.DURABLE_JOURNAL_DATABASE){if(args[1]==='readwrite')committedWrite=true;else if(committedWrite&&args[1]==='readonly'){IDBDatabase.prototype.transaction=real;debugger;}}return real.apply(this,args)};return true})()");
  await startStage(b,'readback-held');
  const end=Date.now()+10000;while(!b.paused&&Date.now()<end)await sleep(20);
  check(b.paused,'writer paused after write transaction before read-back');
  await a.js("window.exclusiveDone=false;window.exclusiveStarted=false;void g.withDurableJournalGate('exclusive',()=>{window.exclusiveStarted=true}).then(()=>window.exclusiveDone=true);true");
  await pending(a,gate,'exclusive');
  check(await a.js("navigator.locks.query().then(q=>q.held.some(x=>x.name==='bodyforge:pilot:v1:durable-write'&&x.mode==='shared'))"),'shared gate covers independent durable read-back');
  check(!await a.js('window.exclusiveStarted'),'replacement cannot inspect between commit and acknowledgement');
  await b.cdp('Debugger.resume');await b.until('window.stageDone','stage acknowledges after resume');await a.until('window.exclusiveDone','exclusive resumes after read-back');
  check(await b.js("stageResult.status==='saved'&&stageResult.entries[0].raw===entry.raw"),'post-resume acknowledgement exact');
  await clearFixture(a);
  // A result that wins the race makes recovery fail closed, never deletes it.
  const again=await seedMarker(a);await b.js('window.originalRaw='+JSON.stringify(again.primary));
  await startStage(b,'winner');await b.until('window.stageDone','winner stage');
  const before=await a.js('d.readDurableJournal()');
  const blocked=await a.js('recovery.restoreInterruptedReplacement('+JSON.stringify(again.marker)+",'rollback')");
  check(blocked.status==='recovery-required','existing completed result blocks rollback');
  check(await a.js('localStorage.getItem(p.PROFILE_REPLACEMENT_MARKER_KEY)')===again.marker,'blocked recovery retains exact marker');
  check(JSON.stringify(await a.js('d.readDurableJournal()'))===JSON.stringify(before),'blocked recovery preserves exact durable result');
  // Explicit test-fixture reset only. The product never deletes these rows.
  await clearFixture(a);
  check((await a.js('recovery.restoreInterruptedReplacement('+JSON.stringify(again.marker)+",'rollback')")).status==='rolled-back','isolated fixture restored');
  await b.js('window.originalRaw='+JSON.stringify(seed.primary));await startStage(b,'actual-replay');await b.until('window.stageDone','final real stage');
  const paid=await b.js("l.withProfileWriteLock(()=>dw.replayDurableWorkouts(null,{signal:new AbortController().signal,isCurrent:()=>true}))");
  check(paid.status==='completed'&&paid.value.status==='saved','profile -> shared journal replay completes without deadlock');
  check(await b.js("p.loadProfileState().profile.xp===120&&p.loadProfileState().profile.coins===35&&p.loadProfileState().profile.workouts.length===1"),'one real replay pays 120 XP and 35 coins exactly once');
  const wallet=await b.js('localStorage.getItem(p.STORAGE_KEY)');
  await b.js("l.withProfileWriteLock(()=>dw.replayDurableWorkouts(null,{signal:new AbortController().signal,isCurrent:()=>true}))");
  check(await b.js('localStorage.getItem(p.STORAGE_KEY)')===wallet,'repeat replay leaves exact wallet unchanged');
  check(errors.length===0,'no uncaught browser errors');
  console.log('BODYFORGE_JOURNAL_GATE_E2E_PASS assertions='+assertions);
}catch(error){console.error('BODYFORGE_JOURNAL_GATE_E2E_FAIL',error.stack||String(error));process.exitCode=21}
finally{
  for(const c of clients)c.dispose();
  if(profile&&chrome)try{await cleanupOwnedChrome(profile,'bf-journal-gate-',chrome,browser)}catch(e){console.error('QA_OWNED_CLEANUP FAIL',String(e));process.exitCode ||=17}
}
