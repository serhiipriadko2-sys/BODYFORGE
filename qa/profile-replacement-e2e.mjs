// BF-106: isolated replacement transaction and actual renderer crashes.
// The app must stop ordinary writes while a replacement marker is pending.
// Only disposable Chrome, no real camera, owner profile, Downloads or network upload.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { requireDevOrigin, waitForOwnedBrowser, newOwnedPage, closeOwnedPage, cleanupOwnedChrome } from './owned-chrome.mjs';

const origin = process.env.BODYFORGE_QA_ORIGIN;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let profile, chrome, browser, socket, seq = 0, assertions = 0;
const pending = new Map(), errors = [];
function check(ok, label) {
  if (!ok) throw Error('FAIL ' + label);
  assertions++; console.log('PASS', label);
}
function rejectPending() {
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(Error('CDP disconnected')); }
  pending.clear();
}
function cdp(method, params = {}) {
  if (socket?.readyState !== WebSocket.OPEN) return Promise.reject(Error('CDP not open'));
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    try { socket.send(JSON.stringify({ id, method, params })); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
}
async function ev(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression, label) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { if (await ev(expression)) return; }
    catch (error) {
      // Only read-only predicates may be retried during a navigation.
      // Never retry a click, storage write or an unrelated CDP failure.
      if (socket?.readyState !== WebSocket.OPEN ||
          !/Inspected target navigated or closed|Cannot find context with specified id|Execution context was destroyed/.test(String(error))) {
        throw Error('WAIT ' + label, { cause: error });
      }
    }
    await sleep(100);
  }
  throw Error('TIMEOUT ' + label);
}

