from pathlib import Path
import hashlib,json,subprocess,shutil,stat,tempfile
root=Path.cwd()
a=root/'docs/audits/BF_107_V2_GAME_FLOW_20261127'
p='qa/tower20-e2e.mjs'
def sha(b):return hashlib.sha256(b).hexdigest()
def hashfile(p):return sha(p.read_bytes())
old=(root/p).read_bytes()
assert sha(old)=='de277f5dfd1fd13d4a9ff066e0c1cb501d8b235bb3086a3c97796183876cc3c5'
s=old.decode('utf-8').replace('\r\n','\n')
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
s=once(s,"import { createHash } from 'node:crypto';","import { createHash } from 'node:crypto';\nimport { gunzipSync } from 'node:zlib';")
s=once(s,"const finalFloor = process.env.BODYFORGE_QA_TOWER_FINAL === '1';","const journalV2 = process.argv.includes('--journal-v2');\nconst finalFloor = journalV2 || process.env.BODYFORGE_QA_TOWER_FINAL === '1';")
h=(a/'flow.stage').read_text(encoding='utf-8-sig')
assert h.strip() and '\x00' not in h
s=once(s,"async function closeOwned() {",h.rstrip()+"\n\nasync function closeOwned() {")
s=once(s,"  const build=await resolveBuild();\n  ws=await ownChrome();","  const build=await resolveBuild();\n  if(journalV2&&!build.entry)throw infra('Keyed v2 game flow requires a pinned production preview');\n  ws=await ownChrome();")
s=once(s,"  assert(await installFixture(build.pose),'synthetic pose stream installed in actual lazy module');","""  if(journalV2) {
    await until("!document.querySelector('[data-storage-status]')",'clean profile before QA preparation',30000);
    assert(await ev('('+prepareQaV2.toString()+')()'),'owned empty v1 database prepared with keyed v2 layout');
    const prepared=await readPhysicalV2();
    assert(prepared.marker.revision===0&&prepared.rows.length===0,'v2 fixture starts without fabricated workout evidence');
  }
  assert(await installFixture(build.pose),'synthetic pose stream installed in actual lazy module');""")
s=once(s,"    await ev('window.__bfPose.used=0');\n    await click('#challenge button.primary-button');","    const beforeSecond=journalV2?await readPair():null;\n    await ev('window.__bfPose.used=0');\n    await click('#challenge button.primary-button');")
s=once(s,"    'ordinary retry records only the award it actually paid');","    'ordinary retry records only the award it actually paid');\n    if(journalV2)await replayAfterWalletRollback(beforeSecond,next);")
s=once(s,"  assert(browserErrors.length===0,'no uncaught browser exceptions');","  if(journalV2)await verifyV2BackupAndRestore();\n  assert(browserErrors.length===0,'no uncaught browser exceptions');")
new=s.encode('utf-8')
with (a/'tower20-e2e.mjs.before').open('xb') as f:f.write(old)
assert (root/p).read_bytes()==old
(root/p).write_bytes(new)
assert hashfile(root/p)==sha(new)
owned={p:sha(new)}
(a/'owned.json').write_text(json.dumps(owned,indent=2),encoding='utf-8')
print('PATCH',p,len(new),sha(new),flush=True)
d=Path(tempfile.mkdtemp(prefix='bodyforge-isolated-qa-')).resolve()
assert not d.is_relative_to(root.resolve()) and d.parent==Path(tempfile.gettempdir()).resolve()
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0')
files+=['index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json']
rows=[];seen=set()
for name in sorted(set(filter(None,files))):
 src=root/name;rel=Path(name)
 assert not rel.is_absolute() and '..' not in rel.parts and name.casefold() not in seen,name
 seen.add(name.casefold())
 assert src.is_file() and not src.is_symlink() and not getattr(src.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT,name
 assert not any(x.startswith('.env') or x in ('.npmrc','.yarnrc') for x in rel.parts),name
 assert src.suffix.lower() not in ('.key','.pem','.p12','.pfx','.jks','.keystore','.apk','.aab'),name
 rows.append(dict(path=name,bytes=src.stat().st_size,sha256=hashfile(src)))
assert all(next(x for x in rows if x['path']==name)['sha256']==h for name,h in owned.items())
for row in rows:
 target=d/row['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/row['path'],target)
 assert hashfile(target)==row['sha256'],row['path']
for row in rows:assert hashfile(root/row['path'])==row['sha256'],row['path']
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==head
for name,content in [('source.json',json.dumps(rows,indent=2)),('head.txt',head+'\n'),('isolated-root.txt',str(d))]:
 with (a/name).open('x',encoding='utf-8') as out:out.write(content)
print('SNAPSHOT',len(rows),hashfile(a/'source.json'),flush=True)
# reuse the previously successful isolated verifier, adding a new gate before
# the general mobile run. No deployment, no change to application files.
verify=(root/'docs/audits/BF_107_KEYED_V2_20261127/verify.ps1').read_text(encoding='utf-8-sig')
verify=once(verify,'BF_107_KEYED_V2_20261127','BF_107_V2_GAME_FLOW_20261127')
verify=once(verify,"bundle='NOT_RUN';mobile='NOT_RUN';","bundle='NOT_RUN';towerV2='NOT_RUN';mobile='NOT_RUN';")
verify=once(verify," $g.mobile=Gate 'MOBILE' 'mobile.log' @('qa/mobile-e2e.mjs')",""" $env:BODYFORGE_QA_ARTIFACT_DIR=Join-Path $a 'tower-browser'
 $g.towerV2=Gate 'KEYED_V2_GAME_FLOW' 'tower-v2.log' @('qa/tower20-e2e.mjs','--journal-v2')
 if($g.towerV2 -ne 0){throw 'Keyed v2 game flow failed'}
 $env:BODYFORGE_QA_ARTIFACT_DIR=Join-Path $a 'browser'
 $g.mobile=Gate 'MOBILE' 'mobile.log' @('qa/mobile-e2e.mjs')""")
with (a/'verify.ps1').open('x',encoding='utf-8',newline='\n') as f:f.write(verify)
