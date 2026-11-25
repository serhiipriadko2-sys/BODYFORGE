import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshGame } from './game';
import { PROFILE_EPOCH_KEY as EPOCH } from './profileEpoch';
import { addCompletedWorkout, parseProfile, STORAGE_KEY, PROFILE_BACKUP_KEY, PROFILE_REPLACEMENT_MARKER_KEY as MARKER } from './progression';
import { executeProfileReplacement, planProfileReplacement, type ReplacementPort } from './profileReplacement';
import { readReplacementRecovery, restoreInterruptedReplacement } from './profileReplacementRecovery';
import { readDurableJournal } from './durableJournal';
import { PROFILE_WRITE_LOCK } from './profileLock';

vi.mock('./durableJournal', () => ({ readDurableJournal: vi.fn() }));
const durable = vi.mocked(readDurableJournal);
const date = new Date('2026-11-25T12:00:00Z');
const initial = parseProfile({ profileId:'qa', xp:400, coins:200, workouts:[], creditedWorkoutIds:[],
  game: {...freshGame(), created:true} });
const target = addCompletedWorkout(initial,32000,date,{sessionId:'one',mode:'tower'});
const primary = JSON.stringify(initial,null,2), backup = JSON.stringify(initial)+'\n';
const aux = {avatarLook:null,appearance:null,manualSteps:null,dailyPlan:null};
let values: Map<string,string>;
const held = new Set<string>();
const write = vi.fn((key:string,value:string|null) => {
  if (!held.has(PROFILE_WRITE_LOCK)) throw Error('write outside lock');
  if (value===null) values.delete(key); else values.set(key,value);
});
const request = vi.fn(async (_name:string,_options:unknown, callback:()=>unknown) => {
  if(held.has(_name)) throw Error('recursive same-name lock');
  held.add(_name); try { return await callback(); } finally { held.delete(_name); }
});
function stage() {
  const json = JSON.stringify({exportFormat:'bodyforge-manual-backup',exportSchemaVersion:1,
    exportedAt:date.toISOString(),complete:true,sourcesChangedDuringRead:false,
    storedProfileRaw:JSON.stringify(target,null,2),storedBackupRaw:JSON.stringify(initial,null,4),
    storageReadStatus:'ready',journalReadStatus:'ready',quarantineReadStatus:'ready',profileQuarantineReadStatus:'ready',durableReadStatus:'ready',
    auxiliaryReadStatus:{avatarLook:'ready',appearance:'ready',manualSteps:'ready',dailyPlan:'ready'},storedAuxiliaryRaw:aux,
    pendingResultOriginals:[],quarantinedResults:[],storedProfileQuarantineRaw:[],durableResults:[]});
  const port:ReplacementPort={
    observe:()=>({epoch:values.get(EPOCH)??null,pair:{primary:values.get(STORAGE_KEY)??null,backup:values.get(PROFILE_BACKUP_KEY)??null},
      auxiliary:aux,sourcesReady:true,pendingRecords:0,durableRecords:0,quarantineRecords:0}),
    getMarker:()=>values.get(MARKER)??null,
    set:(key,value)=>{if(value===null)values.delete(key);else values.set(key,value)},
  };
  const result=planProfileReplacement(json,port.observe());
  if(result.status!=='planned')throw Error(result.reason);
  expect(executeProfileReplacement(port,result.plan,'replace').status).toBe('applied-pending-finalization');
  return port.getMarker()!;
}
beforeEach(()=>{
  values=new Map([[STORAGE_KEY,primary],[PROFILE_BACKUP_KEY,backup],['unrelated','keep']]);
  held.clear();write.mockClear();request.mockClear();durable.mockReset();
  durable.mockImplementation(async()=>{if(!held.has(PROFILE_WRITE_LOCK))throw Error('read outside lock');return {status:'ready',entries:[]}});
  vi.stubGlobal('navigator',{locks:{request}});
  vi.stubGlobal('localStorage',{
    getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>write(key,value),removeItem:(key:string)=>write(key,null),
    get length(){return values.size},key:(i:number)=>[...values.keys()][i]??null,
  });
});
afterEach(()=>vi.unstubAllGlobals());

