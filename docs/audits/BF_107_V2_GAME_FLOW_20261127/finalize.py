from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re,struct,os,tempfile
root=Path.cwd();a=root/'docs/audits/BF_107_V2_GAME_FLOW_20261127'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return p.read_text(encoding='utf-8-sig')
def load(p):return json.loads(read(p))
def create(p,s):
 with p.open('x',encoding='utf-8',newline='\n') as f:f.write(s)
def verify(folder,rows):
 seen=set()
 for row in rows:
  rel=Path(row['path']);key=row['path'].casefold()
  assert not rel.is_absolute() and '..' not in rel.parts and key not in seen,row
  seen.add(key);p=folder/rel
  assert p.is_file() and not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT,p
  assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'].lower(),row['path']
g=load(a/'gates.json')
assert all(g[k]==0 for k in ['unit','tsc','build','bundle','journal','towerV2','mobile','privacy'])
assert g['preview']==200 and g['frozenSourceAndBuildUnchanged'] and g['previewStopped'] and g['devStopped']
source=load(a/'source.json');build=load(a/'build-manifest.json');owned=load(a/'owned.json')
assert len(source)==g['sourceCount']==358 and len(build)==g['buildCount'] and set(owned)=={'qa/tower20-e2e.mjs'}
assert sha(a/'source.json').upper()==g['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
copy=Path(read(a/'isolated-root.txt').strip()).resolve()
assert copy.parent==Path(tempfile.gettempdir()).resolve() and copy.name.startswith('bodyforge-isolated-qa-') and not copy.is_relative_to(root.resolve())
verify(copy,source);verify(copy/'dist',build)
smap={x['path']:x['sha256'] for x in source}
assert all(smap[p]==h for p,h in owned.items())
assert sha(a/'tower20-e2e.mjs.before')=='de277f5dfd1fd13d4a9ff066e0c1cb501d8b235bb3086a3c97796183876cc3c5'
for tool in g['tools']:assert sha(root/tool['path']).upper()==tool['hash']
assert '1186 passed (1186)' in read(a/'unit.log') and '111 passed (111)' in read(a/'unit.log')
journal=read(a/'journal.log');tower=read(a/'tower-v2.log')
assert 'BODYFORGE_DURABLE_JOURNAL_PASS {"assertions":110' in journal and 'QA_OWNED_CLEANUP PASS' in journal
assert 'BODYFORGE_TOWER_20REPS_E2E_PASS assertions=77' in tower and 'QA_OWNED_CLEANUP PASS' in tower
assert not any(x in tower for x in ['BROWSER_EXCEPTION','QA_CLEANUP_ERROR','QA_OWNED_CLEANUP FAIL','BODYFORGE_TOWER_20REPS_E2E_FAIL'])
flow=json.loads(re.search(r'^BODYFORGE_KEYED_V2_GAME_FLOW_PASS (.+)$',tower,re.M)[1])
assert flow=={'rows':2,'packed':1,'revision':6,'xp':360,'coins':120,'workouts':2}
for line in ['normal completion writes a real packed settled checkpoint in production v2',
 'automatic replay restores exact primary and backup bytes once',
 'replay never rewrites settled packed bytes or revision',
 'actual downloaded backup contains exact logical originals, independently decoded from physical records',
 'restart and explicit rollback restore exact original pair and journal',
 'confirmed gzip replacement survives reload without extra rewards',
 'finalized replacement preserves packed journal and activates only the confirmed profile epoch']:
 assert 'PASS '+line in tower,line
buildObs=json.loads(re.search(r'^QA_BUILD (.+)$',tower,re.M)[1])
assert buildObs['mode']=='preview' and buildObs['entrySha256']==g['entrySha256']
assert sha(copy/'dist'/buildObs['pose'].lstrip('/'))==buildObs['poseSha256']
assert 'BODYFORGE_MOBILE_E2E_PASS' in read(a/'mobile.log') and 'QA_CHROME_PROFILE_CLEANUP_FAIL' not in read(a/'mobile.log')
assert 'BODYFORGE_PRIVATE_DEV_PATHS_PASS=12' in read(a/'privacy.log')
bundle=json.loads(re.search(r'BODYFORGE_BUNDLE_ON_DEMAND_PASS (\{[^\r\n]+\})',read(a/'bundle.log'))[1])
assert bundle['entryBytes']==g['entryBytes']==383784 and bundle['baselineEntryBytes']==496761
assert g['entryBytes']<bundle['baselineEntryBytes']*.8 and sha(copy/'dist'/g['entry'])==g['entrySha256']
counts={n:sum(line.startswith('PASS ') for line in read(a/n).splitlines()) for n in ['journal.log','tower-v2.log','mobile.log','privacy.log']}
assert counts['journal.log']==110 and counts['tower-v2.log']==77 and counts['privacy.log']==13
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0'))-{''}
changed=[p for p,h in sorted(smap.items()) if not (root/p).is_file() or sha(root/p)!=h]
new=sorted(actual-set(smap))
owned_matches=all((root/p).is_file() and sha(root/p)==h for p,h in owned.items())
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check','--',*owned.keys()],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
syntax=subprocess.run(['node','--check','qa/tower20-e2e.mjs'],capture_output=True,text=True)
assert owned_matches and diff.returncode==canon.returncode==syntax.returncode==0
screens=[]
for p in sorted(a.rglob('*.png')):
 with p.open('rb') as f:header=f.read(24)
 assert header[:8]==b'\x89PNG\r\n\x1a\n' and header[12:16]==b'IHDR'
 w,h=struct.unpack('>II',header[16:24]);assert w>0 and h>0
 screens.append(dict(path=p.relative_to(a).as_posix(),bytes=p.stat().st_size,sha256=sha(p),width=w,height=h))
link=copy/'node_modules';deps=root/'node_modules'
attrs=getattr(link.lstat(),'st_file_attributes',0)
assert attrs&stat.FILE_ATTRIBUTE_REPARSE_POINT and link.resolve()==deps.resolve()
os.rmdir(link)
assert not os.path.lexists(link) and deps.is_dir()
for tool in g['tools']:assert sha(root/tool['path']).upper()==tool['hash']
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
rb=dict(head=head,frozenHead=g['head'],observed=datetime.datetime.now().astimezone().isoformat(),
 sourceCount=len(source),buildCount=len(build),sourceManifestSha256=sha(a/'source.json'),buildManifestSha256=sha(a/'build-manifest.json'),
 ownedHashesMatch=owned_matches,liveChangedPaths=changed,liveNewPaths=new,ownedDiffCheck=diff.returncode,canon=canon.returncode,qaSyntax=syntax.returncode,
 passLines=counts,gameFlow=flow,bundle=bundle,entrySha256=g['entrySha256'],screenshots=screens,
 isolatedDependencyJunctionRemoved=True,acceptance='TESTED_LOCAL',ownerActivation='NOT_RUN')
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-107 - keyed v2 production game flow','',
 'Status: IMPLEMENTED / TESTED_LOCAL for new opt-in browser acceptance scenario. No production business-logic change in this step; the existing v2 facade is exercised through the actual hashed application bundle.',
 f"Frozen HEAD {g['head']}; current HEAD {head}; observed {rb['observed']}.",
 'Scope: qa/tower20-e2e.mjs --journal-v2; the mode requires a pinned production preview and uses the existing finite timestamp-paced synthetic squat fixture. New disposable Chrome profile only, no owner save, camera or Downloads. The harness explicitly prepares an empty v1 database with native v2 metadata (not the production activation API); actual preparation API remains covered by separate native journal QA. Uses the existing final-floor fixture with prior four floors seeded, not a proof of playing those floors.',
 f"TypeScript, full Vitest 1186/1186 in 111 files, build and bundle exit 0. Native IndexedDB {counts['journal.log']} checks; new production v2 game flow {counts['tower-v2.log']} checks. Tower finish + ordinary finish use real app counter, rewards, journal and renderer. A partial stopped attempt earns nothing. Ordinary settlement creates a real compact record under the original key.",
 'Simulated wallet rollback restores the pre-workout primary and fallback at reload, preserving the settled IndexedDB. Startup replays once and restores exact post-workout primary/fallback bytes; packed bytes and revision unchanged. This is a controlled browser data-loss fixture, not a physical power-loss measurement.',
 'UI backup uses real prepare and second-click download, intercepting only the disposable Blob. Independent Node gzip decoder and SHA-256 verify each logical original; v1 backup schema contains exact originals. Selected file preview/cancel preserve pair and physical journal. A nickname-only synthetic file replacement is explicitly staged, reloaded and rolled back; a second gzip replacement is explicitly kept, reloaded and checked with exact paid IDs and unchanged physical journal. No new reward on import. Profile epoch changes only on explicit keep.',
 f"Final synthetic sample: {flow['workouts']} workouts, {flow['xp']} XP, {flow['coins']} coins, {flow['rows']} durable records including {flow['packed']} compressed, revision {flow['revision']}.",
 f"Production mobile {counts['mobile.log']} and privacy {counts['privacy.log']} PASS lines. Preview HTTP 200; entry and pose digests verified. Entry {bundle['entryBytes']} bytes vs {bundle['baselineEntryBytes']}, {bundle['entryReductionPercent']}% reduction. Existing large chunk warning remains. No field pose accuracy or physical Android claim.",
 f"Verified {len(source)} frozen source paths, {len(build)} build paths, {len(screens)} PNG signatures/dimensions/hashes (not independent visual review). Owned QA file matches workspace. Other live drift: {len(changed)} changed, {len(new)} new paths; see final-readback.json. Both owned servers stopped and dependency junction removed; shared dependencies unchanged.",
 f"Diff check={diff.returncode}; canon={canon.returncode}; QA syntax={syntax.returncode}.",
 'Remaining: physical-device storage pressure, performance, lifecycle and actual activation/recovery acceptance; roadmap not complete. No APK, Firebase, Git commit or push, no owner DB activation. Source-only rollback: restore only qa/tower20-e2e.mjs from exact .before after verifying its current SHA-256; preserve other work.',
 'Commands: node --check; tsc -b; native durable-journal-e2e.mjs; full Vitest threads; vite build; bundle gate; production tower20-e2e.mjs --journal-v2; production mobile/privacy; verify_canon.py.','',
 'Owned path | bytes | SHA-256',*[f'{p} | {(root/p).stat().st_size} | {h}' for p,h in owned.items()],'',
 'Reference: https://www.w3.org/TR/IndexedDB/ (transaction and upgrade scheduling).']
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];seen=set()
secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
 assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
 if not p.is_file():continue
 rel=p.relative_to(a).as_posix();key=rel.casefold()
 assert key not in seen and '..' not in Path(rel).parts;seen.add(key)
 if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.ts','.mjs','.before','.stage','.ps1'):
  assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential pattern '+rel
 items.append(dict(path=rel,bytes=p.stat().st_size,sha256=sha(p)))
mf=a/'artifact-manifest.json';create(mf,json.dumps(items,indent=2)+'\n');verify(a,load(mf))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),mf.stat().st_size,sha(mf))
print('SUMMARY',json.dumps({k:v for k,v in rb.items() if k not in ['screenshots']},ensure_ascii=True))
