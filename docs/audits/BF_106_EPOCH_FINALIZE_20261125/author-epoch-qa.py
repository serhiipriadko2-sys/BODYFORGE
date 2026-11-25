from pathlib import Path
from hashlib import sha256
p=Path('qa/journal-gate-e2e.mjs')
assert sha256(p.read_bytes()).hexdigest()=='952fe5acf7845ecfc1056b1d11944644d2cb1201f415b17a70df8b1d93ee92c4'
s=p.read_text(encoding='utf-8')
s=s[:s.index('async function startStage')]
s=s.replace('// Real two-tab journal/recovery scheduling on a disposable origin. No owner data.', '// BF-106 late-workout lineage in real isolated tabs. Epoch changes are explicit\n// test fixtures, NOT a production finalization or forward-import implementation.')
s=s.replace("window.dw=await import('/src/lib/durableWorkout.ts');", "window.dw=await import('/src/lib/durableWorkout.ts');window.cp=await import('/src/lib/completionPersistence.ts');window.ep=await import('/src/lib/profileEpoch.ts');")
s+=r'''
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
async function prepare(c){
 return c.js("(async()=>{const locked=await l.withProfileWriteLock(()=>j.prepareWorkoutSession(localStorage.getItem(p.STORAGE_KEY),'training'));if(locked.status!=='completed'||locked.value.status!=='ready')throw Error('prepare failed');window.prepared=locked.value;const result={...prepared.session,durationMs:32000,finishedAt:'2026-11-25T12:00:00.000Z',repetitions:20};window.op=cp.createCompletionPersistence(result,{session:prepared.session,baseProfileRaw:prepared.state.revision});if(!op)throw Error('completion not bound');return {session:prepared.session,raw:op.raw,key:op.key,base:prepared.state.revision}})()");
}
async function replay(c){return c.js("l.withProfileWriteLock(()=>dw.replayDurableWorkouts(null,{signal:new AbortController().signal,isCurrent:()=>true}))")}
async function click(c,selector){check(await c.js("(()=>{const el=document.querySelector("+JSON.stringify(selector)+");if(!el||el.disabled)return false;el.click();return true})()"),'click '+selector)}
async function rotateFixture(c,epoch){
 const result=await c.js("l.withProfileWriteLock(()=>g.withDurableJournalGate('exclusive',()=>{localStorage.setItem(ep.PROFILE_EPOCH_KEY,"+JSON.stringify(epoch)+");return ep.readProfileEpoch()}))");
 check(result.status==='completed'&&result.value.status==='completed'&&result.value.value===epoch,'fixture lineage changed under ordered locks');
}
try{
 await requireDevOrigin(origin);
 profile=fs.mkdtempSync(path.join(os.tmpdir(),'bf-workout-epoch-'));
 chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
 '--headless=new','--disable-webgl','--no-first-run','--no-default-browser-check','--remote-allow-origins=*',
 '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 browser=await waitForOwnedBrowser(profile,chrome);
 const a=await tab(),b=await tab();
 check(await a.js('localStorage.length===0'),'disposable storage is empty');
 const seed=await a.js("(async()=>{const {freshGame}=await import('/src/lib/game.ts');const value=p.parseProfile({profileId:'epoch-fighter',xp:400,coins:200,workouts:[],creditedWorkoutIds:[],game:{...freshGame(),created:true}});const raw=JSON.stringify(value,null,2),backup=JSON.stringify(value)+'\\n';const locked=await l.withProfileWriteLock(()=>{localStorage.setItem(p.STORAGE_KEY,raw);localStorage.setItem(p.PROFILE_BACKUP_KEY,backup)});return {raw,backup,status:locked.status}})()");
 check(seed.status==='completed','fixture primary and backup seeded under wallet lock');
 const late=await prepare(b);
 check(!late.session.sessionId.startsWith('epoch:')&&late.base===seed.raw,'pre-import session retains legacy identity and exact base');
 await a.js("window.importHeld=false;window.importDone=false;const wait=new Promise(resolve=>window.releaseImport=resolve);void l.withProfileWriteLock(()=>g.withDurableJournalGate('exclusive',async()=>{window.importHeld=true;await wait})).then(()=>window.importDone=true);true");
 await a.until('window.importHeld','ordered import fixture lock');
 await b.js('window.staged=false;void op.stage().then(x=>{window.stageOutcome=x;window.staged=true});true');
 await pending(a,gate,'shared');check(!await b.js('window.staged'),'late result waits behind exclusive import boundary');
 // No production finalizer exists yet. This fixture changes only the metadata
 // under the exact ordered locks future finalization must use.
 await a.js('localStorage.setItem(ep.PROFILE_EPOCH_KEY,'+JSON.stringify(A)+');window.releaseImport();true');
 await a.until('window.importDone','fixture lock release');await b.until('window.staged','late strict stage');
 check(await b.js("stageOutcome.status==='saved'&&stageOutcome.entries[0].raw===op.raw&&stageOutcome.entries[0].baseProfileRaw===prepared.state.revision"),'late completion is strictly saved unchanged');
 const held=await replay(b);
 check(held.status==='completed'&&held.value.status==='mismatch','late completion is not credited to new lineage');
 check(await a.js('localStorage.getItem(p.STORAGE_KEY)')===seed.raw&&await a.js('localStorage.getItem(p.PROFILE_BACKUP_KEY)')===seed.backup,'late completion leaves exact primary and backup');
 check((await a.js('d.readDurableJournal()')).entries[0].state==='active','late original remains active for review, not falsely settled');
 const c=await tab();await c.cdp('Fetch.disable');await c.cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await c.cdp('Page.navigate',{url:origin+'/'});
 await c.until("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='pending-result'",'actual app exposes unresolved late result');
 await click(c,'[data-action=request-quarantine]');
 check(await a.js('localStorage.getItem(p.STORAGE_KEY)')===seed.raw&&(await a.js('d.readDurableJournal()')).entries[0].state==='active','confirmation request alone changes neither reward nor original');
 await click(c,'[data-action=confirm-quarantine]');
 await c.until("!!document.querySelector('.app-shell') && !!document.querySelector('[data-quarantined-results]')",'explicit UI quarantine preserves original and opens app');
 const quarantine=await a.js('({held:j.readQuarantinedResults(),durable:null})');
 check(quarantine.held.entries.length===1&&JSON.parse(quarantine.held.entries[0].raw).raw===late.raw,'quarantine retains exact late completion bytes');
 check((await a.js('d.readDurableJournal()')).entries[0].state==='quarantined','durable tombstone prevents late replay');
 check(await a.js('localStorage.getItem(p.STORAGE_KEY)')===seed.raw,'actual quarantine gives no XP or coins');
 const fresh=await prepare(b);check(fresh.session.sessionId.startsWith('epoch:'+A+':'),'new session binds current lineage');
 const staged=await b.js('op.stage()');check(staged.status==='saved','current-lineage completion staged');
 const paid=await replay(b);check(paid.status==='completed'&&paid.value.status==='saved','current-lineage replay completes');
 const paidRaw=await b.js('localStorage.getItem(p.STORAGE_KEY)'),wallet=JSON.parse(paidRaw);
 check(wallet.xp===520&&wallet.coins===235&&wallet.workouts.length===1,'one current completion pays exactly 120 XP and 35 coins');
 await replay(b);check(await b.js('localStorage.getItem(p.STORAGE_KEY)')===paidRaw,'repeat replay does not duplicate reward');
 await c.cdp('Page.reload',{ignoreCache:true});
 await c.until("!!document.querySelector('.app-shell') && !document.querySelector('[data-storage-status]')",'fresh app after epoch-aware reward');
 const another=await prepare(b);check(another.session.sessionId.startsWith('epoch:'+A+':'),'next session retains current lineage before new fixture import');
 await rotateFixture(a,B);
 // Identical primary bytes are intentional: an epoch-only change must still
 // stop a stale live application instead of relying only on wallet equality.
 await c.until("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='conflict'",'epoch-only cross-tab change stops stale app');
 check(await a.js('localStorage.getItem(p.STORAGE_KEY)')===paidRaw,'epoch-only invalidation does not rewrite wallet');
 await click(c,'[data-action=load-latest]');
 await c.until("!!document.querySelector('.app-shell') && !document.querySelector('[data-storage-status]')",'explicit latest view adopts new lineage');
 check((await b.js('op.stage()')).status==='saved','second late result preserved after second fixture import');
 check((await replay(b)).value.status==='mismatch','earlier named epoch cannot pay after next import');
 check(await a.js('localStorage.getItem(p.STORAGE_KEY)')===paidRaw,'second late result leaves exact paid wallet');
 const pendingEntries=await b.js('j.readResultJournal().entries');
 check(pendingEntries.length===1&&pendingEntries[0].raw===another.raw,'second late original is still available');
 const q=await b.js("l.withProfileWriteLock(()=>dw.quarantineDurableWorkouts(j.readResultJournal().entries,{signal:new AbortController().signal,isCurrent:()=>true}))");
 check(q.value.status==='saved','explicit second quarantine succeeds without data deletion');
 await c.cdp('Page.reload',{ignoreCache:true});await c.until("!!document.querySelector('.app-shell') && !document.querySelector('[data-storage-status]')",'restart after second quarantine');
 check(await a.js('localStorage.getItem(p.STORAGE_KEY)')===paidRaw,'repeated restart preserves exact wallet and ledger');
 await a.js("localStorage.setItem(ep.PROFILE_EPOCH_KEY,'{corrupt-metadata');true");
 await c.until("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='unavailable'",'unreadable lineage fails closed');
 check(await a.js('localStorage.getItem(p.STORAGE_KEY)')===paidRaw,'unreadable metadata never resets progress');
 check(errors.length===0,'no uncaught browser exceptions');
 console.log('BODYFORGE_WORKOUT_EPOCH_E2E_PASS assertions='+assertions);
}catch(error){console.error('BODYFORGE_WORKOUT_EPOCH_E2E_FAIL',error.stack||String(error));process.exitCode=22}
finally{for(const c of clients)c.dispose();if(profile&&chrome)try{await cleanupOwnedChrome(profile,'bf-workout-epoch-',chrome,browser)}catch(e){console.error('QA_OWNED_CLEANUP FAIL',String(e));process.exitCode ||=17}}
'''
q=Path('qa/workout-epoch-e2e.mjs');assert not q.exists()
with q.open('x',encoding='utf-8',newline='\n') as f:f.write(s)
print('QA',q.stat().st_size,sha256(q.read_bytes()).hexdigest())