from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re
root=Path.cwd()
a=root/'docs/audits/BF_106_EPOCH_FINALIZE_20261125'
r=a/'green-recheck'
copy=root/'.bodyforge-qa/bf106-epoch-finalize-recheck'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return p.read_text(encoding='utf-8-sig')
def load(p):return json.loads(read(p))
def create(p,s):
    with p.open('x',encoding='utf-8',newline='\n') as f:f.write(s)
g=load(r/'gates.json');b=load(r/'retry-gates.json')
assert g['tsc']==0 and all(g[k]==0 for k in ['epoch','journalGate','importPreview'])
assert g['unit']==1 and g['replacement']==19
assert all(b[k]==0 for k in ['counter','unit','replacement','build','bundle','privacy'])
assert b['preview']==200 and b['frozenSourceAndBuildUnchanged'] and b['previewStopped'] and b['devStopped']
assert sha(r/'source.json').upper()==g['sourceManifestSha256']==b['sourceManifestSha256']
assert sha(r/'retry-build-manifest.json').upper()==b['buildManifestSha256']
markers={
a/'epoch-commit-targeted.log':['65 passed (65)'],
r/'epoch-browser.log':['BODYFORGE_WORKOUT_EPOCH_E2E_PASS assertions=31','QA_OWNED_CLEANUP PASS'],
r/'journal-gate.log':['BODYFORGE_JOURNAL_GATE_E2E_PASS assertions=27','QA_OWNED_CLEANUP PASS'],
r/'import-preview.log':['BODYFORGE_IMPORT_PREVIEW_E2E_PASS assertions=24','QA_OWNED_CLEANUP PASS'],
r/'retry-counter.log':['27 passed (27)'],
r/'retry-unit.log':['806 passed (806)','83 passed (83)'],
r/'retry-replacement-browser.log':['BODYFORGE_REPLACE_CORE_E2E_PASS assertions=73 crashes=3','QA_OWNED_CLEANUP PASS','PASS late completion cannot award the accepted profile'],
r/'retry-privacy.log':['BODYFORGE_PRIVATE_DEV_PATHS_PASS=12'],
r/'retry-bundle.log':['BODYFORGE_BUNDLE_ON_DEMAND_PASS']
}
for p,need in markers.items():
    for marker in need: assert marker in read(p),(str(p),marker)
owned={
'src/hooks/useProfileStorage.ts':'4de6ccf0795dc1b9451a619c0c63809ef3e000f07c8a479902c2c2766735e910',
'src/lib/profileReplacement.ts':'e0f1c325c7fad55fb66f6092c5e91769fddec55d2158ee9ddecdf2b523f3f1a5',
'src/lib/profileReplacement.test.ts':'cff453bb160144253c9280bcc3a06ede1360cf2e89559f7e474ad78933eac701',
'src/lib/profileReplacementRecovery.ts':'39bcb20fe75bd7a389484a1a9e08c4db125a4acb6d0f4f70a1a6d230d8bf715f',
'src/lib/profileReplacementRecovery.test.ts':'d6fa0e7b2451454d17d04bc99ff1fd896e6a2854b4188c07fdaa429a24f7b630',
'qa/profile-replacement-e2e.mjs':'a75221bd9c36d8095b3b079702fb7ecf310f5695dd5e4258ec87886726985f31',
'qa/journal-gate-e2e.mjs':'40ef6edf4690d8f50952d34abe4338d6c0742b33fd1ab07197cf3beab5f3cdcc'}
def verify(folder,rows):
    seen=set()
    for row in rows:
        rel=Path(row['path']);key=row['path'].casefold()
        assert not rel.is_absolute() and '..' not in rel.parts and key not in seen
        seen.add(key);p=folder/rel
        assert p.is_file() and not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
        assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'].lower(),row['path']
