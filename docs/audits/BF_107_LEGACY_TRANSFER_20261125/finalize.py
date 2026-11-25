from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re,struct
root=Path.cwd()
a=root/'docs/audits/BF_107_LEGACY_TRANSFER_20261125'
copy=root/'.bodyforge-qa/bf107-legacy-transfer'
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
privacy=next((f for f in ['privacy.log','privacy-server-e2e.mjs'] if (a/f).is_file()),None)
assert privacy is not None
checks={'focused.log':['17 passed (17)'],'unit.log':['1155 passed (1155)','107 passed (107)'],'journal.log':['BODYFORGE_DURABLE_JOURNAL_PASS','PASS transfer refuses the live database as a target','PASS queued exclusive transfer cancellation never writes','PASS copy abort leaves source exact and candidate empty','PASS strict copy preserves all legacy states without writing the source','PASS packed candidate verifies and retries without mutations or cutover authority','PASS new legacy result blocks mismatching nonempty candidate without overwrite','PASS uncooperative source race yields stale candidate, never cutover','PASS lost copy readback is unverified and retry checks retained data','PASS unknown source version blocks copy without partial target','QA_OWNED_CLEANUP PASS'],'mobile.log':['BODYFORGE_MOBILE_E2E_PASS'],privacy:['BODYFORGE_PRIVATE_DEV_PATHS_PASS=12'],'bundle.log':['BODYFORGE_BUNDLE_ON_DEMAND_PASS']}
for f,need in checks.items():
    for item in need:assert item in read(a/f),(f,item)
assert 'QA_CHROME_PROFILE_CLEANUP_FAIL' not in read(a/'mobile.log')
source=load(a/'source.json');build=load(a/'build-manifest.json');owned=load(a/'owned.json')
verify(copy,source);verify(copy/'dist',build)
assert len(source)==g['sourceCount']==341 and len(build)==g['buildCount']==73 and len(owned)==3
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
sample=json.loads(re.search(r'^LEGACY_TRANSFER_SAMPLE (.+)$',read(a/'journal.log'),re.M)[1])
assert len(sample)==9 and all(v is True for v in sample.values())
counts={name:sum(line.startswith('PASS ') for line in read(a/name).splitlines()) for name in ['journal.log','mobile.log',privacy]}
assert counts['journal.log']==57 and counts[privacy]==13
screens=[]
for p in sorted(a.rglob('*.png')):
    with p.open('rb') as f:header=f.read(24)
    assert header[:8]==b'\x89PNG\r\n\x1a\n' and header[12:16]==b'IHDR',p
    w,h=struct.unpack('>II',header[16:24]);assert w>0 and h>0
    screens.append(dict(path=p.relative_to(a).as_posix(),width=w,height=h,bytes=p.stat().st_size,sha256=sha(p)))
rb={'head':head,'observed':datetime.datetime.now().astimezone().isoformat(),'owned':[dict(path=f,bytes=(root/f).stat().st_size,sha256=h) for f,h in owned.items()],'sourceCount':len(source),'buildCount':len(build),'sourceManifestSha256':sha(a/'source.json'),'buildManifestSha256':sha(a/'build-manifest.json'),'liveChangedPaths':changed,'liveNewPaths':new,'ownedDiffCheck':diff.returncode,'canon':canon.returncode,'qaSyntax':syntax.returncode,'passLines':counts,'transferSample':sample,'screenshots':screens}
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-107 - guarded legacy journal transfer and verification','',
'Status: IMPLEMENTED / TESTED_LOCAL for guarded v1-to-candidate transfer and read-only comparison. Production activation, durable cutover, live owner data migration, physical-device acceptance: NOT RUN. Production still uses v1.',
f"HEAD {head}; observed {rb['observed']}.",
'Decision and scope: see ADR.md. Both DB handles are supplied by the caller. Exact v1 source and candidate identity/version/store checks precede the exclusive journal gate. Read-only source snapshots are bounded and reject unknown records. Copy only to empty candidate with strict atomic compare-and-swap; a nonempty exact logical copy is unchanged, including packed records. A nonempty mismatch is conflict, never overwrite. Source reread before and after candidate transaction detects observed drift; no claim of cross-database atomicity. No automatic activation or wallet authority. Every result explicitly has cutoverAuthorized=false.',
'QA includes wrong target identity, no lock fallback, queued cancellation, abort after add, exact copy of all states without a source write, idempotent packed candidate verification, conflict on later legacy activity, deliberately noncooperating concurrent source write, missing readback after commit, and unknown source schema. No user database accessed. Candidate handles and disposable profile only.',
'Focused Vitest 17/17. Initial PowerShell python -c invocation failed before source writes due quoting; corrected to a file-based patch with input hashes and before copies. Initial live TypeScript run reported unused avatarLookDev import in parallel Avatar3D.tsx; no change by this task. That concurrent code was independently completed before final frozen snapshot, which passed TypeScript. All final source/test hashes verified.',
f"Full Vitest 1155/1155 in 107 files. Native IndexedDB journal {counts['journal.log']} checks including 9 new transfer checks. Production preview mobile {counts['mobile.log']} PASS lines; privacy {counts[privacy]} (12 denied paths plus application HTTP 200). Build, TypeScript, bundle gate and QA syntax exit 0. Both owned servers stopped. Exact HTML/entry and frozen source/build verified.",
f"Frozen inputs {len(source)}, build files {len(build)}, entry {g['entry']} SHA-256 {g['entrySha256']}; {len(screens)} PNG headers and hashes checked, no independent visual review claimed. Existing >500 kB chunk warning remains. Bundle entry 397075 bytes, 20.1% smaller than baseline.",
f"Live parity: {len(changed)} changed and {len(new)} new paths against frozen source; all 3 owned hashes and v1 journal source match. Exact paths in final-readback.json. Concurrent edits outside snapshot not covered.",
'Remaining gates: real version coexistence, guarded durable authority handoff and recovery, quota/eviction and physical-device verification. Copy observation alone cannot authorize activation; older writers are not fenced. Do not modify or delete the authoritative source. The 16 MiB / 4096 record candidate bounds remain, not an unlimited history guarantee. No APK, Firebase, Git commit or push.',
'Rollback: restore only the three hash-matching owned files from their respective before copies. Preserve other work.','',
'Commands: focused Vitest, tsc -b (initial live and frozen), native journal E2E, full Vitest --pool=threads --maxWorkers=1 --no-file-parallelism, vite build, bundle gate, mobile E2E, privacy E2E, verify_canon.py.','',
'Owned paths | bytes | SHA-256',*[f'{f} | {(root/f).stat().st_size} | {h}' for f,h in owned.items()],'',
'Reference: https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction ; https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API']
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