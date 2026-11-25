from pathlib import Path
import hashlib,json,subprocess,shutil,stat
root=Path.cwd()
a=root/'docs/audits/BF_107_MIXED_STORAGE_20261125'
dest=root/'.bodyforge-qa/bf107-mixed-storage'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
owned={'src/lib/journalMixedStorage.ts':'84a954296938e8e93c9b5be7f84ede0fa1a3f6df7ac621ab54d6f87afe06ec7a','src/lib/journalMixedStorage.test.ts':'9f336fc9248d8b602fd39f0a13745335259420cd2ccee3ecfdedf0bbdb3f6989','qa/durable-journal-e2e.mjs':'375f35f3ab3e07772b7fe045804462034fec1c11431d475b31b428b63b64f1de'}
for f,h in owned.items():assert sha(root/f)==h,f
assert sha(root/'src/lib/durableJournal.ts')=='99b5ab24987995dca1845c0c6256e27cb6ddb55958d4d7adf632fd4a99f3b062'
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0')
files+=['index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json']
rows=[];seen=set()
for f in sorted(set(filter(None,files))):
 p=root/f;rel=Path(f)
 assert not rel.is_absolute() and '..' not in rel.parts and f.casefold() not in seen,f
 seen.add(f.casefold())
 assert p.is_file() and not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT,f
 assert not any(x.startswith('.env') or x in ('.npmrc','.yarnrc') for x in rel.parts),f
 assert p.suffix.lower() not in ('.key','.pem','.p12','.pfx','.jks','.keystore','.apk','.aab'),f
 rows.append(dict(path=f,bytes=p.stat().st_size,sha256=sha(p)))
dest.mkdir(exist_ok=False)
for r in rows:
 p=dest/r['path'];p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/r['path'],p);assert sha(p)==r['sha256'],r['path']
for r in rows:assert sha(root/r['path'])==r['sha256'],r['path']
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==head
for filename,data in [('source.json',json.dumps(rows,indent=2)),('owned.json',json.dumps(owned,indent=2)),('head.txt',head+'\n')]:
 with (a/filename).open('x',encoding='utf-8') as f:f.write(data)
print('SNAPSHOT',len(rows),sha(a/'source.json'),flush=True)