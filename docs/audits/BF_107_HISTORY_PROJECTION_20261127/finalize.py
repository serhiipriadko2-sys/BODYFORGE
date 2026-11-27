from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re,struct,os,tempfile
root=Path.cwd();a=root/'docs/audits/BF_107_HISTORY_PROJECTION_20261127'
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
g=load(a/'gates.json');prior=load(a/'gates.json.initial')
assert all(g[k]==0 for k in ['focused','unit','tsc','build','bundle','journal','mobile','privacy'])
assert g['preview']==200 and g['frozenSourceAndBuildUnchanged'] and g['previewStopped'] and g['devStopped']
assert g['priorTsc']==prior['tsc']==2 and prior['journal']=='NOT_RUN'
assert 'TS2448' in read(a/'tsc.log.initial') and 'TS6133' in read(a/'tsc.log.initial')
assert sha(a/'source.json.initial').upper()==prior['sourceManifestSha256']
source=load(a/'source.json');build=load(a/'build-manifest.json');owned=load(a/'owned.json')
assert len(source)==g['sourceCount']==352 and len(build)==g['buildCount']==74 and len(owned)==4
assert sha(a/'source.json').upper()==g['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
copy=Path(read(a/'isolated-root.txt').strip()).resolve()
assert copy.parent==Path(tempfile.gettempdir()).resolve() and copy.name.startswith('bodyforge-isolated-qa-') and not copy.is_relative_to(root.resolve())
verify(copy,source);verify(copy/'dist',build)
smap={x['path']:x['sha256'] for x in source}
assert all(smap[p]==h for p,h in owned.items())
for tool in g['tools']:assert sha(root/tool['path']).upper()==tool['hash']
assert '20 passed (20)' in read(a/'focused.log')
assert '1171 passed (1171)' in read(a/'unit.log') and '110 passed (110)' in read(a/'unit.log')
assert 'BODYFORGE_DURABLE_JOURNAL_PASS {"assertions":85' in read(a/'journal.log') and 'QA_OWNED_CLEANUP PASS' in read(a/'journal.log')
assert 'BODYFORGE_MOBILE_E2E_PASS' in read(a/'mobile.log') and 'QA_CHROME_PROFILE_CLEANUP_FAIL' not in read(a/'mobile.log')
assert 'BODYFORGE_PRIVATE_DEV_PATHS_PASS=12' in read(a/'privacy.log')
sample=json.loads(re.search(r'^LARGE_JOURNAL_PAGES (.+)$',read(a/'journal.log'),re.M)[1])
projection=json.loads(re.search(r'^ACTIVITY_RECEIPT_PROJECTION (.+)$',read(a/'journal.log'),re.M)[1])
assert all(sample[k] is True for k in ['stage','pageBound','full','fullPages','retained','damage','cancel','noPartial','slim','slimPages','slimCancel','slimQuarantine'])
assert sample['count']==4105 and sample['pages']==129 and sample['maxPage']==32 and sample['logicalBaselineBytes']==19501560
assert sample['fullJsonBytes']==19952627 and sample['receiptJsonBytes']==360131
assert projection=={'complete':True,'exact':True,'noWrites':True,'cancel':True}
bundle=json.loads(re.search(r'BODYFORGE_BUNDLE_ON_DEMAND_PASS (\{[^\r\n]+\})',read(a/'bundle.log'))[1])
assert bundle['entryBytes']==g['entryBytes']==394968 and bundle['baselineEntryBytes']==496761
assert g['entryBytes']<bundle['baselineEntryBytes']*.8
assert sha(copy/'dist'/g['entry'])==g['entrySha256']
counts={n:sum(line.startswith('PASS ') for line in read(a/n).splitlines()) for n in ['journal.log','mobile.log','privacy.log']}
assert counts['journal.log']==85 and counts['privacy.log']==13
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0'))-{''}
changed=[p for p,h in sorted(smap.items()) if not (root/p).is_file() or sha(root/p)!=h]
new=sorted(actual-set(smap))
owned_matches=all((root/p).is_file() and sha(root/p)==h for p,h in owned.items())
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check','--',*owned.keys()],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
syntax=subprocess.run(['node','--check','qa/durable-journal-e2e.mjs'],capture_output=True,text=True)
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
rb=dict(head=head,frozenHead=g['head'],observed=datetime.datetime.now().astimezone().isoformat(),sourceCount=len(source),buildCount=len(build),
 sourceManifestSha256=sha(a/'source.json'),buildManifestSha256=sha(a/'build-manifest.json'),ownedHashesMatch=owned_matches,
 liveChangedPaths=changed,liveNewPaths=new,ownedDiffCheck=diff.returncode,canon=canon.returncode,qaSyntax=syntax.returncode,
 passLines=counts,largeHistory=sample,activityProjection=projection,bundle=bundle,entrySha256=g['entrySha256'],screenshots=screens,
 isolatedDependencyJunctionRemoved=True,acceptance='TESTED_LOCAL')
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-107 - receipt-only activity projection','',
 'Status: IMPLEMENTED / TESTED_LOCAL for production statistics reader. Current journal v1 remains authority. Compact physical storage activation and migration NOT RUN.',
 f"Frozen HEAD {g['head']}; current HEAD {head}; observed {rb['observed']}.",
 'Decision: share the existing paged readonly snapshot scanner using an explicit projection callback. Full recovery/backup reads preserve all original fields; write readback retains requested originals only; activity statistics retain only settled key/raw/state receipt fields. All physical rows, including excluded states, are still validated; cancellation, corruption or an incomplete page yields unavailable and no trusted partial data. Activity caller now forwards its AbortSignal. No schema, wallet, retention deletion, baseline or backup-format change.',
 'The previous native large-history step was TESTED_LOCAL_WITH_HARNESS_RETRY. Previous retry-gates.json reported mobile exit 0, preview 200, source/build unchanged and stopped preview; previous receipt reported 124 passed scenarios. First failed harness run remains recorded.',
 f"Initial TSC exit 2 (local variable shadowed the for-loop value; TS6133/TS2448). Renamed projected variable, retained initial manifests/logs and pre-fix bytes. Corrected TSC, focused 20/20, full Vitest 1171/1171 in 110 files, build and bundle all exit 0.",
 f"Actual IndexedDB {counts['journal.log']} PASS lines (eight additional checks). Synthetic {sample['count']} settled records plus active record; full JSON {sample['fullJsonBytes']} bytes versus receipt-only {sample['receiptJsonBytes']} bytes, {(1-sample['receiptJsonBytes']/sample['fullJsonBytes'])*100:.2f}% reduction in serialized projection. Not a measured heap or disk reduction. 129 pages <=32 rows. All physical originals retained; late-page corruption and cancellation fail closed. Actual readActivityHistory returns same exact complete history as full original reader for 65 paid receipts (5 restored), without profile or journal writes.",
 f"Production mobile {counts['mobile.log']} PASS lines; privacy {counts['privacy.log']} (12 denied paths plus app). Entry {bundle['entryBytes']} bytes vs {bundle['baselineEntryBytes']}, {bundle['entryReductionPercent']}% reduction, mandatory budget PASS. Existing large chunk warning remains. Preview HTTP 200 and exact entry/index hashes; owned dev/preview stopped. Synthetic browser camera, not device/field accuracy.",
 f"Verified {len(source)} frozen source files and {len(build)} build files; {len(screens)} PNG headers, dimensions and hashes (no independent visual review). All four owned paths match current workspace. Other live drift: {len(changed)} changed and {len(new)} new paths, listed in final-readback.json; not included in tested snapshot. The owned temporary dependency junction removed, shared dependencies unchanged.",
 f"Diff check={diff.returncode}; canon={canon.returncode}; QA syntax={syntax.returncode}.",
 'Limitations: getAll still clones each bounded physical page; full backup/recovery retains full originals. No measured memory ceiling, quota, eviction, physical Android test or production v2 authority handoff. No owner data accessed or modified; no APK, Firebase, Git commit or push.',
 'Rollback: verify current owned SHA-256 values and restore only these four files from their original .before copies, leaving concurrent work intact.',
 'Commands: tsc -b (initial failure, corrected pass); focused activityHistory/historyRetention Vitest; native qa/durable-journal-e2e.mjs; full Vitest threads; vite build; bundle gate; production mobile/privacy E2E; verify_canon.py.','',
 'Owned paths | bytes | SHA-256',*[f'{p} | {(root/p).stat().st_size} | {h}' for p,h in owned.items()],'',
 'Reference: https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getAll']
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];seen=set()
secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
 assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
 if not p.is_file():continue
 rel=p.relative_to(a).as_posix();key=rel.casefold()
 assert key not in seen and '..' not in Path(rel).parts;seen.add(key)
 if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.ts','.mjs','.before','.initial','.before-typefix'):
  assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential pattern '+rel
 items.append(dict(path=rel,bytes=p.stat().st_size,sha256=sha(p)))
mf=a/'artifact-manifest.json';create(mf,json.dumps(items,indent=2)+'\n')
verify(a,load(mf))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),mf.stat().st_size,sha(mf))
print('SUMMARY',json.dumps({k:v for k,v in rb.items() if k not in ['screenshots']},ensure_ascii=True))