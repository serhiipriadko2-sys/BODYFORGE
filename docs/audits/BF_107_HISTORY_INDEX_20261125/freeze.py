from pathlib import Path
import hashlib,json,subprocess,shutil,stat
root=Path.cwd();a=root/'docs/audits/BF_107_HISTORY_INDEX_20261125';dest=root/'.bodyforge-qa/bf107-history-index'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
owned={'src/lib/activityHistory.ts':'d0ded94810f5ff40e0df2e573580709770c7f543a15d79148f6953648e6ec2d8','src/lib/activityHistory.test.ts':'039ff632f4db51bcc5cae7a430a3d532249a705bb16a64aba18493d4d324f2a0','src/lib/progressPulse.ts':'ca7b38ff227080011c97d5094e20c2ba0d79fa69e6f5b4c2da31e8b704529b04','src/components/ProgressPulseBoard.tsx':'05458c68e1b83725aae0b18d481547298e57615e2a02cd6cbab31efe93e6889b','qa/forge-home-xp-faq-e2e.mjs':'efdb1cf0cf9755fefe1348fcf0a598f5f4d96f4682f26b1886d4601bd31c6e7c'}
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