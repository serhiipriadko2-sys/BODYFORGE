from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re,struct,os,tempfile
root=Path.cwd();a=root/'docs/audits/BF_107_ENTRY_BUDGET_20261125'
copy=root/'.bodyforge-qa/bf107-entry-budget'
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
  assert p.is_file() and not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
  assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'].lower(),row['path']
g=load(a/'gates.json');r=load(a/'remaining-gates.json')
assert all(g[k]==0 for k in ['unit','tsc','build','bundle','appearanceLazy'])
assert g['error']=='HTTP unavailable' and g['journal']=='NOT_RUN' and g['previewStopped'] and g['devStopped']
assert all(r[k]==0 for k in ['journal','appearancePreferences','mobile','privacy'])
assert r['frozenSourceAndBuildUnchanged'] and r['previewStopped'] and r['devStopped'] and r['preview']==200
assert r['privateQaPaths']=='NOT_RUN'
assert 'outside of Vite serving allow list' in read(a/'dev-err.log')
source=load(a/'source.json');build=load(a/'build-manifest.json');owned=load(a/'owned.json')
assert len(source)==g['sourceCount']==349 and len(build)==g['buildCount']==74 and len(owned)==5
assert sha(a/'source.json').upper()==g['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
devroot=Path(read(a/'isolated-dev-root.txt').strip()).resolve()
assert devroot.parent==Path(tempfile.gettempdir()).resolve() and devroot.name.startswith('bodyforge-isolated-qa-')
assert not devroot.is_relative_to(root.resolve())
verify(copy,source);verify(devroot,source);verify(copy/'dist',build)
smap={x['path']:x['sha256'] for x in source}
assert all(smap[p]==h for p,h in owned.items())
for tool in g['tools']:assert sha(root/tool['path']).upper()==tool['hash']
assert '1167 passed (1167)' in read(a/'unit.log') and '109 passed (109)' in read(a/'unit.log')
assert 'BODYFORGE_APPEARANCE_LAZY_PASS assertions=13' in read(a/'appearance-lazy.log')
assert 'QA_OWNED_CLEANUP PASS' in read(a/'appearance-lazy.log')
assert 'BODYFORGE_DURABLE_JOURNAL_PASS' in read(a/'journal.log') and 'QA_OWNED_CLEANUP PASS' in read(a/'journal.log')
assert 'BODYFORGE_PREFERENCE_DRAFT_E2E_PASS assertions=18' in read(a/'appearance-preferences.log')
assert 'BODYFORGE_MOBILE_E2E_PASS' in read(a/'mobile.log')
assert 'BODYFORGE_PRIVATE_DEV_PATHS_PASS=12' in read(a/'privacy.log')
assert 'QA_PROFILE_CLEANUP_INCOMPLETE' not in read(a/'appearance-preferences.log')
assert 'QA_CHROME_PROFILE_CLEANUP_FAIL' not in read(a/'mobile.log')
bundle=json.loads(re.search(r'BODYFORGE_BUNDLE_ON_DEMAND_PASS (\{[^\r\n]+\})',read(a/'bundle.log'))[1])
assert bundle['entryBytes']==g['entryBytes']==394581 and bundle['baselineEntryBytes']==496761
assert g['entryBytes']<bundle['baselineEntryBytes']*0.8
assert sha(copy/'dist'/g['entry'])==g['entrySha256']
assert len([x for x in build if re.fullmatch(r'assets/AppearanceDialogContent-[\w-]+\.js',x['path'])])==1
counts={n:sum(line.startswith('PASS ') for line in read(a/n).splitlines()) for n in ['appearance-lazy.log','journal.log','appearance-preferences.log','mobile.log','privacy.log']}
assert counts['appearance-lazy.log']==13 and counts['journal.log']==69 and counts['appearance-preferences.log']==18 and counts['privacy.log']==13
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0'))-{''}
changed=[p for p,h in sorted(smap.items()) if not (root/p).is_file() or sha(root/p)!=h]
new=sorted(actual-set(smap))
owned_matches=all((root/p).is_file() and sha(root/p)==h for p,h in owned.items())
v1_matches=sha(root/'src/lib/durableJournal.ts')==smap['src/lib/durableJournal.ts']
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check','--',*owned.keys()],capture_output=True,text=True)
cached=subprocess.run(['git','-c','core.safecrlf=false','diff','--cached','--check','--',*owned.keys()],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
syntax={f:subprocess.run(['node','--check',f],capture_output=True,text=True).returncode for f in owned if f.endswith('.mjs')}
assert diff.returncode==cached.returncode==canon.returncode==0 and all(x==0 for x in syntax.values())
assert owned_matches and v1_matches
screens=[]
for p in sorted(a.rglob('*.png')):
 with p.open('rb') as f:header=f.read(24)
 assert header[:8]==b'\x89PNG\r\n\x1a\n' and header[12:16]==b'IHDR'
 w,h=struct.unpack('>II',header[16:24]);assert w>0 and h>0
 screens.append(dict(path=p.relative_to(a).as_posix(),bytes=p.stat().st_size,sha256=sha(p),width=w,height=h))
# Remove only the exact owned dependency junction; do not delete the actual dependency tree or test evidence.
link=devroot/'node_modules';deps=root/'node_modules'
attrs=getattr(link.lstat(),'st_file_attributes',0)
assert attrs&stat.FILE_ATTRIBUTE_REPARSE_POINT and link.resolve()==deps.resolve()
os.rmdir(link)
assert not os.path.lexists(link) and deps.is_dir()
for tool in g['tools']:assert sha(root/tool['path']).upper()==tool['hash']
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
rb=dict(head=head,observed=datetime.datetime.now().astimezone().isoformat(),sourceCount=len(source),buildCount=len(build),
 sourceManifestSha256=sha(a/'source.json'),buildManifestSha256=sha(a/'build-manifest.json'),
 ownedHashesMatch=owned_matches,v1SourceMatches=v1_matches,liveChangedPaths=changed,liveNewPaths=new,
 ownedDiffCheck=diff.returncode,ownedCachedDiffCheck=cached.returncode,canon=canon.returncode,qaSyntax=syntax,passLines=counts,
 bundle=bundle,entrySha256=g['entrySha256'],screenshots=screens,isolatedDependencyJunctionRemoved=True,
 acceptance='TESTED_LOCAL',privateQaPaths='NOT_RUN',toolchainVersion=g['viteVersion'])
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-107 - restore initial entry budget using on-demand appearance editor','',
 'Status: IMPLEMENTED / TESTED_LOCAL for entry-budget repair and bounded regression. Actual journal migration, production activation, physical-device acceptance, Vite security upgrade integration and release remain separate.',
 f"HEAD {head}; observed {rb['observed']}.",
 'Decision: keep appearance state, startup application, persistence, cross-tab handling, trigger and native modal shell in AppearancePanel. Move editor controls to AppearanceDialogContent loaded only on user intent. Preserve existing settings, validation and actions. Explicit loading and caught failure; a late download never reopens a closed dialog. No change to reward logic, v1 journal or owner data. Added actual network-interception test and extended existing bundle gate; original 20% requirement unchanged.',
 f"Entry {g['entryBytes']} bytes, baseline {bundle['baselineEntryBytes']}, reduction {bundle['entryReductionPercent']}%; previous measured failed build 398302 bytes (different snapshot). Gzip {bundle['entryGzipBytes']} bytes. Editor chunk not preloaded; dynamic import reference and actual first-click request verified. Initial entry digest {g['entrySha256']}. Existing >500 kB chunk warning remains.",
 f"TypeScript/build/bundle exit 0; full Vitest 1167/1167 in 109 files; new appearance lazy {counts['appearance-lazy.log']} checks. New test uses production preview with exact entry digest, seeded synthetic preference, withheld editor request, close during load, successful late load, reopening, persisted choice, focus return, failed module request and exact game storage preservation. No uncaught exception.",
 f"Native IndexedDB {counts['journal.log']} PASS lines; targeted preference-draft {counts['appearance-preferences.log']}; production mobile {counts['mobile.log']}; privacy {counts['privacy.log']} (12 paths denied plus app). Both owned servers stopped. No physical Android or live camera accuracy claim. Full standalone appearance visual suite and separate private-QA-path suite not run in this step.",
 'First isolated dev startup was denied by the new Vite private .bodyforge-qa filesystem rule. Corrected test infrastructure by copying exact 349 frozen inputs into a newly owned OS temporary directory, with original Vite deny config unchanged and loopback-only explicit source/dependency allow scope. All remaining gates then passed. The temporary dependency junction was removed without touching shared dependencies; the temporary source copy is retained as evidence.',
 f"Verified {len(source)} source files, {len(build)} build files, {len(screens)} PNG signatures and hashes; no independent visual review claimed. Toolchain Vite {g['viteVersion']} (current installed root dependencies, not proposed security update). Current owned hashes match={owned_matches}; v1 source matches={v1_matches}; live drift {len(changed)} changed and {len(new)} new paths. Exact paths in final-readback.json.",
 f"Diff check={diff.returncode}; staged owned diff check={cached.returncode}; canon={canon.returncode}; QA syntax={syntax}.",
 'Remaining: safe bounded production storage integration/retention, actual authority handoff and recovery, large history and quota/device tests, security dependency update and other roadmap phases. Do not treat this receipt as general commercial readiness. No owner database migration, APK, Firebase, Git commit or push.',
 'Rollback: restore only three original files from .before copies after confirming owned hashes; remove only unchanged newly added AppearanceDialogContent.tsx and appearance-lazy-e2e.mjs. Preserve concurrent work.',
 'Commands: tsc -b; vite build; qa/bundle-on-demand.mjs; production qa/appearance-lazy-e2e.mjs; full Vitest threads; native qa/durable-journal-e2e.mjs; qa/appearance-e2e.mjs --preferences-only; production mobile/privacy E2E; verify_canon.py.','',
 'Owned paths | bytes (frozen) | SHA-256',*[f'{p} | {(copy/p).stat().st_size} | {h}' for p,h in owned.items()],'',
 'References: https://react.dev/reference/react/lazy ; https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal']
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];seen=set()
secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
 assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
 if not p.is_file():continue
 rel=p.relative_to(a).as_posix();key=rel.casefold()
 assert key not in seen and '..' not in Path(rel).parts;seen.add(key)
 if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.tsx','.ts','.mjs','.before'):
  assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential pattern '+rel
 items.append(dict(path=rel,bytes=p.stat().st_size,sha256=sha(p)))
mf=a/'artifact-manifest.json';create(mf,json.dumps(items,indent=2)+'\n')
verify(a,load(mf))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),mf.stat().st_size,sha(mf))
print('SUMMARY',json.dumps({k:v for k,v in rb.items() if k not in ['screenshots']},ensure_ascii=True))