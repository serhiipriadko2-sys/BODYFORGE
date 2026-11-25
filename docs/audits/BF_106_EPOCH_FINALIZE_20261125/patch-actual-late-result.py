from pathlib import Path
from hashlib import sha256
p=Path('qa/profile-replacement-e2e.mjs')
a=Path('docs/audits/BF_106_EPOCH_FINALIZE_20261125')
old=p.read_bytes()
assert sha256(old).hexdigest()=='25f81b424fbf075357af38787234961bb89eef7483412caec3c36a2eafc7c5e3'
s=old.decode()
def once(x,y):
 global s
 assert s.count(x)==1,x
 s=s.replace(x,y)
once("  const keepFixture = await run('apply');", """  // An independent tab prepares a real session before accepting the new copy.
  // Its completion is intentionally delayed until the actual UI finalizer exits.
  await connectObserver();
  const lateTarget=target,lateSocket=socket;
  const late=await ev("(async()=>{const p=await import('/src/lib/progression.ts'),j=await import('/src/lib/workoutJournal.ts'),l=await import('/src/lib/profileLock.ts'),c=await import('/src/lib/completionPersistence.ts');const r=await l.withProfileWriteLock(()=>j.prepareWorkoutSession(localStorage.getItem(p.STORAGE_KEY),'training'));if(r.status!=='completed'||r.value.status!=='ready')throw Error('pre-import prepare failed');const session=r.value.session;window.__lateOp=c.createCompletionPersistence({...session,durationMs:32000,finishedAt:'2026-11-25T12:00:00.000Z',repetitions:20},{session,baseProfileRaw:r.value.state.revision});if(!window.__lateOp)throw Error('late fixture not bound');return {id:session.sessionId,key:__lateOp.key,raw:__lateOp.raw}})()");
  check(!late.id.startsWith('epoch:'),'independent pre-import session retains original generation');
  target=appTarget;socket=appSocket;
  const keepFixture = await run('apply');""")
once("  check(errors.length===0,'no uncaught browser exceptions');", """  target=lateTarget;socket=lateSocket;
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
  check(errors.length===0,'no uncaught browser exceptions');""")
with (a/'profile-replacement-e2e.mjs.before-actual-late-result').open('xb') as f:f.write(old)
assert p.read_bytes()==old
p.write_bytes(s.encode())
print('QA',p.stat().st_size,sha256(p.read_bytes()).hexdigest())