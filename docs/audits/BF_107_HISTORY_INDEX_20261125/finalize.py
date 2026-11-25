from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re,struct
root=Path.cwd()
a=root/'docs/audits/BF_107_HISTORY_INDEX_20261125'
copy=root/'.bodyforge-qa/bf107-history-index'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return p.read_text(encoding='utf-8-sig')
def load(p):return json.loads(read(p))
def create(p,s):
    with p.open('x',encoding='utf-8',newline='\n') as f:f.write(s)
g=load(a/'gates.json');retry=load(a/'mobile-retry-gates.json')
assert all(g[k]==0 for k in ['unit','tsc','build','bundle','forge','privacy'])
assert g['mobile']==12 and retry['mobile']==0 and retry['unchanged']
assert g['preview']==200 and g['frozenSourceAndBuildUnchanged'] and g['previewStopped'] and retry['previewStopped']
assert sha(a/'source.json').upper()==g['sourceManifestSha256']==retry['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']==retry['buildManifestSha256']
checks={'targeted.log':['19 passed (20)'],'targeted-fixed.log':['20 passed (20)'],'unit.log':['824 passed (824)','86 passed (86)'],'forge.log':['BODYFORGE_FORGE_XP_FAQ_E2E_PASS','QA_OWNED_CLEANUP PASS','PASS restored dates and exact comparison for 7 days','PASS restored dates and exact comparison for 30 days','PASS view and reload preserve all original localStorage bytes','PASS full history view leaves every IndexedDB original unchanged'],'mobile.log':['Unable to capture screenshot','PASS cross-tab race is never presented as a complete backup'],'mobile-retry.log':['BODYFORGE_MOBILE_E2E_PASS'],'privacy.log':['BODYFORGE_PRIVATE_DEV_PATHS_PASS=12'],'bundle.log':['BODYFORGE_BUNDLE_ON_DEMAND_PASS']}
for f,need in checks.items():
    s=read(a/f)
    for item in need:
        if item=='19 passed (20)' and f=='targeted.log':
            assert 'Invalid timed hold' in s
        else:assert item in s,(f,item)
owned={
'src/lib/activityHistory.ts':'d0ded94810f5ff40e0df2e573580709770c7f543a15d79148f6953648e6ec2d8',
'src/lib/activityHistory.test.ts':'039ff632f4db51bcc5cae7a430a3d532249a705bb16a64aba18493d4d324f2a0',
'src/lib/progressPulse.ts':'ca7b38ff227080011c97d5094e20c2ba0d79fa69e6f5b4c2da31e8b704529b04',
'src/components/ProgressPulseBoard.tsx':'05458c68e1b83725aae0b18d481547298e57615e2a02cd6cbab31efe93e6889b',
'qa/forge-home-xp-faq-e2e.mjs':'efdb1cf0cf9755fefe1348fcf0a598f5f4d96f4682f26b1886d4601bd31c6e7c'}
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
assert len(source)==295 and len(build)==72
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
counts={name:sum(line.startswith('PASS ') for line in read(a/name).splitlines()) for name in ['forge.log','mobile-retry.log','privacy.log']}
assert canon.returncode==0 and syntax.returncode==0
screens=[]
for p in sorted(a.rglob('*.png')):
    with p.open('rb') as f:header=f.read(24)
    assert header[:8]==b'\x89PNG\r\n\x1a\n' and header[12:16]==b'IHDR',p
    w,h=struct.unpack('>II',header[16:24])
    assert w>0 and h>0
    screens.append(dict(path=p.relative_to(a).as_posix(),width=w,height=h,bytes=p.stat().st_size,sha256=sha(p)))
