from pathlib import Path
import hashlib,json,shutil,subprocess,stat
root=Path.cwd();a=root/'docs/audits/BF_106_EPOCH_FINALIZE_20261125';dest=root/'.bodyforge-qa/bf106-epoch-red'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0')
files+=['index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json']
rows=[]
for f in sorted(set(filter(None,files))):
 p=root/f
 assert p.is_file() and not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT,f
 assert not any(x.startswith('.env') or x in ('.npmrc','.yarnrc') for x in Path(f).parts),f
 assert p.suffix.lower() not in ('.key','.pem','.p12','.pfx','.jks','.keystore','.apk','.aab'),f
 rows.append(dict(path=f,bytes=p.stat().st_size,sha256=sha(p)))
dest.mkdir(exist_ok=False)
for r in rows:
 p=dest/r['path'];p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/r['path'],p);assert sha(p)==r['sha256'],r['path']
(a/'ui-red-source.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
print('RED_SOURCE',len(rows),sha(a/'ui-red-source.json'),flush=True)