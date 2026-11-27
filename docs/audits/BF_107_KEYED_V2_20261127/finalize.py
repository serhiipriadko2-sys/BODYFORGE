from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re,struct,os,tempfile
root=Path.cwd();a=root/'docs/audits/BF_107_KEYED_V2_20261127'
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
assert all(g[k]==0 for k in ['unit','tsc','build','bundle','journal','mobile','privacy'])
assert g['preview']==200 and g['frozenSourceAndBuildUnchanged'] and g['previewStopped'] and g['devStopped']
source=load(a/'source.json');build=load(a/'build-manifest.json');owned=load(a/'owned.json')
assert len(source)==g['sourceCount']==355 and len(build)==g['buildCount'] and len(owned)==4
assert sha(a/'source.json').upper()==g['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
copy=Path(read(a/'isolated-root.txt').strip()).resolve()
assert copy.parent==Path(tempfile.gettempdir()).resolve() and copy.name.startswith('bodyforge-isolated-qa-') and not copy.is_relative_to(root.resolve())
verify(copy,source);verify(copy/'dist',build)
smap={x['path']:x['sha256'] for x in source}
assert all(smap[p]==h for p,h in owned.items())
for tool in g['tools']:assert sha(root/tool['path']).upper()==tool['hash']
assert '1175 passed (1175)' in read(a/'unit.log') and '110 passed (110)' in read(a/'unit.log')
journal=read(a/'journal.log')
assert 'BODYFORGE_DURABLE_JOURNAL_PASS {"assertions":110' in journal and 'QA_OWNED_CLEANUP PASS' in journal
assert 'BODYFORGE_MOBILE_E2E_PASS' in read(a/'mobile.log') and 'QA_CHROME_PROFILE_CLEANUP_FAIL' not in read(a/'mobile.log')
assert 'BODYFORGE_PRIVATE_DEV_PATHS_PASS=12' in read(a/'privacy.log')
small=json.loads(re.search(r'^KEYED_V2_SAMPLE (.+)$',journal,re.M)[1]);large=json.loads(re.search(r'^KEYED_V2_LARGE_SAMPLE (.+)$',journal,re.M)[1])
assert len(small)==20 and all(v is True for v in small.values())
assert large=={'large':True,'full':True,'pages':True,'drift':True,'corrupt':True}
bundle=json.loads(re.search(r'BODYFORGE_BUNDLE_ON_DEMAND_PASS (\{[^\r\n]+\})',read(a/'bundle.log'))[1])
assert bundle['entryBytes']==g['entryBytes']==383784 and bundle['baselineEntryBytes']==496761
assert g['entryBytes']<bundle['baselineEntryBytes']*.8 and sha(copy/'dist'/g['entry'])==g['entrySha256']
counts={n:sum(line.startswith('PASS ') for line in read(a/n).splitlines()) for n in ['journal.log','mobile.log','privacy.log']}
assert counts['journal.log']==110 and counts['privacy.log']==13
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
 passLines=counts,keyedV2=small,keyedV2Large=large,bundle=bundle,entrySha256=g['entrySha256'],screenshots=screens,
 isolatedDependencyJunctionRemoved=True,acceptance='TESTED_LOCAL',ownerActivation='NOT_RUN')
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-107 - key-preserving compact journal v2','',
 'Status: IMPLEMENTED / TESTED_LOCAL for versioned production-compatible facade and explicit maintenance on disposable browser profile. Existing user journal activation, real migration, device/field acceptance NOT RUN.',
 f"Frozen HEAD {g['head']}; current HEAD {head}; observed {rb['observed']}.",
 'Decision: ADR.md. Native v2 retains original keys and adds one metadata revision store. Ordinary opens never upgrade. Explicit preparation validates exact legacy rows inside versionchange and only creates metadata. Versioned stage/mark uses strict atomic revision and selected-record CAS plus exact logical readback. Compact settled checkpoints use existing lossless codec. Active, quarantined, oversized and incompressible originals remain plain. Bounded maintenance can compact or restore settled rows without deleting history. Revision-checked pages and final read prevent trusted partial history if cooperating writers change state.',
 'The first attempted command exceeded the Windows process command-length limit and made no source edits; prepared smaller staged files, rechecked original hashes and applied successfully. Preserved staged sources and original .before copies.',
 f"TypeScript, full Vitest 1175/1175 in 110 files, build and bundle exit 0. Native IndexedDB {counts['journal.log']} PASS lines (25 new keyed v2 assertions: 20 basic + 5 large); exact original bytes, absent/blocked/invalid upgrade, idempotent preparation, legacy fence, compact/restore, settlement, quarantine, strict abort, stale CAS, readback loss, oversized fallback, revision drift and corrupt packed checkpoint. Synthetic 4105 legacy originals plus new result; more than 16 MiB of baseline text. No total journal cap. No partial trusted view under tested revision drift.",
 f"Production preview HTTP 200, exact entry/index verified. Mobile {counts['mobile.log']} and privacy {counts['privacy.log']} PASS lines; standard v1 application flow tested in production preview, v2 storage facade exercised natively via isolated dev browser. Entry {bundle['entryBytes']} bytes versus {bundle['baselineEntryBytes']}, reduction {bundle['entryReductionPercent']}%; existing large-chunk warning remains. Difference against baseline is aggregate, not solely due to this patch.",
 f"Verified {len(source)} frozen source files, {len(build)} build files, {len(screens)} PNG signatures/dimensions/hashes (not visually reviewed). Four owned paths match workspace. Other live drift: {len(changed)} changed, {len(new)} new paths, not covered by snapshot. Owned dev/preview stopped, dependency junction removed without changing shared dependencies.",
 f"Diff={diff.returncode}; canon={canon.returncode}; QA syntax={syntax.returncode}.",
 'Limitations: revision fences cooperating v2 writers, not arbitrary same-origin mutation. Reads and post-write validation remain O(history); no measured mobile memory, latency or storage-pressure guarantee. Materialization does not downgrade the IndexedDB version. No automatic activation, owner data, APK, Firebase, Git commit or push. Full UI workout/backup/recovery through prepared v2 and device/activation gates still required; roadmap not complete.',
 'Rollback: for source-only local rollback, verify owned hashes; restore durableJournal.ts and qa/durable-journal-e2e.mjs from exact .before copies; remove only unchanged new schema/v2 source files. Do not downgrade any activated database; existing owner v1 remains untouched.',
 'Commands: tsc -b; native durable-journal-e2e.mjs; full Vitest threads; vite build; bundle gate; production mobile/privacy E2E; verify_canon.py.','',
 'Owned paths | bytes | SHA-256',*[f'{p} | {(root/p).stat().st_size} | {h}' for p,h in owned.items()],'',
 'References: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB ; https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction']
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
