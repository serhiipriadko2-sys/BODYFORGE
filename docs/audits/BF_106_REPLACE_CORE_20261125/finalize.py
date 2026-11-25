from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re
root=Path.cwd()
a=root/'docs/audits/BF_106_REPLACE_CORE_20261125'
copy=root/'.bodyforge-qa/bf106-replace-core'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return p.read_text(encoding='utf-8-sig')
def load(p):return json.loads(read(p))
def create(p,s):
    with p.open('x',encoding='utf-8',newline='\n') as f:f.write(s)
g=load(a/'gates.json')
assert all(g[k]==0 for k in ['unit','tsc','build','bundle','replacement','importPreview','privacy'])
assert g['preview']==200 and g['frozenSourceAndBuildUnchanged'] and g['devStopped'] and g['previewStopped']
assert sha(a/'source.json').upper()==g['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
for name,marker in [('hardened-targeted.log','58 passed (58)'),('unit.log','742 passed (742)'),('browser.log','BODYFORGE_REPLACE_CORE_E2E_PASS assertions=52 crashes=3'),('browser.log','QA_OWNED_CLEANUP PASS'),('import-preview.log','BODYFORGE_IMPORT_PREVIEW_E2E_PASS assertions=24'),('import-preview.log','QA_OWNED_CLEANUP PASS'),('privacy.log','BODYFORGE_PRIVATE_DEV_PATHS_PASS=12'),('bundle.log','BODYFORGE_BUNDLE_ON_DEMAND_PASS')]:
    assert marker in read(a/name),name
owned={
'src/lib/profileReplacement.ts':'9535349f81f975d8b8874545b8989a7b2c5cc56b08a781f840eba11a2f76401e',
'src/lib/profileReplacement.test.ts':'68d2047871ddbeb33579fd4ae12fdd9cbf68517b24c82dd3a0426bbe10cc77ef',
'qa/profile-replacement-e2e.mjs':'6e2ee1d6f6247c0c58e85a89de3ee84129e629425a1d9bdeec812aebad7fdc64'}
def verify(folder,rows):
    seen=set()
    for row in rows:
        rel=Path(row['path'])
        assert not rel.is_absolute() and '..' not in rel.parts and row['path'].casefold() not in seen
        seen.add(row['path'].casefold())
        p=folder/rel
        assert p.is_file() and not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
        assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'].lower(),row['path']
source=load(a/'source.json');build=load(a/'build-manifest.json')
verify(copy,source);verify(copy/'dist',build)
assert len(source)==268 and len(build)==64
for f,h in owned.items():
    assert sha(root/f)==h,f
    assert not any(line.endswith((' ','\t')) for line in read(root/f).splitlines()),f
expected={r['path']:r['sha256'].lower() for r in source}
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0'))-{''}
changed=[p for p,h in sorted(expected.items()) if not (root/p).is_file() or sha(root/p)!=h]
new=sorted(actual-set(expected))
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check'],capture_output=True,text=True)
cached=subprocess.run(['git','-c','core.safecrlf=false','diff','--cached','--check'],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
syntax=subprocess.run(['node','--check','qa/profile-replacement-e2e.mjs'],capture_output=True,text=True)
assert canon.returncode==0 and syntax.returncode==0
rb={'head':head,'observed':datetime.datetime.now().astimezone().isoformat(),'owned':[dict(path=f,bytes=(root/f).stat().st_size,sha256=h) for f,h in owned.items()],'sourceCount':len(source),'buildCount':len(build),'sourceManifestSha256':g['sourceManifestSha256'],'buildManifestSha256':g['buildManifestSha256'],'liveChangedPaths':changed,'liveNewPaths':new,'diffCheck':diff.returncode,'cachedDiffCheck':cached.returncode,'canon':canon.returncode,'qaSyntax':syntax.returncode}
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-106 - isolated profile replacement core','',
'Status: IMPLEMENTED / TESTED_LOCAL for the narrow replacement state machine, explicit rollback and isolated browser crash recovery. Full BF-106 activation is NOT_IMPLEMENTED; no replace UI or startup guard.',
f"HEAD {head}; observed {rb['observed']}.",
'The exact primary and fallback are staged in a canonical marker before changing either key. The transaction ID is unique; stale confirmation cannot cancel a later identical replacement. Replacement writes and read-back operate on an injected port, with the existing exclusive Web Lock in the browser QA. No general storage mutation API, automatic replay or application wiring added. Successful apply retains marker and requires future finalization. Failures roll back recognized prefixes only, and retain explicit recovery-required status on uncertainty. Cancellation and invalid/stale decisions have zero replacement writes.',
'Pilot deliberately blocks nonempty pending/durable/quarantine journals, incompatible identity, unsupported full history or missing paid ledger, and different auxiliary data. A complete real-device import is not claimed. No power-loss durability or noncooperative-writer guarantee. Startup/replay/writer guard, locked source collection, retention/finalization and broader import policy remain required.',
'Targeted: 58/58 in 3 test files, including 20 replacement tests. Full Vitest 742/742 in 75 files. TypeScript/Vite and bundle gate exit 0. Browser QA 52/52, actual Chrome renderer crashes after marker, fallback and primary writes; each new renderer recognizes exact prefix and explicit rollback restores original bytes. Verified fault injections after real writes, cancellation, stale marker, normal reload and actual app hydration only after resolving pending marker. Prior import preview regression 24/24. Both disposable profiles cleaned. Privacy 12/12. No physical device verification.',
f"Frozen inputs {len(source)}; output {len(build)} files; production preview index and entry matched exact bytes. Entry {g['entry']} SHA-256 {g['entrySha256']}. Entry 397283 bytes; camera separate 154276 bytes. Existing large-chunk warning remains. Temporary QA servers stopped.",
f"Current source drift: {len(changed)} changed and {len(new)} new paths relative to tested snapshot. diff={diff.returncode}, cached={cached.returncode}, canon={canon.returncode}, syntax={syntax.returncode}. Whole current-tree PASS requires parity, not merely frozen build.",
'Commands: npm test targeted files; node qa/profile-replacement-e2e.mjs; node qa/import-preview-e2e.mjs; vitest run --maxWorkers=1 --no-file-parallelism; tsc -b; vite build; node qa/bundle-on-demand.mjs; node qa/privacy-server-e2e.mjs.',
'No owner profile reads/writes, APK, Firebase, git stage/commit/push. Rollback of code: remove the three new owned files only if current hashes match; preserve all unrelated work.',
'Next: wire fail-closed startup and all writer/replay guards, verified source collector and explicit marker recovery/finalization; then run actual integrated app acceptance before enabling user replacement.','',
'Owned paths | bytes | SHA-256',
*[f'{f} | {(root/f).stat().st_size} | {h}' for f,h in owned.items()], '',
'References: https://www.w3.org/TR/2021/SPSD-webstorage-20210128/ ; https://www.w3.org/TR/web-locks/']
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];seen=set()
secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
    assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
    if not p.is_file():continue
    rel=p.relative_to(a).as_posix()
    assert rel.casefold() not in seen and '..' not in Path(rel).parts
    seen.add(rel.casefold());size=p.stat().st_size
    assert size or re.search(r'(?:tsc|preview-err|dev-err)\.log$',rel),rel
    if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.ts','.mjs'):
        assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential pattern: '+rel
    items.append(dict(path=rel,bytes=size,sha256=sha(p)))
mf=a/'artifact-manifest.json'
create(mf,json.dumps(items,indent=2)+'\n')
verify(a,load(mf))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),mf.stat().st_size,sha(mf))
print('READBACK',json.dumps(rb,ensure_ascii=True))