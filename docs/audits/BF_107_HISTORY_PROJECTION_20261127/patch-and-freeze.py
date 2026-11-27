from pathlib import Path
import hashlib,json,subprocess,shutil,stat,tempfile
root=Path.cwd()
a=root/'docs/audits/BF_107_HISTORY_PROJECTION_20261127'
expected={'src/lib/durableJournal.ts':'3a44acaa602460ae024956a70235a44391e2ecb6aca6fde7a2d9746c8ee5407c','src/lib/activityHistory.ts':'d0ded94810f5ff40e0df2e573580709770c7f543a15d79148f6953648e6ec2d8','src/lib/activityHistory.test.ts':'039ff632f4db51bcc5cae7a430a3d532249a705bb16a64aba18493d4d324f2a0','qa/durable-journal-e2e.mjs':'404b64c1444e75952ff8cb48e88714278e8ae53c7488f30235357ad8a7d3b899'}
def sha(b):return hashlib.sha256(b).hexdigest()
def hashfile(p):return sha(p.read_bytes())
old={p:(root/p).read_bytes() for p in expected}
for p,h in expected.items():assert sha(old[p])==h,p
def norm(p):return old[p].decode('utf-8').replace('\r\n','\n')
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
p,h,t,q=expected.keys()
s=norm(p)
s=once(s,"type ReadResult = { status: 'ready' | 'unavailable'; entries: DurableJournalEntry[] };",
"""type ReadResult<T = DurableJournalEntry> = { status: 'ready' | 'unavailable'; entries: T[] };
/** Activity-only evidence. Recovery and backup must use the full originals. */
export type DurableHistoryReceipt = Pick<DurableJournalEntry, 'key' | 'raw' | 'state'>;""")
s=once(s,"async function readJournalSnapshot(selected?: ReadonlySet<string>, signal?: AbortSignal): Promise<ReadResult> {\n  const unavailable: ReadResult = { status: 'unavailable', entries: [] };",
"""async function readJournalSnapshot<T>(project: (row: StoredEntry) => T | undefined, signal?: AbortSignal): Promise<ReadResult<T>> {
  const unavailable: ReadResult<T> = { status: 'unavailable', entries: [] };""")
s=once(s,"    const entries: DurableJournalEntry[] = [];","    const entries: T[] = [];")
s=once(s,"    const finish = (result: ReadResult) => {","    const finish = (result: ReadResult<T>) => {")
s=once(s,"              if (!selected || selected.has(row.key)) entries.push(publicEntry(row));",
"""              const value = project(row);
              if (value !== undefined) entries.push(value);""")
s=once(s,"  return readJournalSnapshot();\n}\n\nasync function writeEntriesUnlocked",
"""  return readJournalSnapshot(publicEntry);
}

/** Scan and validate every physical row, but retain only settled receipt
 * fields needed for activity statistics. No checkpoint data or write authority
 * escapes this view; incomplete/cancelled scans still fail closed. */
export function readDurableHistoryReceipts(signal?: AbortSignal): Promise<ReadResult<DurableHistoryReceipt>> {
  return readJournalSnapshot(({ key, raw, state }) =>
    state === 'settled' ? { key, raw, state } : undefined, signal);
}

async function writeEntriesUnlocked""")
s=once(s,"const checked = await readJournalSnapshot(new Set(expected.keys()), signal);",
"const checked = await readJournalSnapshot(row => expected.has(row.key) ? publicEntry(row) : undefined, signal);")
v=norm(h)
v=once(v,"import { readDurableJournal, type DurableJournalEntry } from './durableJournal';",
"import { readDurableHistoryReceipts, type DurableHistoryReceipt } from './durableJournal';")
v=once(v,"entries: readonly DurableJournalEntry[]","entries: readonly DurableHistoryReceipt[]")
v=once(v,"    const journal = await readDurableJournal();","    const journal = await readDurableHistoryReceipts(signal);")
w=norm(t)
w=once(w,"entries:[{key:entry.key,raw:entry.raw,state:'settled',baseProfileRaw:null}]","entries:[{key:entry.key,raw:entry.raw,state:'settled'}]")
w=once(w,"  it('does not fabricate a missing paid date",
"""  it('projects the same complete history from receipt-only records without checkpoints',()=>{
    const f=fixture();
    const entries=f.archived.map(({key,raw,state})=>({key,raw,state}));
    expect(indexActivityHistory(f.raw,parseProfile(JSON.parse(f.raw)),{status:'ready',entries}))
      .toEqual(index(f));
    expect(entries.every(r=>!('baseProfileRaw' in r))).toBe(true);
  });
  it('does not fabricate a missing paid date""")