async function seed() {
  const p = await import('/src/lib/progression.ts');
  const { freshGame } = await import('/src/lib/game.ts');
  const { withProfileWriteLock } = await import('/src/lib/profileLock.ts');
  const date = new Date('2026-11-24T10:00:00.000Z');
  const initial = p.parseProfile({
    profileId: 'bf105-receipt-qa', xp: 400, coins: 200,
    creditedWorkoutIds: ['legacy-one'],
    workouts: [{ id: 'legacy-one', finishedAt: date.toISOString(), durationMs: 60000, repetitions: 20, xp: 100 }],
    totals: { workouts: 1, repetitions: 20, bestDurationMs: 60000 },
    game: { ...freshGame(), created: true, nickname: 'RECEIPT QA', ownedOutfits: ['base', 'ember'],
      outfit: 'ember', muscles: { arms: 1, core: 2, legs: 3, back: 4 } },
  });
  return withProfileWriteLock(() => {
    const first = p.saveProfile(initial, { expectedRaw: null });
    if (first.status !== 'saved') throw Error('Initial fixture save failed: ' + first.status);
    const tower = p.addCompletedWorkout(initial, 32000, date, {
      sessionId: 'tower-one', mode: 'tower', splitsMs: Array.from({ length: 20 }, (_, i) => (i+1)*1000),
    });
    const second = p.saveProfile(tower, { expectedRaw: first.revision });
    if (second.status !== 'saved') throw Error('Tower fixture save failed: ' + second.status);
    const plank = p.addCompletedWorkout(tower, 31000, date, {
      sessionId: 'plank-one', exerciseId: 'plank', holdSeconds: 30,
    });
    const third = p.saveProfile(plank, { expectedRaw: second.revision });
    if (third.status !== 'saved') throw Error('Plank fixture save failed: ' + third.status);
    return { raw: third.revision, backup: second.revision,
      exactPrimary: localStorage.getItem(p.STORAGE_KEY) === third.revision,
      exactBackup: localStorage.getItem(p.PROFILE_BACKUP_KEY) === second.revision };
  });
}
// All observations occur on the disposable origin, under the production lock.
// IndexedDB is read before and after; there are no application writers here.
async function operation(action, boundary, expected) {
  const p = await import('/src/lib/progression.ts');
  const r = await import('/src/lib/profileReplacement.ts');
  const { withProfileWriteLock } = await import('/src/lib/profileLock.ts');
  const { readDurableJournal } = await import('/src/lib/durableJournal.ts');
  const { readResultJournal, readQuarantinedResults } = await import('/src/lib/workoutJournal.ts');
  const { readProfileQuarantine } = await import('/src/lib/profileQuarantineExport.ts');
  const { AVATAR_LOOK_KEY } = await import('/src/lib/avatarLook.ts');
  const { APPEARANCE_KEY } = await import('/src/lib/appearance.ts');
  const { MANUAL_STEPS_KEY } = await import('/src/lib/stepsLog.ts');
  const { DAILY_PLAN_KEY } = await import('/src/lib/dailyPlan.ts');
  const { prepareProgressBackup } = await import('/src/lib/progressBackup.ts');
  const lock = await withProfileWriteLock(async () => {
    const durable = await readDurableJournal();
    if (durable.status !== 'ready' || durable.entries.length !== 0) throw Error('QA durable not empty');
    let writes=0, injected=false;
    const port = {
      observe() {
        const journal=readResultJournal(), quarantine=readQuarantinedResults(), profiles=readProfileQuarantine();
        return {
          epoch:localStorage.getItem('bodyforge:pilot:v1:epoch'),
          pair:{primary:localStorage.getItem(p.STORAGE_KEY),backup:localStorage.getItem(p.PROFILE_BACKUP_KEY)},
          auxiliary:{avatarLook:localStorage.getItem(AVATAR_LOOK_KEY),appearance:localStorage.getItem(APPEARANCE_KEY),
            manualSteps:localStorage.getItem(MANUAL_STEPS_KEY),dailyPlan:localStorage.getItem(DAILY_PLAN_KEY)},
          sourcesReady:[journal.status,quarantine.status,profiles.status,durable.status].every(s=>s==='ready'),
          pendingRecords:journal.entries.length,durableRecords:durable.entries.length,
          quarantineRecords:quarantine.entries.length+profiles.entries.length,
        };
      },
      getMarker:()=>localStorage.getItem(r.PROFILE_REPLACEMENT_MARKER_KEY),
      set(key,value){
        writes++;
        if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);
        if(action==='crash' && writes===boundary){
          window.__replaceBoundary={key,writes,exact:localStorage.getItem(key)===value};
          debugger;
        }
        if(action==='fault' && writes===boundary && !injected){injected=true;throw new DOMException('fixture failure after write','QuotaExceededError');}
      },
    };
    const before=port.observe(), marker=port.getMarker();
    let result, candidate=null;
    if(action==='inspect') result={status:r.inspectProfileReplacement(port)};
    else if(action==='rollback') result=r.rollbackProfileReplacement(port,marker,'rollback');
    else if(action==='stale') result=r.rollbackProfileReplacement(port,expected,'rollback');
    else {
      const state=p.loadProfileState();
      if(state.status!=='ready')throw Error('fixture profile not ready');
      const prepared=await prepareProgressBackup(state.profile,null,new Date('2026-11-25T12:00:00Z'));
      if(!prepared.complete)throw Error('fixture backup incomplete');
      const envelope=JSON.parse(prepared.json);
      const next=p.addCompletedWorkout(state.profile,38000,new Date('2026-11-25T12:01:00Z'),{
        sessionId:'replacement-fourth',mode:'training',
      });
      // Deliberately noncanonical formatting proves exact bytes are used.
      envelope.storedProfileRaw=JSON.stringify(next,null,2)+'\n';
      envelope.storedBackupRaw=JSON.stringify(state.profile,null,4);
      candidate={primary:envelope.storedProfileRaw,backup:envelope.storedBackupRaw};
      const json=JSON.stringify(envelope);
      const planned=r.planProfileReplacement(action==='invalid'?'{{':json,before);
      if(planned.status!=='planned') result=planned;
      else if(action==='conflict'){
        // A newer value appears between planning and the decision.
        const old=localStorage.getItem(p.PROFILE_BACKUP_KEY);
        localStorage.setItem(p.PROFILE_BACKUP_KEY,old+'\n');
        try{result=r.executeProfileReplacement(port,planned.plan,'replace');}
        finally{localStorage.setItem(p.PROFILE_BACKUP_KEY,old);}
      }else result=r.executeProfileReplacement(port,planned.plan,action==='cancel'?'cancel':'replace');
    }
    const after=port.observe(), afterMarker=port.getMarker(), durableAfter=await readDurableJournal();
    if(durableAfter.status!=='ready'||durableAfter.entries.length!==0)throw Error('journal changed');
    return {result,writes,before,after,marker,afterMarker,candidate,
      state:r.inspectProfileReplacement(port),unrelated:localStorage.getItem('bf-qa-unrelated')};
  });
  if(lock.status!=='completed')throw Error('lock result '+lock.status);
  return lock.value;
}
async function run(action,boundary=0,expected=null) {
  return ev('('+operation.toString()+')('+JSON.stringify(action)+','+boundary+','+JSON.stringify(expected)+')');
}
function original(result,expected,label){
  check(result.after.pair.primary===expected.raw && result.after.pair.backup===expected.backup &&
    result.afterMarker===null && result.state==='none', label+' exact original primary and fallback');
  check(result.unrelated==='keep'&&result.after.pendingRecords===0&&result.after.durableRecords===0&&
    result.after.quarantineRecords===0,label+' unrelated storage and journals unchanged');
}

