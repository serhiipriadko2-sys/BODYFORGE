import { describe, expect, it } from 'vitest';
import { freshGame } from './game';
import { addCompletedWorkout, parseProfile, type Profile } from './progression';
import { resultJournalEntry } from './workoutJournal';
import { indexActivityHistory } from './activityHistory';
import { comparePulsePeriods } from './progressPulse';
import type { DurableJournalEntry } from './durableJournal';

const now = new Date(2026, 10, 25, 12);
const old = new Date(2026, 10, 22, 12);
const previous = new Date(2026, 10, 17, 12);
function row(id: string, date = old, state: DurableJournalEntry['state'] = 'settled', profileId = 'fighter') {
  const entry = resultJournalEntry({ schemaVersion:1, profileId, sessionId:id, mode:'training',
    floor:null, durationMs:32000, finishedAt:date.toISOString(), repetitions:20 })!;
  return { key:entry.key, raw:entry.raw, baseProfileRaw:null, state };
}
function fixture() {
  let profile: Profile = { profileId:'fighter', xp:0, coins:0, creditedWorkoutIds:[], workouts:[],
    game:{...freshGame(),created:true} };
  const archived: DurableJournalEntry[] = [];
  for (let i=0;i<65;i++) {
    const date=i===0?previous:i<5?old:now;
    profile=addCompletedWorkout(profile,32000,date,{sessionId:'id-'+i,mode:'training'});
    archived.push(row('id-'+i,date));
  }
  return { profile, archived, raw:JSON.stringify(profile) };
}
const index = (f: ReturnType<typeof fixture>, entries = f.archived) =>
  indexActivityHistory(f.raw,parseProfile(JSON.parse(f.raw)),{status:'ready',entries});
describe('BF-107 full activity projection',()=>{
  it('restores older paid dates without estimating dates or rewards',()=>{
    const f=fixture(), before=JSON.stringify(f);
    const view=index(f);
    expect(view).toMatchObject({complete:true,expectedCount:65,restoredCount:5});
    expect(view.records).toHaveLength(65);
    expect(new Set(view.records.map(r=>r.id)).size).toBe(65);
    expect(comparePulsePeriods(view.records,now,7,view.expectedCount,view.complete?'complete':'partial'))
      .toMatchObject({historyLimited:false,current:{sessions:64,reps:1280,activeDays:2},previous:{sessions:1},deltaSessions:63});
    expect(comparePulsePeriods(view.records,now,30,view.expectedCount,'complete').current.sessions).toBe(65);
    expect(JSON.stringify(f)).toBe(before);
    expect(view.records.every(r=>!('xp' in r)&&!('coins' in r))).toBe(true);
  });
  it('projects the same complete history from receipt-only records without checkpoints',()=>{
    const f=fixture();
    const entries=f.archived.map(({key,raw,state})=>({key,raw,state}));
    expect(indexActivityHistory(f.raw,parseProfile(JSON.parse(f.raw)),{status:'ready',entries}))
      .toEqual(index(f));
    expect(entries.every(r=>!('baseProfileRaw' in r))).toBe(true);
  });
  it('does not fabricate a missing paid date or count active, foreign, unpaid or quarantined rows',()=>{
    const f=fixture(), rows=f.archived.slice(5);
    rows.push(row('id-0',previous,'active'),row('id-1',old,'quarantined'),
      row('id-2',old,'settled','other'),row('unpaid'),row('id-3'));
    const result=index(f,rows);
    expect(result).toMatchObject({complete:false,expectedCount:65,restoredCount:1});
    expect(result.records).toHaveLength(61);
    expect(result.records.some(r=>r.id==='unpaid'||r.id==='id-0'||r.id==='id-2')).toBe(false);
  });
  it('does not count conflicting facts or invalid raw rows as complete coverage',()=>{
    const f=fixture();
    const result=index(f,[...f.archived,row('id-64',old),{...row('id-0',previous),key:'wrong'}]);
    expect(result.complete).toBe(false);
    expect(result.records.some(r=>r.id==='id-64')).toBe(false);
  });
  it('keeps missing explicit paid ledger and unavailable IndexedDB conservative',()=>{
    const f=fixture(), missing={...f.profile,creditedWorkoutIds:undefined};
    expect(indexActivityHistory(JSON.stringify(missing),missing,{status:'ready',entries:f.archived}))
      .toMatchObject({complete:false,restoredCount:0});
    expect(indexActivityHistory(f.raw,parseProfile(JSON.parse(f.raw)),{status:'unavailable',entries:f.archived}))
      .toMatchObject({complete:false,restoredCount:0});
  });
  it('uses uncapped legacy raw rows without trimming the original source',()=>{
    const f=fixture();
    const original=f.archived.map(row=>{
      const r=JSON.parse(row.raw);
      return {id:r.sessionId,finishedAt:r.finishedAt,durationMs:r.durationMs,repetitions:20,xp:120,mode:'training'};
    });
    const raw=JSON.stringify({...f.profile,workouts:original});
    const view=indexActivityHistory(raw,parseProfile(JSON.parse(raw)),{status:'ready',entries:[]});
    expect(view).toMatchObject({complete:true,restoredCount:5,expectedCount:65});
    expect(JSON.parse(raw).workouts).toHaveLength(65);
  });
  it('does not treat a capped list as complete without lifetime totals',()=>{
    const f=fixture(),p={...f.profile,totals:undefined,creditedWorkoutIds:f.profile.workouts.map(r=>r.id)};
    expect(indexActivityHistory(JSON.stringify(p),p,{status:'ready',entries:[]}).complete).toBe(false);
  });
  it('counts archived plank seconds independently',()=>{
    let p: Profile={profileId:'fighter',xp:0,coins:0,creditedWorkoutIds:[],workouts:[],game:freshGame()};
    p=addCompletedWorkout(p,31000,old,{sessionId:'plank-old',exerciseId:'plank',holdSeconds:30});
    for(let i=0;i<60;i++)p=addCompletedWorkout(p,32000,now,{sessionId:'r-'+i});
    const entry=resultJournalEntry({schemaVersion:1,profileId:'fighter',sessionId:'plank-old',
      mode:'training',floor:null,exerciseId:'plank',durationMs:31000,finishedAt:old.toISOString(),repetitions:0,holdSeconds:30})!;
    const raw=JSON.stringify(p);
    const view=indexActivityHistory(raw,parseProfile(JSON.parse(raw)),{status:'ready',entries:[{key:entry.key,raw:entry.raw,state:'settled'}]});
    expect(view.complete).toBe(true);
    expect(comparePulsePeriods(view.records,now,7,61,'complete').current).toMatchObject({sessions:61,reps:1200,holdSeconds:30});
  });
});
