from pathlib import Path
import hashlib,json,subprocess,shutil,stat
root=Path.cwd();a=root/'docs/audits/BF_106_JOURNAL_GATE_20261125';copy=root/'.bodyforge-qa/bf106-journal-gate'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
owned={'src/lib/durableJournal.ts':'082ab2cb783507a0273ddd244afbd1662d6b7bb7408adfe8eb0250b7ba50861f','src/lib/durableJournalGate.ts':'9387363d7a6db62d32457d9b3b697af8078702674ba3bd6760a8ac1ccbc6c1ac','src/lib/durableJournalGate.test.ts':'7ccfc0caf61f51e1ef9940df504613e0a8c4f2decd36356c607f28c869ab801e','src/lib/profileReplacementRecovery.ts':'3d26d56e006e877ca5d997c1670b2f8651cee0064e1c8cd1582453685fa05adb','src/lib/profileReplacementRecovery.test.ts':'c37e1bdfa47e94b3417349f141399fba889d824d88bbd7bad2c8c10044adefae','qa/journal-gate-e2e.mjs':'952fe5acf7845ecfc1056b1d11944644d2cb1201f415b17a70df8b1d93ee92c4'}
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
(a/'owned.json').write_text(json.dumps(owned,indent=2),encoding='utf-8')
print('SNAPSHOT',len(manifest),sha(a/'source.json'),head,flush=True)