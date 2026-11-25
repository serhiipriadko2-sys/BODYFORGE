from pathlib import Path
import hashlib,json,subprocess,shutil,stat
root=Path.cwd()
a=root/'docs/audits/BF_107_LEGACY_TRANSFER_20261125'
dest=root/'.bodyforge-qa/bf107-legacy-transfer'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
owned=json.loads((a/'owned.json').read_text(encoding='utf-8-sig'))
assert set(owned)=={'src/lib/journalMixedStorage.ts','src/lib/journalMixedStorage.test.ts','qa/durable-journal-e2e.mjs'}
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
for row in rows:
 p=dest/row['path'];p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/row['path'],p)
 assert sha(p)==row['sha256'],row['path']
for row in rows:assert sha(root/row['path'])==row['sha256'],row['path']
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==head
for name,content in [('source.json',json.dumps(rows,indent=2)),('head.txt',head+'\n')]:
 with (a/name).open('x',encoding='utf-8') as f:f.write(content)
print('SNAPSHOT',len(rows),sha(a/'source.json'),flush=True)