from pathlib import Path
import hashlib,json,shutil
root=Path.cwd()
a=root/'docs/audits/BF_107_JOURNAL_WRITE_SCALE_20261125'
prior=root/'.bodyforge-qa/bf107-journal-write-scale'
dest=root/'.bodyforge-qa/bf107-journal-write-recheck'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
q=root/'qa/durable-journal-e2e.mjs'
old=q.read_bytes()
assert sha(q)=='0fcfc995b0385026efb1f4eee5f4f70fe1c17b144ac1e0f9aeee03db6183feba'
assert sha(root/'src/lib/durableJournal.ts')=='99b5ab24987995dca1845c0c6256e27cb6ddb55958d4d7adf632fd4a99f3b062'
s=old.decode()
for x in ['await resetDB(); await mod.readDurableJournal(); true','await resetDB();await mod.readDurableJournal();true']:
 pattern='await js("'+x+'");'
 assert s.count(pattern)==1
 s=s.replace(pattern,'await js("(async()=>{await resetDB();await mod.readDurableJournal();return true})()");')
with (a/'durable-journal-e2e.mjs.before-async-fix').open('xb') as f:f.write(old)
assert q.read_bytes()==old
q.write_bytes(s.encode())
manifest=json.loads((a/'source.json').read_text(encoding='utf-8-sig'))
dest.mkdir(exist_ok=False)
for row in manifest:
 rel=row['path'];p=prior/rel;assert sha(p)==row['sha256'],rel
 target=dest/rel;target.parent.mkdir(parents=True,exist_ok=True)
 shutil.copyfile(q if rel=='qa/durable-journal-e2e.mjs' else p,target)
 if rel=='qa/durable-journal-e2e.mjs':
  row.update(bytes=target.stat().st_size,sha256=sha(target))
 assert sha(target)==row['sha256'],rel
with (a/'source-recheck.json').open('x',encoding='utf-8') as f:json.dump(manifest,f,indent=2)
print('QA_PATCH',q.stat().st_size,sha(q))
print('RECHECK_SNAPSHOT',len(manifest),sha(a/'source-recheck.json'))