let target, paused=false, crashed=false;
async function connectObserver(){
  paused=false;crashed=false;
  target=await newOwnedPage(browser);
  const ws=new WebSocket(target.webSocketDebuggerUrl);socket=ws;
  ws.addEventListener('close',()=>{if(socket===ws)rejectPending()});
  ws.addEventListener('error',()=>{if(socket===ws)rejectPending()});
  ws.addEventListener('message',e=>{
    if(socket!==ws)return;
    const message=JSON.parse(e.data.toString()),request=pending.get(message.id);
    if(request){pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result)}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params?.exceptionDetails?.exception?.description||message.params?.exceptionDetails?.text||'unknown');
    if(message.method==='Debugger.paused')paused=message.params.callFrames[0].callFrameId;
    if(message.method==='Inspector.targetCrashed')crashed=true;
    if(message.method==='Fetch.requestPaused'){
      void cdp('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:200,
        responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}],
        body:Buffer.from('<!doctype html><title>BF106 replacement observer</title>').toString('base64')})
        .catch(error=>errors.push(error.message));
    }
  });
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('CDP open timeout')),3000);
    ws.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});
    ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP open failed'))},{once:true});
  });
  await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Inspector.enable');
  await cdp('Fetch.enable',{patterns:[{urlPattern:origin+'/?bf106-replace-observer',resourceType:'Document',requestStage:'Request'}]});
  await cdp('Page.navigate',{url:origin+'/?bf106-replace-observer'});
  await until("document.title==='BF106 replacement observer' && location.origin==="+JSON.stringify(origin),'owned replacement observer');
}
async function waitHost(predicate,label){
  const end=Date.now()+20000;
  while(Date.now()<end){if(predicate())return;await sleep(100)}
  throw Error('TIMEOUT '+label);
}

