from pathlib import Path
import hashlib,json,re,subprocess,datetime,stat
root=Path.cwd();a=root/'docs/audits/BF_106_JOURNAL_GATE_20261125';run=a/'final-run';copy=root/'.bodyforge-qa/bf106-journal-gate-final'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def text(p):return p.read_text(encoding='utf-8-sig')
def load(p):return json.loads(text(p))
def create(p,s):
 with p.open('x',encoding='utf-8',newline='\n') as f:f.write(s)
g=load(run/'gates.json')
checks=['tsc','journalGate','recovery','journal','unit','build','bundle','tower','privacy']
assert all(g[k]==0 for k in checks),g
retry=load(a/'mobile-retry-gates.json')
assert g['mobile']==12 and retry['mobile']==0 and retry['preview']==200
assert retry['frozenSourceAndBuildUnchanged'] and retry['previewStopped']
assert retry['sourceManifestSha256']==g['sourceManifestSha256']
assert retry['buildManifestSha256']==g['buildManifestSha256']
assert retry['entrySha256']==g['entrySha256']
assert 'broken backup cannot be presented as verified' in text(run/'mobile.log')
assert g['preview']==200 and g['frozenSourceAndBuildUnchanged'] and g['devStopped'] and g['previewStopped']
assert sha(run/'source.json').upper()==g['sourceManifestSha256']
assert sha(run/'build-manifest.json').upper()==g['buildManifestSha256']
assert '5 failed | 9 passed (14)' in text(a/'red.log')
assert '42 passed (42)' in text(a/'green.log')
assert 'BODYFORGE_JOURNAL_GATE_E2E_PASS assertions=27' in text(run/'gate-browser.log')
assert 'BODYFORGE_REPLACE_CORE_E2E_PASS assertions=64 crashes=3' in text(run/'recovery.log')
journal=re.search(r'^BODYFORGE_JOURNAL_PASS (.+)$',text(run/'journal.log'),re.M)
assert journal
j=json.loads(journal[1]);assert j['assertions']==161 and j['crashes']==3 and not j['queueOnly']
unit=re.search(r'Tests\s+(\d+) passed \((\d+)\)',text(run/'unit.log'));assert unit and unit[1]==unit[2]
files=re.search(r'Test Files\s+(\d+) passed \((\d+)\)',text(run/'unit.log'));assert files and files[1]==files[2]
tower=re.search(r'BODYFORGE_TOWER_20REPS_E2E_PASS assertions=(\d+)',text(run/'tower.log'));assert tower
mobile=text(a/'mobile-retry.log');assert 'BODYFORGE_MOBILE_E2E_PASS' in mobile
mobileErrors=re.findall(r'^BROWSER_(?:EXCEPTION|ERROR).*$',mobile,re.M)
assert not mobileErrors,mobileErrors
assert 'BODYFORGE_PRIVATE_DEV_PATHS_PASS=12' in text(run/'privacy.log')
for f in ['gate-browser.log','recovery.log','journal.log']:
 assert 'QA_OWNED_CLEANUP PASS' in text(run/f),f
assert 'QA_OWNED_CLEANUP PASS' in text(run/'tower.log')
assert not re.search(r'QA_CHROME_(?:PROFILE_CLEANUP_FAIL|CLOSE_UNCONFIRMED)',mobile)
bundle=json.loads(re.search(r'BODYFORGE_BUNDLE_ON_DEMAND_PASS (.+)',text(run/'bundle.log'))[1])
owned=load(a/'owned-final.json')
assert owned['qa/mobile-e2e.mjs']==retry['qaSha256']
for f,h in owned.items():
 assert sha(root/f)==h,f
 assert not any(line.endswith((' ','\t')) for line in text(root/f).splitlines()),f
before={'durableJournal.ts.before':'4009b083d300dafd822d6098f5d76ebb5aa54c4c6537b740205718be868a0e65','profileReplacementRecovery.ts.before':'95fc22c5914fea1e353ef22c91949a12c533cc8a744f2f774c39ce66be2bd43a','profileReplacementRecovery.test.ts.before':'9115d63c6379010d2b9ce119c173247321309e56ff0c68e0ed981c3b6bb8c562','journal-e2e.mjs.before':'48aa98b6c64ea37b62cb11f14ebd75b16217d8868a518bfe8609a069e0e04067'}
before['mobile-e2e.mjs.before']='18e4fc3cfe1e71ff68e781e6cf14166ed5e41e6c6b06784f9d02e5908c0050b2'
for f,h in before.items():assert sha(a/f)==h,f