z=norm(q)
z=once(z,"      result.fullPages=unbounded===0&&largest<=32&&pages===Math.floor((count+1)/32)+1;",
"""      result.fullPages=unbounded===0&&largest<=32&&pages===Math.floor((count+1)/32)+1;
      pages=0;largest=0;unbounded=0;
      const projected=await mod.readDurableHistoryReceipts();
      result.slim=projected.status==='ready'&&projected.entries.length===count&&
        projected.entries.every((row,i)=>row.key===rows[i].key&&row.raw===rows[i].raw&&row.state==='settled'&&
          Object.keys(row).length===3&&!('baseProfileRaw' in row));
      result.slimPages=unbounded===0&&largest<=32&&pages===Math.floor((count+1)/32)+1;
      result.fullJsonBytes=new TextEncoder().encode(JSON.stringify(full.entries)).byteLength;
      result.receiptJsonBytes=new TextEncoder().encode(JSON.stringify(projected.entries)).byteLength;""")
z=once(z,"    result.damage=refused.status==='unavailable'&&invalid.status==='unavailable'&&invalid.entries.length===0&&(await countRows())===count+2;",
"""    const invalidSlim=await mod.readDurableHistoryReceipts();
    result.damage=refused.status==='unavailable'&&invalid.status==='unavailable'&&invalid.entries.length===0&&
      invalidSlim.status==='unavailable'&&invalidSlim.entries.length===0&&(await countRows())===count+2;""")
z=once(z,"    result.noPartial=failed.status==='unavailable'&&failed.entries.length===0&&interrupted===2&&(await mod.readDurableJournal()).entries.length===66;",
"""    result.noPartial=failed.status==='unavailable'&&failed.entries.length===0&&interrupted===2&&(await mod.readDurableJournal()).entries.length===66;
    const controller2=new AbortController();
    let slimPages=0;
    IDBObjectStore.prototype.getAll=function(...args){
      const r=pageOriginal.apply(this,args);
      if(this.transaction.db.name===dbName&&++slimPages===2)r.addEventListener('success',()=>controller2.abort());
      return r;
    };
    let stoppedSlim;
    try{stoppedSlim=await mod.readDurableHistoryReceipts(controller2.signal)}finally{IDBObjectStore.prototype.getAll=pageOriginal}
    const marked=await mod.markDurableResults([small],'quarantined');
    const finalSlim=await mod.readDurableHistoryReceipts();
    result.slimCancel=stoppedSlim.status==='unavailable'&&stoppedSlim.entries.length===0&&slimPages===2;
    result.slimQuarantine=marked.status==='saved'&&finalSlim.status==='ready'&&finalSlim.entries.length===65&&
      finalSlim.entries.every(row=>row.state==='settled'&&row.key!==small.key)&&(await countRows())===66;""")
z=once(z,"    ['fullPages','full history also uses a consistent bounded page scan'],",
"""    ['fullPages','full history also uses a consistent bounded page scan'],
    ['slim','activity receipt projection retains all settled records without checkpoint fields'],
    ['slimPages','receipt projection validates entire history with the same bounded pages'],
    ['slimCancel','cancelled receipt projection returns no partial trusted records'],
    ['slimQuarantine','receipt projection excludes quarantine while all physical originals remain'],""")
