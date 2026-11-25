from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re,struct
root=Path.cwd();a=root/'docs/audits/BF_107_MIXED_WRITER_20261125'
copy=root/'.bodyforge-qa/bf107-mixed-writer';control=root/'.bodyforge-qa/bf107-mixed-writer-control'
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
g=load(a/'gates.json');d=load(a/'diagnostic-gates.json')
assert all(g[k]==0 for k in ['unit','tsc','build','journal'])
assert g['bundle']==1 and g['mobile']==g['privacy']=='NOT_RUN' and g['devStopped']
assert d['controlBuild']==0 and d['controlBundle']==1 and d['entryEqual'] and d['mobile']==d['privacy']==0
assert d['preview']==200 and d['previewStopped'] and d['frozenSourceAndBuildUnchanged']
source=load(a/'source.json');other=load(a/'control-source.json');build=load(a/'build-manifest.json');owned=load(a/'owned.json')
verify(copy,source);verify(control,other);verify(copy/'dist',build)
assert len(source)==len(other)==g['sourceCount']==345 and len(build)==g['buildCount']==73
assert sha(a/'source.json').upper()==g['sourceManifestSha256']
assert sha(a/'control-source.json').upper()==d['controlSourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
assert {x['path'] for x in source}=={x['path'] for x in other}
smap={x['path']:x['sha256'] for x in source};omap={x['path']:x['sha256'] for x in other}
assert {p for p in smap if smap[p]!=omap[p]}==set(owned)
assert all(smap[p]==h for p,h in owned.items())
entry=copy/'dist'/d['entry'];oldentry=control/'dist'/d['entry']
assert entry.stat().st_size==oldentry.stat().st_size==398302
assert sha(entry)==sha(oldentry)==d['entrySha256']==d['controlEntrySha256']
assert 'Initial bundle regression' in read(a/'bundle.log') and 'Initial bundle regression' in read(a/'control-bundle.log')
assert '1165 passed (1165)' in read(a/'unit.log') and '108 passed (108)' in read(a/'unit.log')
assert '19 passed (19)' in read(a/'focused.log')
assert 'BODYFORGE_DURABLE_JOURNAL_PASS' in read(a/'journal.log')
assert 'PASS native version fence blocks old journal readers and writers without altering records' in read(a/'journal.log')
assert 'QA_OWNED_CLEANUP PASS' in read(a/'journal.log')
sample=json.loads(re.search(r'^MIXED_WRITER_SAMPLE (.+)$',read(a/'journal.log'),re.M)[1])
assert len(sample)==11 and all(v is True for v in sample.values()),sample
assert 'BODYFORGE_MOBILE_E2E_PASS' in read(a/'mobile.log')
assert 'BODYFORGE_PRIVATE_DEV_PATHS_PASS=12' in read(a/'privacy.log')
counts={n:sum(line.startswith('PASS ') for line in read(a/n).splitlines()) for n in ['journal.log','mobile.log','privacy.log']}
assert counts['journal.log']==69 and counts['privacy.log']==13
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0'))-{''}
changed=[p for p,h in sorted(smap.items()) if not (root/p).is_file() or sha(root/p)!=h]
new=sorted(actual-set(smap))
owned_matches=all((root/p).is_file() and sha(root/p)==h for p,h in owned.items())
v1_matches=sha(root/'src/lib/durableJournal.ts')==smap['src/lib/durableJournal.ts']
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check','--',*owned.keys()],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
syntax=subprocess.run(['node','--check','qa/durable-journal-e2e.mjs'],capture_output=True,text=True)
screens=[]
for p in sorted(a.rglob('*.png')):
 with p.open('rb') as f:header=f.read(24)
 assert header[:8]==b'\x89PNG\r\n\x1a\n' and header[12:16]==b'IHDR'
 w,h=struct.unpack('>II',header[16:24]);assert w>0 and h>0
 screens.append(dict(path=p.relative_to(a).as_posix(),bytes=p.stat().st_size,sha256=sha(p),width=w,height=h))
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
rb=dict(head=head,observed=datetime.datetime.now().astimezone().isoformat(),sourceCount=len(source),buildCount=len(build),
 sourceManifestSha256=sha(a/'source.json'),controlManifestSha256=sha(a/'control-source.json'),buildManifestSha256=sha(a/'build-manifest.json'),
 ownedHashesMatch=owned_matches,v1SourceMatches=v1_matches,liveChangedPaths=changed,liveNewPaths=new,
 ownedDiffCheck=diff.returncode,canon=canon.returncode,qaSyntax=syntax.returncode,passLines=counts,mixedWriterSample=sample,
 entryBytes=d['entryBytes'],entrySha256=d['entrySha256'],controlEntrySha256=d['controlEntrySha256'],screenshots=screens,
 acceptance='BLOCKED_BUNDLE_BUDGET',candidate='TESTED_LOCAL')
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-107 - mixed candidate writer and native version fence','',
 'Status: IMPLEMENTED / TESTED_LOCAL for candidate write semantics and native v1 version rejection. Overall acceptance BLOCKED_BUNDLE_BUDGET. Actual migration, production adapter integration, authority cutover and physical device verification NOT RUN. Production still uses v1.',
 f"HEAD {head}; observed {rb['observed']}.",
 'Decision: candidate writer snapshots input, validates immutable raw result, preserves first baseline, applies existing active/settled/quarantined state rules. Shared journal gate; strict full-physical CAS; changed packed batch materializes all originals and state transition atomically. Terminal retries do not rewrite unchanged packed data. Fresh exact physical and logical readback required. Commit/readback uncertainty is not success. Bounded candidate only (16 MiB / 4096 records), no production opener, automatic upgrade or wallet authority.',
 'Native fence: disposable v1 database upgraded to v2 by QA; old explicit v1 open rejects VersionError, existing journal read/stage/mark fail closed and records remain exact. This tests existing v1 implementation, not arbitrary earlier clients, wallet operations or production cutover.',
 f"Focused 19/19; full Vitest 1165/1165 in 108 files. TSC/build exit 0. Native journal {counts['journal.log']} PASS lines (11 new mixed-writer checks and one version fence). Tests include active baseline retention, packed retries, conflicting/missing inputs, atomic abort, exact quarantine materialization, cancellation, lost readback, competing changes. Owned browser cleanup passed.",
 'Required bundle gate FAIL: entry 398302 bytes; baseline 496761; strict maximum integer 397408 bytes (entry must be < 80% of baseline); exceeds by 894 bytes, reduction 19.8% rounded. Counterfactual control on same 345 frozen input paths differs only in the three task-owned files restored to before versions. Both build exit 0 and bundle exit 1; identical entry length and SHA-256 prove this patch did not change the initial bundle in the controlled snapshot. No weakening of gate. No attribution to a specific concurrent file without a separate causal test.',
 f"Diagnostic runtime checks against the exact failing-budget build: HTTP 200, exact index and entry hash, mobile {counts['mobile.log']} PASS lines, privacy {counts['privacy.log']} (12 private paths plus app), owned preview stopped. These are diagnostic passes, not overall acceptance. Existing large-chunk warning remains.",
 f"Frozen {len(source)} source files, {len(build)} build files; {len(screens)} PNG signatures and hashes checked, no independent visual review claimed. Current owned hashes match={owned_matches}; v1 source matches={v1_matches}; live drift {len(changed)} changed and {len(new)} new paths. See final-readback.json. No changes to parallel files.",
 f"Diff check={diff.returncode}; canon={canon.returncode}; QA syntax={syntax.returncode}.",
 'Remaining: resolve shared initial bundle budget, then integrate and test bounded migration/retention and guarded versioned authority handoff, including existing larger journals, recovery, quota and real devices. No owner profile accessed or changed. No APK, Firebase, Git commit or push.',
 'Rollback: restore only task-owned files if current SHA-256 matches owned.json, using their .before copies. Preserve other concurrent work.',
 'Commands: focused Vitest; tsc -b; frozen full Vitest threads; qa/durable-journal-e2e.mjs; vite build and qa/bundle-on-demand.mjs (current/control); production diagnostic mobile/privacy E2E; verify_canon.py.','',
 'Owned paths | bytes (frozen) | SHA-256',*[f'{p} | {(copy/p).stat().st_size} | {h}' for p,h in owned.items()],'',
 'References: https://www.w3.org/TR/IndexedDB/ ; https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB']
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