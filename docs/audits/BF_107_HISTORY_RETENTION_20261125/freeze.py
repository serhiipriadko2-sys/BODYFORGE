from pathlib import Path
import hashlib,json,subprocess,shutil,stat
root=Path.cwd();a=root/'docs/audits/BF_107_HISTORY_RETENTION_20261125';dest=root/'.bodyforge-qa/bf107-history-retention'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
owned={'src/lib/progression.ts':'cafc31cc4c43f9019cf8c45508bf6c5c84207ee0cee4a1519746bc089e3e4ff6','src/lib/historyRetention.test.ts':'1efb043ec62d2770710e076c83bcefbd70e5cdb76922fae2dd1467d8154b2838','src/lib/profileReplacement.ts':'b6c4163c487a5545bf85e8f5948566179c2707dc5923371fae3e31d98b532087','src/lib/profileReplacement.test.ts':'b3d65e9aa9373cc77ab11573819b321232c7c6557899878b29a0ee24565be1ca','src/lib/settledImportHistory.ts':'a7aacc81ad235383c3a53340ec447f12aca5b6e4a876f5170f337d74afc0985d','qa/forge-home-xp-faq-e2e.mjs':'e957af783eea976aa19e62c391e44b31a50712c8b3e796b9d55b5a59f185d7d8'}
for f,h in owned.items():assert sha(root/f)==h,f
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
assert head=='664ab80c89b244bab1014ec5c652d11c6a490470'
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
for r in rows:assert sha(root/r['path'])==r['sha256'],r['path']
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==head
with (a/'source.json').open('x',encoding='utf-8') as f:json.dump(rows,f,indent=2)
(a/'head.txt').write_text(head+'\n',encoding='utf-8')
print('SNAPSHOT',len(rows),sha(a/'source.json'),flush=True)