describe('BF-106 locked recovery adapter',()=>{
  it('holds exclusive journal barrier from the durable snapshot through rollback read-back',async()=>{
    const marker=stage();
    durable.mockImplementation(async()=>{
      if (!held.has('bodyforge:pilot:v1:durable-write')) throw Error('unprotected durable snapshot');
      return {status:'ready',entries:[]};
    });
    expect(await readReplacementRecovery()).toEqual({state:'applied',marker});
    write.mockImplementation((key,value)=>{
      if (!held.has(PROFILE_WRITE_LOCK) || !held.has('bodyforge:pilot:v1:durable-write')) throw Error('unprotected rollback');
      if(value===null)values.delete(key);else values.set(key,value);
    });
    expect(await restoreInterruptedReplacement(marker,'rollback')).toEqual({status:'rolled-back'});
    expect(values.get(STORAGE_KEY)).toBe(primary);
    expect(values.get(PROFILE_BACKUP_KEY)).toBe(backup);
    expect(values.has(MARKER)).toBe(false);
    expect(request.mock.calls.map(c=>[c[0],(c[1] as LockOptions).mode])).toEqual([
      [PROFILE_WRITE_LOCK,'exclusive'],['bodyforge:pilot:v1:durable-write','exclusive'],
      [PROFILE_WRITE_LOCK,'exclusive'],['bodyforge:pilot:v1:durable-write','exclusive'],
    ]);
  });

  it('reads actual marker under shared production write lock without mutating keys',async()=>{
    const marker=stage(),before=[...values];
    expect(await readReplacementRecovery()).toEqual({state:'applied',marker});
    expect(request.mock.calls[0][0]).toBe(PROFILE_WRITE_LOCK);
    expect([...values]).toEqual(before);expect(write).not.toHaveBeenCalled();
  });
  it('cancel and already aborted signal use zero lock, durable or local mutation calls',async()=>{
    const marker=stage(),abort=new AbortController();abort.abort();
    expect(await restoreInterruptedReplacement(marker,'cancel')).toEqual({status:'cancelled'});
    expect(await restoreInterruptedReplacement(marker,'rollback',abort.signal)).toEqual({status:'cancelled'});
    expect(request).not.toHaveBeenCalled();expect(durable).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();
  });
  it('restores exact original pair after explicit matching confirmation',async()=>{
    const marker=stage();
    expect(await restoreInterruptedReplacement(marker,'rollback')).toEqual({status:'rolled-back'});
    expect(values.get(STORAGE_KEY)).toBe(primary);expect(values.get(PROFILE_BACKUP_KEY)).toBe(backup);
    expect(values.has(MARKER)).toBe(false);expect(values.get('unrelated')).toBe('keep');
    expect(write.mock.calls.map(c=>c[0])).toEqual([STORAGE_KEY,PROFILE_BACKUP_KEY,MARKER]);
  });
  it('keeps the new profile only after writing its epoch inside both exclusive locks',async()=>{
    const marker=stage();const tx=JSON.parse(marker).transactionId;
    expect(await restoreInterruptedReplacement(marker,'keep')).toEqual({status:'finalized'});
    expect(values.get(EPOCH)).toBe(tx);expect(values.has(MARKER)).toBe(false);
    expect(write.mock.calls.map(c=>c[0])).toEqual([EPOCH,MARKER]);
  });
  it('rejects a stale confirmation before touching durable storage',async()=>{
    stage();const before=[...values];
    expect(await restoreInterruptedReplacement('older-marker','rollback')).toMatchObject({status:'conflict'});
    expect(durable).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();expect([...values]).toEqual(before);
  });
  it.each(['active','settled','quarantined'] as const)('blocks durable %s rows without dropping them',async state=>{
    const marker=stage(),before=[...values];
    durable.mockResolvedValue({status:'ready',entries:[{key:STORAGE_KEY+':result:x',raw:'{}',state,baseProfileRaw:null}]});
    expect((await readReplacementRecovery()).state).toBe('conflict');
    expect((await restoreInterruptedReplacement(marker,'rollback')).status).toBe('recovery-required');
    expect(write).not.toHaveBeenCalled();expect([...values]).toEqual(before);
  });
  it('blocks unavailable durable storage and malformed marker; export evidence remains exact',async()=>{
    const marker=stage();durable.mockResolvedValue({status:'unavailable',entries:[]});
    expect(await readReplacementRecovery()).toEqual({state:'conflict',marker});
    expect((await restoreInterruptedReplacement(marker,'rollback')).status).toBe('recovery-required');
    values.set(MARKER,'{broken');
    expect(await readReplacementRecovery()).toEqual({state:'conflict',marker:'{broken'});
    expect(write).not.toHaveBeenCalled();
  });
  it('rechecks marker after async journal read and aborts without writing on cancellation',async()=>{
    const marker=stage(),abort=new AbortController();
    durable.mockImplementation(async()=>{abort.abort();return {status:'ready',entries:[]}});
    expect(await restoreInterruptedReplacement(marker,'rollback',abort.signal)).toEqual({status:'cancelled'});
    expect(write).not.toHaveBeenCalled();expect(values.get(MARKER)).toBe(marker);
  });
});
