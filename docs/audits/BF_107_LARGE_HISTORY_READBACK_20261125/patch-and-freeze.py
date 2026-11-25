from pathlib import Path
import hashlib,json,subprocess,shutil,stat,tempfile
root=Path.cwd()
a=root/'docs/audits/BF_107_LARGE_HISTORY_READBACK_20261125'
expected={'src/lib/durableJournal.ts':'99b5ab24987995dca1845c0c6256e27cb6ddb55958d4d7adf632fd4a99f3b062','qa/durable-journal-e2e.mjs':'c28d08806f242f1813375fd47fd45d9d8b2790a2435da6eac0b21cd97e91fad4'}
def sha(data):return hashlib.sha256(data).hexdigest()
def hashfile(p):return sha(p.read_bytes())
old={p:(root/p).read_bytes() for p in expected}
for p,h in expected.items():assert sha(old[p])==h,p
p,q=expected.keys()
s=old[p].decode().replace('\r\n','\n')
start=s.index('/** Opaque raw records are preserved; unknown store schema fails closed. */')
end=s.index('async function writeEntriesUnlocked',start)
s=s[:start]+r"""/** A page limit bounds the number of cloned records, not individual record
 * size or total history. One readonly transaction gives a consistent view.
 * Selected readback retains only requested originals but validates EVERY row.
 * Never treat a corrupt, incomplete or cancelled scan as an empty history. */
const JOURNAL_PAGE_ROWS = 32;
async function readJournalSnapshot(selected?: ReadonlySet<string>, signal?: AbortSignal): Promise<ReadResult> {
  const unavailable: ReadResult = { status: 'unavailable', entries: [] };
  const db = await openDatabase(signal);
  if (!db || signal?.aborted) { db?.close(); return unavailable; }
  return new Promise((resolve) => {
    let done = false, complete = false;
    const entries: DurableJournalEntry[] = [];
    let tx: IDBTransaction | undefined;
    const finish = (result: ReadResult) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      db.close(); resolve(result);
    };
    const abort = () => {
      try { tx?.abort(); } catch { /* Already inactive. */ }
      finish(unavailable);
    };
    const timer = setTimeout(abort, TIMEOUT_MS);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      tx = db.transaction(STORE, 'readonly');
      tx.oncomplete = () => finish(complete && !signal?.aborted ? { status: 'ready', entries } : unavailable);
      tx.onabort = tx.onerror = () => finish(unavailable);
      const store = tx.objectStore(STORE);
      if (store.keyPath !== 'key' || signal?.aborted) { abort(); return; }
      let previous: string | undefined;
      // Schedule the next page synchronously inside the active IDB callback.
      // No async gap, separate transaction or offset/count truncation.
      const page = () => {
        const range = previous === undefined ? undefined : IDBKeyRange.lowerBound(previous, true);
        const request = store.getAll(range, JOURNAL_PAGE_ROWS);
        request.onsuccess = () => {
          if (done || signal?.aborted) { abort(); return; }
          try {
            const values: unknown[] = request.result;
            if (!Array.isArray(values) || values.length > JOURNAL_PAGE_ROWS) { abort(); return; }
            for (const value of values) {
              const row = storedEntry(value);
              if (!row || (previous !== undefined && row.key <= previous)) { abort(); return; }
              previous = row.key;
              if (!selected || selected.has(row.key)) entries.push(publicEntry(row));
            }
            if (values.length < JOURNAL_PAGE_ROWS) complete = true;
            else page();
          } catch { abort(); }
        };
      };
      page();
    } catch { abort(); }
  });
}

/** Opaque raw records are preserved; unknown store schema fails closed. */
export function readDurableJournal(): Promise<ReadResult> {
  return readJournalSnapshot();
}
"""+'\n'+s[end:]
assert s.count('const checked = await readDurableJournal();')==1
s=s.replace('const checked = await readDurableJournal();','const checked = await readJournalSnapshot(new Set(expected.keys()), signal);')
v=old[q].decode().replace('\r\n','\n')
anchor='  // Candidate compact records live only in this disposable QA database.'
assert v.count(anchor)==1
# Insert large test AFTER previous compact and mixed fixtures, when their
# required retained v1 history has already been consumed.
anchor="  await test("+chr(96)+"(async()=>{const result=await mod.stageDurableResults([entry],null);const db=await openNative(2);db.close();return result.status==='saved'})()"
assert v.count(anchor)==1
v=v.replace(anchor,r"""
  // A real large legacy journal exceeds both candidate bounds. The normal
  // production API must not silently truncate, discard or cap that history.
  const largeHistory=await js(`(async()=>{
    const prefix='bodyforge:pilot:v1:result:large-';
    const count=4105,base='long-original-checkpoint-'.repeat(1500)+'\\ud800';
    const rows=Array.from({length:count},(_,i)=>({schemaVersion:1,key:prefix+String(i).padStart(5,'0'),
      raw:'original-'+i,baseProfileRaw:i<520?base:null,state:'settled'}));
    const small={key:prefix+'new',raw:'new original'};
    const putDirect=async list=>{
      const db=await openNative();
      try{await new Promise((resolve,reject)=>{const tx=db.transaction('results','readwrite',{durability:'strict'}),store=tx.objectStore('results');
        tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);list.forEach(row=>store.add(row))})}finally{db.close()}
    };
    const countRows=async()=>{
      const db=await openNative();
      try{return await new Promise((resolve,reject)=>{const tx=db.transaction('results','readonly'),r=tx.objectStore('results').count();
        tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error)})}finally{db.close()}
    };
    await resetDB();await mod.readDurableJournal();await putDirect(rows);
    const old=IDBObjectStore.prototype.getAll, result={};
    let pages=0,largest=0,unbounded=0;
    IDBObjectStore.prototype.getAll=function(...args){
      if(this.transaction.db.name===dbName){
        pages++;if(args[1]!==32)unbounded++;
        const r=old.apply(this,args);
        r.addEventListener('success',()=>{largest=Math.max(largest,r.result.length)});
        return r;
      }
      return old.apply(this,args);
    };
    try{
      const start=performance.now(),stage=await mod.stageDurableResults([small],null),elapsed=performance.now()-start;
      result.stage=stage.status==='saved'&&stage.entries.length===1&&stage.entries[0].key===small.key&&stage.entries[0].baseProfileRaw===null&&stage.entries[0].state==='active';
      result.pageBound=unbounded===0&&largest<=32&&pages===Math.floor((count+1)/32)+1;
      result.pages=pages;result.maxPage=largest;result.elapsedMs=Math.round(elapsed);
      pages=0;largest=0;unbounded=0;
      const full=await mod.readDurableJournal();
      result.full=full.status==='ready'&&full.entries.length===count+1&&full.entries.slice(0,count).every((row,i)=>row.key===rows[i].key&&row.raw===rows[i].raw&&row.baseProfileRaw===rows[i].baseProfileRaw&&row.state==='settled')&&full.entries[count].key===small.key;
      result.fullPages=unbounded===0&&largest<=32&&pages===Math.floor((count+1)/32)+1;
      result.count=count;result.logicalBaselineBytes=520*new TextEncoder().encode(base).byteLength;
      result.retained=(await countRows())===count+1;
    }finally{IDBObjectStore.prototype.getAll=old}
    // An unrelated damaged row on the final page still blocks the receipt.
    const bad={schemaVersion:99,key:prefix+'zz-invalid',raw:'future',baseProfileRaw:null,state:'active'};
    await putDirect([bad]);
    const refused=await mod.markDurableResults([small],'settled'),invalid=await mod.readDurableJournal();
    result.damage=refused.status==='unavailable'&&invalid.status==='unavailable'&&invalid.entries.length===0&&(await countRows())===count+2;
    // Even if the write commits, cancellation or an interrupted later page
    // cannot authorize a saved receipt. Do not claim zero writes.
    await resetDB();await mod.readDurableJournal();
    await putDirect(rows.slice(-65));
    const controller=new AbortController(),native=IDBObjectStore.prototype.getAll;
    let seen=0;
    IDBObjectStore.prototype.getAll=function(...args){
      const r=native.apply(this,args);
      if(this.transaction.db.name===dbName&&++seen===2)r.addEventListener('success',()=>controller.abort());
      return r;
    };
    let cancelled;
    try{cancelled=await mod.stageDurableResults([small],null,controller.signal)}finally{IDBObjectStore.prototype.getAll=native}
    const recovered=await mod.stageDurableResults([small],'later baseline');
    result.cancel=cancelled.status==='unavailable'&&seen===2&&recovered.status==='saved'&&recovered.entries[0].baseProfileRaw===null&&(await countRows())===66;
    const pageOriginal=IDBObjectStore.prototype.getAll;
    let interrupted=0;
    IDBObjectStore.prototype.getAll=function(...args){
      if(this.transaction.db.name===dbName&&++interrupted===2)throw Error('QA second page unavailable');
      return pageOriginal.apply(this,args);
    };
    let failed;
    try{failed=await mod.readDurableJournal()}finally{IDBObjectStore.prototype.getAll=pageOriginal}
    result.noPartial=failed.status==='unavailable'&&failed.entries.length===0&&interrupted===2&&(await mod.readDurableJournal()).entries.length===66;
    await resetDB();await mod.readDurableJournal();
    return result;
  })()`);
  console.log('LARGE_JOURNAL_PAGES',JSON.stringify(largeHistory));
  for(const [flag,label] of [
    ['stage','large legacy journal acknowledges new result beyond candidate size and count limits'],
    ['pageBound','write readback scans all originals in pages of at most 32'],
    ['full','full history read restores every large legacy original exactly'],
    ['fullPages','full history also uses a consistent bounded page scan'],
    ['retained','large history retains every physical record'],
    ['damage','damaged final page prevents trusted receipt and partial history'],
    ['cancel','cancelled later readback page cannot acknowledge and exact retry preserves baseline'],
    ['noPartial','failed second page never returns partial trusted history'],
  ])check(largeHistory[flag]===true,label);
"""+anchor)
updates={p:s.encode(),q:v.encode()}
for path,data in old.items():
 with (a/(Path(path).name+'.before')).open('xb') as f:f.write(data)
for path,data in old.items():assert (root/path).read_bytes()==data,path
for path,data in updates.items():
 (root/path).write_bytes(data)
 assert hashfile(root/path)==sha(data)
 print('PATCH',path,len(data),sha(data),flush=True)
owned={p:sha(data) for p,data in updates.items()}
with (a/'owned.json').open('x',encoding='utf-8') as f:json.dump(owned,f,indent=2)
# One isolated source/build/dev root outside all private project paths.
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