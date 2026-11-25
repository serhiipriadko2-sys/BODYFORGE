from pathlib import Path
import hashlib,json,subprocess,datetime,stat,re
root=Path.cwd()
a=root/'docs/audits/BF_106_IMPORT_PREVIEW_20261125'
copy=root/'.bodyforge-qa/bf106-preview'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p): return p.read_text(encoding='utf-8-sig')
def load(p): return json.loads(read(p))
def create(p,s):
    with p.open('x',encoding='utf-8',newline='\n') as f: f.write(s)
g=load(a/'gates.json')
assert all(g[k]==0 for k in ['unit','tsc','build','bundle','importPreview','privacy'])
assert g['preview']==200 and g['frozenSourceAndBuildUnchanged'] and g['devStopped'] and g['previewStopped']
assert sha(a/'source.json').upper()==g['sourceManifestSha256']
assert sha(a/'build-manifest.json').upper()==g['buildManifestSha256']
for name,marker in [('targeted.log','53 passed (53)'),('unit.log','718 passed (718)'),('browser.log','BODYFORGE_IMPORT_PREVIEW_E2E_PASS assertions=24'),('browser.log','QA_OWNED_CLEANUP PASS'),('privacy.log','BODYFORGE_PRIVATE_DEV_PATHS_PASS=12'),('bundle.log','BODYFORGE_BUNDLE_ON_DEMAND_PASS')]:
    assert marker in read(a/name),name
owned={
 'src/lib/progressImportPreview.ts':'83feec5c52f3f30b0a6e3d1b2fb9829ccad6efc378e4ea8d1d96f3e4ac4dbbf2',
 'src/lib/progressImportPreview.test.ts':'2a2897140e12f58f579d264e7e1c5a41f7439a4884f360d93c52a33b569bdade',
 'src/components/ProgressBackupPanel.tsx':'40d8fc15cb08a0672cc44187efaecf2813a8cb8f92b38eb66be8e928f29c3b83',
 'src/components/progressBackup.css':'b6ab3ea86a2938f1271aad02609ddd98546194eda4f8f41013a7d1cd3f8bf38e',
 'qa/import-preview-e2e.mjs':'352f20b0af60ed8a615d5681b166e6fd1de8b5263c12922026928c6960d1a8b1'}
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
assert len(source)==263 and len(build)==64
for f,h in owned.items():
    assert sha(root/f)==h,f
    assert not any(line.endswith((' ','\t')) for line in read(root/f).splitlines()),f
assert sha(a/'ProgressBackupPanel.tsx.before')=='36765beecdf9d77396370e743706a90bfa0e9297b9ba70f66534ab55bef6b24a'
assert sha(a/'progressBackup.css.before')=='45261d6c02ca11cc6d39be3838deb336ad380d29989816ab68848982a63a6b33'
expected={row['path']:row['sha256'].lower() for row in source}
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0'))-{''}
changed=[p for p,h in sorted(expected.items()) if not (root/p).is_file() or sha(root/p)!=h]
new=sorted(actual-set(expected))
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check'],capture_output=True,text=True)
cached=subprocess.run(['git','-c','core.safecrlf=false','diff','--cached','--check'],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
syntax=subprocess.run(['node','--check','qa/import-preview-e2e.mjs'],capture_output=True,text=True)
assert syntax.returncode==0 and canon.returncode==0
rb={'head':head,'observed':datetime.datetime.now().astimezone().isoformat(),'owned':[dict(path=f,bytes=(root/f).stat().st_size,sha256=h) for f,h in owned.items()],
    'sourceCount':len(source),'buildCount':len(build),'sourceManifestSha256':g['sourceManifestSha256'],'buildManifestSha256':g['buildManifestSha256'],
    'liveChangedPaths':changed,'liveNewPaths':new,'diffCheck':diff.returncode,'cachedDiffCheck':cached.returncode,'canon':canon.returncode,'qaSyntax':syntax.returncode}
create(a/'final-readback.json',json.dumps(rb,indent=2)+'\n')
lines=[
 '# BF-106 - backup import preview, first acceptance gate','',
 'Status: IMPLEMENTED / TESTED_LOCAL for read-only comparison and cancellation. BF-106 replacement, backup/read-back/rollback transaction remains NOT_IMPLEMENTED in this batch.',
 f"HEAD {head}; observed {rb['observed']}.",
 'Existing manual-backup v1 envelope and storage keys retained. The preview reads storedProfileRaw, not the export display mirror. Reuses the BF-105 adapter and the backup inspector. Strict UTF-8, 16 MiB byte limit before file read, exact file size check, duplicate decoded keys, prototype keys, depth and token limits. No new dependency, network upload, reward replay, write or apply API.',
 'Shows current and incoming XP, coins, total/available workouts, repetitions, plank seconds, tower floor, outfit count, identity relation and recognized grant count. Warnings for lower values, other/unknown identity, incomplete and inconsistent copies, fallback incompatibility, legacy/opaque receipts, pending/durable/quarantine records and auxiliary settings. Local identity match and recognized grant shape do not establish authenticity. Preview-ready does not authorize replacement. File contents stay in selected file; UI retains summaries only.',
 'UI cancel invalidates generation; stale results discarded after profile revision, disabled state, cross-tab storage signal or unmount. First patch attempt stopped at exact UI anchor before modifying sources; corrected anchor and recorded original before files. No assertions weakened.',
 'Targeted: 53/53 in four files (16 new). Full snapshot: 718/718 in 73 files; TypeScript and Vite build exit 0; bundle gate exit 0. Browser: 24/24 actual file input, 320/390px layout, valid comparison, invalid JSON/UTF-8, oversize not read, cancellation including delayed read, revision invalidation, exact primary and localStorage/IndexedDB durable journal unchanged, reload, no uncaught exceptions. Owned Chrome cleaned. Privacy: 12/12. No physical device testing or actual import execution.',
 f"Frozen inputs {len(source)}; output {len(build)} files; exact HTTP preview index and entry matched. Entry {g['entry']} SHA-256 {g['entrySha256']}; entry 397283 bytes, camera chunk separate 154276 bytes. Existing large-chunk warning remains. Test servers stopped.",
 f"Live comparison: {len(changed)} changed, {len(new)} new paths vs frozen snapshot. diff={diff.returncode}, cached={cached.returncode}, canon={canon.returncode}, syntax={syntax.returncode}. Whole current-tree PASS only if corresponding manifests and HEAD match.",
 'Commands: npm test targeted files; node qa/import-preview-e2e.mjs; vitest run --maxWorkers=1 --no-file-parallelism; tsc -b; vite build; node qa/bundle-on-demand.mjs; node qa/privacy-server-e2e.mjs.',
 'No owner profile read/write, APK, Firebase, Git stage/commit/push. Next: design and test explicit replacement transaction on disposable profiles; preserve original primary/backup/auxiliary/journal state, handle conflict and partial failure, prove exact read-back and rollback before exposing replace.',
 'Rollback: after comparing owned hashes, restore exact two .before UI files; remove only the three new owned source/test files if unchanged. Do not reset or clean unrelated work.',
 '',
 'Owned paths | bytes | SHA-256',
 *[f'{f} | {(root/f).stat().st_size} | {h}' for f,h in owned.items()],
 '',
 'References: https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/fatal ; https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html',
]
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];seen=set()
secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
    assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
    if not p.is_file(): continue
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