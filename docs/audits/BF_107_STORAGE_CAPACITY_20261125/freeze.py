from pathlib import Path
import hashlib,json,subprocess,shutil,stat
root=Path.cwd()
a=root/'docs/audits/BF_107_STORAGE_CAPACITY_20261125'
dest=root/'.bodyforge-qa/bf107-storage-capacity'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
owned={'src/lib/progressBackup.ts':'f1affce4f28336a3e8147401c9669078886d920eae8ed93d686b9584c1cb1993','src/lib/progressBackup.test.ts':'12d9d9a9e715b391590bdf71173d45cb51bd6afb363d775702d6755e014e1545','src/lib/progressBackupInspector.ts':'c0303d46d4586ce7d962ab9422e396923d5b2a7a5a488d8c0d0c739fd03fe8a2','src/lib/progressBackupInspector.test.ts':'9868ce56dd00281b5e55091388bb28b7fab36f42dc083ce5516d75fc29cc9c2a','src/components/ProgressBackupPanel.tsx':'cebe5db74e06634e407b83af9261b7c7732a9cb0083833d67f098a97181a79ae','src/components/progressBackup.css':'6b930b8ebb01546f83696ba807efb55d3359b793e7ed05b30fd866d493d9b9bd','src/lib/storageCapacity.ts':'79505d32c6a6b18856a1041bca86e0323ff4f06e669cee954a316497456a8c98','src/lib/storageCapacity.test.ts':'15032317c91d824774a6b130de932ba15bb963261e5967feb1897ead9c36f94d','qa/mobile-e2e.mjs':'b83a15cbf457d2b3b88a11a030498f49d9c8057bf49a6e0be4805e2351f51b08'}
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
with (a/'source.json').open('x',encoding='utf-8') as f:json.dump(rows,f,indent=2)
with (a/'head.txt').open('x',encoding='utf-8') as f:f.write(head+'\n')
print('SNAPSHOT',len(rows),sha(a/'source.json'),flush=True)