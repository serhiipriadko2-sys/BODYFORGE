from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re,struct,os,tempfile
root=Path.cwd();a=root/'docs/audits/BF_107_LARGE_HISTORY_READBACK_20261125'
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
g=load(a/'gates.json');r=load(a/'retry-gates.json')
assert all(g[k]==0 for k in ['unit','tsc','build','bundle','journal','privacy'])
assert g['mobile']==12 and g['error']=='Acceptance gate failed' and g['frozenSourceAndBuildUnchanged'] and g['previewStopped'] and g['devStopped']
assert 'Page.captureScreenshot timeout' in read(a/'mobile.log')
assert 'PASS solo tower shown on its own tab' in read(a/'mobile.log')
assert 'QA_CHROME_PROFILE_CLEANUP_FAIL' in read(a/'mobile.log')
source=load(a/'source.json');build=load(a/'build-manifest.json');owned=load(a/'owned.json')
assert len(source)==g['sourceCount']==349 and len(build)==g['buildCount']==74 and len(owned)==2
assert sha(a/'source.json').upper()==g['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
copy=Path(read(a/'isolated-root.txt').strip()).resolve()
assert copy.parent==Path(tempfile.gettempdir()).resolve() and copy.name.startswith('bodyforge-isolated-qa-') and not copy.is_relative_to(root.resolve())
verify(copy,source);verify(copy/'dist',build)
smap={x['path']:x['sha256'] for x in source}
assert all(smap[p]==h for p,h in owned.items())
for tool in g['tools']:assert sha(root/tool['path']).upper()==tool['hash']
assert '1167 passed (1167)' in read(a/'unit.log') and '109 passed (109)' in read(a/'unit.log')
assert 'BODYFORGE_DURABLE_JOURNAL_PASS' in read(a/'journal.log') and 'QA_OWNED_CLEANUP PASS' in read(a/'journal.log')
assert 'BODYFORGE_PRIVATE_DEV_PATHS_PASS=12' in read(a/'privacy.log')
sample=json.loads(re.search(r'^LARGE_JOURNAL_PAGES (.+)$',read(a/'journal.log'),re.M)[1])
assert all(sample[k] is True for k in ['stage','pageBound','full','fullPages','retained','damage','cancel','noPartial'])
assert sample['count']==4105 and sample['pages']==129 and sample['maxPage']==32 and sample['logicalBaselineBytes']==19501560
bundle=json.loads(re.search(r'BODYFORGE_BUNDLE_ON_DEMAND_PASS (\{[^\r\n]+\})',read(a/'bundle.log'))[1])
assert bundle['entryBytes']==g['entryBytes']==394853 and bundle['baselineEntryBytes']==496761
assert g['entryBytes']<bundle['baselineEntryBytes']*0.8
assert sha(copy/'dist'/g['entry'])==g['entrySha256']
retry=read(a/'mobile-retry.log') if (a/'mobile-retry.log').is_file() else ''
retry_ok=(r['mobile']==0 and r.get('preview')==200 and r.get('previewStopped') and r.get('frozenSourceAndBuildUnchanged') and
 'BODYFORGE_MOBILE_E2E_PASS' in retry and 'QA_CHROME_PROFILE_CLEANUP_FAIL' not in retry and 'QA_CHROME_CLOSE_UNCONFIRMED' not in retry)
counts={n:sum(line.startswith('PASS ') for line in read(a/n).splitlines()) for n in ['journal.log','mobile.log','privacy.log']}
counts['mobile-retry.log']=sum(line.startswith('PASS ') for line in retry.splitlines())
assert counts['journal.log']==77 and counts['privacy.log']==13
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
# Original failed run's exact QA temp profile may remain. Do not access user
# browser profiles or kill processes; only check existence of this named folder.
first_profile=Path(tempfile.gettempdir())/'bf-mobile-Y8Addl'
first_profile_remaining=first_profile.exists()
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
status='TESTED_LOCAL_WITH_HARNESS_RETRY' if retry_ok else 'BLOCKED_MOBILE_ACCEPTANCE'
rb=dict(head=head,observed=datetime.datetime.now().astimezone().isoformat(),sourceCount=len(source),buildCount=len(build),
 sourceManifestSha256=sha(a/'source.json'),buildManifestSha256=sha(a/'build-manifest.json'),ownedHashesMatch=owned_matches,
 liveChangedPaths=changed,liveNewPaths=new,ownedDiffCheck=diff.returncode,canon=canon.returncode,qaSyntax=syntax.returncode,
 passLines=counts,largeHistory=sample,bundle=bundle,entrySha256=g['entrySha256'],screenshots=screens,
 isolatedDependencyJunctionRemoved=True,firstProfileRemaining=first_profile_remaining,acceptance=status,retryPassed=bool(retry_ok))
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-107 - bounded paged readback of existing durable history','',
 'Status: IMPLEMENTED / '+status+'. Existing journal v1 remains the production authority. Compact candidate caps are unchanged; no production v2 activation or migration.',
 f"HEAD {head}; observed {rb['observed']}.",
 'Decision: replace unbounded getAll readback with sequential pages of at most 32 physical rows in one readonly transaction. Exclusive lowerBound on last validated key, no offset/truncation; every row validated even for a selected acknowledgement. Preserve all original values and order. Readback retains only requested results; full history API still materializes all logical rows. Abort/timeout/invalid page returns unavailable and no partial entries, not proof of zero prior writes. No schema, wallet, existing record format or retention deletion change.',
 'Bounds: maximum 32 cloned records per request, not a strict byte/memory bound, and no arbitrary total row limit. Existing 5s total read timeout unchanged. This does not solve full-history memory cost or candidate 16 MiB / 4096 limits.',
 f"Native journal 77/77 checks. Synthetic existing history {sample['count']} rows; {sample['logicalBaselineBytes']} UTF-8 baseline bytes (not disk usage); new stage exact, 129 bounded pages, max 32 rows, measured {sample['elapsedMs']} ms on local machine; complete read restores all originals. Last-page unknown schema prevents acknowledgement and partial read; cancellation after commit yields unavailable and retry preserves first baseline; later page failure returns no partial result.",
 f"TypeScript/build/bundle exit 0; full Vitest 1167/1167 in 109 files. Initial entry {bundle['entryBytes']} bytes, baseline {bundle['baselineEntryBytes']}, reduction {bundle['entryReductionPercent']}%, gate PASS; existing large chunk warning remains. Privacy 13 PASS lines (12 denied paths plus app HTTP).",
 f"First production mobile run exit 12 after {counts['mobile.log']} PASS lines. Tower DOM/layout check passed; Page.captureScreenshot timed out and disposable Chrome profile removal failed EPERM. This is an incomplete harness run, not proof of an application defect or full PASS. First run log retained. Exact source/build preserved, servers stopped.",
 f"One bounded repeat on identical hashed build: exit={r['mobile']}; {counts['mobile-retry.log']} PASS lines; verified retry pass={bool(retry_ok)}. Original failed run remains evidence. First temporary profile still exists={first_profile_remaining}; no claim that original cleanup succeeded. No owner browser read or process termination.",
 f"Verified {len(source)} source paths, {len(build)} build paths, {len(screens)} PNG headers and hashes; no independent visual review. Owned files match; live drift {len(changed)} changed and {len(new)} new paths. See final-readback.json. Exact dependency junction removed without modifying shared dependencies.",
 f"Diff check={diff.returncode}; canon={canon.returncode}; QA syntax={syntax.returncode}.",
 'Remaining: scalable compact integration and versioned authority/recovery, large history full materialization limits and real device/storage pressure tests. Browser storage quota is not guaranteed; no owner profile accessed or modified. No APK, Firebase, Git commit or push.',
 'Rollback: restore only the two owned files from .before copies after confirming their exact hashes. Preserve all parallel changes.',
 'Commands: tsc -b; qa/durable-journal-e2e.mjs; full Vitest threads; vite build; qa/bundle-on-demand.mjs; production mobile E2E (initial + one same-build retry); privacy E2E; verify_canon.py.','',
 'Owned paths | bytes | SHA-256',*[f'{p} | {(root/p).stat().st_size} | {h}' for p,h in owned.items()],'',
 'References: https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getAll ; https://developer.mozilla.org/en-US/docs/Web/API/IDBKeyRange/lowerBound']
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];seen=set()
secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
 assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
 if not p.is_file():continue
 rel=p.relative_to(a).as_posix();key=rel.casefold()
 assert key not in seen and '..' not in Path(rel).parts;seen.add(key)
 if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.ts','.mjs','.before'):
  assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential pattern '+rel
 items.append(dict(path=rel,bytes=p.stat().st_size,sha256=sha(p)))
mf=a/'artifact-manifest.json';create(mf,json.dumps(items,indent=2)+'\n')
verify(a,load(mf))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),mf.stat().st_size,sha(mf))
print('SUMMARY',json.dumps({k:v for k,v in rb.items() if k not in ['screenshots']},ensure_ascii=True))