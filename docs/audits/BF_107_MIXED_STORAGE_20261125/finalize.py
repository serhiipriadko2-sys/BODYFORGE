from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re,struct
root=Path.cwd()
a=root/'docs/audits/BF_107_MIXED_STORAGE_20261125'
copy=root/'.bodyforge-qa/bf107-mixed-storage'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return p.read_text(encoding='utf-8-sig')
def load(p):return json.loads(read(p))
def create(p,s):
    with p.open('x',encoding='utf-8',newline='\n') as f:f.write(s)
def verify(folder,rows):
    seen=set()
    for row in rows:
        rel=Path(row['path']);key=row['path'].casefold()
        assert not rel.is_absolute() and '..' not in rel.parts and key not in seen
        seen.add(key);p=folder/rel
        assert p.is_file() and not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
        assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'].lower(),row['path']
g=load(a/'gates.json')
assert all(g[k]==0 for k in ['unit','tsc','build','bundle','journal','mobile','privacy'])
assert g['preview']==200 and g['frozenSourceAndBuildUnchanged'] and g['previewStopped'] and g['devStopped']
assert sha(a/'source.json').upper()==g['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
checks={'focused.log':['15 passed (15)'],'unit.log':['1074 passed (1074)','102 passed (102)'],'journal.log':['BODYFORGE_DURABLE_JOURNAL_PASS','PASS abort after compact add rolls back all original deletes','PASS concurrent change to an unrelated row invalidates entire conversion','PASS post-commit readback failure is unverified, not a false saved result','PASS repeat compaction is idempotent and overlap conflicts without writes','PASS inverse conversion restores every original legacy record','PASS candidate migration never changes the existing v1 journal','QA_OWNED_CLEANUP PASS'],'mobile.log':['BODYFORGE_MOBILE_E2E_PASS'],'privacy.log':['BODYFORGE_PRIVATE_DEV_PATHS_PASS=12'],'bundle.log':['BODYFORGE_BUNDLE_ON_DEMAND_PASS']}
for f,need in checks.items():
    for item in need:assert item in read(a/f),(f,item)
assert 'QA_CHROME_PROFILE_CLEANUP_FAIL' not in read(a/'mobile.log')
source=load(a/'source.json');build=load(a/'build-manifest.json');owned=load(a/'owned.json')
verify(copy,source);verify(copy/'dist',build)
assert len(source)==330 and len(build)==73 and len(owned)==3
for f,h in owned.items():assert sha(root/f)==h,f
assert sha(root/'src/lib/durableJournal.ts')=='99b5ab24987995dca1845c0c6256e27cb6ddb55958d4d7adf632fd4a99f3b062'
expected={x['path']:x['sha256'].lower() for x in source}
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0'))-{''}
changed=[p for p,h in sorted(expected.items()) if not (root/p).is_file() or sha(root/p)!=h]
new=sorted(actual-set(expected))
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check','--',*owned.keys()],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
syntax=subprocess.run(['node','--check','qa/durable-journal-e2e.mjs'],capture_output=True,text=True)
assert diff.returncode==0 and canon.returncode==0 and syntax.returncode==0
sample=json.loads(re.search(r'^MIXED_STORAGE_SAMPLE (.+)$',read(a/'journal.log'),re.M)[1])
assert len(sample)==14 and all(v is True for v in sample.values())
counts={name:sum(line.startswith('PASS ') for line in read(a/name).splitlines()) for name in ['journal.log','mobile.log','privacy.log']}
assert counts['journal.log']==48
screens=[]
for p in sorted(a.rglob('*.png')):
    with p.open('rb') as f:header=f.read(24)
    assert header[:8]==b'\x89PNG\r\n\x1a\n' and header[12:16]==b'IHDR',p
    w,h=struct.unpack('>II',header[16:24]);assert w>0 and h>0
    screens.append(dict(path=p.relative_to(a).as_posix(),width=w,height=h,bytes=p.stat().st_size,sha256=sha(p)))
rb={'head':head,'observed':datetime.datetime.now().astimezone().isoformat(),'owned':[dict(path=f,bytes=(root/f).stat().st_size,sha256=h) for f,h in owned.items()],'sourceCount':len(source),'buildCount':len(build),'sourceManifestSha256':sha(a/'source.json'),'buildManifestSha256':sha(a/'build-manifest.json'),'liveChangedPaths':changed,'liveNewPaths':new,'ownedDiffCheck':diff.returncode,'canon':canon.returncode,'qaSyntax':syntax.returncode,'passLines':counts,'migrationSample':sample,'screenshots':screens}
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-107 - candidate mixed journal storage with reversible conversion','',
'Status: IMPLEMENTED / TESTED_LOCAL for bounded candidate v2 read/pack/restore. Production activation, real v1 migration, cross-version upgrade/cutover, physical-device acceptance: NOT RUN. The application still uses its existing v1 journal.',
f"HEAD {head}; observed {rb['observed']}.",
'Decision: candidate database name and version are explicitly restricted; there is no production opener or schema upgrade. Decode mixed legacy rows and compact settled batches into exact logical rows, reject unknown versions, unexpected fields, duplicate logical/physical keys, oversized input, and damaged content. Incremental cursor scan bounds accepted logical/binary data (16 MiB aggregate budget, 4096 logical/physical records); batch limits remain 64 rows and 2 MiB. Limits are safety gates, not unlimited-history support.',
'Conversion and inverse conversion verify complete logical equivalence before attempting a strict readwrite transaction. Re-scan and compare normalized records including binary bytes inside the transaction; reject stale snapshots including unrelated-row changes. Delete/add requests are synchronous in the active callback and atomic within the transaction. Fresh readonly transaction and exact logical/physical comparison required for saved. Commit/readback uncertainty is unverified, not successful or proof of zero writes. Repeat pack of an exact already-packed set returns unchanged; missing rollback target returns conflict. Active and quarantined rows are never converted. No reward or wallet authority.',
'Focused Vitest 15/15. Initial file creation stopped because a relative .NET path resolved outside the PowerShell working directory; no source writes occurred in that attempt. Corrected to absolute root paths with create-new semantics. Initial snapshot stopped before copying because of a transcription error in expected test SHA-256; readback matched the original observed hash; corrected the expected value only. Final checks passed.',
f"Full Vitest 1074/1074 in 102 files, TypeScript, Vite build and bundle gate exit 0. Actual IndexedDB journal {counts['journal.log']} PASS lines including 14 new mixed-storage checks. Native tests simulate abort after add, concurrent write, missing readback after commit, repeat pack without mutation, corrupt payload rejection, inverse conversion abort and exact restore, close/reopen, and unchanged legacy database.",
f"Production preview mobile {counts['mobile.log']} PASS lines; privacy {counts['privacy.log']} (12 denied paths plus app HTTP 200). Exact index and entry hashes verified. Owned servers stopped. Frozen inputs {len(source)}, build files {len(build)}, entry {g['entry']} SHA-256 {g['entrySha256']}; {len(screens)} PNG headers and hashes checked; no independent visual review claimed. Existing >500 kB bundle warning remains.",
f"Live parity: {len(changed)} changed and {len(new)} new paths against frozen source; all three owned hashes and v1 journal source match. Exact paths in final-readback.json. Parallel edits outside this snapshot are not covered.",
'Remaining gates: implement guarded source-to-candidate copying, old/new app coordination, durable cutover and recovery with the original source retained, storage quota and large-history policy, and physical-device verification before activation. No user journal accessed, compacted or deleted. No APK, Firebase deploy, commit or push.',
'Rollback: restore qa/durable-journal-e2e.mjs from its before file only if current owned hash matches; remove only unchanged newly added journalMixedStorage.ts/test.ts. Preserve concurrent work.',
'Commands: focused Vitest; tsc -b; full Vitest --pool=threads --maxWorkers=1 --no-file-parallelism; vite build; qa/bundle-on-demand.mjs; qa/durable-journal-e2e.mjs; qa/mobile-e2e.mjs; qa/privacy-server-e2e.mjs; verify_canon.py.','',
'Owned paths | bytes | SHA-256',*[f'{f} | {(root/f).stat().st_size} | {h}' for f,h in owned.items()],'',
'References: https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction ; https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability']
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];seen=set()
secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
    assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
    if not p.is_file():continue
    rel=p.relative_to(a).as_posix();key=rel.casefold()
    assert key not in seen and '..' not in Path(rel).parts;seen.add(key)
    size=p.stat().st_size
    if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.ts','.mjs','.before'):
        assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential pattern: '+rel
    items.append(dict(path=rel,bytes=size,sha256=sha(p)))
mf=a/'artifact-manifest.json';create(mf,json.dumps(items,indent=2)+'\n')
verify(a,load(mf))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),mf.stat().st_size,sha(mf))
print('SUMMARY',json.dumps({k:v for k,v in rb.items() if k not in ['owned','screenshots']},ensure_ascii=True))