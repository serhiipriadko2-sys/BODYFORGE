from pathlib import Path
from hashlib import sha256
a=Path('docs/audits/BF_107_HISTORY_RETENTION_20261125')
p=Path('src/lib/historyRetention.test.ts')
q=Path('qa/forge-home-xp-faq-e2e.mjs')
expected={p:'5d74919d33b5d461b62cfe7913fd0f3112356832812d92c1693205a2d71def60',q:'efdb1cf0cf9755fefe1348fcf0a598f5f4d96f4682f26b1886d4601bd31c6e7c'}
old={f:f.read_bytes() for f in expected}
for f,h in expected.items():assert sha256(old[f]).hexdigest()==h,f
s=old[p].decode('utf-8').replace('\r\n','\n')
anchor="  it('keeps exact prior history when primary write runs out of quota',()=>{"
assert s.count(anchor)==1
s=s.replace(anchor,"""  it('retains earlier stored originals even when a batch crosses from 59 to 61',()=>{
    const f=fixture(59),{values}=storage([[STORAGE_KEY,f.raw]]);
    const first=addCompletedWorkout(loadProfile(),33000,date,{sessionId:'paid-59'});
    const next=addCompletedWorkout(first,34000,date,{sessionId:'paid-60'});
    expect(saveProfile(next,{expectedRaw:f.raw}).status).toBe('saved');
    expect(JSON.parse(values.get(STORAGE_KEY)!).workouts).toEqual([next.workouts[0],first.workouts[0],...f.history]);
  });
  it('preserves an at-risk uncapped fallback without merging it into the current wallet',()=>{
    const f=fixture(65),raw=JSON.stringify(f.profile);
    const {values}=storage([[STORAGE_KEY,raw],[PROFILE_BACKUP_KEY,f.raw]]);
    const next={...loadProfile(),coins:9};
    expect(saveProfile(next,{expectedRaw:raw}).status).toBe('saved');
    expect(values.get(STORAGE_KEY+':quarantine:0')).toBe(f.raw);
    expect(loadProfile().coins).toBe(9);
    expect(JSON.parse(values.get(STORAGE_KEY)!).workouts).toHaveLength(60);
    expect(JSON.parse(values.get(PROFILE_BACKUP_KEY)!).workouts).toHaveLength(60);
  });
  it('fails closed before rotating an at-risk fallback when exact preservation fails',()=>{
    const f=fixture(65),raw=JSON.stringify(f.profile);
    const {values,setItem}=storage([[STORAGE_KEY,raw],[PROFILE_BACKUP_KEY,f.raw]]);
    setItem.mockImplementation((k,v)=>{if(k.startsWith(STORAGE_KEY+':quarantine:'))throw Error('quota');values.set(k,v);});
    expect(saveProfile({...loadProfile(),coins:9},{expectedRaw:raw}).status).toBe('unavailable');
    expect(values.get(STORAGE_KEY)).toBe(raw);
    expect(values.get(PROFILE_BACKUP_KEY)).toBe(f.raw);
    expect(setItem.mock.calls.every(([key])=>key.startsWith(STORAGE_KEY+':quarantine:'))).toBe(true);
  });
  it('keeps both unique originals when explicitly starting over after corruption',()=>{
    const f=fixture(65),{values}=storage([[STORAGE_KEY,'{broken'],[PROFILE_BACKUP_KEY,f.raw]]);
    expect(recoverProfile('empty').status).toBe('ready');
    expect(values.get(STORAGE_KEY+':quarantine:0')).toBe('{broken');
    expect(values.get(STORAGE_KEY+':quarantine:1')).toBe(f.raw);
    expect(loadProfile().workouts).toHaveLength(0);
    expect(saveProfile({...loadProfile(),coins:10}).status).toBe('saved');
    expect(values.get(STORAGE_KEY+':quarantine:1')).toBe(f.raw);
  });
"""+anchor)
t=old[q].decode('utf-8').replace('\r\n','\n')
anchor="  assert(browserErrors.length === 0, 'no uncaught exceptions while switching screens');"
assert t.count(anchor)==1
t=t.replace(anchor,r"""  // Uncapped v1 originals must survive the actual normal UI save, restart and fallback restore.
  const legacyFixture = await js("(async()=>{const key='bodyforge:pilot:v1';return navigator.locks.request(key+':write',()=>{const profile=JSON.parse(localStorage.getItem(key));const older="+JSON.stringify(fullFixture.rows.slice(0,5).map(r=>JSON.parse(r.raw)))+";profile.workouts.push(...older.map(r=>({id:r.sessionId,finishedAt:r.finishedAt,durationMs:r.durationMs,repetitions:r.repetitions,xp:120,mode:r.mode})));profile.game.lastLoginDay=null;profile.game.claimedLoginDays=[];const raw=JSON.stringify(profile);localStorage.setItem(key,raw);return {raw,rows:profile.workouts,coins:profile.coins,xp:profile.xp}})})()");
  assert(legacyFixture.rows.length===65,'uncapped v1 source retains all 65 original workout rows');
  await cdp('Page.reload',{ignoreCache:true});
  await until('!!document.querySelector(".app-shell[data-fighter-created=true] .mobile-nav") && !document.querySelector("[data-storage-status]")','uncapped profile loaded');
  await click('.mobile-nav button:nth-child(1)');
  await until('!!document.querySelector("#quests .quest-button:not([disabled])")','normal login reward available after fixture reload');
  const beforeLegacyWrite = await js('localStorage.getItem("bodyforge:pilot:v1")');
  assert(JSON.parse(beforeLegacyWrite).workouts.length===65,'app boot does not trim uncapped original');
  await click('#quests .quest-button');
  await until('JSON.parse(localStorage.getItem("bodyforge:pilot:v1")).coins==='+(legacyFixture.coins+10),'ordinary UI wallet save acknowledged');
  const afterLegacyWrite=await js('({primary:localStorage.getItem("bodyforge:pilot:v1"),backup:localStorage.getItem("bodyforge:pilot:v1:backup")})');
  assert(JSON.stringify(JSON.parse(afterLegacyWrite.primary).workouts)===JSON.stringify(legacyFixture.rows),'ordinary UI wallet save retains all exact workout values and ordering');
  assert(afterLegacyWrite.backup===beforeLegacyWrite && JSON.parse(afterLegacyWrite.primary).xp===legacyFixture.xp,'fallback retains exact pre-save source and no workout XP is issued');
  await cdp('Page.reload',{ignoreCache:true});
  await until('!!document.querySelector(".app-shell[data-fighter-created=true] .mobile-nav") && !document.querySelector("[data-storage-status]")','saved uncapped profile reopened');
  assert(await js('localStorage.getItem("bodyforge:pilot:v1")')===afterLegacyWrite.primary,'real reload preserves complete acknowledged primary');
  await js("(async()=>navigator.locks.request('bodyforge:pilot:v1:write',()=>{localStorage.setItem('bodyforge:pilot:v1','{bf107-broken');return true}))()");
  await cdp('Page.reload',{ignoreCache:true});
  await until('document.querySelector("[data-action=restore-backup]")?.disabled===false','explicit recovery offers intact uncapped fallback');
  await click('[data-action=restore-backup]');
  await until('!!document.querySelector(".app-shell[data-fighter-created=true] .mobile-nav") && !document.querySelector("[data-storage-status]")','explicit fallback restore reopens app');
  assert(await js('localStorage.getItem("bodyforge:pilot:v1")')===afterLegacyWrite.backup,'explicit restore preserves the exact 65-row fallback bytes');
  assert(await js('localStorage.getItem("bodyforge:pilot:v1:quarantine:0")')==='{bf107-broken','damaged original retained during uncapped restore');
  await click('.mobile-nav button:nth-child(2)');
  await until("(()=>{const d=document.querySelector('.pulse-trend-card:not([hidden])')?.dataset;return d?.historyIndex==='ready'&&d.historyLimited==='false'&&d.historyKnown==='65'})()",'recovered full history remains visible');
  await js('document.querySelector(".pulse-trend-card").scrollIntoView({block:"start",behavior:"instant"})');
  await snapshot('pulse-retained-restore-390.png');
"""+anchor)
for f,data in old.items():
 with (a/(f.name+'.before-fallback-qa')).open('xb') as out:out.write(data)
for f,data in old.items():assert f.read_bytes()==data
for f,content in [(p,s),(q,t)]:
 f.write_bytes(content.encode('utf-8'));print(f,f.stat().st_size,sha256(f.read_bytes()).hexdigest())