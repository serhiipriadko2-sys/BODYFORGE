from pathlib import Path
from hashlib import sha256
p=Path('src/lib/profileReplacement.test.ts')
a=Path('docs/audits/BF_107_HISTORY_RETENTION_20261125')
old=p.read_bytes()
assert sha256(old).hexdigest()=='2481f749f9e8a2a3197bb512b3b2f365b5ec33de1dbe073f024fb9cb288b9f61'
s=old.decode('utf-8').replace('\r\n','\n')
anchor="  it('accepts a fully applied pair after reload, verifying epoch before deleting the marker', () => {"
assert s.count(anchor)==1
s=s.replace(anchor,"""  it('retains uncapped saved originals during compatible file replacement and blocks truncation or altered facts', () => {
    let profile=initial;
    const history=[];
    for(let i=0;i<65;i++){
      profile=addCompletedWorkout(profile,32000,date,{sessionId:'archive-'+i});
      history.unshift(profile.workouts[0]);
    }
    const full=JSON.stringify({...profile,workouts:history});
    const m=memory();m.values.set(STORAGE_KEY,full);
    for(const candidate of [JSON.stringify(profile),JSON.stringify({...profile,workouts:history.map((w,i)=>i===64?{...w,durationMs:w.durationMs+1}:w)})]){
      expect(planProfileReplacement(envelope({storedProfileRaw:candidate}),m.port.observe()).status).toBe('blocked');
    }
    const incomingFull=JSON.stringify({...profile,workouts:history,coins:profile.coins+10});
    const p=plan(m,envelope({storedProfileRaw:incomingFull}));
    expect(executeProfileReplacement(m.port,p,'replace').status).toBe('applied-pending-finalization');
    expect(finalizeProfileReplacement(m.port,m.port.getMarker()!,'keep').status).toBe('finalized');
    expect(JSON.parse(m.values.get(STORAGE_KEY)!).workouts).toEqual(history);
  });
  it('blocks a changed settled fact outside the last 60 even on a fresh import', async () => {
    let profile=initial;
    const history=[];
    for(let i=0;i<65;i++){
      profile=addCompletedWorkout(profile,32000,date,{sessionId:'archive-'+i});
      history.unshift(profile.workouts[0]);
    }
    const old=resultJournalEntry({schemaVersion:1,profileId:'qa',sessionId:'archive-0',
      mode:'training',floor:null,durationMs:32000,finishedAt:date.toISOString(),repetitions:20})!;
    const durable={key:old.key,raw:old.raw,baseProfileRaw:null,state:'settled' as const};
    const settled=await snapshotSettledHistory([durable]);
    const m=memory();
    m.values.set(STORAGE_KEY,JSON.stringify(profile));
    m.setSource({durableRecords:1,settledHistory:settled});
    const conflicting=JSON.stringify({...profile,workouts:history.map((w,i)=>i===64?{...w,durationMs:w.durationMs+1}:w)});
    expect(planProfileReplacement(envelope({storedProfileRaw:conflicting,durableResults:[durable]}),m.port.observe()).status).toBe('blocked');
  });
"""+anchor)
with (a/'profileReplacement.test.ts.before').open('xb') as f:f.write(old)
assert p.read_bytes()==old
p.write_bytes(s.encode())
print('replacement tests',p.stat().st_size,sha256(p.read_bytes()).hexdigest())