def verify(folder,rows):
 seen=set()
 for r in rows:
  rel=Path(r['path']);key=r['path'].casefold()
  assert not rel.is_absolute() and '..' not in rel.parts and key not in seen,key
  seen.add(key);p=folder/rel
  assert p.is_file() and not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT,key
  assert p.stat().st_size==r['bytes'] and sha(p)==r['sha256'].lower(),key
source=load(run/'source.json');build=load(run/'build-manifest.json')
verify(copy,source);verify(copy/'dist',build)
expected={x['path']:x['sha256'] for x in source}
# The tested mobile harness is outside the frozen product, pinned separately.
expected.update(owned)
actual=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','qa','public']).decode().split('\0'))-{''}
changed=[p for p,h in expected.items() if not (root/p).is_file() or sha(root/p)!=h]
new=sorted(actual-set(expected))
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
diff=subprocess.run(['git','-c','core.safecrlf=false','diff','--check'],capture_output=True,text=True)
cached=subprocess.run(['git','-c','core.safecrlf=false','diff','--cached','--check'],capture_output=True,text=True)
canon=subprocess.run(['python','.iskra/scripts/verify_canon.py'],capture_output=True,text=True)
assert canon.returncode==0
syntax=[]
for f in ['qa/journal-gate-e2e.mjs','qa/journal-e2e.mjs','qa/mobile-e2e.mjs']:
 r=subprocess.run(['node','--check',f],capture_output=True,text=True);assert r.returncode==0;syntax.append({'path':f,'exit':r.returncode})
health=load(a/'health.json')
receipt={'head':head,'observed':datetime.datetime.now().astimezone().isoformat(),'owned':[{'path':p,'bytes':(root/p).stat().st_size,'sha256':h} for p,h in owned.items()],
 'sourceCount':len(source),'buildCount':len(build),'sourceManifestSha256':g['sourceManifestSha256'],'buildManifestSha256':g['buildManifestSha256'],
 'liveChangedPaths':changed,'liveNewPaths':new,'diffCheck':diff.returncode,'cachedDiffCheck':cached.returncode,'canon':canon.returncode,'syntax':syntax,
 'unitTests':int(unit[1]),'testFiles':int(files[1]),'journalAssertions':j['assertions'],'journalCrashes':j['crashes'],'gateAssertions':27,'recoveryAssertions':64,
 'towerAssertions':int(tower[1]),'mobileAssertions':len(re.findall(r'^PASS ',mobile,re.M)),'mobileBrowserErrors':len(mobileErrors),'mobileHarnessSha256':retry['qaSha256'],'bundle':bundle,'health':health}
