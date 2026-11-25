import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshGame } from './game';
import { STORAGE_KEY, PROFILE_BACKUP_KEY, loadProfileState, saveProfile } from './progression';
import { prepareWorkoutSession, commitWorkoutResult, resultJournalEntry, readResultJournal,
  quarantineWorkoutResults, type CompletedWorkoutResult } from './workoutJournal';
import { replayDurableWorkouts, quarantineDurableWorkouts } from './durableWorkout';

const EPOCH_KEY = 'bodyforge:pilot:v1:epoch';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const result = (id = 'before-import'): CompletedWorkoutResult => ({ schemaVersion:1, profileId:'player',
  sessionId:id, mode:'training', floor:null, durationMs:32000, finishedAt:'2026-11-25T12:00:00Z', repetitions:20 });
const wallet = {profileId:'player',creditedWorkoutIds:[],xp:400,coins:200,workouts:[],game:{...freshGame(),created:true}};
const raw = JSON.stringify(wallet,null,2), backup = JSON.stringify(wallet)+'\n';
const db = vi.hoisted(() => ({read:vi.fn(),stage:vi.fn(),mark:vi.fn()}));
vi.mock('./durableJournal',()=>({readDurableJournal:db.read,stageDurableResults:db.stage,markDurableResults:db.mark}));
let values:Map<string,string>;
let rows:Map<string,{key:string;raw:string;baseProfileRaw:string|null;state:'active'|'settled'|'quarantined'}>;
const ctx=()=>({signal:new AbortController().signal,isCurrent:()=>true});
beforeEach(()=>{
  values=new Map([[STORAGE_KEY,raw],[PROFILE_BACKUP_KEY,backup]]); rows=new Map();
  vi.stubGlobal('window',{});
  vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k),
    key:(i:number)=>[...values.keys()][i]??null,get length(){return values.size}});
  db.read.mockReset().mockImplementation(async()=>({status:'ready',entries:[...rows.values()]}));
  db.stage.mockReset().mockImplementation(async(entries:{key:string;raw:string}[],baseProfileRaw:string|null)=>{
    for(const e of entries){if(rows.has(e.key)&&rows.get(e.key)!.raw!==e.raw)return {status:'invalid'};
      if(!rows.has(e.key))rows.set(e.key,{...e,baseProfileRaw,state:'active'});}
    return {status:'saved',entries:entries.map(e=>rows.get(e.key))};
  });
  db.mark.mockReset().mockImplementation(async(entries:{key:string;raw:string}[],state:'settled'|'quarantined')=>{
    for(const e of entries){const row=rows.get(e.key);if(!row||row.raw!==e.raw)return {status:'invalid'};rows.set(e.key,{...row,state});}
    return {status:'saved',entries:entries.map(e=>rows.get(e.key))};
  });
});
afterEach(()=>vi.unstubAllGlobals());
function unchanged(){expect(values.get(STORAGE_KEY)).toBe(raw);expect(values.get(PROFILE_BACKUP_KEY)).toBe(backup);}
function prepare(){const p=prepareWorkoutSession(values.get(STORAGE_KEY)!,'training');if(p.status!=='ready')throw Error(p.status);return p.session;}

