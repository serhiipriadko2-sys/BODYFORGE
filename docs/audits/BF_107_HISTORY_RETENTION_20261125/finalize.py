from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re,struct
root=Path.cwd()
a=root/'docs/audits/BF_107_HISTORY_RETENTION_20261125'
copy=root/'.bodyforge-qa/bf107-history-retention'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return p.read_text(encoding='utf-8-sig')
def load(p):return json.loads(read(p))
def create(p,s):
    with p.open('x',encoding='utf-8',newline='\n') as f:f.write(s)
g=load(a/'gates.json')
assert all(g[k]==0 for k in ['unit','tsc','build','bundle','forge','replacement','importPreview','dedup','privacy'])
assert g['preview']==200 and g['frozenSourceAndBuildUnchanged'] and g['previewStopped'] and g['devStopped']
assert sha(a/'source.json').upper()==g['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
checks={'red.log':['9 failed','45 passed'],'fallback-red.log':['4 failed','8 passed'],'fallback-green.log':['155 passed (155)'],'unit.log':['844 passed (844)','88 passed (88)'],'forge.log':['BODYFORGE_FORGE_XP_FAQ_E2E_PASS','QA_OWNED_CLEANUP PASS','PASS ordinary UI wallet save retains all exact workout values and ordering','PASS fallback retains exact pre-save source and no workout XP is issued','PASS real reload preserves complete acknowledged primary','PASS explicit restore preserves the exact 65-row fallback bytes','PASS damaged original retained during uncapped restore'],'replacement.log':['BODYFORGE_REPLACE_CORE_E2E_PASS assertions=73 crashes=3','QA_OWNED_CLEANUP PASS'],'import-preview.log':['BODYFORGE_IMPORT_PREVIEW_E2E_PASS assertions=36','QA_OWNED_CLEANUP PASS'],'dedup.log':['BODYFORGE_DEDUP_RECOVERY_PASS','"assertions":34','QA_OWNED_CLEANUP PASS'],'privacy.log':['BODYFORGE_PRIVATE_DEV_PATHS_PASS=12'],'bundle.log':['BODYFORGE_BUNDLE_ON_DEMAND_PASS']}
for f,need in checks.items():
    s=read(a/f)
    for item in need:assert item in s,(f,item)
owned={'src/lib/progression.ts':'cafc31cc4c43f9019cf8c45508bf6c5c84207ee0cee4a1519746bc089e3e4ff6','src/lib/historyRetention.test.ts':'1efb043ec62d2770710e076c83bcefbd70e5cdb76922fae2dd1467d8154b2838','src/lib/profileReplacement.ts':'b6c4163c487a5545bf85e8f5948566179c2707dc5923371fae3e31d98b532087','src/lib/profileReplacement.test.ts':'b3d65e9aa9373cc77ab11573819b321232c7c6557899878b29a0ee24565be1ca','src/lib/settledImportHistory.ts':'a7aacc81ad235383c3a53340ec447f12aca5b6e4a876f5170f337d74afc0985d','qa/forge-home-xp-faq-e2e.mjs':'e957af783eea976aa19e62c391e44b31a50712c8b3e796b9d55b5a59f185d7d8'}
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
assert len(source)==300 and len(build)==72
for f,h in owned.items():assert sha(root/f)==h,f
expected={x['path']:x['sha256'].lower() for x in source}
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0'))-{''}
changed=[p for p,h in sorted(expected.items()) if not (root/p).is_file() or sha(root/p)!=h]
new=sorted(actual-set(expected))
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check'],capture_output=True,text=True)
cached=subprocess.run(['git','-c','core.safecrlf=false','diff','--cached','--check'],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
syntax=subprocess.run(['node','--check','qa/forge-home-xp-faq-e2e.mjs'],capture_output=True,text=True)
assert canon.returncode==0 and syntax.returncode==0 and diff.returncode==0 and cached.returncode==0
screens=[]
for p in sorted(a.rglob('*.png')):
    with p.open('rb') as f:header=f.read(24)
    assert header[:8]==b'\x89PNG\r\n\x1a\n' and header[12:16]==b'IHDR',p
    w,h=struct.unpack('>II',header[16:24]);assert w>0 and h>0
    screens.append(dict(path=p.relative_to(a).as_posix(),width=w,height=h,bytes=p.stat().st_size,sha256=sha(p)))
counts={name:sum(line.startswith('PASS ') for line in read(a/name).splitlines()) for name in ['forge.log','replacement.log','import-preview.log','dedup.log','privacy.log']}
rb={'head':head,'observed':datetime.datetime.now().astimezone().isoformat(),'owned':[dict(path=f,bytes=(root/f).stat().st_size,sha256=h) for f,h in owned.items()],'sourceCount':len(source),'buildCount':len(build),'sourceManifestSha256':g['sourceManifestSha256'],'buildManifestSha256':g['buildManifestSha256'],'liveChangedPaths':changed,'liveNewPaths':new,'diffCheck':diff.returncode,'cachedDiffCheck':cached.returncode,'canon':canon.returncode,'qaSyntax':syntax.returncode,'passLines':counts,'screenshots':screens}
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-107 - retained detailed workout originals','',
'Status: IMPLEMENTED / TESTED_LOCAL for lossless retained v1 rows, fallback protection and compatible file replacement. BF-107 has verified local index, coverage and retention policy. Compact scalable archive, capacity UX, physical-device and eviction tests remain open.',
f"HEAD {head}; observed {rb['observed']}.",
'Decision recorded in ADR.md before patch. Keep the existing v1 key and shape. Last 60 is only a view cap. On cap crossing, uncapped source or supplied full history, retain original workout objects and their order and require the projected profile to equal the intended normalized profile. Preserve original metadata/receipts. Conflicts, malformed originals and missing identities fail closed. No reconstruction of missing dates or new rewards.',
'Exact old primary is retained as fallback in the retention branch; explicitly restoring an uncapped backup copies its exact raw bytes. A detailed fallback with 60 or more rows that would otherwise lose available original rows during rotation is preserved in the existing exportable quarantine before overwrite. Failure to preserve blocks the save. Explicit fresh start also protects a distinct detailed fallback. No automatic merge of stale wallet or cross-fighter rows.',
'Compatible imports can carry uncapped v1 history while retaining the strict marker/identity/size/settled-journal gates. Both previous slots must retain the available original records. Settled history compares the uncapped receipt view, so an old conflicting duration is not hidden by the last-60 cap.',
'Initial regression: 9 failed / 45 passed. Retention patch focused: 151/151. Additional fallback/batch negative regression: 4 failed / 8 passed. A patch command initially failed on escaped TypeScript template literals before production write; corrected the patch script and verified exact source precondition. Final focused 155/155 in 6 files. Full Vitest 844/844 in 88 files; tsc and Vite build exit 0.',
f"Production browser forge {counts['forge.log']} PASS lines, including actual UI login reward with 65 original rows, unchanged workout XP, exact fallback, reload, deliberate corruption of disposable primary, exact fallback restore, retained damaged raw, and full-history chart. Replacement 73 assertions/3 actual owned renderer crashes; file preview/import 36; dedup recovery 34; privacy 12 private paths (13 PASS lines including app HTTP). All owned QA servers stopped; no owner browser/profile used.",
f"Frozen source {len(source)} files; production build {len(build)} files. Entry {g['entry']} SHA-256 {g['entrySha256']}; 391465 bytes, 21.2% below 496761 baseline. Camera chunk 154276 bytes. Large-chunk warning remains. Preview HTTP 200, exact index and entry read-back, real DOM. PNG headers and hashes verified for {len(screens)} captures; no visual review claimed.",
f"Current tree parity: {len(changed)} changed, {len(new)} new paths versus frozen source. Owned hashes match. Git diff={diff.returncode}, staged diff={cached.returncode}, canon={canon.returncode}, QA syntax={syntax.returncode}. See final-readback.json. No inference about parallel changes outside tested snapshot.",
'Limits: retaining raw full rows increases snapshot size; quota can prevent writes and the export/marker limit remains 16 MiB. Browser eviction, storage pressure, physical power loss and realme not verified. No automatic pruning or new database schema. Earlier already-lost dates are not recovered; unique fallback preservation is bounded to detailed fallback of >=60 rows. Full mobile suite not rerun in this iteration; profile-specific production browser tests run. No camera accuracy claim. No APK, Firebase publication, Git commit or push by this task.',
'Rollback: restore progression.ts.before, profileReplacement.ts.before, profileReplacement.test.ts.before, settledImportHistory.ts.before and forge-home-xp-faq-e2e.mjs.before-fallback-qa only after matching current owned hashes; remove only unchanged new historyRetention.test.ts. Preserve prior activity index and parallel avatar/camera changes.',
'Commands: targeted Vitest; full vitest run --maxWorkers=1 --no-file-parallelism; tsc -b; vite build; node qa/bundle-on-demand.mjs; node qa/forge-home-xp-faq-e2e.mjs; node qa/profile-replacement-e2e.mjs; node qa/import-preview-e2e.mjs; node qa/journal-e2e.mjs --dedup-only; node qa/privacy-server-e2e.mjs.','',
'Owned paths | bytes | SHA-256',*[f'{f} | {(root/f).stat().st_size} | {h}' for f,h in owned.items()],'',
'References: https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability ; https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria']
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];seen=set()
secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
    assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
    if not p.is_file():continue
    rel=p.relative_to(a).as_posix();key=rel.casefold()
    assert key not in seen and '..' not in Path(rel).parts;seen.add(key)
    size=p.stat().st_size
    assert size or re.search(r'(?:tsc|preview-err|dev-err)\.log$',rel),rel
    if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.ts','.mjs','.before'):
        assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential pattern: '+rel
    items.append(dict(path=rel,bytes=size,sha256=sha(p)))
mf=a/'artifact-manifest.json';create(mf,json.dumps(items,indent=2)+'\n')
verify(a,load(mf))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),mf.stat().st_size,sha(mf))
print('READBACK',json.dumps({k:v for k,v in rb.items() if k!='screenshots'},ensure_ascii=True))
print('SCREENSHOTS',len(screens))