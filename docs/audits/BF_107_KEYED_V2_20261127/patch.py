from pathlib import Path
import hashlib,json,subprocess,shutil,stat,tempfile
root=Path.cwd()
a=root/'docs/audits/BF_107_KEYED_V2_20261127'
expected={'src/lib/durableJournal.ts':'e38aa80f94ed3c152179b247a8a93d9d66728ace298c700e73ac1595ce134b6a','qa/durable-journal-e2e.mjs':'a2a7b01ee53eb7e2fdca6007a80c97114361e376b3f1d83bf29d659fcf72788d'}
def sha(b):return hashlib.sha256(b).hexdigest()
def hashfile(p):return sha(p.read_bytes())
old={p:(root/p).read_bytes() for p in expected}
for p,h in expected.items():assert sha(old[p])==h,p
def norm(p):return old[p].decode('utf-8').replace('\r\n','\n')
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
def staged(f):
 s=(a/f).read_text(encoding='utf-8-sig')
 assert s.strip() and '\x00' not in s
 return s.rstrip()+'\n'
p,q=expected.keys()
s=norm(p)
s=once(s,"export const DURABLE_JOURNAL_DATABASE = 'bodyforge:durable-results:v1';\nconst STORE = 'results';",
"""import { DURABLE_JOURNAL_DATABASE, DURABLE_RESULT_STORE as STORE, isVersionedJournalLayout } from './durableJournalSchema';
export { DURABLE_JOURNAL_DATABASE } from './durableJournalSchema';""")
s=once(s,"const request = indexedDB.open(DURABLE_JOURNAL_DATABASE, 1);","const request = indexedDB.open(DURABLE_JOURNAL_DATABASE);")
s=once(s,"      request.onupgradeneeded = () => {\n        if (done || signal?.aborted) { request.transaction?.abort(); return; }",
"      request.onupgradeneeded = event => {\n        if (done || signal?.aborted || event.oldVersion !== 0 || request.result.version !== 1) { request.transaction?.abort(); return; }")
s=once(s,"if (done || signal?.aborted || !db.objectStoreNames.contains(STORE))",
"if (done || signal?.aborted || !db.objectStoreNames.contains(STORE) || (db.version !== 1 && !isVersionedJournalLayout(db)))")
s=once(s,"  if (!db || signal?.aborted) { db?.close(); return unavailable; }\n  return new Promise((resolve) => {",
"""  if (!db || signal?.aborted) { db?.close(); return unavailable; }
  if (isVersionedJournalLayout(db)) {
    try {
      const { readVersionedJournal } = await import('./durableJournalV2');
      return await readVersionedJournal(db,row=>project({...row,schemaVersion:1}),signal);
    } catch { return unavailable; }
    finally { db.close(); }
  }
  return new Promise((resolve) => {""")
s=once(s,"  if (!db || signal?.aborted) { db?.close(); return { status: 'unavailable' }; }\n  const expected =",
"""  if (!db || signal?.aborted) { db?.close(); return { status: 'unavailable' }; }
  if (isVersionedJournalLayout(db)) {
    try {
      const { writeVersionedJournal } = await import('./durableJournalV2');
      return await writeVersionedJournal(db,unique,baseProfileRaw,state,signal);
    } catch { return {status:'unavailable'}; }
    finally { db.close(); }
  }
  const expected =""")
