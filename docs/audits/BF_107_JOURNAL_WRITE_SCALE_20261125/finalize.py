from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re,struct
root=Path.cwd()
a=root/'docs/audits/BF_107_JOURNAL_WRITE_SCALE_20261125'
copy=root/'.bodyforge-qa/bf107-journal-write-scale'
recheck=root/'.bodyforge-qa/bf107-journal-write-recheck'
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
g=load(a/'gates.json');r=load(a/'recheck-gates.json')
assert all(g[k]==0 for k in ['unit','tsc','build','bundle','dedup','mobile','privacy'])
assert g['journal']==22 and g['preview']==200 and g['frozenSourceAndBuildUnchanged'] and g['previewStopped'] and g['devStopped']
assert r['red']==22 and r['redExpectedFailure'] and r['green']==0 and r['restoredNewModule'] and r['sourceVerified'] and r['serverStopped']
assert sha(a/'source.json').upper()==g['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
source=load(a/'source.json');source2=load(a/'source-recheck.json');build=load(a/'build-manifest.json')
verify(copy,source);verify(recheck,source2);verify(copy/'dist',build)
assert len(source)==len(source2)==317 and len(build)==73
old={row['path']:row['sha256'] for row in source};new={row['path']:row['sha256'] for row in source2}
assert old.keys()==new.keys()
assert [f for f in old if old[f]!=new[f]]==['qa/durable-journal-e2e.mjs']
owned={f:new[f] for f in ['src/lib/durableJournal.ts','qa/durable-journal-e2e.mjs']}
for f,h in owned.items():assert sha(root/f)==h,f
checks={'unit.log':['960 passed (960)','95 passed (95)'],'journal.log':['PASS terminal duplicate stage and mark acknowledge without rewriting original','SyntaxError: await is only valid'],'recheck-red.log':['FAIL terminal duplicate stage and mark acknowledge without rewriting original','QA_OWNED_CLEANUP PASS'],'recheck-green.log':['BODYFORGE_DURABLE_JOURNAL_PASS','PASS active duplicate still issues one strict put','PASS 256 historical terminal rows plus one new settlement require exactly one put and complete receipt','PASS second full reconciliation makes zero puts and still acknowledges every original','PASS mixed batch conflict never rewrites any terminal originals','PASS no-op terminal acknowledgement still uses strict completion and a fresh readonly transaction','QA_OWNED_CLEANUP PASS'],'dedup.log':['BODYFORGE_DEDUP_RECOVERY_PASS','QA_OWNED_CLEANUP PASS'],'mobile.log':['BODYFORGE_MOBILE_E2E_PASS'],'privacy.log':['BODYFORGE_PRIVATE_DEV_PATHS_PASS=12'],'bundle.log':['BODYFORGE_BUNDLE_ON_DEMAND_PASS']}
for f,need in checks.items():
    for item in need:assert item in read(a/f),(f,item)
scaling=json.loads(re.search(r'^TERMINAL_SCALING (.+)$',read(a/'recheck-green.log'),re.M)[1])
assert scaling['puts']==1 and scaling['ackCount']==257 and scaling['allSettled'] and scaling['exact'] and scaling['ack']=='saved'
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0'))-{''}
changed=[p for p,h in sorted(new.items()) if not (root/p).is_file() or sha(root/p)!=h]
newpaths=sorted(actual-set(new))
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check','--','src/lib/durableJournal.ts','qa/durable-journal-e2e.mjs'],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
syntax=subprocess.run(['node','--check','qa/durable-journal-e2e.mjs'],capture_output=True,text=True)
assert diff.returncode==0 and canon.returncode==0 and syntax.returncode==0
screens=[]
for p in sorted(a.rglob('*.png')):
    with p.open('rb') as f:header=f.read(24)
    assert header[:8]==b'\x89PNG\r\n\x1a\n' and header[12:16]==b'IHDR',p
    w,h=struct.unpack('>II',header[16:24]);assert w>0 and h>0
    screens.append(dict(path=p.relative_to(a).as_posix(),width=w,height=h,bytes=p.stat().st_size,sha256=sha(p)))
counts={name:sum(line.startswith('PASS ') for line in read(a/name).splitlines()) for name in ['recheck-green.log','dedup.log','mobile.log','privacy.log']}
assert counts['recheck-green.log']==32 and counts['dedup.log']==34
rb={'head':head,'observed':datetime.datetime.now().astimezone().isoformat(),'owned':[dict(path=f,bytes=(root/f).stat().st_size,sha256=h) for f,h in owned.items()],'sourceCount':len(source),'buildCount':len(build),'sourceManifestSha256':sha(a/'source.json'),'recheckManifestSha256':sha(a/'source-recheck.json'),'buildManifestSha256':sha(a/'build-manifest.json'),'onlyRecheckDifference':'qa/durable-journal-e2e.mjs','liveChangedPaths':changed,'liveNewPaths':newpaths,'ownedDiffCheck':diff.returncode,'canon':canon.returncode,'qaSyntax':syntax.returncode,'passLines':counts,'scaling':scaling,'screenshots':screens}
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-107 - skip redundant terminal journal writes','',
'Status: IMPLEMENTED / TESTED_LOCAL. Actual IndexedDB and production web preview verified. Not an at-rest compression migration or Android physical-device acceptance.',
f"HEAD {head}; observed {rb['observed']}.",
'Decision: validate all requested rows and preserve complete exact readback receipts; skip put only when an existing settled/quarantined row has the same terminal state. Inserts, active retries and actual state changes retain strict put. Schema, immutable original payload, first baseline, quarantine semantics, full readback and reward authority unchanged. No deletes, compaction, checkpoint pruning, or migration.',
'Regression: initial browser launcher and cold Vite preflight attempts failed infrastructure checks. Full frozen run passed 25 durable checks before its legacy CDP expression failed because unwrapped await was not valid. Corrected only two QA expressions. On a separately verified identical source snapshot except that QA file, original production module fails the new terminal-duplicate assertion; new module passes all 32 checks. Both disposable QA profiles cleaned up. Production and other tests are byte-identical to the first frozen run.',
'Scaling fixture: 256 terminal originals plus one active original; exactly one put, 257 acknowledged originals and exact original bytes preserved. Second reconciliation issues zero puts. Conflict aborts before writes; no-op still waits for strict completion and a separate readback. Old implementation issued put for every expected row; 257 is the code-derived baseline, not a physical disk benchmark. No claim of latency, bytes-on-disk reduction or quota recovery.',
f"Full Vitest 960/960 in 95 files; TypeScript, Vite build and bundle gate exit 0. Durable journal {counts['recheck-green.log']} PASS lines, dedup/recovery {counts['dedup.log']}, mobile {counts['mobile.log']}, privacy {counts['privacy.log']} (12 private paths plus app). Preview HTTP 200 and exact HTML/entry hashes. All owned servers stopped.",
f"Frozen inputs {len(source)}; build files {len(build)}; entry {g['entry']}, SHA-256 {g['entrySha256']}; {len(screens)} PNG headers and hashes checked. Existing bundle >500 kB warning remains. No independent visual review claimed.",
f"Live parity: {len(changed)} changed and {len(newpaths)} new paths versus corrected QA snapshot; owned source hashes match. See final-readback.json. Concurrent changes outside frozen inputs are not covered.",
'Limits: full journal readback and retained baseline storage still grow; physical device, power loss, eviction, and disk use not measured. No owner browser/storage accessed. No APK, Firebase deployment, Git commit or push by this task.',
'Rollback: restore only hash-matching owned files from durableJournal.ts.before and durable-journal-e2e.mjs.before; keep other concurrent edits. Intermediate QA copies retained for traceability.',
'Commands: vitest run --maxWorkers=1 --no-file-parallelism; tsc -b; vite build; node qa/bundle-on-demand.mjs; node qa/durable-journal-e2e.mjs (original and corrected module in disposable dev QA); node qa/journal-e2e.mjs --dedup-only; node qa/mobile-e2e.mjs; node qa/privacy-server-e2e.mjs; verify_canon.py.','',
'Owned paths | bytes | SHA-256',*[f'{f} | {(root/f).stat().st_size} | {h}' for f,h in owned.items()],'',
'Reference: https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability']
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];seen=set()
secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
    assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
    if not p.is_file():continue
    rel=p.relative_to(a).as_posix();key=rel.casefold()
    assert key not in seen and '..' not in Path(rel).parts;seen.add(key)
    size=p.stat().st_size
    if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.ts','.mjs','.before','.before-harness','.before-production','.before-async-fix'):
        assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential pattern: '+rel
    items.append(dict(path=rel,bytes=size,sha256=sha(p)))
mf=a/'artifact-manifest.json';create(mf,json.dumps(items,indent=2)+'\n')
verify(a,load(mf))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),mf.stat().st_size,sha(mf))
print('SUMMARY',json.dumps({k:v for k,v in rb.items() if k not in ['owned','screenshots']},ensure_ascii=True))