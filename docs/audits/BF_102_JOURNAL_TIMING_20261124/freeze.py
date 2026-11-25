from pathlib import Path
import hashlib, json, subprocess, shutil
root=Path.cwd()
a=root/'docs/audits/BF_102_JOURNAL_TIMING_20261124'
copy=root/'.bodyforge-qa/bf102-journal-timing'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
assert head=='7caa598c873c92887ac2ae3071b13f433225312e'
assert sha(root/'qa/journal-e2e.mjs')=='918d1a64773c5b3c4b9d8aa9fe8eae4e8cdca8f5440ddaab48d4de2ab2c6aa5c'
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0')
files += ['index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json']
files=sorted(set(f for f in files if f))
manifest=[]
for f in files:
 p=root/f
 assert p.is_file() and not p.is_symlink(), f
 assert not any(part.startswith('.env') or part in ('.npmrc','.yarnrc') for part in Path(f).parts),f
 assert p.suffix.lower() not in ('.pem','.key','.p12','.jks','.keystore','.apk','.aab'),f
 manifest.append(dict(path=f,bytes=p.stat().st_size,sha256=sha(p)))
copy.mkdir(exist_ok=False)
for row in manifest:
 src=root/row['path']; dest=copy/row['path']
 dest.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(src,dest)
 assert sha(dest)==row['sha256'],row['path']
for row in manifest: assert sha(root/row['path'])==row['sha256'],row['path']
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==head
(a/'source.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('SNAPSHOT',len(manifest),sha(a/'source.json'),flush=True)