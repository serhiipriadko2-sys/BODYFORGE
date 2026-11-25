from pathlib import Path
import hashlib, json, subprocess, shutil
root=Path.cwd(); a=root/'docs/audits/BF_105_RECEIPT_SCHEMA_20261124'
copy=root/'.bodyforge-qa/bf105-receipt-preview'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
owned={'src/lib/receiptCompatibility.ts':'d4086dee7d8b90b3e726ca402845beed8df4dbcf49a99235d51496749cb4f69e','src/lib/receiptCompatibility.test.ts':'584d5a8b0439b2c88e503062a3d44865a3d13d534fd6d1b333b4851cf1207d69'}
for f,h in owned.items(): assert sha(root/f)==h,f
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0')
files += ['index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json']
files=sorted(set(f for f in files if f))
manifest=[]
for f in files:
 p=root/f
 assert p.is_file() and not p.is_symlink(),f
 assert not any(part.startswith('.env') or part in ('.npmrc','.yarnrc') for part in Path(f).parts),f
 assert p.suffix.lower() not in ('.pem','.key','.p12','.jks','.keystore','.apk','.aab'),f
 manifest.append(dict(path=f,bytes=p.stat().st_size,sha256=sha(p)))
copy.mkdir(exist_ok=False)
for row in manifest:
 src=root/row['path'];dest=copy/row['path']
 dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest)
 assert sha(dest)==row['sha256'],row['path']
for row in manifest: assert sha(root/row['path'])==row['sha256'],row['path']
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==head
(a/'source.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(a/'head.txt').write_text(head+'\n',encoding='utf-8')
print('SNAPSHOT',len(manifest),sha(a/'source.json'),head,flush=True)