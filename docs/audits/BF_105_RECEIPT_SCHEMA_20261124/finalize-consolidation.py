from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re
root=Path.cwd()
a=root/'docs/audits/BF_105_RECEIPT_SCHEMA_20261124'
copy=root/'.bodyforge-qa/bf105-consolidated-receipts'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def read(p): return p.read_text(encoding='utf-8-sig')
def create(p,s):
    with p.open('x',encoding='utf-8',newline='\n') as f: f.write(s)
g=load(a/'consolidated-gates.json')
r=load(a/'consolidated-retry-gates.json')
assert all(g[k]==0 for k in ['unit','tsc','build','bundle','privacy'])
assert g['preview']==200 and g['frozenSourceAndBuildUnchanged'] and g['devStopped'] and g['previewStopped']
assert r['receipt']==0 and r['sourceUnchanged'] and r['devStopped']
assert g['sourceManifestSha256']==r['sourceManifestSha256']==sha(a/'consolidated-source.json').upper()
assert g['buildManifestSha256']==sha(a/'consolidated-build-manifest.json').upper()
for name,marker in [('consolidated-unit.log','694 passed (694)'),('consolidated-targeted.log','54 passed (54)'),('consolidated-browser-retry.log','BODYFORGE_RECEIPT_PREVIEW_E2E_PASS assertions=33'),('consolidated-browser-retry.log','QA_OWNED_CLEANUP PASS'),('consolidated-privacy.log','BODYFORGE_PRIVATE_DEV_PATHS_PASS=12'),('consolidated-bundle.log','BODYFORGE_BUNDLE_ON_DEMAND_PASS')]:
    assert marker in read(a/name),name
c=load(a/'forge-cleanup-readback.json')
assert c['remainingOwnedProcesses']==0 and not c['profileExists'] and c['listenerCount']==0
owned={
 'src/lib/receiptCompatibility.ts':'5312e5013f21eebea0ac5544858fc822aa4bb4ace650d7bf9c13249d4a04c471',
 'src/lib/receiptCompatibility.test.ts':'1585e9aff81ed6ecb4f4ce349c4cf8a743124cbcbbe7ae4167a0da31b271f85f',
 'qa/receipt-preview-e2e.mjs':'8ce311347cf7cbaf25b334df460f093e7ca32557dbcb5ef34a9107fbcc7d77cc',
}
dependencies={
 'src/lib/workoutReceipt.ts':'0a4d55bc930aad4d0229b78ba351807838fc1beefb7d230e41a49b5d87b25a7f',
 'src/lib/progression.ts':'666939a292869e188f9f64aad8ad4289c2a714594e1c2fa6a9e56249fa2934b1',
}
for f,h in owned.items():
    p=root/f
    assert sha(p)==h,f
    assert not any(line.endswith((' ','\t')) for line in read(p).splitlines()),f
for f,h in dependencies.items(): assert sha(root/f)==h,f
def verify(folder,rows):
    seen=set()
    for row in rows:
        rel=Path(row['path'])
        assert not rel.is_absolute() and '..' not in rel.parts and row['path'].casefold() not in seen
        seen.add(row['path'].casefold())
        p=folder/rel
        assert p.is_file() and not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
        assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'].lower(),row['path']
