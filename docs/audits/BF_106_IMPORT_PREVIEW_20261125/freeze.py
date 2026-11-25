from pathlib import Path
import hashlib, json, subprocess, shutil, stat
root=Path.cwd(); a=root/'docs/audits/BF_106_IMPORT_PREVIEW_20261125'
copy=root/'.bodyforge-qa/bf106-preview'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
owned={
 'src/lib/progressImportPreview.ts':'83feec5c52f3f30b0a6e3d1b2fb9829ccad6efc378e4ea8d1d96f3e4ac4dbbf2',
 'src/lib/progressImportPreview.test.ts':'2a2897140e12f58f579d264e7e1c5a41f7439a4884f360d93c52a33b569bdade',
 'src/components/ProgressBackupPanel.tsx':'40d8fc15cb08a0672cc44187efaecf2813a8cb8f92b38eb66be8e928f29c3b83',
 'src/components/progressBackup.css':'b6ab3ea86a2938f1271aad02609ddd98546194eda4f8f41013a7d1cd3f8bf38e',
 'qa/import-preview-e2e.mjs':'352f20b0af60ed8a615d5681b166e6fd1de8b5263c12922026928c6960d1a8b1'}
for f,h in owned.items(): assert sha(root/f)==h,f
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0')
files += ['index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json']
files=sorted(set(f for f in files if f))
manifest=[]
for f in files:
 p=root/f
 assert p.is_file() and not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT,f
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