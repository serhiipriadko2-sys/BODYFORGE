// BF-105: real browser round-trip of the existing v1 wallet and receipt preview.
// Deliberately seeded completions, not a claim of camera accuracy or import support.
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
async function ev(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
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
async function inspect() {
  const p = await import('/src/lib/progression.ts');
  // Resolve module imports before instrumenting storage in an active App.
  // From this point through finally there is no await: React startup and
  // other task/microtask callbacks cannot be mistaken for adapter calls.
  const m = await import('/src/lib/receiptCompatibility.ts');
  const raw = localStorage.getItem(p.STORAGE_KEY), backup = localStorage.getItem(p.PROFILE_BACKUP_KEY);
  const state = p.loadProfileState();
  let calls = 0;
  const patched = [];
  const deny = () => { calls++; throw Error('Read-only adapter touched storage'); };
  let preview, repeat, invalid, roundTrip;
  try {
    for (const [proto, names] of [[Storage.prototype, ['getItem','setItem','removeItem','clear','key']],
      [IDBFactory.prototype, ['open','deleteDatabase']]]) {
      for (const name of names) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, name);
        if (!descriptor || !('value' in descriptor)) throw Error('Unable to instrument ' + name);
        patched.push([proto, name, descriptor]);
        Object.defineProperty(proto, name, { ...descriptor, value: deny });
      }
    }
    preview = m.previewReceiptMigration(raw);
    repeat = m.previewReceiptMigration(raw);
    invalid = m.previewReceiptMigration('{"xp":0,"coins":0,"workouts":[],"__proto__":{}}');
    if (preview.status === 'preview-ready') roundTrip = m.legacySourceFromPreview(preview);
  } finally {
    for (const [proto,name,descriptor] of patched.reverse()) Object.defineProperty(proto,name,descriptor);
  }
  return { state: state.status, raw, backup, preview, invalid, calls,
    deterministic: JSON.stringify(preview) === JSON.stringify(repeat), roundTrip,
    unchanged: localStorage.getItem(p.STORAGE_KEY) === raw && localStorage.getItem(p.PROFILE_BACKUP_KEY) === backup };
}
function verify(view, expected, label) {
  const p = view.preview;
  check(view.state === 'ready' && view.raw === expected.raw && view.backup === expected.backup, label + ' exact v1 primary and fallback');
  if (view.calls !== 0 || !view.unchanged || !view.deterministic || view.roundTrip !== view.raw) {
    console.error('BF105_PREVIEW_DIAGNOSTIC', JSON.stringify({ label, calls:view.calls, unchanged:view.unchanged,
      deterministic:view.deterministic, exactRoundTrip:view.roundTrip===view.raw,
      status:view.preview.status, reason:view.preview.reason }));
  }
  check(view.calls === 0 && view.unchanged && view.deterministic && view.roundTrip === view.raw, label + ' preview is read-only and reversible');
  check(view.invalid.status === 'invalid' && !view.invalid.activationAuthorized, label + ' unsafe JSON rejected');
  check(p.status === 'preview-ready' && !p.activationAuthorized && !p.grantsComplete, label + ' evidence never authorizes migration or rewards');
  check(p.profile.xp === 705 && p.profile.coins === 300 && p.profile.workouts.length === 3, label + ' exact wallet and history');
  check(p.profile.totals.workouts === 3 && p.profile.totals.repetitions === 40 && p.profile.totals.holdSeconds === 30, label + ' exact totals');
  check(p.profile.game.highestClearedFloor === 1 && p.profile.game.bestGhost.splitsMs.length === 20 &&
    p.profile.game.outfit === 'ember' && p.profile.game.ownedOutfits.join(',') === 'base,ember' &&
    JSON.stringify(p.profile.game.muscles) === JSON.stringify({arms:1,core:2,legs:3,back:4}), label + ' tower, ghost and ownership retained');
  check(p.storedCreditedWorkoutIds.join(',') === 'legacy-one,tower-one,plank-one', label + ' exact independent reward identities');
  check(p.receipts.map(r => r.receiptEvidence).join(',') === 'recognized,recognized,missing', label + ' old and new records distinguished');
  check(p.recordedGrants.length === 3 && p.recordedGrants.every(e => e.provenance === 'local-profile-unverified') &&
    new Set(p.recordedGrants.map(e=>e.scopedId)).size === 3 &&
    p.recordedGrants.map(e=>[e.grant.xpDelta,e.grant.coinDelta].join('/')).join(',') === '120/35,120/35,65/30', label + ' only actual recorded grant evidence');
}

try {
  await requireDevOrigin(origin);
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-receipt-preview-'));
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
        body:Buffer.from('<!doctype html><title>BF105 disposable observer</title>').toString('base64')})
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
  await until("document.title==='BF105 disposable observer' && location.origin==="+JSON.stringify(origin),'owned observer');
  check(await ev('localStorage.length===0'),'isolated origin has no pre-existing data');
  const fixture = await ev('('+seed.toString()+')()');
  check(fixture.status==='completed' && fixture.value.exactPrimary && fixture.value.exactBackup,'fixture saved through actual Web Lock and read-back');
  const expected = fixture.value;
  verify(await ev('('+inspect.toString()+')()'),expected,'observer');
  await cdp('Fetch.disable');
  await cdp('Page.navigate',{url:origin+'/'});
  await until("!!document.querySelector('.app-shell[data-fighter-created=true]') && !document.querySelector('[data-storage-status]')",'actual fighter hydrated');
  verify(await ev('('+inspect.toString()+')()'),expected,'app hydration');
  await ev("window.__bf105BeforeReload=true");
  await cdp('Page.reload',{ignoreCache:true});
  await until("!window.__bf105BeforeReload && !!document.querySelector('.app-shell[data-fighter-created=true]') && !document.querySelector('[data-storage-status]')",'actual reload');
  verify(await ev('('+inspect.toString()+')()'),expected,'app reload');
  check(errors.length===0,'no uncaught browser exceptions');
  console.log('BODYFORGE_RECEIPT_PREVIEW_E2E_PASS assertions='+assertions);
} catch(error) {
  console.error('BODYFORGE_RECEIPT_PREVIEW_E2E_FAIL',error.stack||String(error));
  process.exitCode=18;
} finally {
  socket?.close();rejectPending();
  if(profile && chrome) {
    try { await cleanupOwnedChrome(profile,'bf-receipt-preview-',chrome,browser); }
    catch(error) { console.error('QA_OWNED_CLEANUP FAIL',String(error));process.exitCode ||= 17; }
  }
}
