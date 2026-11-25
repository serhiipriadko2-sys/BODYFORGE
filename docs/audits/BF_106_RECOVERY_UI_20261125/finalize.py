from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re
root=Path.cwd();a=root/'docs/audits/BF_106_RECOVERY_UI_20261125'
r=a/'recheck';copy=root/'.bodyforge-qa/bf106-recovery-ui-recheck'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return p.read_text(encoding='utf-8-sig')
def load(p):return json.loads(read(p))
def create(p,s):
    with p.open('x',encoding='utf-8',newline='\n') as f:f.write(s)
g=load(r/'gates.json');b=load(r/'browser-retry-gates.json');first=load(a/'gates.json')
assert all(g[k]==0 for k in ['avatar','unit','tsc','build','bundle'])
assert all(b[k]==0 for k in ['replacement','importPreview','dedup','privacy'])
assert b['preview']==200 and b['frozenSourceAndBuildUnchanged'] and b['previewStopped'] and b['devStopped']
assert first['unit']==1 and first['replacement']==0
assert sha(r/'source.json').upper()==g['sourceManifestSha256']==b['sourceManifestSha256']
assert sha(r/'build-manifest.json').upper()==g['buildManifestSha256']==b['buildManifestSha256']
for p,marker in [(a/'targeted.log','33 passed (33)'),(r/'unit.log','757 passed (757)'),(r/'avatar.log','4 passed (4)'),(r/'retry-browser.log','BODYFORGE_REPLACE_CORE_E2E_PASS assertions=64 crashes=3'),(r/'retry-browser.log','QA_OWNED_CLEANUP PASS'),(r/'retry-import-preview.log','BODYFORGE_IMPORT_PREVIEW_E2E_PASS assertions=24'),(r/'retry-import-preview.log','QA_OWNED_CLEANUP PASS'),(r/'retry-dedup.log','BODYFORGE_DEDUP_RECOVERY_PASS'),(r/'retry-dedup.log','"assertions":34'),(r/'retry-dedup.log','QA_OWNED_CLEANUP PASS'),(r/'retry-privacy.log','BODYFORGE_PRIVATE_DEV_PATHS_PASS=12'),(r/'bundle.log','BODYFORGE_BUNDLE_ON_DEMAND_PASS')]:
    assert marker in read(p),str(p)
owned={
'src/App.tsx':'aed7c608fa02371bf5bc6aaf0620e135a94e37d38ded08ab208de903e512cc3d',
'src/components/StorageRecovery.tsx':'e4cb38de47702017a0363f98311df1d042d0a4426705c259d093ee48286a016e',
'src/components/ReplacementRecoveryPanel.tsx':'85b93e874360ac16c9f83a31ce5fd95d43457394f5e1b6827dc490b00f54d7d5',
'src/lib/profileReplacementRecovery.ts':'95fc22c5914fea1e353ef22c91949a12c533cc8a744f2f774c39ce66be2bd43a',
'src/lib/profileReplacementRecovery.test.ts':'9115d63c6379010d2b9ce119c173247321309e56ff0c68e0ed981c3b6bb8c562',
'qa/profile-replacement-e2e.mjs':'a1241a154c5d8bc7b4494d89c631d5ff1cc8eb44c59656e1fbfc7a18245e660f'}
def verify(folder,rows):
    seen=set()
    for row in rows:
        rel=Path(row['path']);key=row['path'].casefold()
        assert not rel.is_absolute() and '..' not in rel.parts and key not in seen
        seen.add(key);p=folder/rel
        assert p.is_file() and not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
        assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'].lower(),row['path']
source=load(r/'source.json');build=load(r/'build-manifest.json')
verify(copy,source);verify(copy/'dist',build)
assert len(source)==273 and len(build)==69
for f,h in owned.items():assert sha(root/f)==h,f
expected={x['path']:x['sha256'].lower() for x in source}
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
lines=['# BF-106 - explicit recovery UI and locked rollback','',
'Status: IMPLEMENTED / TESTED_LOCAL for explicit rollback of existing replacement markers and normal startup after rollback. Full BF-106 forward import/finalization remains not enabled.',
f"HEAD {head}; observed {rb['observed']}.",
'Scope: reuse canonical replacement core and parallel startup fence. Locked recovery reads exact primary/fallback, auxiliary values, local/durable journal and quarantine state. It binds rollback confirmation to exact observed marker. Cancel performs no recovery mutation. Unknown, malformed or conflicting marker is preserved. Existing pending result or write blocks rollback in UI. Export requests local download; actual file saving is not inferred. Recovery UI is loaded only on demand; ordinary recovery and quarantine notice remain available in their respective states.',
'No forward replace button, automatic commit, marker retention/finalization, deletion of durable results, or production/user-profile restore. Independent durable stage can race the profile lock; complete forward import requires a verified coordination/finalization gate. This is not a physical-device power-loss guarantee. No real device check.',
'Tests: 33/33 focused (20 core, 9 adapter, 4 fence); final full 757/757 in 77 files; tsc and Vite build exit 0. Initial frozen run 756/757: parallel avatar emblem clearance test failed at -1.20742 mm vs -0.5 mm threshold. Parallel avatar correction changed avatarPhysique.ts and added avatarChestMarkFit.ts. New frozen snapshot confirms 4/4 avatar anatomy tests and 757/757 total. No changes to parallel avatar code by this patch.',
'Initial recheck browser attempts at port 6000 failed before scenarios with TypeError fetch failed; direct Node fetch cause bad port verified. Retried exact same source/build on 6100 with Node HTTP preflight. Final browser: 64/64 replacement with 3 real renderer crashes, exact marker and primary/fallback on cancellation, confirmed UI rollback and reopen, malformed marker evidence export and no normal retry; import preview 24/24; dedup 34/34; privacy 12/12. Disposable Chrome cleaned; test servers stopped. Production index and entry HTTP exact byte match.',
f"Frozen inputs {len(source)}; build {len(build)} files. Entry {g['entry']} SHA-256 {g['entrySha256']}; 375329 bytes (24.4% below historical 496761 byte baseline), camera chunk separate 154276 bytes. Previous fence entry 397313 bytes; warning for other large chunks remains.",
f"Live source drift: {len(changed)} changed, {len(new)} new paths vs final tested snapshot. diff={diff.returncode}, cached={cached.returncode}, canon={canon.returncode}, syntax={syntax.returncode}. See final-readback.json. Whole-current-tree verification bounded by exact manifest parity.",
'No owner profile reads/writes; no APK, Firebase publication, Git commit/stage/push. Rollback of changes: compare exact owned hashes, restore only App.tsx.before, StorageRecovery.tsx.before, profile-replacement-e2e.mjs.before; remove only new recovery adapter, adapter tests, and new panel if unchanged. ReplacementRecoveryPanel.tsx.before is the pre-wiring intermediate, not the pre-task state. Preserve unrelated work.',
'Next: design exclusive coordination with independent result staging and durable retention, finalization receipts and full acceptance before enabling actual replace.','',
'Owned paths | bytes | SHA-256',
*[f'{f} | {(root/f).stat().st_size} | {h}' for f,h in owned.items()],'',
'References: https://www.w3.org/TR/web-locks/ ; https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event']
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
print('READBACK',json.dumps(rb,ensure_ascii=True))