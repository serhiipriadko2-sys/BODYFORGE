// BF-106: actual Settings file input and read-only import comparison.
// Synthetic file fixtures exercise preview, cancellation and explicit replacement.
// Only disposable Chrome, no real camera, owner profile, Downloads or network upload.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { requireDevOrigin, waitForOwnedBrowser, newOwnedPage, cleanupOwnedChrome } from './owned-chrome.mjs';

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
async function ev(expression, userGesture = false) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression, label) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await ev(expression)) return;
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
async function makeBackup() {
  const p = await import('/src/lib/progression.ts');
  const { prepareProgressBackup } = await import('/src/lib/progressBackup.ts');
  const state = p.loadProfileState();
  if (state.status !== 'ready') throw Error('Fixture not ready');
  const prepared = await prepareProgressBackup(state.profile, null, new Date('2026-11-25T12:00:00Z'));
  if (!prepared.complete) throw Error('Fixture export incomplete');
  const envelope = JSON.parse(prepared.json);
  const next = p.addCompletedWorkout(state.profile, 38000, new Date('2026-11-25T12:01:00Z'), {
    sessionId: 'preview-only-fourth', mode: 'training',
  });
  envelope.storedProfileRaw = JSON.stringify(next);
  envelope.xp = 999999; envelope.coins = 999999; // Must ignore display mirror.
  return { json: JSON.stringify(envelope), xp: next.xp, coins: next.coins, workouts: next.totals.workouts };
}
async function snapshot() {
  const { readDurableJournal } = await import('/src/lib/durableJournal.ts');
  const result = await readDurableJournal();
  return JSON.stringify({
    local: Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]),
    durable: { status: result.status, entries: [...result.entries].sort((a,b) => a.key.localeCompare(b.key)) },
  });
}
async function selectFixture(payload, kind) {
  const input = document.querySelector('[data-action=inspect-progress-file]');
  const contents = kind === 'oversize' ? [new Uint8Array(16*1024*1024+1)] :
    kind === 'bad-utf8' ? [new Uint8Array([0xc3,0x28])] :
    kind === 'gzip' ? [await new Response(new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'))).blob()] : [payload];
  const file = new File(contents, 'bf106-' + kind + (kind==='gzip'?'.json.gz':'.json'), { type: kind==='gzip'?'application/gzip':'application/json' });
  const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
async function choose(payload, kind = 'valid') {
  return ev('('+selectFixture.toString()+')('+JSON.stringify(payload)+','+JSON.stringify(kind)+')');
}
async function cancel() {
  check(await ev("(()=>{const b=document.querySelector('[data-action=cancel-import-preview]');if(!b)return false;b.click();return true})()"),'explicit cancel available');
  await until("document.querySelector('[data-inspection-state]')?.dataset.inspectionState==='idle' && !document.querySelector('[data-import-preview]')",'preview cleared');
}

try {
  await requireDevOrigin(origin);
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-import-preview-'));
  chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new','--disable-webgl','--no-first-run','--no-default-browser-check',
    '--remote-allow-origins=*','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank',
  ], {stdio:'ignore'});
  browser = await waitForOwnedBrowser(profile, chrome);
  const target = await newOwnedPage(browser);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('close', rejectPending);
  socket.addEventListener('error', rejectPending);
  socket.addEventListener('message', e => {
    const message=JSON.parse(e.data.toString()), request=pending.get(message.id);
    if(request) { pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result); }
    if(message.method==='Runtime.exceptionThrown') errors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'unknown');
    if(message.method==='Fetch.requestPaused') {
      void cdp('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:200,
        responseHeaders:[{name:'Content-Type',value:'text/html; charset=utf-8'}],
        body:Buffer.from('<!doctype html><title>BF106 disposable observer</title>').toString('base64')})
        .catch(error=>errors.push(error.message));
    }
  });
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('CDP connection timeout')),3000);
    socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP connection failed'));},{once:true});
  });
  await cdp('Page.enable');await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await cdp('Fetch.enable',{patterns:[{urlPattern:origin+'/?bf105-observer',resourceType:'Document',requestStage:'Request'}]});
  await cdp('Page.navigate',{url:origin+'/?bf105-observer'});
  await until("document.title==='BF106 disposable observer' && location.origin==="+JSON.stringify(origin),'owned observer');
  check(await ev('localStorage.length===0'),'isolated origin has no pre-existing data');
  const fixture = await ev('('+seed.toString()+')()');
  check(fixture.status==='completed' && fixture.value.exactPrimary && fixture.value.exactBackup,'fixture saved through actual Web Lock and read-back');
  const expected = fixture.value;
  const settled = await ev(`(async()=>{
    const {stageDurableResults,markDurableResults,readDurableJournal}=await import('/src/lib/durableJournal.ts');
    const {resultJournalEntry}=await import('/src/lib/workoutJournal.ts');
    const primary=JSON.parse(localStorage.getItem('bodyforge:pilot:v1'));
    const workout=primary.workouts.find(w=>w.id==='tower-one');
    const entry=resultJournalEntry({schemaVersion:1,profileId:primary.profileId,sessionId:workout.id,mode:'tower',
      floor:1,durationMs:workout.durationMs,repetitions:20,finishedAt:workout.finishedAt,splitsMs:workout.splitsMs});
    if(!entry || (await stageDurableResults([entry],null)).status!=='saved' ||
       (await markDurableResults([entry],'settled')).status!=='saved') throw Error('paid journal fixture failed');
    return (await readDurableJournal()).entries;
  })()`);
  check(settled.length===1 && settled[0].state==='settled','real IndexedDB holds the paid session');
  if (process.argv.includes('--journal-v2')) {
    const upgrade = await ev("(async()=>await(await import('/src/lib/durableJournalV2.ts')).prepareVersionedJournal())()");
    check(upgrade.status==='prepared' && upgrade.versionConfirmed===2,'explicit upgrade on disposable IndexedDB');
  }
  const backup = await ev('('+makeBackup.toString()+')()');
  check(backup.xp===825 && backup.coins===335 && backup.workouts===4,'backup candidate has independent totals');
  await cdp('Fetch.disable');
  await cdp('Page.navigate',{url:origin+'/'});
  await until("!!document.querySelector('.app-shell[data-fighter-created=true]') && !document.querySelector('[data-storage-status]')",'actual fighter hydrated');
  await ev("document.querySelector('.mobile-nav button:nth-child(6)').click()");
  await until("!!document.querySelector('#progress-backup [data-action=inspect-progress-file]')",'FAQ backup panel mounted');
  await ev("document.querySelector('.progress-backup-file-checker').open=true");
  await sleep(300);
  const before = await ev('('+snapshot.toString()+')()');
  const unchanged = async label => check(await ev('('+snapshot.toString()+')()')===before,label+' exact localStorage and durable journal unchanged');
  check(await ev("localStorage.getItem('bodyforge:pilot:v1')")===expected.raw,'initial primary exact');
  await choose(backup.json);
  await until("document.querySelector('[data-import-preview]')?.dataset.importPreview==='preview-ready'",'comparison rendered');
  const rows = await ev("Array.from(document.querySelectorAll('[data-import-preview] tbody tr')).map(row=>Array.from(row.querySelectorAll('td')).map(c=>Number(c.textContent.replace(/[^0-9.-]/g,''))))");
  check(rows.length===8 && JSON.stringify(rows.slice(0,4))===JSON.stringify([[705,825],[300,335],[3,4],[3,4]]),'visible comparison uses authoritative stored source');
  check(await ev("document.documentElement.scrollWidth===innerWidth"),'390px layout has no horizontal overflow');
  await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(250);
  const narrow=await ev("(()=>{const t=document.querySelector('[data-import-preview] table').getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,left:t.left,right:t.right}})()");
  check(narrow.width===320&&narrow.scroll===320&&narrow.left>=0&&narrow.right<=320,'320px comparison remains inside viewport');
  await unchanged('valid preview');
  await cancel();
  await unchanged('cancel');
  await choose('{','bad-json');
  await until("document.querySelector('[data-inspection-result]')?.dataset.inspectionResult==='invalid'",'malformed JSON rejected');
  check(await ev("!document.querySelector('[data-import-preview]')"),'invalid JSON cannot show comparison');
  await unchanged('invalid JSON');
  await choose('', 'bad-utf8');
  await until("document.querySelector('[data-inspection-result]')?.dataset.inspectionResult==='invalid'",'invalid UTF-8 rejected');
  await unchanged('invalid UTF-8');
  await cancel();
  // Real file input uses the production File.size preflight.
  await ev("window.__bf106Reads=0;window.__bf106ArrayBuffer=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){if(this.name.startsWith('bf106-'))window.__bf106Reads++;return window.__bf106ArrayBuffer.call(this)};true");
  await choose('', 'oversize');
  await until("document.querySelector('[data-inspection-result]')?.dataset.inspectionResult==='invalid'",'oversized file rejected');
  check(await ev('window.__bf106Reads===0'),'oversized file never read');
  await unchanged('oversize');
  await cancel();
  // Delay only the selected File; abort the UI generation while reading.
  await ev("File.prototype.arrayBuffer=function(){if(this.name==='bf106-delayed.json'){const file=this;return new Promise(resolve=>{window.__bf106Release=()=>resolve(window.__bf106ArrayBuffer.call(file))})}return window.__bf106ArrayBuffer.call(this)};true");
  await choose(backup.json,'delayed');
  await until("typeof window.__bf106Release==='function' && document.querySelector('[data-inspection-state]')?.dataset.inspectionState==='checking'",'delayed file read pending');
  await cancel();
  await ev("window.__bf106Release();File.prototype.arrayBuffer=window.__bf106ArrayBuffer;true");
  await sleep(300);
  check(await ev("!document.querySelector('[data-import-preview]') && document.querySelector('[data-inspection-state]')?.dataset.inspectionState==='idle'"),'cancelled read cannot restore stale preview');
  await unchanged('cancelled async read');
  await choose(backup.json);
  await until("document.querySelector('[data-import-preview]')?.dataset.importPreview==='preview-ready'",'fresh selection works after cancel');
  await ev("window.dispatchEvent(new StorageEvent('storage',{key:'bodyforge:pilot:v1'}));true");
  await until("!document.querySelector('[data-import-preview]') && document.querySelector('[data-inspection-state]')?.dataset.inspectionState==='idle'",'external revision invalidates preview');
  await unchanged('revision invalidation');
  await choose(backup.json);
  await until("document.querySelector('[data-import-preview]')?.dataset.importPreview==='preview-ready'",'preview rebuilt');
  await ev("window.__bf106BeforeReload=true");
  await cdp('Page.reload',{ignoreCache:true});
  await until("!window.__bf106BeforeReload && !!document.querySelector('.app-shell[data-fighter-created=true]') && !document.querySelector('[data-storage-status]')",'actual reload');
  await sleep(300);
  check(await ev("localStorage.getItem('bodyforge:pilot:v1')")===expected.raw,'reload preserves exact original primary');
  await unchanged('reload');
  await ev("document.querySelector('.mobile-nav button:nth-child(6)').click()");
  await until("!!document.querySelector('[data-action=inspect-progress-file]')",'settings reopened');
  await ev("document.querySelector('.progress-backup-file-checker').open=true");
  const candidateFile = JSON.parse(backup.json);
  for (const [candidate, issue, phrase] of [
    [{ ...candidateFile, durableResults: settled.map(row => ({ ...row, state: 'active' })) },
      'incoming-pending', 'ожидающий начисления'],
    [{ ...candidateFile, durableResults: settled.map(row => ({ ...row, state: 'quarantined' })) },
      'incoming-quarantine', 'карантине'],
    [{ ...candidateFile, durableResults: [] }, 'different-journal', 'оплаченных тренировок различаются'],
    [{ ...candidateFile, storedAuxiliaryRaw: { ...candidateFile.storedAuxiliaryRaw, manualSteps: '[]' } },
      'auxiliary-replacement-unsupported', 'настройки'],
  ]) {
    await choose(JSON.stringify(candidate));
    await until("!!document.querySelector('[data-file-replacement-status="+issue+"]')",'visible import block '+issue);
    const feedback = await ev("document.querySelector('[data-file-replacement-status]').textContent");
    check(feedback.toLowerCase().includes(phrase) &&
      await ev("!!document.querySelector('[data-import-preview]') && !document.querySelector('[data-action=request-file-replacement]')"),
      issue+' exposes specific guidance with comparison and no replace action');
    await unchanged(issue);
    await cancel();
  }
  async function requestReplacement(kind='valid'){
    await choose(backup.json,kind);
    await until("!!document.querySelector('[data-action=request-file-replacement]')",'compatible file eligible');
    await ev("document.querySelector('[data-action=request-file-replacement]').click()");
    await until("!!document.querySelector('[data-action=confirm-file-replacement]')",'explicit decision offered');
    check(await ev("document.querySelector('[data-action=confirm-file-replacement]').getBoundingClientRect().height>=44"),'mobile confirmation has a 44px touch target');
  }
  await requestReplacement();
  await cancel();
  await unchanged('cancel explicit replacement');
  await requestReplacement();
  // A separate same-origin tab holds the real lock until the confirmed operation queues.
  await ev(`window.__bfPeer=window.open('about:blank','_blank');if(!__bfPeer)throw Error('peer unavailable'); __bfPeer.eval("navigator.locks.request('bodyforge:pilot:v1:write',()=>new Promise(resolve=>{window.releaseFileLock=resolve}))");true`, true);
  await until("typeof __bfPeer.releaseFileLock==='function'",'peer holds profile lock');
  await ev("document.querySelector('[data-action=confirm-file-replacement]').click()");
  await until("navigator.locks.query().then(q=>q.pending.some(l=>l.name==='bodyforge:pilot:v1:write'))",'confirmed operation waits for profile lock');
  await ev("window.__bfFallback=localStorage.getItem('bodyforge:pilot:v1:backup'); __bfPeer.localStorage.setItem('bodyforge:pilot:v1:backup',__bfFallback+' '); __bfPeer.releaseFileLock();true");
  await until("!document.querySelector('[data-action=confirm-file-replacement]')",'changed fallback invalidates confirmation');
  check(await ev("localStorage.getItem('bodyforge:pilot:v1:replace-pending:v1')===null && localStorage.getItem('bodyforge:pilot:v1:backup')===__bfFallback+' '") &&
    await ev("localStorage.getItem('bodyforge:pilot:v1')")===expected.raw,'stale approval preserves peer update and original primary');
  await ev("__bfPeer.localStorage.setItem('bodyforge:pilot:v1:backup',__bfFallback);__bfPeer.close();true");
  await until("document.querySelector('[data-inspection-state]')?.dataset.inspectionState==='idle'",'fresh comparison required');
  await requestReplacement();
  await ev("document.querySelector('[data-action=confirm-file-replacement]').click()");
  await until("document.querySelector('[data-replacement-recovery]')?.dataset.replacementRecovery==='applied'",'selected file reaches verified recovery screen');
  const candidate=JSON.parse(backup.json);
  check(await ev("localStorage.getItem('bodyforge:pilot:v1')")===candidate.storedProfileRaw &&
    await ev("localStorage.getItem('bodyforge:pilot:v1:backup')")===candidate.storedBackupRaw,'file import stages exact primary and fallback');
  const stagedEvidence = await ev(`(async()=>{
    const {prepareProgressBackup}=await import('/src/lib/progressBackup.ts');
    const {parseProfile}=await import('/src/lib/progression.ts');
    const {inspectProgressBackupJson}=await import('/src/lib/progressBackupInspector.ts');
    const exportFile=await prepareProgressBackup(parseProfile(null),null);
    const content=JSON.parse(exportFile.json);
    return {complete:exportFile.complete, inspection:inspectProgressBackupJson(exportFile.json).state,
      primary:content.storedProfileRaw, backup:content.storedBackupRaw,
      rows:content.durableResults};
  })()`);
  check(!stagedEvidence.complete && stagedEvidence.inspection==='incomplete' &&
    stagedEvidence.primary===candidate.storedProfileRaw && stagedEvidence.backup===candidate.storedBackupRaw &&
    JSON.stringify(stagedEvidence.rows)===JSON.stringify(settled),
    'export during unresolved replacement keeps exact profiles and journal as incomplete evidence');
  await ev(`window.__bfRecoveryPeer=window.open('about:blank','_blank');
    if(!__bfRecoveryPeer)throw Error('recovery peer unavailable');
    __bfRecoveryPeer.eval("navigator.locks.request('bodyforge:pilot:v1:write',()=>new Promise(resolve=>{window.releaseRecoveryLock=resolve}))");
    true`, true);
  await until("typeof __bfRecoveryPeer.releaseRecoveryLock==='function'",'peer holds lock before recovery reload');
  const peerTargets=await cdp('Target.getTargets');
  const peerInfo=peerTargets.targetInfos.find(page=>page.type==='page' && page.url==='about:blank' && page.openerId===target.id);
  const recoveryPeer=peerInfo && { id: peerInfo.targetId };
  if (!recoveryPeer) throw Error('owned recovery peer missing');
  await cdp('Page.bringToFront');
  await ev('window.__bfRecoveryBeforeReload=true');
  await cdp('Page.reload',{ignoreCache:true});
  await until("!window.__bfRecoveryBeforeReload && !!document.querySelector('[data-replacement-recovery] [role=alert]')",
    'startup blocks recovery actions while the profile lock is held');
  const released = await cdp('Target.closeTarget',{targetId:recoveryPeer.id});
  if (!released.success) throw Error('owned recovery peer did not close');
  await until("!!document.querySelector('[data-action=request-replacement-keep]:enabled')",
    'recovery reads staged copy automatically after startup unlocks');
  check(await ev("localStorage.getItem('bodyforge:pilot:v1:replace-pending:v1')!==null"),
    'waiting for recovery preserves rollback record');
  async function reopenAfterDecision(action){
    await ev("document.querySelector('[data-action=request-replacement-"+action+"]')"+'.click()');
    await ev("document.querySelector('[data-action=confirm-replacement-"+action+"]')"+'.click()');
    await until("!!document.querySelector('[data-action=open-restored-profile]')",'decision verified');
    await ev("document.querySelector('[data-action=open-restored-profile]').click()");
    await until("!!document.querySelector('.app-shell[data-fighter-created=true]')",'profile reopened');
    await ev('window.__paidBeforeReload=true');
    await cdp('Page.reload',{ignoreCache:true});
    await until("!window.__paidBeforeReload && !!document.querySelector('.app-shell[data-fighter-created=true]') && !document.querySelector('[data-storage-status]')",'paid history reloaded');
  }
  await reopenAfterDecision('rollback');
  await unchanged('rollback and reload with settled history');
  await ev("document.querySelector('.mobile-nav button:nth-child(6)').click()");
  await until("!!document.querySelector('[data-action=inspect-progress-file]')",'settings after rollback');
  await ev("document.querySelector('.progress-backup-file-checker').open=true");
  await requestReplacement('gzip');
  await ev("document.querySelector('[data-action=confirm-file-replacement]').click()");
  try {
    await until("!!document.querySelector('[data-action=request-replacement-keep]')",'same paid file in gzip can be selected again');
  } catch (error) {
    console.error('GZIP_REPLACEMENT_STATUS', await ev(`({
      storage: document.querySelector('[data-storage-status]')?.dataset.storageStatus,
      recovery: document.querySelector('[data-replacement-recovery]')?.dataset.replacementRecovery,
      reason: document.querySelector('[data-file-replacement-status]')?.dataset.fileReplacementStatus,
      confirmation: !!document.querySelector('[data-action=confirm-file-replacement]'),
      pendingReplacement: localStorage.getItem('bodyforge:pilot:v1:replace-pending:v1') !== null,
    })`));
    throw error;
  }
  check(await ev("localStorage.getItem('bodyforge:pilot:v1')")===candidate.storedProfileRaw &&
    await ev("localStorage.getItem('bodyforge:pilot:v1:backup')")===candidate.storedBackupRaw,'gzip file replacement stages exact v1 bytes without new authority');
  await reopenAfterDecision('keep');
  check(JSON.stringify(JSON.parse(await ev('('+snapshot.toString()+')()')).durable.entries)===JSON.stringify(settled),
    'accepted paid original remains byte-exact in IndexedDB after reload');

  check(await ev("localStorage.getItem('bodyforge:pilot:v1')")===candidate.storedProfileRaw &&
    await ev("localStorage.getItem('bodyforge:pilot:v1:replace-pending:v1')===null"),'adopted file does not generate a new reward');
  check(errors.length===0,'no uncaught browser exceptions');
  console.log('BODYFORGE_IMPORT_PREVIEW_E2E_PASS assertions='+assertions);
} catch(error) {
  console.error('BODYFORGE_IMPORT_PREVIEW_E2E_FAIL',error.stack||String(error));
  process.exitCode=18;
} finally {
  socket?.close();rejectPending();
  if(profile && chrome) {
    try { await cleanupOwnedChrome(profile,'bf-import-preview-',chrome,browser); }
    catch(error) { console.error('QA_OWNED_CLEANUP FAIL',String(error));process.exitCode ||= 17; }
  }
}
