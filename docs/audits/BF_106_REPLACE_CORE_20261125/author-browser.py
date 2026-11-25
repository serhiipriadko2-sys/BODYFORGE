from pathlib import Path
from hashlib import sha256
base=Path('qa/receipt-preview-e2e.mjs')
assert sha256(base.read_bytes()).hexdigest()=='8ce311347cf7cbaf25b334df460f093e7ca32557dbcb5ef34a9107fbcc7d77cc'
s=base.read_text(encoding='utf-8')
start=s.index('async function inspect()')
s=s[:start]+r"""// All observations occur on the disposable origin, under the production lock.
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
"""+'\n'+r"""try {
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
  // The actual application is only opened after all markers have been resolved.
  await cdp('Fetch.disable');
  await cdp('Page.navigate',{url:origin+'/'});
  await until("!!document.querySelector('.app-shell[data-fighter-created=true]') && !document.querySelector('[data-storage-status]')",'actual app hydration after rollback');
  check(await ev("localStorage.getItem('bodyforge:pilot:v1')")==expected.raw,'actual application keeps original wallet');
  check(await ev("localStorage.getItem('bodyforge:pilot:v1:backup')")==expected.backup,'actual application keeps original fallback');
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
"""
s=s.replace('// BF-105: real browser round-trip of the existing v1 wallet and receipt preview.','// BF-106: isolated replacement transaction and actual renderer crashes.')
s=s.replace('// Deliberately seeded completions, not a claim of camera accuracy or import support.','// No application writer runs while a replacement marker is pending.')
s=s.replace('newOwnedPage, cleanupOwnedChrome','newOwnedPage, closeOwnedPage, cleanupOwnedChrome')
p=Path('qa/profile-replacement-e2e.mjs')
with p.open('x',encoding='utf-8',newline='\n') as f:f.write(s)
print(p,p.stat().st_size,sha256(p.read_bytes()).hexdigest())