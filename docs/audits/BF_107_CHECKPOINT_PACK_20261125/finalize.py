from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re,struct
root=Path.cwd()
a=root/'docs/audits/BF_107_CHECKPOINT_PACK_20261125'
copy=root/'.bodyforge-qa/bf107-checkpoint-pack'
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
prior=load(a/'gates.json');g=load(a/'retry-gates.json')
assert prior['unit']==1 and prior['tsc']==0 and prior['build']=='NOT_RUN'
assert all(g[k]==0 for k in ['unit','tsc','build','bundle','journal','mobile','privacy'])
assert g['preview']==200 and g['frozenSourceAndBuildUnchanged'] and g['previewStopped'] and g['devStopped']
assert sha(a/'source.json').upper()==g['sourceManifestSha256']==prior['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
checks={'focused.log':['43 passed (43)'],'unit.log':['1027 passed (1027)','spawn UNKNOWN','Errors  2 errors'],'unit-retry.log':['1034 passed (1034)','99 passed (99)'],'journal.log':['BODYFORGE_DURABLE_JOURNAL_PASS','PASS compact checkpoint batch survives a strict native IndexedDB transaction and fresh readback','PASS aborted compact prototype write retains verified batch and leaves live v1 journal untouched','QA_OWNED_CLEANUP PASS'],'mobile.log':['BODYFORGE_MOBILE_E2E_PASS','PASS disposable journal includes four exact repeated checkpoint snapshots','PASS UI reports bounded actual checkpoint sample savings','PASS checkpoint estimate preserves exact journal and wallet','PASS stale checkpoint estimate not presented as current'],'privacy.log':['BODYFORGE_PRIVATE_DEV_PATHS_PASS=12'],'bundle.log':['BODYFORGE_BUNDLE_ON_DEMAND_PASS']}
for f,need in checks.items():
    for item in need:assert item in read(a/f),(f,item)
assert 'QA_CHROME_PROFILE_CLEANUP_FAIL' not in read(a/'mobile.log')
source=load(a/'source.json');build=load(a/'build-manifest.json');owned=load(a/'owned.json')
verify(copy,source);verify(copy/'dist',build)
assert len(source)==324 and len(build)==73 and len(owned)==7
for f,h in owned.items():assert sha(root/f)==h,f
expected={x['path']:x['sha256'].lower() for x in source}
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0'))-{''}
changed=[p for p,h in sorted(expected.items()) if not (root/p).is_file() or sha(root/p)!=h]
new=sorted(actual-set(expected))
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check','--',*owned.keys()],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
syntax=[subprocess.run(['node','--check',f],capture_output=True,text=True).returncode for f in ['qa/durable-journal-e2e.mjs','qa/mobile-e2e.mjs']]
assert diff.returncode==0 and canon.returncode==0 and syntax==[0,0]
samples={}
for f,tag in [('journal.log','CHECKPOINT_PACK_SAMPLE'),('mobile.log','CHECKPOINT_UI_SAMPLE')]:
    samples[tag]=json.loads(re.search(r'^'+tag+r' (.+)$',read(a/f),re.M)[1])
s=samples['CHECKPOINT_PACK_SAMPLE']
assert s=={'rows':32,'originalBytes':1052471,'packedBytes':3016,'uniqueCheckpoints':1,'exact':True,'binary':True,'abortedOriginal':True,'originalUntouched':True}
u=samples['CHECKPOINT_UI_SAMPLE']
assert u['sample']==4 and u['packed']<u['original']
counts={name:sum(line.startswith('PASS ') for line in read(a/name).splitlines()) for name in ['journal.log','mobile.log','privacy.log']}
assert counts['journal.log']==34
screens=[]
for p in sorted(a.rglob('*.png')):
    with p.open('rb') as f:header=f.read(24)
    assert header[:8]==b'\x89PNG\r\n\x1a\n' and header[12:16]==b'IHDR',p
    w,h=struct.unpack('>II',header[16:24]);assert w>0 and h>0
    screens.append(dict(path=p.relative_to(a).as_posix(),width=w,height=h,bytes=p.stat().st_size,sha256=sha(p)))
rb={'head':head,'observed':datetime.datetime.now().astimezone().isoformat(),'owned':[dict(path=f,bytes=(root/f).stat().st_size,sha256=h) for f,h in owned.items()],'sourceCount':len(source),'buildCount':len(build),'sourceManifestSha256':sha(a/'source.json'),'buildManifestSha256':sha(a/'build-manifest.json'),'liveChangedPaths':changed,'liveNewPaths':new,'ownedDiffCheck':diff.returncode,'canon':canon.returncode,'qaSyntax':syntax,'passLines':counts,'samples':samples,'screenshots':screens}
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-107 - bounded checkpoint batch codec and read-only preview','',
'Status: IMPLEMENTED / TESTED_LOCAL for compact representation and Settings preview; PROTOTYPE_NATIVE_IDB for isolated physical layout. No production journal migration enabled.',
f"HEAD {head}; observed {rb['observed']}.",
'Decision: represent a bounded batch of settled public v1 journal rows as immutable key/raw/nullable checkpoint references plus one pool of distinct exact strings. Use native gzip if smaller, otherwise UTF-8 JSON pool; source and inflated pool bounded. Max 64 rows and 2 MiB logical serialized source. Reject unexpected fields, duplicates, non-terminal rows, missing or unused references, corrupt compressed content and mismatched SHA-256. Validate the complete round-trip before reporting a packed candidate. SHA-256 protects consistency, not authenticity or reward authority. Existing 16 MiB import gate unchanged; a smaller decoded bound can be provided by the new codec.',
'UI: explicit bounded sample calculation only from an already prepared complete backup. No new database read/write, network or permission request by the estimator. Stale prepared backup invalidates the estimate. Sizes are logical JSON metadata plus binary payload, not browser storage quota or disk usage. No extrapolation to other journals. Active and quarantined originals excluded. No schema/version change or migration of existing v1 database. Older readers must never receive packed rows as v1 originals.',
'Focused Vitest 43/43. Initial typecheck found a settled type narrowing issue, fixed by using an explicitly typed logical projection after state guards. QA patch initially stopped on a duplicate anchor before touching source, repaired with last-occurrence guard. First frozen full Vitest passed 1027 assertions in 97 files but exit 1 because two fork workers could not spawn/terminate (UNKNOWN); build not run. Same source snapshot retried with --pool=threads and maxWorkers=1, 1034/1034 in 99 files, exit 0. TSC, Vite build and bundle gate exit 0.',
f"Native journal browser {counts['journal.log']} PASS lines. Separate disposable IndexedDB stores the candidate binary using strict transaction and fresh readback. All 32 originals round-trip exactly. Aborted candidate overwrite retains prior valid batch and leaves v1 fixture untouched. Logical sample {s['originalBytes']} -> {s['packedBytes']} bytes; one distinct repeated checkpoint. UI browser sample {u['sample']} rows, {u['original']} -> {u['packed']} logical bytes; exact wallet and journal unchanged; stale estimate invalidated.",
f"Production mobile {counts['mobile.log']} PASS lines; privacy {counts['privacy.log']} (12 private paths plus app HTTP). Preview 200, exact index and entry digest. All owned servers stopped. Frozen inputs {len(source)}, build files {len(build)}, entry {g['entry']} SHA-256 {g['entrySha256']}; {len(screens)} PNG headers and hashes checked. Existing chunk >500 kB warning remains; no independent visual review claimed.",
f"Live parity: {len(changed)} changed and {len(new)} new paths against frozen source; all owned file hashes match. Paths in final-readback.json. Parallel edits outside this snapshot not covered.",
'Next gate: implement and verify an explicit atomic dual-format read/write migration and reversible recovery before activating compact storage. Do not replace existing durable originals simply because a sample compresses well. Actual browser disk usage, eviction, power loss, installed Android WebView and physical-device acceptance remain unverified. No owner history read or changed in QA; no APK, Firebase deployment, git commit or push.',
'Rollback: only restore hash-matching owned prior versions from *.before and *.before-qa; remove only unchanged new journalCheckpointBatch.ts/test.ts. Preserve concurrent avatar and exercise work.',
'Commands: focused Vitest; initial tsc -b; frozen tsc -b; full Vitest forks (failed infrastructure), same snapshot full Vitest --pool=threads --maxWorkers=1 --no-file-parallelism; vite build; qa/bundle-on-demand.mjs; qa/durable-journal-e2e.mjs; qa/mobile-e2e.mjs; qa/privacy-server-e2e.mjs; verify_canon.py.','',
'Owned paths | bytes | SHA-256',*[f'{f} | {(root/f).stat().st_size} | {h}' for f,h in owned.items()],'',
'Reference: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API ; https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getAll']
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];seen=set()
secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
    assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
    if not p.is_file():continue
    rel=p.relative_to(a).as_posix();key=rel.casefold()
    assert key not in seen and '..' not in Path(rel).parts;seen.add(key)
    size=p.stat().st_size
    if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.ts','.mjs','.before','.before-qa'):
        assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential pattern: '+rel
    items.append(dict(path=rel,bytes=size,sha256=sha(p)))
mf=a/'artifact-manifest.json';create(mf,json.dumps(items,indent=2)+'\n')
verify(a,load(mf))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),mf.stat().st_size,sha(mf))
print('SUMMARY',json.dumps({k:v for k,v in rb.items() if k not in ['owned','screenshots']},ensure_ascii=True))