z=norm(q)
anchor="  console.log('BODYFORGE_DURABLE_JOURNAL_PASS',"
z=once(z,anchor,staged('qa.stage')+anchor)
z=once(z,'native version fence blocks old journal readers and writers without altering records','unrecognized native v2 layout blocks journal readers and writers without altering records')
newfiles={'src/lib/durableJournalSchema.ts':staged('schema.stage').encode(),'src/lib/durableJournalV2.ts':staged('v2.stage').encode()}
assert all(not (root/path).exists() for path in newfiles)
updates={p:s.encode(),q:z.encode(),**newfiles}
adr="""# BF-107 ADR - key-preserving compact journal v2

Status: accepted for local implementation and disposable-profile testing. No owner database activation.
Context: mixed-batch candidate changes original keys and imposes a 16 MiB/4096-record total bound. Production v1 is paged and keeps original keys. Backup and profile replacement depend on exact logical originals.
Decision: explicit native v2 schema, results plus revision marker. Keep original result keys; encode one settled original with existing lossless bounded codec, otherwise keep plain v1 row. Production facade lazily recognizes exact prepared v2 layout; ordinary opens never upgrade. Versionchange preparation validates every original and creates only metadata. Normal stage/mark uses strict atomic revision CAS and exact requested-row comparison/readback. Active/quarantine remain plain. Bounded explicit maintenance compacts/restores settled keys. Paged reads check a common revision and final revision after decoding; no async codec inside active transaction. Full backup/recovery still receives original fields.
Alternatives: separate DB pointer rejected (split-brain); batch physical keys rejected (direct lookup); automatic upgrade rejected pending activation and device acceptance; custom compression rejected.
Consequences: native v2 fences explicit legacy v1 opens; cannot downgrade version. Restore materializes originals without downgrade. Revision assumes cooperating v2 writers, not arbitrary same-origin mutation. Per-record codec limit is not total history cap. Full readback remains O(history); real latency/quota/device gates remain. Local compatibility is not authorization to activate owner storage.
Tests: absent, blocked, invalid and idempotent preparation; exact originals, fence, stage/mark, compact/restore/quarantine, conflict, abort, lost acknowledgement, oversized fallback, stale revision, large mixed history, revision drift, corrupt packed buffer; full suite/build/preview.
Diff: durableJournal.ts, durableJournalSchema.ts, durableJournalV2.ts, qa/durable-journal-e2e.mjs. Rollback: restore only hash-matching owned original files, remove only unchanged new files; never downgrade or touch owner's DB. Before real activation require separate approval, device and recovery gates.
"""
with (a/'ADR.md').open('x',encoding='utf-8') as out:out.write(adr)
for path,data in old.items():
 with (a/(Path(path).name+'.before')).open('xb') as out:out.write(data)
for path,data in old.items():assert (root/path).read_bytes()==data,path
for path,data in updates.items():
 if path in newfiles:
  with (root/path).open('xb') as out:out.write(data)
 else:(root/path).write_bytes(data)
 assert hashfile(root/path)==sha(data)
 print('PATCH',path,len(data),sha(data),flush=True)
owned={p:sha(data) for p,data in updates.items()}
with (a/'owned.json').open('x',encoding='utf-8') as out:json.dump(owned,out,indent=2)
d=Path(tempfile.mkdtemp(prefix='bodyforge-isolated-qa-')).resolve()
assert not d.is_relative_to(root.resolve()) and d.parent==Path(tempfile.gettempdir()).resolve()
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0')
files+=['index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json']
rows=[];seen=set()
for path in sorted(set(filter(None,files))):
 src=root/path;rel=Path(path)
 assert not rel.is_absolute() and '..' not in rel.parts and path.casefold() not in seen,path
 seen.add(path.casefold())
 assert src.is_file() and not src.is_symlink() and not getattr(src.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT,path
 assert not any(x.startswith('.env') or x in ('.npmrc','.yarnrc') for x in rel.parts),path
 assert src.suffix.lower() not in ('.key','.pem','.p12','.pfx','.jks','.keystore','.apk','.aab'),path
 rows.append(dict(path=path,bytes=src.stat().st_size,sha256=hashfile(src)))
assert all(next(x for x in rows if x['path']==p)['sha256']==h for p,h in owned.items())
for row in rows:
 target=d/row['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/row['path'],target)
 assert hashfile(target)==row['sha256'],row['path']
for row in rows:assert hashfile(root/row['path'])==row['sha256'],row['path']
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==head
for name,content in [('source.json',json.dumps(rows,indent=2)),('head.txt',head+'\n'),('isolated-root.txt',str(d))]:
 with (a/name).open('x',encoding='utf-8') as out:out.write(content)
print('SNAPSHOT',len(rows),hashfile(a/'source.json'),flush=True)