try {
  await requireDevOrigin(origin);
  profile=fs.mkdtempSync(path.join(os.tmpdir(),'bf-replace-core-'));
  chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new','--disable-webgl','--no-first-run','--no-default-browser-check',
    '--remote-allow-origins=*','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank',
  ],{stdio:'ignore'});
  browser=await waitForOwnedBrowser(profile,chrome);
  await connectObserver();
  check(await ev('localStorage.length===0'),'new disposable origin empty');
  const fixture=await ev('('+seed.toString()+')()');
  check(fixture.status==='completed'&&fixture.value.exactPrimary&&fixture.value.exactBackup,'real seed through production lock');
  const expected=fixture.value;
  await ev("localStorage.setItem('bf-qa-unrelated','keep')");
  for(const [action,status] of [['invalid','blocked'],['cancel','cancelled'],['conflict','conflict']]){
    const result=await run(action);
    check(result.result.status===status&&result.writes===0,action+' does not invoke replacement writes');
    original(result,expected,action);
  }
  for(const n of [1,2,3]){
    const result=await run('fault',n);
    check(result.result.status==='rolled-back','exception after real write '+n+' is rolled back');
    original(result,expected,'fault '+n);
  }
  const normal=await run('apply');
  check(normal.result.status==='applied-pending-finalization'&&normal.writes===3&&normal.state==='applied','exact replacement staged and verified');
  check(normal.after.pair.primary===normal.candidate.primary&&normal.after.pair.backup===normal.candidate.backup,'imported exact formatted bytes');
  const marker=JSON.parse(normal.afterMarker);
  check(marker.before.primary===expected.raw&&marker.before.backup===expected.backup,'marker preserves exact original bytes');
  await ev('window.__bf106Reload=true');
  await cdp('Page.reload',{ignoreCache:true});
  await until("!window.__bf106Reload && document.title==='BF106 replacement observer'",'observer reload');
  const recovered=await run('inspect');
  check(recovered.result.status==='applied'&&recovered.afterMarker===normal.afterMarker,'marker and applied bytes survive reload');
  const restored=await run('rollback');
  check(restored.result.status==='rolled-back','explicit rollback after reload');
  original(restored,expected,'reload rollback');
  const again=await run('apply');
  check(again.afterMarker!==normal.afterMarker&&again.state==='applied','new transaction has unique marker');
  const stale=await run('stale',0,normal.afterMarker);
  check(stale.result.status==='conflict'&&stale.writes===0&&stale.afterMarker===again.afterMarker,'old confirmation cannot rollback new identical transaction');
  original(await run('rollback'),expected,'second rollback');

  for(const n of [1,2,3]){
    await cdp('Debugger.enable');paused=false;
    void run('crash',n).catch(()=>{});
    await waitHost(()=>paused,'replacement persistence boundary '+n);
    const observed=await cdp('Debugger.evaluateOnCallFrame',{callFrameId:paused,expression:'window.__replaceBoundary',returnByValue:true});
    const info=observed.result.value;
    check(info?.writes===n&&info.exact&&info.key===[null,'bodyforge:pilot:v1:replace-pending:v1','bodyforge:pilot:v1:backup','bodyforge:pilot:v1'][n],'paused immediately after exact write '+n);
    void cdp('Page.crash').catch(()=>{});
    await waitHost(()=>crashed,'actual renderer crash '+n);
    check(crashed,'Chrome confirms actual owned renderer crash '+n);
    const dead=target;socket.close();rejectPending();socket=null;
    await closeOwnedPage(browser,dead);
    await connectObserver();
    const afterCrash=await run('inspect');
    check(afterCrash.result.status===(n===3?'applied':'staged')&&afterCrash.afterMarker!==null,'interrupted prefix '+n+' recognized in fresh renderer');
    const rolled=await run('rollback');
    check(rolled.result.status==='rolled-back','explicit crash rollback '+n);
    original(rolled,expected,'crash '+n);
  }
  // Reopen the actual application after the isolated crash fixtures.
  await cdp('Fetch.disable');
  await cdp('Page.navigate',{url:origin+'/'});
  await until("!!document.querySelector('.app-shell[data-fighter-created=true]') && !document.querySelector('[data-storage-status]')",'actual app hydration after rollback');
  check(await ev("localStorage.getItem('bodyforge:pilot:v1')")==expected.raw,'actual application keeps original wallet');
  check(await ev("localStorage.getItem('bodyforge:pilot:v1:backup')")==expected.backup,'actual application keeps original fallback');
  const appTarget=target,appSocket=socket;
  await connectObserver();
  const observerTarget=target,observerSocket=socket;
  const pendingReplacement=await run('apply');
  check(pendingReplacement.result.status==='applied-pending-finalization','replacement staged in a different real tab');
  target=appTarget;socket=appSocket;
  await until("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='unavailable'",'open app responds to native marker event');
  check(await ev("!document.querySelector('.app-shell') && !document.querySelector('[data-action=restore-backup]')"),
    'open app suspends gameplay and ordinary backup recovery');
  await ev('window.__beforeFenceReload=true');
  await cdp('Page.reload',{ignoreCache:true});
  await until("!window.__beforeFenceReload && document.querySelector('[data-storage-status]')?.dataset.storageStatus==='unavailable'",'startup stays blocked with replacement marker');
  check(await ev("!document.querySelector('.app-shell') && !document.querySelector('#onboarding')"),
    'fresh app never hydrates the staged profile or starts a new one');
  target=observerTarget;socket=observerSocket;
  const preserved=await run('inspect');
  check(preserved.afterMarker===pendingReplacement.afterMarker &&
    preserved.after.pair.primary===pendingReplacement.candidate.primary &&
    preserved.after.pair.backup===pendingReplacement.candidate.backup,
  'ordinary app leaves exact staged values and rollback marker intact');
  target=appTarget;socket=appSocket;
  await until("document.querySelector('[data-replacement-recovery]')?.dataset.replacementRecovery==='applied'",'dedicated recovery panel verified exact marker');
  check(await ev("!!document.querySelector('[data-action=export-replacement-evidence]')&&!document.querySelector('[data-action=retry-save]')"),'marker evidence can be exported and ordinary retry is hidden');
  await ev("document.querySelector('[data-action=request-replacement-rollback]').click()");
  await until("!!document.querySelector('[data-action=confirm-replacement-rollback]')",'explicit rollback confirmation required');
  await ev("document.querySelector('[data-action=cancel-replacement-rollback]').click()");
  check(await ev("!document.querySelector('[data-action=confirm-replacement-rollback]')"),'cancel hides confirmation');
  target=observerTarget;socket=observerSocket;
  const cancelled=await run('inspect');
  check(cancelled.afterMarker===pendingReplacement.afterMarker && cancelled.after.pair.primary===pendingReplacement.candidate.primary &&
    cancelled.after.pair.backup===pendingReplacement.candidate.backup,'UI cancellation leaves exact staged bytes unchanged');
  target=appTarget;socket=appSocket;
  await ev("document.querySelector('[data-action=request-replacement-rollback]').click()");
  await ev("document.querySelector('[data-action=confirm-replacement-rollback]').click()");
  await until("document.querySelector('[data-replacement-recovery]')?.dataset.replacementRecovery==='none'",'confirmed rollback completes in actual recovery panel');
  check(await ev("!!document.querySelector('[data-action=open-restored-profile]')"),'explicit reopen available after verified rollback');
  target=observerTarget;socket=observerSocket;
  original(await run('inspect'),expected,'UI restart rollback');
  observerSocket.close();
  await closeOwnedPage(browser,observerTarget);
  target=appTarget;socket=appSocket;
  await cdp('Page.bringToFront');
  await ev("document.querySelector('[data-action=open-restored-profile]').click()");
  await until("!!document.querySelector('.app-shell[data-fighter-created=true]') && !document.querySelector('[data-storage-status]')",
    'app resumes original profile after explicit rollback');
  await ev("localStorage.setItem('bodyforge:pilot:v1:replace-pending:v1','{broken');true");
  await cdp('Page.reload',{ignoreCache:true});
  await until("document.querySelector('[data-replacement-recovery]')?.dataset.replacementRecovery==='conflict'",'malformed marker opens safe recovery panel');
  check(await ev("!document.querySelector('[data-action=request-replacement-rollback]')&&!!document.querySelector('[data-action=export-replacement-evidence]')&&localStorage.getItem('bodyforge:pilot:v1:replace-pending:v1')==='{broken'"),'malformed marker preserved, only evidence export offered');
  // Explicit disposable-fixture cleanup; production UI cannot delete malformed marker.
  await ev("localStorage.removeItem('bodyforge:pilot:v1:replace-pending:v1');true");
  await cdp('Page.reload',{ignoreCache:true});
  await until("!!document.querySelector('.app-shell[data-fighter-created=true]') && !document.querySelector('[data-storage-status]')",'fixture cleanup restores ordinary startup');
  check(await ev("localStorage.getItem('bodyforge:pilot:v1')")===expected.raw,
    'app resumes with exact original wallet and history');
  // An independent tab prepares a real session before accepting the new copy.
  // Its completion is intentionally delayed until the actual UI finalizer exits.
  await connectObserver();
  const lateTarget=target,lateSocket=socket;
  const late=await ev("(async()=>{const p=await import('/src/lib/progression.ts'),j=await import('/src/lib/workoutJournal.ts'),l=await import('/src/lib/profileLock.ts'),c=await import('/src/lib/completionPersistence.ts');const r=await l.withProfileWriteLock(()=>j.prepareWorkoutSession(localStorage.getItem(p.STORAGE_KEY),'training'));if(r.status!=='completed'||r.value.status!=='ready')throw Error('pre-import prepare failed');const session=r.value.session;window.__lateOp=c.createCompletionPersistence({...session,durationMs:32000,finishedAt:'2026-11-25T12:00:00.000Z',repetitions:20},{session,baseProfileRaw:r.value.state.revision});if(!window.__lateOp)throw Error('late fixture not bound');return {id:session.sessionId,key:__lateOp.key,raw:__lateOp.raw}})()");
  check(!late.id.startsWith('epoch:'),'independent pre-import session retains original generation');
  target=appTarget;socket=appSocket;
  const keepFixture = await run('apply');
  check(keepFixture.result.status === 'applied-pending-finalization', 'applied fixture ready for explicit acceptance');
  await cdp('Page.reload', {ignoreCache:true});
  await until("!!document.querySelector('[data-action=request-replacement-keep]')", 'acceptance offered after restart');
  await ev("document.querySelector('[data-action=request-replacement-keep]').click()");
  await ev("document.querySelector('[data-action=cancel-replacement-keep]').click()");
  check(await ev("localStorage.getItem('bodyforge:pilot:v1:replace-pending:v1')") === keepFixture.afterMarker,
    'cancel acceptance retains exact rollback record');
  await ev("document.querySelector('[data-action=request-replacement-keep]').click()");
  await ev("document.querySelector('[data-action=confirm-replacement-keep]').click()");
  await until("!!document.querySelector('[data-action=open-restored-profile]')", 'acceptance completes after readback');
  await ev("document.querySelector('[data-action=open-restored-profile]').click()");
  await until("!!document.querySelector('.app-shell[data-fighter-created=true]')", 'accepted profile in game');
  await cdp('Page.reload', {ignoreCache:true});
  await until("!!document.querySelector('.app-shell[data-fighter-created=true]')", 'accepted profile after reload');
  check(await ev("localStorage.getItem('bodyforge:pilot:v1')") === keepFixture.candidate.primary &&
    await ev("localStorage.getItem('bodyforge:pilot:v1:backup')") === keepFixture.candidate.backup &&
    await ev("localStorage.getItem('bodyforge:pilot:v1:replace-pending:v1')") === null,
    'accepted profile and fallback survive reload byte-for-byte without additional reward');
  check(await ev("localStorage.getItem('bodyforge:pilot:v1:epoch')")===JSON.parse(keepFixture.afterMarker).transactionId,
    'actual UI acceptance persists the exact new generation before reopening');
  target=lateTarget;socket=lateSocket;
  const lateStage=await ev('window.__lateOp.stage()');
  check(lateStage.status==='saved'&&lateStage.entries[0].raw===late.raw,'late completion preserves exact original bytes after actual UI acceptance');
  const lateReplay=await ev("(async()=>{const l=await import('/src/lib/profileLock.ts'),d=await import('/src/lib/durableWorkout.ts');return l.withProfileWriteLock(()=>d.replayDurableWorkouts(null,{signal:new AbortController().signal,isCurrent:()=>true}))})()");
  check(lateReplay.status==='completed'&&lateReplay.value.status==='mismatch','late completion cannot award the accepted profile');
  check(await ev("localStorage.getItem('bodyforge:pilot:v1')")===keepFixture.candidate.primary&&await ev("localStorage.getItem('bodyforge:pilot:v1:backup')")===keepFixture.candidate.backup,
    'late completion does not change accepted primary or backup');
  const held=await ev("(async()=>{const j=await import('/src/lib/durableJournal.ts');return j.readDurableJournal()})()");
  check(held.entries.some(e=>e.key===late.key&&e.raw===late.raw&&e.state==='active'),'late result remains active and recoverable, not falsely settled');
  lateSocket.close();await closeOwnedPage(browser,lateTarget);
  target=appTarget;socket=appSocket;
  check(errors.length===0,'no uncaught browser exceptions');
  console.log('BODYFORGE_REPLACE_CORE_E2E_PASS assertions='+assertions+' crashes=3');
} catch(error) {
  console.error('BODYFORGE_REPLACE_CORE_E2E_FAIL',error.stack||String(error));process.exitCode=19;
} finally {
  socket?.close();rejectPending();
  if(profile&&chrome){
    try{await cleanupOwnedChrome(profile,'bf-replace-core-',chrome,browser);}
    catch(error){console.error('QA_OWNED_CLEANUP FAIL',String(error));process.exitCode ||=17;}
  }
}
