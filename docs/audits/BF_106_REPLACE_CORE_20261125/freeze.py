from pathlib import Path
import hashlib,json,subprocess,shutil,stat
root=Path.cwd();a=root/'docs/audits/BF_106_REPLACE_CORE_20261125'
copy=root/'.bodyforge-qa/bf106-replace-core'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
owned={
'src/lib/profileReplacement.ts':'9535349f81f975d8b8874545b8989a7b2c5cc56b08a781f840eba11a2f76401e',
'src/lib/profileReplacement.test.ts':'68d2047871ddbeb33579fd4ae12fdd9cbf68517b24c82dd3a0426bbe10cc77ef',
'qa/profile-replacement-e2e.mjs':'6e2ee1d6f6247c0c58e85a89de3ee84129e629425a1d9bdeec812aebad7fdc64'}
for f,h in owned.items():assert sha(root/f)==h,f
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0')
files+=['index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json']
files=sorted(set(filter(None,files)));manifest=[]
for f in files:
 p=root/f
 assert p.is_file() and not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT,f
 assert not any(part.startswith('.env') or part in ('.npmrc','.yarnrc') for part in Path(f).parts),f
 assert p.suffix.lower() not in ('.pem','.key','.p12','.pfx','.jks','.keystore','.apk','.aab'),f
 manifest.append(dict(path=f,bytes=p.stat().st_size,sha256=sha(p)))
copy.mkdir(exist_ok=False)
for row in manifest:
 src=root/row['path'];dest=copy/row['path'];dest.parent.mkdir(parents=True,exist_ok=True)
 shutil.copyfile(src,dest);assert sha(dest)==row['sha256'],row['path']
for row in manifest:assert sha(root/row['path'])==row['sha256'],row['path']
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==head
(a/'source.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(a/'head.txt').write_text(head+'\n',encoding='utf-8')
print('SNAPSHOT',len(manifest),sha(a/'source.json'),head,flush=True)