describe('BF-106 late-workout epoch boundary',()=>{
  it('keeps legacy profile bytes and unprefixed preparation unchanged when epoch is absent',()=>{
    const session=prepare();expect(session.sessionId).not.toContain('epoch:');unchanged();expect(values.has(EPOCH_KEY)).toBe(false);
    expect(commitWorkoutResult({...result(),...session}).status).toBe('saved');
    expect(JSON.parse(values.get(STORAGE_KEY)!)).toMatchObject({xp:520,coins:235});
  });
  it('blocks an uncredited pre-import result and preserves its exact journal without rewarding',()=>{
    values.set(EPOCH_KEY,A);const pending=result();
    expect(commitWorkoutResult(pending).status).toBe('mismatch');unchanged();
    expect(readResultJournal().entries).toMatchObject([{result:pending}]);
  });
  it('binds fresh session ID to current epoch without writing either profile',()=>{
    values.set(EPOCH_KEY,A);const session=prepare();
    expect(session.sessionId).toMatch(/^epoch:11111111-1111-4111-8111-111111111111:.+$/);
    expect(session.sessionId.length).toBeLessThanOrEqual(128);unchanged();
  });
  it('preserves a result from an earlier epoch for explicit quarantine and export',()=>{
    values.set(EPOCH_KEY,A);const old={...result(),...prepare()};values.set(EPOCH_KEY,B);
    expect(commitWorkoutResult(old).status).toBe('mismatch');unchanged();
    const entries=readResultJournal().entries;expect(entries).toHaveLength(1);
    const exact=entries[0].raw;expect(quarantineWorkoutResults(entries).status).toBe('saved');unchanged();
    expect(readResultJournal().entries).toHaveLength(0);
    const held=[...values].find(([k])=>k.startsWith(STORAGE_KEY+':result-quarantine:'));
    expect(JSON.parse(held![1])).toMatchObject({sourceKey:entries[0].key,raw:exact});
  });
  it('pays a current-epoch completion once and keeps epoch stable through ordinary saves',()=>{
    values.set(EPOCH_KEY,A);const pending={...result(),...prepare()};
    expect(commitWorkoutResult(pending).status).toBe('saved');const paid=values.get(STORAGE_KEY)!;
    expect(JSON.parse(paid)).toMatchObject({xp:520,coins:235});expect(values.get(EPOCH_KEY)).toBe(A);
    expect(commitWorkoutResult(pending).status).toBe('saved');expect(values.get(STORAGE_KEY)).toBe(paid);
  });
  it.each(['', 'not-an-epoch', A+' ', A.toUpperCase()+'!'])('blocks unreadable epoch %j without repairing or replacing progress',epoch=>{
    values.set(EPOCH_KEY,epoch);const before=[...values];
    expect(loadProfileState().status).toBe('unavailable');
    expect(prepareWorkoutSession(raw,'training').status).toBe('unavailable');
    expect(saveProfile(wallet,{expectedRaw:raw}).status).toBe('unavailable');expect([...values]).toEqual(before);
  });
  it('deduplicates already credited legacy identities after epoch change without re-award',()=>{
    expect(commitWorkoutResult(result()).status).toBe('saved');const paid=values.get(STORAGE_KEY);
    values.set(EPOCH_KEY,A);expect(commitWorkoutResult(result()).status).toBe('saved');
    expect(values.get(STORAGE_KEY)).toBe(paid);expect(readResultJournal().entries).toHaveLength(0);
  });
  it('late durable stage remains active, exportable, unpaid, and explicitly quarantinable',async()=>{
    values.set(EPOCH_KEY,A);const entry=resultJournalEntry(result())!;
    rows.set(entry.key,{key:entry.key,raw:entry.raw,baseProfileRaw:raw,state:'active'});
    expect((await replayDurableWorkouts(null,ctx())).status).toBe('mismatch');unchanged();
    expect(rows.get(entry.key)?.state).toBe('active');expect(readResultJournal().entries[0].raw).toBe(entry.raw);
    expect((await quarantineDurableWorkouts(readResultJournal().entries,ctx())).status).toBe('saved');
    unchanged();expect(rows.get(entry.key)?.state).toBe('quarantined');expect(rows.get(entry.key)?.raw).toBe(entry.raw);
  });
  it('retained settled history from an earlier epoch cannot refill an imported wallet',async()=>{
    values.set(EPOCH_KEY,A);const entry=resultJournalEntry(result())!;
    rows.set(entry.key,{key:entry.key,raw:entry.raw,baseProfileRaw:raw,state:'settled'});
    expect((await replayDurableWorkouts(null,ctx())).status).toBe('saved');unchanged();
    expect(readResultJournal().entries).toHaveLength(0);expect(rows.get(entry.key)?.raw).toBe(entry.raw);
  });
});