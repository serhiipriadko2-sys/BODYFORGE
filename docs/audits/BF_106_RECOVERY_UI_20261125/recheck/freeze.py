from pathlib import Path
import hashlib,json,subprocess,shutil,stat
root=Path.cwd();a=root/'docs/audits/BF_106_RECOVERY_UI_20261125/recheck';copy=root/'.bodyforge-qa/bf106-recovery-ui-recheck'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
owned={'src/App.tsx':'aed7c608fa02371bf5bc6aaf0620e135a94e37d38ded08ab208de903e512cc3d','src/components/StorageRecovery.tsx':'e4cb38de47702017a0363f98311df1d042d0a4426705c259d093ee48286a016e','src/components/ReplacementRecoveryPanel.tsx':'85b93e874360ac16c9f83a31ce5fd95d43457394f5e1b6827dc490b00f54d7d5','src/lib/profileReplacementRecovery.ts':'95fc22c5914fea1e353ef22c91949a12c533cc8a744f2f774c39ce66be2bd43a','src/lib/profileReplacementRecovery.test.ts':'9115d63c6379010d2b9ce119c173247321309e56ff0c68e0ed981c3b6bb8c562','qa/profile-replacement-e2e.mjs':'a1241a154c5d8bc7b4494d89c631d5ff1cc8eb44c59656e1fbfc7a18245e660f'}
for f,h in owned.items():assert sha(root/f)==h,f
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0')
files+=['index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json']
manifest=[]
for f in sorted(set(filter(None,files))):
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