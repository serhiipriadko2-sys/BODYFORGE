from pathlib import Path
import hashlib,json,subprocess,shutil,stat
root=Path.cwd()
a=root/'docs/audits/BF_107_GZIP_ARCHIVE_20261125'
dest=root/'.bodyforge-qa/bf107-gzip-archive'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
owned={'src/lib/backupArchive.ts':'da43b805f52f4506045fdae15e78be24f42753272f1aad0845f9485a3db48489','src/lib/backupArchive.test.ts':'9ffde048b410d228c5b6bfbb26df0cd31b369cb004b019917b2db3541dd7f8ee','src/lib/progressImportPreview.ts':'cc85af6b931d5ba6093d537ced81e9ab77201e021088a8620e2f3185abf1a051','src/lib/progressImportPreview.test.ts':'e018e757cfe2e89630a4e0144ab41193baee328a1f4e37a22a54fe9aeaa61c57','src/lib/progressBackup.ts':'d4098f57f38ab3ca1206eed32532cd8098dda67b5bab9dc6a337359b72a4367b','src/components/ProgressBackupPanel.tsx':'63b0d4e7bba2b463b7938cfc3c0ada32705c3c3355a4567332ee8a154623f3d1','src/components/progressBackup.css':'0c7a1b487e9bcc30a8a01e0e8800411b46afb3c5447ee8e1c22c52de0c324f84','qa/mobile-e2e.mjs':'c6588ef16d7852fc3631d7d13bdf011ff5d5e4182c9df3f1d796f4baa449bcc6','qa/import-preview-e2e.mjs':'fe83e87ed9c6d0527dbfce7451a3d535b67503ea1d0b567ced5808a2b964ec2e'}
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
with (a/'owned.json').open('x',encoding='utf-8') as f:json.dump(owned,f,indent=2)
print('SNAPSHOT',len(rows),sha(a/'source.json'),flush=True)