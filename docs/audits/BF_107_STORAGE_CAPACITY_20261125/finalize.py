from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re,struct
root=Path.cwd()
a=root/'docs/audits/BF_107_STORAGE_CAPACITY_20261125'
copy=root/'.bodyforge-qa/bf107-storage-capacity'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return p.read_text(encoding='utf-8-sig')
def load(p):return json.loads(read(p))
def create(p,s):
    with p.open('x',encoding='utf-8',newline='\n') as f:f.write(s)
g=load(a/'gates.json');retry=load(a/'import-retry-gates.json')
assert all(g[k]==0 for k in ['unit','tsc','build','bundle','mobile','privacy'])
assert g['importPreview']==18 and retry['importPreview']==0 and retry['unchanged']
assert g['preview']==200 and g['frozenSourceAndBuildUnchanged'] and g['previewStopped'] and g['devStopped'] and retry['devStopped']
assert sha(a/'source.json').upper()==g['sourceManifestSha256']==retry['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
checks={'targeted-final.log':['41 passed (41)'],'unit.log':['865 passed (865)','91 passed (91)'],'mobile.log':['BODYFORGE_MOBILE_E2E_PASS','PASS storage panel measures observed string size and displays advisory warning','PASS capacity check performs no local mutation or persistence request','PASS refresh reports new observation without claiming quota','PASS prepared file exposes its measured byte size and capacity classification','PASS disposable journal contains oversized multibyte evidence','PASS oversize evidence download is not presented as an inspectable backup','PASS large export retains exact original evidence and unchanged wallet','PASS actual selected oversize file is refused before import','PASS large backup and rejected import never rewrite the wallet'],'import-preview.log':['Inspected target navigated or closed','QA_OWNED_CLEANUP PASS'],'import-preview-retry.log':['BODYFORGE_IMPORT_PREVIEW_E2E_PASS assertions=36','QA_OWNED_CLEANUP PASS'],'privacy.log':['BODYFORGE_PRIVATE_DEV_PATHS_PASS=12'],'bundle.log':['BODYFORGE_BUNDLE_ON_DEMAND_PASS']}
for f,need in checks.items():
    s=read(a/f)
    for item in need:assert item in s,(f,item)
assert 'QA_CHROME_PROFILE_CLEANUP_FAIL' not in read(a/'mobile.log')
owned={'src/lib/progressBackup.ts':'f1affce4f28336a3e8147401c9669078886d920eae8ed93d686b9584c1cb1993','src/lib/progressBackup.test.ts':'12d9d9a9e715b391590bdf71173d45cb51bd6afb363d775702d6755e014e1545','src/lib/progressBackupInspector.ts':'c0303d46d4586ce7d962ab9422e396923d5b2a7a5a488d8c0d0c739fd03fe8a2','src/lib/progressBackupInspector.test.ts':'9868ce56dd00281b5e55091388bb28b7fab36f42dc083ce5516d75fc29cc9c2a','src/components/ProgressBackupPanel.tsx':'cebe5db74e06634e407b83af9261b7c7732a9cb0083833d67f098a97181a79ae','src/components/progressBackup.css':'6b930b8ebb01546f83696ba807efb55d3359b793e7ed05b30fd866d493d9b9bd','src/lib/storageCapacity.ts':'79505d32c6a6b18856a1041bca86e0323ff4f06e669cee954a316497456a8c98','src/lib/storageCapacity.test.ts':'15032317c91d824774a6b130de932ba15bb963261e5967feb1897ead9c36f94d','qa/mobile-e2e.mjs':'b83a15cbf457d2b3b88a11a030498f49d9c8057bf49a6e0be4805e2351f51b08'}
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
assert len(source)==307 and len(build)==73
for f,h in owned.items():assert sha(root/f)==h,f
expected={x['path']:x['sha256'].lower() for x in source}
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0'))-{''}
changed=[p for p,h in sorted(expected.items()) if not (root/p).is_file() or sha(root/p)!=h]
new=sorted(actual-set(expected))
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check'],capture_output=True,text=True)
cached=subprocess.run(['git','-c','core.safecrlf=false','diff','--cached','--check'],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
syntax=subprocess.run(['node','--check','qa/mobile-e2e.mjs'],capture_output=True,text=True)
assert canon.returncode==0 and syntax.returncode==0 and diff.returncode==0 and cached.returncode==0
screens=[]
for p in sorted(a.rglob('*.png')):
    with p.open('rb') as f:header=f.read(24)
    assert header[:8]==b'\x89PNG\r\n\x1a\n' and header[12:16]==b'IHDR',p
    w,h=struct.unpack('>II',header[16:24]);assert w>0 and h>0
    screens.append(dict(path=p.relative_to(a).as_posix(),width=w,height=h,bytes=p.stat().st_size,sha256=sha(p)))
counts={name:sum(line.startswith('PASS ') for line in read(a/name).splitlines()) for name in ['mobile.log','privacy.log','import-preview-retry.log']}
rb={'head':head,'observed':datetime.datetime.now().astimezone().isoformat(),'owned':[dict(path=f,bytes=(root/f).stat().st_size,sha256=h) for f,h in owned.items()],'sourceCount':len(source),'buildCount':len(build),'sourceManifestSha256':g['sourceManifestSha256'],'buildManifestSha256':g['buildManifestSha256'],'liveChangedPaths':changed,'liveNewPaths':new,'diffCheck':diff.returncode,'cachedDiffCheck':cached.returncode,'canon':canon.returncode,'qaSyntax':syntax.returncode,'passLines':counts,'screenshots':screens}
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-107 - storage capacity and inspectable backup boundary','',
'Status: IMPLEMENTED / TESTED_LOCAL for advisory storage measurement, compact lossless export and explicit oversized evidence handling. Does not close scalable history archive or physical-device acceptance.',
f"HEAD {head}; observed {rb['observed']}.",
'New read-only capacity observation counts localStorage key/value UTF-16 code units times two, not actual browser disk usage or remaining quota. 3 MiB is a conservative advisory policy threshold, not a platform limit. The origin usage/quota estimate and persisted status are read separately with a two-second timeout; unsupported/invalid/late results are unknown. No probe writes, clear operations, persistence permission request or new network calls. UI invalidates stale observations.',
'Manual backup serialization uses compact JSON envelope; original opaque strings including durable baseProfileRaw are retained exactly. UTF-8 byte size determines within-limit, near-limit (75 percent of 16 MiB) or oversized. Export source-read completeness stays independent from inspection capacity. Oversize output uses evidence filename, explicit warning and download-for-analysis button; built-in file reader remains bounded at 16 MiB. No silent truncation, replacement or reward creation.',
'Focused Vitest 41/41 in four files. Full Vitest 865/865 in 91 files, TypeScript exit 0, Vite build exit 0. Actual disposable production-browser test pads the origin with a synthetic non-BODYFORGE key, observes the advisory warning, verifies no mutation or persistence request, removes only its fixture and verifies invalidation. Oversized multibyte opaque journal evidence is injected under test locks; export is preserved and selected-file inspection refuses the oversized blob. Wallet unchanged. No owner browser or storage accessed.',
f"Mobile production browser {counts['mobile.log']} PASS lines; privacy {counts['privacy.log']} PASS lines (12 private paths plus app HTTP). Initial dev import test failed with CDP navigation error after 33 prior steps; full retry on identical frozen source and harness passed {counts['import-preview-retry.log']} assertions, including exact rollback, keep, and no new reward. Both attempts retained. All owned QA servers stopped.",
f"Frozen source {len(source)} files; production build {len(build)} files. Entry {g['entry']} SHA-256 {g['entrySha256']}; 391816 bytes, 21.1% below baseline. Camera chunk 154276 bytes. Existing large-chunk warning remains. Preview HTTP 200, exact entry/index read-back. {len(screens)} PNG headers and hashes verified; no independent visual review claimed.",
f"Current source parity: {len(changed)} changed and {len(new)} new paths versus frozen source. Owned hashes match. Diff={diff.returncode}, cached diff={cached.returncode}, canon={canon.returncode}, QA syntax={syntax.returncode}. See final-readback.json. Parallel changes not covered by this frozen run.",
'Limits: actual quota, storage eviction, physical power loss, installed Android WebView, and very large archive memory usage remain unverified. 16 MiB built-in inspection limit unchanged. Large JSON evidence is downloadable but is NOT a verified restorable file. No automatically deleting or pruning history, no IDB schema migration, no APK/Firebase/Git commit/push.',
'Commands: targeted vitest; full vitest run --maxWorkers=1 --no-file-parallelism; tsc -b; vite build; node qa/bundle-on-demand.mjs; node qa/mobile-e2e.mjs; node qa/privacy-server-e2e.mjs; node qa/import-preview-e2e.mjs (one unchanged retry).','',
'Owned paths | bytes | SHA-256',*[f'{f} | {(root/f).stat().st_size} | {h}' for f,h in owned.items()],'',
'References: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate ; https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria']
# Count instead of guessing the first failed run's completed assertions.
lines=[s.replace('after 33 prior steps',f"after {sum(line.startswith('PASS ') for line in read(a/'import-preview.log').splitlines())} PASS lines") for s in lines]
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
    if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.ts','.mjs','.before','.before-ui-qa'):
        assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential pattern: '+rel
    items.append(dict(path=rel,bytes=size,sha256=sha(p)))
mf=a/'artifact-manifest.json';create(mf,json.dumps(items,indent=2)+'\n')
verify(a,load(mf))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),mf.stat().st_size,sha(mf))
print('SUMMARY',json.dumps({k:v for k,v in rb.items() if k not in ['owned','screenshots']},ensure_ascii=True))
print('SCREENSHOTS',len(screens))