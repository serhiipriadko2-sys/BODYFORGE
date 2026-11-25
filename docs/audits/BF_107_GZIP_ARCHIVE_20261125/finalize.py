from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re,struct
root=Path.cwd()
a=root/'docs/audits/BF_107_GZIP_ARCHIVE_20261125'
copy=root/'.bodyforge-qa/bf107-gzip-archive'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return p.read_text(encoding='utf-8-sig')
def load(p):return json.loads(read(p))
def create(p,s):
    with p.open('x',encoding='utf-8',newline='\n') as f:f.write(s)
g=load(a/'gates.json')
assert all(g[k]==0 for k in ['unit','tsc','build','bundle','mobile','privacy','importPreview'])
assert g['preview']==200 and g['frozenSourceAndBuildUnchanged'] and g['previewStopped'] and g['devStopped']
assert sha(a/'source.json').upper()==g['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
checks={'targeted.log':['35 passed (35)'],'unit.log':['924 passed (924)','94 passed (94)'],'mobile.log':['BODYFORGE_MOBILE_E2E_PASS','PASS gzip is smaller than the prepared JSON','PASS actual GZIP download preserves exact profile evidence','PASS selected gzip uses the existing strict comparison','PASS corrupt archive exposes no comparison','PASS gzip export and inspection never rewrite the wallet','PASS stale gzip is not offered for download','PASS small gzip still warns about oversized inflated JSON','PASS oversize gzip preserves original journal evidence','PASS gzip cannot bypass the decoded size limit'],'import-preview.log':['BODYFORGE_IMPORT_PREVIEW_E2E_PASS assertions=37','PASS gzip file replacement stages exact v1 bytes without new authority','PASS accepted paid original remains byte-exact in IndexedDB after reload','PASS adopted file does not generate a new reward','QA_OWNED_CLEANUP PASS'],'privacy.log':['BODYFORGE_PRIVATE_DEV_PATHS_PASS=12'],'bundle.log':['BODYFORGE_BUNDLE_ON_DEMAND_PASS']}
for f,need in checks.items():
    for item in need:assert item in read(a/f),(f,item)
assert 'QA_CHROME_PROFILE_CLEANUP_FAIL' not in read(a/'mobile.log')
owned=load(a/'owned.json')
assert len(owned)==9
def verify(folder,rows):
    seen=set()
    for row in rows:
        rel=Path(row['path']);key=row['path'].casefold()
        assert not rel.is_absolute() and '..' not in rel.parts and key not in seen
        seen.add(key);p=folder/rel
        assert p.is_file() and not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
        assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'].lower(),row['path']
source=load(a/'source.json');build=load(a/'build-manifest.json')
verify(copy,source);verify(copy/'dist',build)
assert len(source)==315 and len(build)==73
for f,h in owned.items():assert sha(root/f)==h,f
expected={x['path']:x['sha256'].lower() for x in source}
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0'))-{''}
changed=[p for p,h in sorted(expected.items()) if not (root/p).is_file() or sha(root/p)!=h]
new=sorted(actual-set(expected))
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check'],capture_output=True,text=True)
cached=subprocess.run(['git','-c','core.safecrlf=false','diff','--cached','--check'],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
syntax=[subprocess.run(['node','--check',f],capture_output=True,text=True).returncode for f in ['qa/mobile-e2e.mjs','qa/import-preview-e2e.mjs']]
assert canon.returncode==0 and syntax==[0,0] and diff.returncode==0 and cached.returncode==0
screens=[]
for p in sorted(a.rglob('*.png')):
    with p.open('rb') as f:header=f.read(24)
    assert header[:8]==b'\x89PNG\r\n\x1a\n' and header[12:16]==b'IHDR',p
    w,h=struct.unpack('>II',header[16:24]);assert w>0 and h>0
    screens.append(dict(path=p.relative_to(a).as_posix(),width=w,height=h,bytes=p.stat().st_size,sha256=sha(p)))
counts={name:sum(line.startswith('PASS ') for line in read(a/name).splitlines()) for name in ['mobile.log','privacy.log','import-preview.log']}
samples={tag:json.loads(re.search(r'^'+tag+r' (.+)$',read(a/'mobile.log'),re.M)[1]) for tag in ['GZIP_SAMPLE','GZIP_LARGE_SAMPLE']}
assert samples['GZIP_SAMPLE']=={'sourceBytes':1599,'archiveBytes':589}
assert samples['GZIP_LARGE_SAMPLE']=={'bytes':17080,'sourceBytes':16778921,'exact':True}
rb={'head':head,'observed':datetime.datetime.now().astimezone().isoformat(),'owned':[dict(path=f,bytes=(root/f).stat().st_size,sha256=h) for f,h in owned.items()],'sourceCount':len(source),'buildCount':len(build),'sourceManifestSha256':g['sourceManifestSha256'],'buildManifestSha256':g['buildManifestSha256'],'liveChangedPaths':changed,'liveNewPaths':new,'diffCheck':diff.returncode,'cachedDiffCheck':cached.returncode,'canon':canon.returncode,'qaSyntax':syntax,'passLines':counts,'samples':samples,'screenshots':screens}
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-107 - lossless GZIP backup archive','',
'Status: IMPLEMENTED / TESTED_LOCAL for optional compressed export and strict selected-file import. Not an at-rest journal migration or physical-device acceptance.',
f"HEAD {head}; observed {rb['observed']}.",
'Decision: wrap the existing v1 JSON envelope in standard gzip, retain plain JSON fallback. Do not alter any IndexedDB schema, stored workout bytes, reward policy, wallet, or baseline snapshots. Native browser CompressionStream and DecompressionStream only. Source compression budget 32 MiB; selected compressed input and inflated JSON each bounded to 16 MiB. Read chunks with a 15-second timeout, cancellation, exact UTF-8 round-trip verification before offering download. No extra import authority: strict existing comparator and replacement gates receive the decoded JSON. Stale prepared archive invalidated on local profile changes, cross-tab changes, pagehide and unmount.',
'Limits: compression is optional, not guaranteed to reduce every file; unsupported browsers or too-large source retain JSON fallback. Chunked decoding bounds accumulated output but cannot promise native inflater memory usage. A small compressed file with oversized decoded JSON is evidence only, not a restorable backup. No actual device test, memory/eviction/power-loss guarantee, archive of owner data, new APK, Firebase deploy, commit or push.',
f"Focused Vitest 35/35; full Vitest 924/924 in 94 files. TSC, Vite build and bundle gate exit 0. Production browser mobile {counts['mobile.log']} PASS lines; privacy {counts['privacy.log']} PASS lines (12 private paths plus app HTTP); dev import {counts['import-preview.log']} PASS assertions including compatible gzip replacement, exact original journal and no reward replay. Owned QA servers stopped.",
'Measured disposable synthetic normal backup: 1599 bytes JSON -> 589 bytes GZIP (63.16% reduction). Repetitive stress fixture: 16778921 -> 17080 bytes; original evidence preserved and decoded-size import correctly refused. These are test fixtures, not an estimate of the owner history.',
f"Frozen source {len(source)}; production build {len(build)} files. Entry {g['entry']} SHA-256 {g['entrySha256']}, 392604 bytes; 21% below previous baseline. Camera chunk 154276 bytes. Existing >500 kB chunk warning remains. Preview HTTP 200 and entry/index hash check. {len(screens)} PNG headers and hashes checked; no independent visual review claimed.",
f"Current source parity: {len(changed)} changed and {len(new)} new paths against frozen source. Owned hashes match. Diff={diff.returncode}; cached diff={cached.returncode}; canon={canon.returncode}; QA syntax={syntax}. Parallel changes not covered by frozen test run. Exact paths in final-readback.json.",
'Next: design an atomic compatible journal/checkpoint retention migration; no automatic pruning of existing baseProfileRaw.',
'Rollback: restore only hash-matching owned pre-edit files from the first before copies; use .before-qa for CSS/mobile QA and import-preview-e2e.mjs.before; remove only unchanged newly introduced backupArchive.ts/test.ts. Do not roll back unrelated work.',
'Commands: targeted Vitest, full Vitest, tsc -b, vite build, qa/bundle-on-demand.mjs, qa/mobile-e2e.mjs, qa/privacy-server-e2e.mjs, qa/import-preview-e2e.mjs; verify_canon.py.','',
'Owned paths | bytes | SHA-256',*[f'{f} | {(root/f).stat().st_size} | {h}' for f,h in owned.items()],'',
'References: https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API ; https://compression.spec.whatwg.org/ ; https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API']
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];seen=set()
secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
    assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
    if not p.is_file():continue
    rel=p.relative_to(a).as_posix();key=rel.casefold()
    assert key not in seen and '..' not in Path(rel).parts;seen.add(key)
    size=p.stat().st_size
    assert size or re.search(r'(?:tsc(?:-initial)?|preview-err|dev-err)\.log$',rel),rel
    if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.ts','.mjs','.before','.before-qa'):
        assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential pattern: '+rel
    items.append(dict(path=rel,bytes=size,sha256=sha(p)))
mf=a/'artifact-manifest.json';create(mf,json.dumps(items,indent=2)+'\n')
verify(a,load(mf))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),mf.stat().st_size,sha(mf))
print('SUMMARY',json.dumps({k:v for k,v in rb.items() if k not in ['owned','screenshots']},ensure_ascii=True))
print('SCREENSHOTS',len(screens))