source=load(a/'consolidated-source.json');build=load(a/'consolidated-build-manifest.json')
verify(copy,source);verify(copy/'dist',build)
assert len(source)==249 and len(build)==62
expected={row['path']:row['sha256'].lower() for row in source};expected.update(owned)
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0'))-{''}
changed=[p for p,h in sorted(expected.items()) if not (root/p).is_file() or sha(root/p)!=h]
new=sorted(actual-set(expected))
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check'],capture_output=True,text=True)
cached=subprocess.run(['git','-c','core.safecrlf=false','diff','--cached','--check'],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
syntax=subprocess.run(['node','--check','qa/receipt-preview-e2e.mjs'],capture_output=True,text=True)
rb={'head':head,'observed':datetime.datetime.now().astimezone().isoformat(),'owned':[dict(path=f,bytes=(root/f).stat().st_size,sha256=h) for f,h in owned.items()],'dependencies':dependencies,'frozenSourceCount':len(source),'frozenBuildCount':len(build),'sourceManifestSha256':g['sourceManifestSha256'],'buildManifestSha256':g['buildManifestSha256'],'liveChangedPaths':changed,'liveNewPaths':new,'diffCheck':diff.returncode,'cachedDiffCheck':cached.returncode,'canon':canon.returncode,'qaSyntax':syntax.returncode}
assert syntax.returncode==0 and canon.returncode==0
create(a/'consolidated-readback.json',json.dumps(rb,indent=2)+'\n')
create(a/'ADR-CONSOLIDATION.md',"""# BF-105 compatibility consolidation

Status: IMPLEMENTED / TESTED_LOCAL for the read-only compatibility projection.
This supersedes the separate provisional receipt definitions in this folder's
initial ADR. The persisted contract is the parallel BF-105 workoutReceipt.ts
implementation and its BF_105_RECEIPTS_20261124/ADR.md.

Decision: use the existing readWorkoutReceipt and canonical grant type.
WorkoutReceiptView is a projection, not a second persisted schema.
Classify missing, recognized, opaque and unpaid-journal evidence; expose only
explicitly stored recognized grant shapes with local-profile-unverified
provenance. Unknown legacy values stay opaque. No inferred old grants, tower
floor, historical policy, or active time. grantsComplete and
activationAuthorized remain false. Source raw is reversible; no storage API
or reward writer is invoked by preview.

Alternative: competing grant schemas (rejected: inconsistent authority).
Price: additive code and explicit preview limits, no new wallet or storage key.
The module is not yet wired to import UI. The separate live receipt writer is
untouched. Rollback: compare owned hashes and use before files, never reset
the workspace. No live migration, import, APK or deploy.
Tests: 54 targeted, 694 full Vitest, TypeScript/Vite/bundle, 33 actual browser
receipt checks and 12 privacy checks on frozen inputs.
Next: BF-106 strict backup envelope and preview-only UI; any actual replace
requires staged-copy/read-back/rollback tests and explicit confirmation.
Delta: one canonical grant contract. Trace: manifests/gates. Confidence:
verified local synthetic inputs. Revisit: physical device, current-tree release
gate, and activation/import acceptance.
""")
lines=['# BF-105 - unified receipt compatibility engineering receipt','',
'Status: IMPLEMENTED / TESTED_LOCAL for the adapter and receipt round-trip on exact frozen inputs. Full migration activation not accepted; no import or new economy.',
f"HEAD at verification: {head}; observed: {rb['observed']}.",'',
'Consolidated our preview around the separate parallel workoutReceipt.ts contract. No overwrite of parallel progression, avatar, camera or receipt writer work. Old/future/malformed optional receipts stay opaque. Recognized grants are local evidence, not authorization or a reconstructed lifetime ledger. No owner save accessed.',
'Initial pre-consolidation snapshot: 687/687 Vitest; TypeScript/build/bundle/privacy passed. Forge timed out in Runtime.evaluate and left a locked owned Chrome profile (EPERM). Verified exact temp profile/UUID/PID, cleaned only that process group; forge-cleanup-readback.json proves zero remaining owned processes/listeners and profile removed. No full Forge PASS for that attempt.',
'Consolidated targeted: 54/54 in four files; 22 compatibility tests including 72 deterministic histories and mixed old/new/opaque records. Initial browser run saved mixed profile and hydrated app but failed read-only measurement at reload while instrumentation spanned async import. Corrected QA only: resolve imports before instrumenting synchronous preview. Original failure retained.',
'Frozen product: 249 files; six overlays on previous verified source; unrelated parallel avatar/camera work not incorporated. 694/694 in 69 Vitest files; TypeScript, Vite build, bundle exit 0; 62 build files. Existing >500 kB warning remains. Entry 397014 bytes (20.1% smaller than historical baseline), lazy pose chunk 154276 bytes.',
f"Exact production entry {g['entry']} SHA-256 {g['entrySha256']}; HTTP index and entry read-back 200. Privacy 12 checks passed; all frozen source/build bytes rehashed.",
'Corrected harness on the same frozen product: 33/33 PASS, exit 0. Actual Web Locks/saveProfile/localStorage backup/read-back and app reload. Fixture retained 705 XP, 300 coins, 3 workouts, 40 reps, 30s plank, tower floor 1, 20 ghost splits, 2 owned outfits, four muscle levels, three credited session IDs. Old record has no inferred grants; new records preserve exact 120/35, 120/35 and 65/30 recorded deltas. Preview called no Storage/IDB APIs, raw and backup unchanged, unsafe JSON rejected, no uncaught browser exceptions. Cleanup PASS; test servers stopped.',
f"Live tree differs from tested product in {len(changed)} known paths and {len(new)} new paths (see consolidated-readback.json); no whole current-tree PASS. Final diff={diff.returncode}, cached diff={cached.returncode}, canon={canon.returncode}, QA syntax={syntax.returncode}. Earlier parallel whitespace observation was not edited.",
'','Owned final paths (path | bytes | SHA-256):',
*[f"- {f} | {(root/f).stat().st_size} | {h}" for f,h in owned.items()],
'','Rollback: restore receiptCompatibility.ts.pre-consolidation and receiptCompatibility.test.ts.pre-consolidation only after matching final owned hashes; remove only new receipt-preview-e2e.mjs if unchanged. For full module rollback remove only our new files after matching hashes. Do not revert parallel writer or other work.',
'No dependency changes, owner save writes, Git stage/commit/push, APK creation or Firebase publication. No real-device/power-loss verification, no full-history reconstruction, no activation. Adapter not yet wired into app UI.',
'Next: BF-106 preview-only backup inspection and staged import plan; actual replace remains separate and explicit.',
'Reference: https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability (strict durability is a hint, not an absolute power-loss guarantee).']
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];names=set()
secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
    assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
    if not p.is_file(): continue
    rel=p.relative_to(a).as_posix()
    assert rel.casefold() not in names and '..' not in Path(rel).parts
    names.add(rel.casefold());size=p.stat().st_size
    assert size or re.search(r'(?:tsc|preview-err|dev-err)\.log$',rel),rel
    if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.ts','.mjs'):
        assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential-pattern finding: '+rel
    items.append(dict(path=rel,bytes=size,sha256=sha(p)))
mf=a/'artifact-manifest.json'
create(mf,json.dumps(items,indent=2)+'\n');verify(a,load(mf))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),mf.stat().st_size,sha(mf))
print('READBACK',json.dumps(rb,ensure_ascii=True))