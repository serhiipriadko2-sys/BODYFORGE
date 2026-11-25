import { snapshotSettledHistory } from './settledImportHistory';
import { resultJournalEntry } from './workoutJournal';
import { describe, expect, it } from 'vitest';
import { addCompletedWorkout, parseProfile, STORAGE_KEY, PROFILE_BACKUP_KEY } from './progression';
import { freshGame } from './game';
import { PROFILE_EPOCH_KEY as EPOCH } from './profileEpoch';
import { executeProfileReplacement, finalizeProfileReplacement, inspectProfileReplacement, planProfileReplacement,
  PROFILE_REPLACEMENT_MARKER_KEY as MARKER, rollbackProfileReplacement,
  type ReplacementObservation, type ReplacementPort, type ReplacementPlan } from './profileReplacement';

const date = new Date('2026-11-25T12:00:00.000Z');
const initial = parseProfile({ profileId: 'qa', xp: 400, coins: 200, creditedWorkoutIds: [], workouts: [],
  game: { ...freshGame(), created: true, ownedOutfits: ['base', 'ember'], outfit: 'ember' } });
const incoming = addCompletedWorkout(initial, 32000, date, { sessionId: 'tower-1', mode: 'tower' });
const primary = JSON.stringify(initial, null, 2);
const backup = JSON.stringify(initial) + '\n';
const target = JSON.stringify(incoming, null, 1) + '\n';
const targetBackup = JSON.stringify(initial, null, 4);
const aux = { avatarLook: '{"style":"x"}', appearance: null, manualSteps: null, dailyPlan: null };
function envelope(override: Record<string, unknown> = {}) {
  return JSON.stringify({ exportFormat: 'bodyforge-manual-backup', exportSchemaVersion: 1,
    exportedAt: date.toISOString(), complete: true, sourcesChangedDuringRead: false,
    storedProfileRaw: target, storedBackupRaw: targetBackup,
    storageReadStatus: 'ready', journalReadStatus: 'ready', quarantineReadStatus: 'ready',
    profileQuarantineReadStatus: 'ready', durableReadStatus: 'ready',
    auxiliaryReadStatus: { avatarLook: 'ready', appearance: 'ready', manualSteps: 'ready', dailyPlan: 'ready' },
    storedAuxiliaryRaw: aux, pendingResultOriginals: [], quarantinedResults: [],
    storedProfileQuarantineRaw: [], durableResults: [], ...override });
}
function memory() {
  const values = new Map<string, string>([[STORAGE_KEY, primary], [PROFILE_BACKUP_KEY, backup], ['unrelated', 'keep']]);
  let source = { auxiliary: { ...aux }, sourcesReady: true, pendingRecords: 0, durableRecords: 0, quarantineRecords: 0 };
  const calls: [string, string | null][] = [];
  let fail: (key: string, value: string | null, n: number) => 'before' | 'after' | 'noop' | undefined = () => undefined;
  const port: ReplacementPort = {
    observe: () => ({ ...source, epoch: values.get(EPOCH) ?? null, pair: { primary: values.get(STORAGE_KEY) ?? null, backup: values.get(PROFILE_BACKUP_KEY) ?? null } }),
    getMarker: () => values.get(MARKER) ?? null,
    set: (key, value) => {
      calls.push([key, value]);
      const mode = fail(key, value, calls.length);
      if (mode === 'before') throw Error('injected-before');
      if (mode === 'noop') return;
      if (value === null) values.delete(key); else values.set(key, value);
      if (mode === 'after') throw Error('injected-after');
    },
  };
  return { port, values, calls, setFail: (fn: typeof fail) => { fail = fn; },
    setSource: (change: Partial<Omit<ReplacementObservation,'pair'>>) => { source = { ...source, ...change } as typeof source; } };
}
function plan(m: ReturnType<typeof memory>, json = envelope()): ReplacementPlan {
  const result = planProfileReplacement(json, m.port.observe());
  if (result.status !== 'planned') throw Error(result.reason);
  return result.plan;
}
function original(m: ReturnType<typeof memory>) {
  expect(m.port.observe().pair).toEqual({ primary, backup });
  expect(m.port.getMarker()).toBeNull();
  expect(m.values.get('unrelated')).toBe('keep');
}