anchor="  await test("+chr(96)+"(async()=>{const result=await mod.stageDurableResults([entry],null);const db=await openNative(2);db.close();return result.status==='saved'})()"
fixture=r"""
  // Exercise the actual activity-history reader, including its profile lock,
  // against valid receipts in the isolated browser, not merely a codec fixture.
  const activityProjection=await js(__BT__(async()=>{
    const progress=await import('/src/lib/progression.ts'), game=await import('/src/lib/game.ts');
    const journal=await import('/src/lib/workoutJournal.ts'), history=await import('/src/lib/activityHistory.ts');
    let profile={profileId:'qa-history-projection',xp:0,coins:0,creditedWorkoutIds:[],workouts:[],game:{...game.freshGame(),created:true}};
    const rows=[],base='recovery checkpoint '.repeat(1024);
    for(let i=0;i<65;i++){
      const sessionId='qa-projection-'+i,date=new Date(Date.UTC(2026,10,20,0,i));
      profile=progress.addCompletedWorkout(profile,32000,date,{sessionId,mode:'training'});
      const entry=journal.resultJournalEntry({schemaVersion:1,profileId:profile.profileId,sessionId,mode:'training',
        floor:null,durationMs:32000,finishedAt:date.toISOString(),repetitions:20});
      if(!entry)throw Error('invalid projection fixture');
      rows.push({schemaVersion:1,key:entry.key,raw:entry.raw,baseProfileRaw:base,state:'settled'});
    }
    await resetDB();await mod.readDurableJournal();
    const db=await openNative();
    try{await new Promise((resolve,reject)=>{
      const tx=db.transaction('results','readwrite',{durability:'strict'}),store=tx.objectStore('results');
      tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);rows.forEach(row=>store.add(row));
    })}finally{db.close()}
    const key=progress.STORAGE_KEY,raw=JSON.stringify(profile),prior=localStorage.getItem(key);
    localStorage.setItem(key,raw);
    const native=IDBDatabase.prototype.transaction;
    let writes=0;
    IDBDatabase.prototype.transaction=function(...args){
      if(this.name===dbName&&args[1]==='readwrite')writes++;
      return native.apply(this,args);
    };
    try{
      const loaded=progress.loadProfileState();
      if(loaded.status!=='ready')throw Error('profile fixture not ready');
      const signal=new AbortController().signal;
      const view=await history.readActivityHistory(loaded.profile,signal);
      const full=history.indexActivityHistory(raw,loaded.profile,await mod.readDurableJournal());
      const cancelled=await history.readActivityHistory(loaded.profile,AbortSignal.abort());
      return {complete:view.complete===true&&view.expectedCount===65&&view.restoredCount===5&&view.records.length===65,
        exact:JSON.stringify(view)===JSON.stringify(full),noWrites:writes===0&&localStorage.getItem(key)===raw,
        cancel:cancelled.complete===false&&cancelled.restoredCount===0&&cancelled.records.length===60};
    }finally{
      IDBDatabase.prototype.transaction=native;
      if(prior===null)localStorage.removeItem(key);else localStorage.setItem(key,prior);
      await resetDB();await mod.readDurableJournal();
    }
  })()__BT__);
  console.log('ACTIVITY_RECEIPT_PROJECTION',JSON.stringify(activityProjection));
  for(const [flag,label] of [
    ['complete','actual activity reader restores every paid historical result'],
    ['exact','receipt-only activity reader agrees exactly with full original history'],
    ['noWrites','activity reader never writes journal or profile'],
    ['cancel','cancelled activity reader retains conservative visible history'],
  ])check(activityProjection[flag]===true,label);
""".replace('__BT__',chr(96))
z=once(z,anchor,fixture+anchor)
updates={p:s.encode(),h:v.encode(),t:w.encode(),q:z.encode()}
for path,data in old.items():
 with (a/(Path(path).name+'.before')).open('xb') as f:f.write(data)
for path,data in old.items():assert (root/path).read_bytes()==data,path
for path,data in updates.items():
 (root/path).write_bytes(data)
 assert hashfile(root/path)==sha(data)
 print('PATCH',path,len(data),sha(data),flush=True)
owned={p:sha(data) for p,data in updates.items()}
with (a/'owned.json').open('x',encoding='utf-8') as f:json.dump(owned,f,indent=2)
d=Path(tempfile.mkdtemp(prefix='bodyforge-isolated-qa-')).resolve()
assert not d.is_relative_to(root.resolve()) and d.parent==Path(tempfile.gettempdir()).resolve()
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0')
files+=['index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json']
rows=[];seen=set()
for path in sorted(set(filter(None,files))):
 source=root/path;rel=Path(path)
 assert not rel.is_absolute() and '..' not in rel.parts and path.casefold() not in seen,path
 seen.add(path.casefold())
 assert source.is_file() and not source.is_symlink() and not getattr(source.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT,path
 assert not any(x.startswith('.env') or x in ('.npmrc','.yarnrc') for x in rel.parts),path
 assert source.suffix.lower() not in ('.key','.pem','.p12','.pfx','.jks','.keystore','.apk','.aab'),path
 rows.append(dict(path=path,bytes=source.stat().st_size,sha256=hashfile(source)))
assert all(next(x for x in rows if x['path']==p)['sha256']==h for p,h in owned.items())
for row in rows:
 target=d/row['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/row['path'],target)
 assert hashfile(target)==row['sha256'],row['path']
for row in rows:assert hashfile(root/row['path'])==row['sha256'],row['path']
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==head
for name,content in [('source.json',json.dumps(rows,indent=2)),('head.txt',head+'\n'),('isolated-root.txt',str(d))]:
 with (a/name).open('x',encoding='utf-8') as f:f.write(content)
print('SNAPSHOT',len(rows),hashfile(a/'source.json'),flush=True)