source=load(r/'source.json');build=load(r/'retry-build-manifest.json')
verify(copy,source);verify(copy/'dist',build)
assert len(source)==287 and len(build)==69
for f,h in owned.items():assert sha(root/f)==h,f
assert b['qaSha256'].lower()==owned['qa/profile-replacement-e2e.mjs']
expected={x['path']:x['sha256'].lower() for x in source};expected.update(owned)
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0'))-{''}
changed=[p for p,h in sorted(expected.items()) if not (root/p).is_file() or sha(root/p)!=h]
new=sorted(actual-set(expected))
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check'],capture_output=True,text=True)
cached=subprocess.run(['git','-c','core.safecrlf=false','diff','--cached','--check'],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
syntax={f:subprocess.run(['node','--check',f],capture_output=True,text=True).returncode for f in owned if f.endswith('.mjs')}
assert canon.returncode==0 and all(x==0 for x in syntax.values())
rb={'head':head,'observed':datetime.datetime.now().astimezone().isoformat(),'owned':[dict(path=f,bytes=(root/f).stat().st_size,sha256=h) for f,h in owned.items()],'sourceCount':len(source),'buildCount':len(build),'sourceManifestSha256':g['sourceManifestSha256'],'buildManifestSha256':b['buildManifestSha256'],'externalQASha256':b['qaSha256'],'liveChangedPaths':changed,'liveNewPaths':new,'diffCheck':diff.returncode,'cachedDiffCheck':cached.returncode,'canon':canon.returncode,'qaSyntax':syntax}
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=['# BF-106 - workout generation and verified replacement acceptance','',
'Status: IMPLEMENTED / TESTED_LOCAL for generation-aware acceptance of staged replacement, old-workout preservation, stale-tab fence, and rollback of interrupted generation commit. Full forward import from selected file and physical-device acceptance remain PARTIAL.',
f"HEAD {head}; observed {rb['observed']}.",
'Existing epoch protection prevents uncredited late results from reaching a different wallet generation. The hook now observes epoch-only changes, checks lineage inside the existing profile lock before saves, preparation, recovery and unowned replay, and requires explicit reload for a stale view. The independent immutable completion stage is preserved.',
'New marker v2 includes beforeEpoch. Acceptance validates the pair/history and writes transactionId as the next epoch before marker removal, verifies both values and keeps rollback evidence on uncertainty. Restart can resume finalization or restore previous epoch and exact primary/fallback. Legacy v1 marker is rollback-only when epoch is absent. Existing profile keys and workout result originals are retained. Production recovery port observes epoch and writes it only under the existing ordered profile/exclusive journal locks.',
'Tests: 65/65 focused; exercise counter retry 27/27; full Vitest 806/806 in 83 files, TypeScript exit 0. Browser: 31/31 epoch; 73/73 replacement (3 actual owned renderer crashes); 27/27 journal gate; 24/24 preview; 12/12 privacy. Real UI acceptance persists new epoch before reopening. An independently prepared pre-import workout stages exact bytes after actual acceptance, remains active/unpaid and preserves both accepted profile strings. No physical camera or real-device/power-loss claim.',
'Prior failed runs retained: epoch-only UI red; TS2556 in parallel avatarScalpDensity.test.ts, fixed by parallel work and copied as only test overlay; Vitest worker unexpected exit 3221226505 in exerciseCounter.test.ts (779 passing assertions, not accepted); CDP navigation context failure after rollback, corrected read-only wait only, no retry of mutations. Same frozen product passed repeat full unit, replacement browser and build. All owned Chrome cleanup markers present; QA servers stopped.',
f"Frozen source {len(source)} files; production build {len(build)} files. Entry {b['entry']} SHA-256 {b['entrySha256']}; 388883 bytes (21.7% below 496761 baseline), lazy camera 154276 bytes. Existing >500 kB chunk warning remains. Exact index and entry HTTP readback match. Final replacement harness is an external QA-only overlay with exact SHA-256 {b['qaSha256'].lower()}, not a changed build input.",
f"Current source comparison: {len(changed)} changed, {len(new)} new paths vs tested snapshot plus verified QA overlay. diff={diff.returncode}, staged diff={cached.returncode}, canon={canon.returncode}. See final-readback.json. Do not infer acceptance of parallel edits.",
'No actual owner profile read or write, APK, Firebase deploy, Git stage/commit/push. Forward file import still not exposed by ProgressBackupPanel. Narrow pilot requires quiet stores, compatible identity and auxiliary bytes, retained reward identities. Need full explicit file-to-staged replacement integration with source revalidation, consent and durable retention, and physical-device tests. Epoch protocol is cooperative, not anti-cheat or disk durability guarantee.',
'Rollback code: use exact .before-epoch-commit / .before-epoch-ui-fix files after matching owned hashes; QA before-epoch-commit restores its previous script; do not revert parallel avatar or earlier epoch changes. No workspace reset.',
'Commands: npm test targeted replacement/recovery/fence/epoch; vitest run --maxWorkers=1 --no-file-parallelism; tsc -b; vite build; node qa/workout-epoch-e2e.mjs; node qa/profile-replacement-e2e.mjs; node qa/journal-gate-e2e.mjs; node qa/import-preview-e2e.mjs; node qa/bundle-on-demand.mjs; node qa/privacy-server-e2e.mjs.','',
'Owned paths | bytes | SHA-256',*[f'{f} | {(root/f).stat().st_size} | {h}' for f,h in owned.items()],'',
'References: https://www.w3.org/TR/web-locks/ ; https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request']
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];seen=set()
secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
    assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
    if not p.is_file():continue
    rel=p.relative_to(a).as_posix();key=rel.casefold()
    assert key not in seen and '..' not in Path(rel).parts;seen.add(key)
    size=p.stat().st_size
    assert size or re.search(r'(?:tsc|dev-err|preview-err)\.log$',rel),rel
    if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.ts','.mjs','.before','.before-epoch-commit','.before-epoch-ui-fix'):
        assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential pattern: '+rel
    items.append(dict(path=rel,bytes=size,sha256=sha(p)))
mf=a/'artifact-manifest.json';create(mf,json.dumps(items,indent=2)+'\n')
verify(a,load(mf))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),mf.stat().st_size,sha(mf))
print('READBACK',json.dumps(rb,ensure_ascii=True))