rb={'head':head,'observed':datetime.datetime.now().astimezone().isoformat(),'owned':[dict(path=f,bytes=(root/f).stat().st_size,sha256=h) for f,h in owned.items()],'sourceCount':len(source),'buildCount':len(build),'sourceManifestSha256':g['sourceManifestSha256'],'buildManifestSha256':g['buildManifestSha256'],'liveChangedPaths':changed,'liveNewPaths':new,'diffCheck':diff.returncode,'cachedDiffCheck':cached.returncode,'canon':canon.returncode,'qaSyntax':syntax.returncode,'passLines':counts,'screenshots':screens}
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-107 - read-only full activity history projection','',
'Status: IMPLEMENTED / TESTED_LOCAL for the activity index and its visible coverage; BF-107 full retention/migration remains PARTIAL.',
f"HEAD {head}; observed {rb['observed']}.",
'The local profile remains the only wallet. A read-only projection combines exact current profile receipts with settled, canonical, same-fighter IndexedDB originals whose IDs occur in the stored paid ledger. Conflicting facts are excluded, pending/quarantined/foreign/unpaid results are not admitted, and a capped history is considered complete only with explicit retained identities and matching workout/repetition/hold totals. No dates or rewards are synthesized. No journal rows are pruned. The index checks the saved revision and epoch under the existing profile lock. The Camera activity card refreshes when visible and cancels stale requests; without full coverage it displays lower bounds.',
'Browser production fixture: 65 paid workouts, 60 visible records, five older settled originals and one duplicate visible ID. 7-day comparison: 64 current, 1 prior, 1280 reps, 2 active days; 30-day: 65, 1300 reps, 3 active days. The earlier incomplete fixture continues to omit unknown dates. All localStorage key/value bytes and each IndexedDB original key/raw/base/state/schema preserved across viewing and reload. This does not prove camera validity.',
f"Focused tests 20/20; first fixture run 19/20 because the synthetic plank lacked its required holdSeconds=30; only fixture corrected. Full Vitest 824/824 in 86 files; TypeScript, Vite build and bundle gate exit 0. Production forge {counts['forge.log']} PASS lines, privacy {counts['privacy.log']} PASS lines. Initial mobile gate exit 12 on CDP Unable to capture screenshot after all backup inspection assertions; repeated unchanged build, new disposable browser and port, mobile exit 0 with {counts['mobile-retry.log']} PASS lines. Both owned preview servers stopped; no change to app code between runs.",
f"Frozen inputs {len(source)}; build {len(build)} files. Entry {g['entry']} SHA-256 {g['entrySha256']}; 388964 bytes, 21.7% below 496761 byte baseline. Camera chunk 154276 bytes. Large-chunk warning remains. Production preview HTTP 200 and exact entry/index checks. PNG headers and hashes verified for {len(screens)} captures; no independent visual inspection claimed.",
f"Current tree parity: {len(changed)} changed, {len(new)} new paths versus frozen source. diff={diff.returncode}, staged diff={cached.returncode}, canon={canon.returncode}, syntax={syntax.returncode}. See final-readback.json for exact paths. Do not extrapolate test results to untested parallel work.",
'Limits: no persistent history migration or new retention database schema, no recovery of already lost dates, no physical-device/power-loss/eviction test. Explicit retention rules and safe preservation of uncapped legacy raw history before normal saves are still required. No owner progress accessed, modified or exported; no APK or Firebase publication; no Git commit/push.',
'Rollback: restore only the exact pre-edit progressPulse.ts.before, ProgressPulseBoard.tsx.before and forge-home-xp-faq-e2e.mjs.before after matching owned hashes; remove only the two unchanged new activityHistory files. Preserve all parallel avatar changes.',
'Commands: npm test targeted activityHistory/progressPulse; vitest run --maxWorkers=1 --no-file-parallelism; tsc -b; vite build; node qa/bundle-on-demand.mjs; node qa/forge-home-xp-faq-e2e.mjs; node qa/mobile-e2e.mjs (one unchanged-build retry); node qa/privacy-server-e2e.mjs.','',
'Owned paths | bytes | SHA-256',*[f'{f} | {(root/f).stat().st_size} | {h}' for f,h in owned.items()],'',
'Reference: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API']
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];seen=set()
secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
    assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
    if not p.is_file():continue
    rel=p.relative_to(a).as_posix();key=rel.casefold()
    assert key not in seen and '..' not in Path(rel).parts;seen.add(key)
    size=p.stat().st_size
    assert size or re.search(r'(?:tsc|preview-err)\.log$',rel),rel
    if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.ts','.mjs','.before'):
        assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential pattern: '+rel
    items.append(dict(path=rel,bytes=size,sha256=sha(p)))
mf=a/'artifact-manifest.json';create(mf,json.dumps(items,indent=2)+'\n')
verify(a,load(mf))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),mf.stat().st_size,sha(mf))
print('READBACK',json.dumps(rb,ensure_ascii=True))