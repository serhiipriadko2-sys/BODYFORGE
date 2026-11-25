from pathlib import Path
import hashlib,json,subprocess,shutil,stat
root=Path.cwd();a=root/'docs/audits/BF_106_EPOCH_FINALIZE_20261125';dest=root/'.bodyforge-qa/bf106-epoch-finalize-green'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
owned={'src/hooks/useProfileStorage.ts':'4de6ccf0795dc1b9451a619c0c63809ef3e000f07c8a479902c2c2766735e910','src/lib/profileReplacement.ts':'e0f1c325c7fad55fb66f6092c5e91769fddec55d2158ee9ddecdf2b523f3f1a5','src/lib/profileReplacement.test.ts':'cff453bb160144253c9280bcc3a06ede1360cf2e89559f7e474ad78933eac701','src/lib/profileReplacementRecovery.ts':'39bcb20fe75bd7a389484a1a9e08c4db125a4acb6d0f4f70a1a6d230d8bf715f','src/lib/profileReplacementRecovery.test.ts':'d6fa0e7b2451454d17d04bc99ff1fd896e6a2854b4188c07fdaa429a24f7b630','qa/profile-replacement-e2e.mjs':'3e99c0e6cb337e9a2b2a0b719056f9dc6e897ae9102877e83b3a7dbf2a6fc0d0','qa/journal-gate-e2e.mjs':'40ef6edf4690d8f50952d34abe4338d6c0742b33fd1ab07197cf3beab5f3cdcc'}
for f,h in owned.items():assert sha(root/f)==h,f
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
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
(a/'green-source.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
(a/'green-head.txt').write_text(head+'\n',encoding='utf-8')
print('SNAPSHOT',len(rows),sha(a/'green-source.json'),flush=True)