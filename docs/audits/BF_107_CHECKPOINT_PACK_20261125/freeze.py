from pathlib import Path
import hashlib,json,subprocess,shutil,stat
root=Path.cwd()
a=root/'docs/audits/BF_107_CHECKPOINT_PACK_20261125'
dest=root/'.bodyforge-qa/bf107-checkpoint-pack'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
owned={'src/lib/journalCheckpointBatch.ts':'1f887f75b0d0fdd3b43e896a6828009aae3b7bd3f188d825e824b33a8598dd44','src/lib/journalCheckpointBatch.test.ts':'e1187de3f68d5208596653058a38a6b8a93fbb22395a17f359897ace7ddb17a5','src/lib/backupArchive.ts':'f1f6b0fffa81dab33cfb208327208d4ad6c2703b0d09c52162b545ad63aa1fd9','src/components/ProgressBackupPanel.tsx':'a4bb83109667f151a0f05d48cbb3e30f508eabd8060bd4fedbed976888aee217','src/components/progressBackup.css':'13c853fc3e563793f6d3a478f06db0dce64b334ab8ae5bb0c6f7c479f6572762','qa/durable-journal-e2e.mjs':'6a6eb254bb56d1627485111476635c041ff0dbdf094c7775f5802579fac6461c','qa/mobile-e2e.mjs':'dce2c8a9c0b0ad95c69e75a86eea7d0fc53f01d256fb96013040e6863375fff7'}
for f,h in owned.items():assert sha(root/f)==h,f
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