describe('BF-106 isolated replacement transaction', () => {
  const paidResult = resultJournalEntry({ schemaVersion: 1, profileId: 'qa', sessionId: 'tower-1',
    mode: 'tower', floor: 1, durationMs: 32000, finishedAt: date.toISOString(), repetitions: 20 })!;
  const row = { key: paidResult.key, raw: paidResult.raw, state: 'settled' as const, baseProfileRaw: primary };
  it.each(['keep', 'rollback'] as const)('preserves exact paid history across %s and checks it again on recovery', async choice => {
    const m = memory();
    m.values.set(STORAGE_KEY, JSON.stringify(incoming));
    const history = await snapshotSettledHistory([row]);
    expect(history).toBeDefined();
    m.setSource({ durableRecords: 1, settledHistory: history });
    const p = plan(m, envelope({ durableResults: [row] }));
    const changed = await snapshotSettledHistory([{ ...row, baseProfileRaw: primary + ' ' }]);
    m.setSource({ settledHistory: changed });
    expect(executeProfileReplacement(m.port,p,'replace').status).toBe('conflict');
    expect(m.calls).toHaveLength(0);
    m.setSource({ settledHistory: history });
    expect(executeProfileReplacement(m.port,p,'replace').status).toBe('applied-pending-finalization');
    const marker = m.port.getMarker()!;
    m.setSource({ settledHistory: changed });
    expect(inspectProfileReplacement(m.port)).toBe('conflict');
    expect(finalizeProfileReplacement(m.port,marker,'keep').status).not.toBe('finalized');
    expect(rollbackProfileReplacement(m.port,marker,'rollback').status).not.toBe('rolled-back');
    expect(m.port.getMarker()).toBe(marker);
    m.setSource({ settledHistory: history });
    const outcome = choice === 'keep' ? finalizeProfileReplacement(m.port,marker,'keep') : rollbackProfileReplacement(m.port,marker,'rollback');
    expect(outcome.status).toBe(choice === 'keep' ? 'finalized' : 'rolled-back');
    expect(m.port.observe().pair.primary).toBe(choice === 'keep' ? target : JSON.stringify(incoming));
  });
  it('checks available workout facts even when the payment ID matches', async () => {
    const m = memory(), history = await snapshotSettledHistory([row]);
    m.setSource({ durableRecords: 1, settledHistory: history });
    m.values.set(STORAGE_KEY, JSON.stringify(incoming));
    const different = { ...incoming, workouts: incoming.workouts.map(w => ({ ...w, durationMs: w.durationMs + 1000 })) };
    expect(planProfileReplacement(envelope({ durableResults: [row], storedProfileRaw: JSON.stringify(different) }),
      m.port.observe()).status).toBe('blocked');
  });
  it('accepts older paid IDs retained beyond the visible history without reconstructing a workout', async () => {
    const m = memory(), history = await snapshotSettledHistory([row]);
    const archived = JSON.stringify({ ...incoming, workouts: [] });
    m.setSource({ durableRecords: 1, settledHistory: history });
    m.values.set(STORAGE_KEY, archived);
    expect(planProfileReplacement(envelope({ durableResults: [row], storedProfileRaw: archived+' ' }),m.port.observe()).status).toBe('planned');
  });
  it('compares multiple rows independently of array order', async () => {
    const other = resultJournalEntry({ ...paidResult.result, sessionId: 'older-id' })!;
    const second = { ...row, key: other.key, raw: other.raw };
    const history = await snapshotSettledHistory([row,second]);
    expect(history?.digest).toMatch(/^[a-f0-9]{64}$/);
    expect((await snapshotSettledHistory([second,row]))?.digest).toBe(history?.digest);
    const m = memory(), both = JSON.stringify({ ...incoming, creditedWorkoutIds: ['older-id','tower-1'] });
    m.setSource({ durableRecords: 2, settledHistory: history });
    m.values.set(STORAGE_KEY, both);
    expect(planProfileReplacement(envelope({ durableResults: [second,row], storedProfileRaw: both+' ' }),m.port.observe()).status).toBe('planned');
  });
  it('blocks missing reward evidence, changed source bytes, duplicate keys and nonterminal states', async () => {
    const m = memory(), history = await snapshotSettledHistory([row]);
    m.setSource({ durableRecords: 1, settledHistory: history });
    expect(planProfileReplacement(envelope({durableResults:[row]}), m.port.observe()).status).toBe('blocked');
    m.values.set(STORAGE_KEY, JSON.stringify(incoming));
    for (const rows of [[],[row,row],[{...row, raw:row.raw+' '}],[{...row,baseProfileRaw:null}],
      [{...row,state:'active'}],[{...row,state:'quarantined'}],[{...row,extra:true}]]) {
      expect(planProfileReplacement(envelope({durableResults:rows}), m.port.observe()).status).toBe('blocked');
    }
    for (const rows of [[row,row],[{...row,state:'active' as const}],[{...row,state:'quarantined' as const}],
      [{...row,key:row.key+'x'}],[{...row,raw:'{'}]]) expect(await snapshotSettledHistory(rows)).toBeUndefined();
    expect(m.calls).toHaveLength(0);
  });
  it('accepts a fully applied pair after reload, verifying epoch before deleting the marker', () => {
    const m = memory();
    executeProfileReplacement(m.port, plan(m), 'replace');
    const marker = m.port.getMarker()!;
    m.calls.length = 0;
    expect(finalizeProfileReplacement(m.port, marker, 'cancel')).toEqual({ status: 'cancelled' });
    expect(finalizeProfileReplacement(m.port, marker + ' ', 'keep').status).toBe('conflict');
    expect(m.calls).toHaveLength(0);
    expect(finalizeProfileReplacement(m.port, marker, 'keep')).toEqual({ status: 'finalized' });
    expect(m.port.observe().pair).toEqual({ primary: target, backup: targetBackup });
    expect(finalizeProfileReplacement(m.port, marker, 'keep').status).toBe('conflict');
    expect(m.values.get(EPOCH)).toBe(JSON.parse(marker).transactionId);
    expect(m.calls).toEqual([[EPOCH, JSON.parse(marker).transactionId], [MARKER, null]]);
  });
  it.each(['prefix', 'ledger', 'journal', 'bad-json', 'foreign', 'duplicate', 'fallback'] as const)(
    'retains rollback evidence on an unsafe %s', scenario => {
      const m = memory();
      executeProfileReplacement(m.port, plan(m), 'replace');
      const marker = JSON.parse(m.port.getMarker()!);
      if (scenario === 'prefix') m.values.set(STORAGE_KEY, primary);
      if (scenario === 'journal') m.setSource({ durableRecords: 1 });
      if (scenario === 'ledger') marker.before.primary = JSON.stringify({ ...initial, creditedWorkoutIds: ['older'] });
      if (scenario === 'bad-json') marker.after.primary = '{}';
      if (scenario === 'foreign') marker.after.primary = JSON.stringify({ ...incoming, profileId: 'other' });
      if (scenario === 'duplicate') marker.after.primary = target.replace('{', '{"xp":0,');
      if (scenario === 'fallback') marker.after.backup = null;
      if (scenario !== 'prefix') m.values.set(STORAGE_KEY, marker.after.primary);
      if (marker.after.backup === null) m.values.delete(PROFILE_BACKUP_KEY);
      const exact = JSON.stringify(marker);
      m.values.set(MARKER, exact);
      m.calls.length = 0;
      expect(finalizeProfileReplacement(m.port, exact, 'keep').status).not.toBe('finalized');
      expect(m.calls).toHaveLength(0);
      expect(m.port.getMarker()).toBe(exact);
    });
  it.each(['before','noop','after'] as const)('verifies marker removal when storage reports %s', failure => {
    const m = memory();
    executeProfileReplacement(m.port, plan(m), 'replace');
    const marker = m.port.getMarker()!;
    m.setFail(() => failure);
    expect(finalizeProfileReplacement(m.port, marker, 'keep').status)
      .toBe(failure === 'after' ? 'finalized' : 'recovery-required');
    expect(m.port.observe().pair).toEqual({ primary: target, backup: targetBackup });
  });
  it('resumes interrupted epoch commit or restores the exact old epoch on rollback', () => {
    const oldEpoch = '11111111-1111-4111-8111-111111111111';
    for (const decision of ['keep','rollback'] as const) {
      const m=memory();m.values.set(EPOCH,oldEpoch);
      executeProfileReplacement(m.port,plan(m),'replace');
      const marker=m.port.getMarker()!;
      m.setFail((key)=>key===MARKER?'before':undefined);
      expect(finalizeProfileReplacement(m.port,marker,'keep').status).toBe('recovery-required');
      expect(m.port.getMarker()).toBe(marker);
      expect(m.values.get(EPOCH)).toBe(JSON.parse(marker).transactionId);
      expect(inspectProfileReplacement(m.port)).toBe('applied');
      m.setFail(()=>undefined);
      if(decision==='keep'){
        expect(finalizeProfileReplacement(m.port,marker,'keep').status).toBe('finalized');
        expect(m.values.get(EPOCH)).toBe(JSON.parse(marker).transactionId);
      }else{
        expect(rollbackProfileReplacement(m.port,marker,'rollback').status).toBe('rolled-back');
        original(m);expect(m.values.get(EPOCH)).toBe(oldEpoch);
      }
    }
  });
  it('never clears marker before confirmed epoch; stale or corrupt epoch blocks writes', () => {
    for (const bad of ['22222222-2222-4222-8222-222222222222','broken']) {
      const m=memory();executeProfileReplacement(m.port,plan(m),'replace');
      const marker=m.port.getMarker()!;m.values.set(EPOCH,bad);m.calls.length=0;
      expect(finalizeProfileReplacement(m.port,marker,'keep').status).not.toBe('finalized');
      expect(rollbackProfileReplacement(m.port,marker,'rollback').status).not.toBe('rolled-back');
      expect(m.calls).toHaveLength(0);expect(m.port.getMarker()).toBe(marker);
    }
  });
  it('old v1 marker remains rollback-only; no new lineage is inferred', () => {
    const m=memory();executeProfileReplacement(m.port,plan(m),'replace');
    const marker=JSON.parse(m.port.getMarker()!);
    marker.version=1;delete marker.beforeEpoch;
    const raw=JSON.stringify(marker);m.values.set(MARKER,raw);m.calls.length=0;
    expect(inspectProfileReplacement(m.port)).toBe('staged');
    expect(finalizeProfileReplacement(m.port,raw,'keep').status).toBe('blocked');
    expect(m.calls).toHaveLength(0);
    expect(rollbackProfileReplacement(m.port,raw,'rollback').status).toBe('rolled-back');original(m);
  });
  it.each([
    { ...initial, creditedWorkoutIds: ['old-paid-id'] },
    { ...initial, game: { ...initial.game, highestClearedFloor: 4 } },
    { ...initial, game: { ...initial.game, lastLoginDay: '2026-11-24' } },
    { ...initial, game: { ...initial.game, claimedQuestDays: ['2026-11-24'] } },
  ])('refuses to discard previously credited rewards during planning', previous => {
    const m = memory();
    m.values.set(STORAGE_KEY, JSON.stringify(previous));
    expect(planProfileReplacement(envelope(), m.port.observe()).status).toBe('blocked');
    expect(m.calls).toHaveLength(0);
  });
  it('plans without writes and cancellation makes zero storage calls', () => {
    const m = memory(), p = plan(m);
    expect(m.calls).toHaveLength(0);
    expect(executeProfileReplacement(m.port,p,'cancel')).toEqual({ status: 'cancelled' });
    expect(m.calls).toHaveLength(0);
    original(m);
  });
  it('rejects invalid, incomplete, duplicate-key and unsupported backup without writes', () => {
    const m = memory();
    for (const json of ['{', envelope({ complete:false }), envelope({ storedProfileRaw:'{}' }),
      envelope().replace('"complete":true','"complete":false,"complete":true'),
      envelope({ storedProfileRaw:JSON.stringify({ ...incoming, profileId:'different' }) }),
      envelope({ storedBackupRaw:JSON.stringify({ ...initial, profileId:'different' }) }),
      envelope({ storedAuxiliaryRaw:{...aux, appearance:'different'} }),
      envelope({ pendingResult: {} }),
      envelope({ pendingResults: 'invalid' }),
      envelope({ durableResults:[{key:STORAGE_KEY+':result:x',raw:'{}',baseProfileRaw:null,state:'settled'}] })]) {
      expect(planProfileReplacement(json,m.port.observe()).status).toBe('blocked');
    }
    expect(m.calls).toHaveLength(0);
    original(m);
  });
  it('rejects unknown current source, journal or quarantine even when it is only settled history', () => {
    for (const change of [{sourcesReady:false},{pendingRecords:1},{durableRecords:1},{quarantineRecords:1}]) {
      const m=memory();m.setSource(change);
      expect(planProfileReplacement(envelope(),m.port.observe()).status).toBe('blocked');
      expect(m.calls).toHaveLength(0);
    }
  });
  it('blocks stale primary, fallback or auxiliary observations and cloned plans', () => {
    for (const which of [STORAGE_KEY, PROFILE_BACKUP_KEY, 'aux']) {
      const m=memory(),p=plan(m);
      if(which==='aux') m.setSource({auxiliary:{...aux,appearance:'changed'}});
      else m.values.set(which,'newer');
      expect(executeProfileReplacement(m.port,p,'replace').status).toBe('conflict');
      expect(m.calls).toHaveLength(0);
    }
    const m=memory(),p=plan(m);
    expect(executeProfileReplacement(m.port,{...p},'replace').status).toBe('blocked');
    expect(m.calls).toHaveLength(0);
  });
  it('writes marker, exact incoming backup and primary, retains old raw and supports explicit rollback', () => {
    const m=memory(),p=plan(m);
    expect(executeProfileReplacement(m.port,p,'replace')).toEqual({status:'applied-pending-finalization'});
    expect(m.calls.map(c=>c[0])).toEqual([MARKER,PROFILE_BACKUP_KEY,STORAGE_KEY]);
    expect(m.port.observe().pair).toEqual({primary:target,backup:targetBackup});
    const marker=m.port.getMarker()!;
    expect(JSON.parse(marker).before).toEqual({primary,backup});
    expect(inspectProfileReplacement(m.port)).toBe('applied');
    const count=m.calls.length;
    expect(executeProfileReplacement(m.port,p,'replace').status).toBe('recovery-required');
    expect(rollbackProfileReplacement(m.port,marker,'cancel').status).toBe('cancelled');
    expect(m.calls).toHaveLength(count);
    expect(rollbackProfileReplacement(m.port,marker,'rollback').status).toBe('rolled-back');
    original(m);
  });
  it.each([1,2,3].flatMap(n=>['before','after','noop'].map(mode=>[n,mode] as const)))
  ('fault on write %i (%s) preserves original exact pair or reports stage unavailable', (n,mode) => {
    const m=memory(),p=plan(m);
    m.setFail((_key,_value,i)=>i===n?mode as 'before'|'after'|'noop':undefined);
    const result=executeProfileReplacement(m.port,p,'replace');
    expect(result.status).toBe(n===1&&mode!=='after'?'unavailable':'rolled-back');
    original(m);
  });
  it('recognizes each interruption prefix and supports restart rollback without an in-memory plan', () => {
    const complete=memory(),p=plan(complete);
    executeProfileReplacement(complete.port,p,'replace');
    const marker=complete.port.getMarker()!;
    for (const prefix of [1,2,3]) {
      const m=memory();
      for(const [key,value] of complete.calls.slice(0,prefix)) if(value!==null)m.values.set(key,value);
      expect(inspectProfileReplacement(m.port)).toBe(prefix===3?'applied':'staged');
      expect(rollbackProfileReplacement(m.port,marker,'rollback').status).toBe('rolled-back');
      original(m);
    }
  });
  it('retains marker on rollback failure and can retry reverse prefix without touching unrelated keys', () => {
    for (const n of [4,5,6]) {
      const m=memory(),p=plan(m);
      executeProfileReplacement(m.port,p,'replace');
      const marker=m.port.getMarker()!;
      m.setFail((_k,_v,i)=>i===n?'before':undefined);
      expect(rollbackProfileReplacement(m.port,marker,'rollback').status).toBe('recovery-required');
      expect(m.port.getMarker()).toBe(marker);
      m.setFail(()=>undefined);
      expect(rollbackProfileReplacement(m.port,marker,'rollback').status).toBe('rolled-back');
      original(m);
    }
  });
  it('never rolls back through a newer revision or changed journal and never accepts malformed marker', () => {
    for (const kind of ['primary','backup','journal','marker']) {
      const m=memory(),p=plan(m);
      executeProfileReplacement(m.port,p,'replace');
      if(kind==='primary')m.values.set(STORAGE_KEY,'newer');
      if(kind==='backup')m.values.set(PROFILE_BACKUP_KEY,'newer');
      if(kind==='journal')m.setSource({durableRecords:1});
      if(kind==='marker')m.values.set(MARKER,'{"version":1,"version":1}');
      const marker=m.port.getMarker()!,count=m.calls.length;
      expect(inspectProfileReplacement(m.port)).toBe('conflict');
      expect(rollbackProfileReplacement(m.port,marker,'rollback').status).toBe('recovery-required');
      expect(m.calls).toHaveLength(count);
    }
  });
  it('distinguishes two transactions with identical before/after bytes (ABA)', () => {
    const m=memory(), first=plan(m);
    expect(executeProfileReplacement(m.port,first,'replace').status).toBe('applied-pending-finalization');
    const old=m.port.getMarker()!;
    expect(rollbackProfileReplacement(m.port,old,'rollback').status).toBe('rolled-back');
    const second=plan(m);
    expect(second.transactionId).not.toBe(first.transactionId);
    expect(executeProfileReplacement(m.port,second,'replace').status).toBe('applied-pending-finalization');
    const count=m.calls.length;
    expect(rollbackProfileReplacement(m.port,old,'rollback').status).toBe('conflict');
    expect(m.calls).toHaveLength(count);
    expect(rollbackProfileReplacement(m.port,m.port.getMarker()!,'rollback').status).toBe('rolled-back');
    original(m);
  });
  it('verifies rollback even if final marker removal throws after its effect', () => {
    const m=memory(),p=plan(m);
    executeProfileReplacement(m.port,p,'replace');
    m.setFail((key,value)=>key===MARKER&&value===null?'after':undefined);
    expect(rollbackProfileReplacement(m.port,m.port.getMarker()!,'rollback').status).toBe('rolled-back');
    original(m);
  });
  it('blocks stale recovery confirmation and duplicate execution; supports exact no-op', () => {
    const m=memory(),p=plan(m);
    executeProfileReplacement(m.port,p,'replace');
    const count=m.calls.length;
    expect(rollbackProfileReplacement(m.port,'old-marker','rollback').status).toBe('conflict');
    expect(m.calls).toHaveLength(count);
    const n=memory(),same=plan(n,envelope({storedProfileRaw:primary,storedBackupRaw:backup}));
    expect(executeProfileReplacement(n.port,same,'replace').status).toBe('unchanged');
    expect(n.calls).toHaveLength(0);
  });
});