create(a/'final-readback.json',json.dumps(receipt,indent=2)+'\n')
lines=['# BF-106 - journal/recovery coordination gate','',
'Status: IMPLEMENTED / TESTED_LOCAL for cooperating durable stage/mark versus recovery snapshot and rollback. Full forward replacement/finalization is NOT enabled.',
f"HEAD {head}; observed {receipt['observed']}.",
'Production scope: new durableJournalGate, shared writer wrapper in durableJournal, exclusive recovery barrier in profileReplacementRecovery. Fixed lock order PROFILE -> JOURNAL; independent stage takes JOURNAL only and releases it before waiting for PROFILE. Shared access lasts through strict IDB commit plus independent read-back. Cancellation/unsupported locking fails closed. Mutable input payloads are copied before queueing. No wallet, schema, targets, reward amounts, or existing records are changed by the patch.',
'Five regression cases demonstrated the missing boundary before implementation (5 failed / 9 passed); targeted green is 42/42. Native two-tab Chrome QA: 27 assertions with actual Web Locks and IndexedDB. Writer preserves exact payload, remains independent of busy profile lock, queues behind exclusive snapshot, aborts without late write, settlement waits, and a debugger pause between strict commit/read-back does not release the shared gate. Existing row blocks recovery without deletion. Real profile replay pays 120 XP/35 coins once and repeated replay leaves exact wallet bytes unchanged.',
'First full journal run: 127 assertions and 3 renderer crashes then FAIL on immediate quarantine-notice visibility. Dedicated diagnosis preserved all raw source/exports and observed immediate=false then eventual=true in four cases (~339 ms). The notice was moved behind lazy Suspense by the prior UI work. Added bounded wait for the actual notice after app shell and after reload; original data/reward assertions and timeouts preserved. Product code was not altered for this QA issue. Failed run and diagnostics retained.',
'First mobile pass stopped at an outdated exact Russian message assertion, while inspection state was invalid and the file was rejected. Replaced message matching with explicit invalid state, no verified comparison, nonempty status and exact wallet/reward-history preservation. Final corrected harness ran externally against the identical hashed production build; its SHA is separately recorded. No product change for this QA mismatch. Original failed logs remain.',
f"Final acceptance on {len(source)} frozen source inputs: {unit[1]}/{unit[2]} unit tests in {files[1]} files; TypeScript/build/bundle exit 0; native gate 27; UI rollback 64 with 3 real renderer crashes; full journal 161 with 3 real renderer crashes; tower {tower[1]}; mobile {receipt['mobileAssertions']} PASS lines and zero reported browser errors; privacy 12. All final acceptance exit codes zero; earlier failed attempts remain in evidence. Synthetic camera fixtures do not prove real-human accuracy or physical power-loss durability.",
f"Build contains {len(build)} files. Exact preview HTML and entry matched HTTP 200. Entry {g['entry']} SHA-256 {g['entrySha256']}, {bundle['entryBytes']} bytes; separate camera chunk {bundle['cameraChunkBytes']} bytes. Existing large-chunk warning remains. QA servers stopped; owned-browser cleanup verified by logs.",
f"Current live drift vs tested snapshot plus the verified external mobile harness: {len(changed)} changed known paths, {len(new)} new paths; exact names in final-readback.json. Own final files all match. diff={diff.returncode}, cached={cached.returncode}, canon={canon.returncode}. Do not transfer full frozen PASS to unrelated newer source.",
'No owner profile used in tests. No owner storage read/write, APK, Firebase deployment, dependency changes, Git stage/commit/push. Cooperating application versions only; old tabs/manual DB writes bypass this protocol. The gate does not decide how a forward import should handle a workout prepared before import; that policy and persistent finalization gate remain required.',
'Rollback: compare current owned hashes; restore exact durableJournal.ts.before, profileReplacementRecovery.ts.before, profileReplacementRecovery.test.ts.before, journal-e2e.mjs.before and mobile-e2e.mjs.before; remove only the new durableJournalGate.ts/test and journal-gate-e2e.mjs if unchanged. Never reset or clean parallel work.',
'Commands and full evidence: run-gates.ps1, final-run/run-gates.ps1 and run-mobile-retry.ps1; red/green logs; diagnostic-quarantine; final source/build manifests.','',
'Owned paths | bytes | SHA-256',*[f"{p} | {(root/p).stat().st_size} | {h}" for p,h in owned.items()],'',
'Next: late-workout policy and verified finalization of an explicitly chosen replacement before exposing forward import.',
'Sources: https://www.w3.org/TR/web-locks/ ; https://www.w3.org/TR/IndexedDB-3/ ; https://react.dev/reference/react/lazy']
create(a/'RECEIPT.md','\n'.join(lines)+'\n')
items=[];seen=set();secret=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')
for p in sorted(a.rglob('*')):
 assert not p.is_symlink() and not getattr(p.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT
 if not p.is_file():continue
 rel=p.relative_to(a).as_posix();key=rel.casefold()
 assert key not in seen and '..' not in Path(rel).parts;seen.add(key)
 n=p.stat().st_size;assert n or re.search(r'(?:tsc|dev-err|preview-err)\.log$',rel),rel
 if p.suffix.lower() in ('.md','.json','.log','.txt','.py','.ts','.mjs','.ps1','.before'):
  assert not secret.search(p.read_text(encoding='utf-8-sig',errors='replace')),'credential pattern: '+rel
 items.append({'path':rel,'bytes':n,'sha256':sha(p)})
create(a/'artifact-manifest.json',json.dumps(items,indent=2)+'\n');verify(a,load(a/'artifact-manifest.json'))
print('RECEIPT',a/'RECEIPT.md',(a/'RECEIPT.md').stat().st_size,sha(a/'RECEIPT.md'))
print('MANIFEST',len(items),sha(a/'artifact-manifest.json'))
print('READBACK',json.dumps(receipt,ensure_ascii=True))