from pathlib import Path
p=Path('docs/audits/BF_106_JOURNAL_GATE_20261125/finalize.py')
s=p.read_text(encoding='utf-8')
def once(old,new):
 global s
 assert s.count(old)==1,old
 s=s.replace(old,new)
once("checks=['tsc','journalGate','recovery','journal','unit','build','bundle','tower','mobile','privacy']", "checks=['tsc','journalGate','recovery','journal','unit','build','bundle','tower','privacy']")
once("assert all(g[k]==0 for k in checks),g", """assert all(g[k]==0 for k in checks),g
retry=load(a/'mobile-retry-gates.json')
assert g['mobile']==12 and retry['mobile']==0 and retry['preview']==200
assert retry['frozenSourceAndBuildUnchanged'] and retry['previewStopped']
assert retry['sourceManifestSha256']==g['sourceManifestSha256']
assert retry['buildManifestSha256']==g['buildManifestSha256']
assert retry['entrySha256']==g['entrySha256']
assert 'broken backup cannot be presented as verified' in text(run/'mobile.log')""")
once("mobile=text(run/'mobile.log');assert 'BODYFORGE_MOBILE_E2E_PASS' in mobile", "mobile=text(a/'mobile-retry.log');assert 'BODYFORGE_MOBILE_E2E_PASS' in mobile")
once("owned=load(a/'owned-final.json')", "owned=load(a/'owned-final.json')\nassert owned['qa/mobile-e2e.mjs']==retry['qaSha256']")
once("for f,h in before.items():assert sha(a/f)==h,f", "before['mobile-e2e.mjs.before']='18e4fc3cfe1e71ff68e781e6cf14166ed5e41e6c6b06784f9d02e5908c0050b2'\nfor f,h in before.items():assert sha(a/f)==h,f")
once("expected={x['path']:x['sha256'] for x in source}", "expected={x['path']:x['sha256'] for x in source}\n# The tested mobile harness is outside the frozen product, pinned separately.\nexpected.update(owned)")
once("for f in ['qa/journal-gate-e2e.mjs','qa/journal-e2e.mjs']:", "for f in ['qa/journal-gate-e2e.mjs','qa/journal-e2e.mjs','qa/mobile-e2e.mjs']:")
once("'mobileBrowserErrors':len(mobileErrors),'bundle':bundle,'health':health}", "'mobileBrowserErrors':len(mobileErrors),'mobileHarnessSha256':retry['qaSha256'],'bundle':bundle,'health':health}")
anchor='f"Final acceptance on {len(source)} frozen source inputs:'
assert s.count(anchor)==1
s=s.replace(anchor,"'First mobile pass stopped at an outdated exact Russian message assertion, while inspection state was invalid and the file was rejected. Replaced message matching with explicit invalid state, no verified comparison, nonempty status and exact wallet/reward-history preservation. Final corrected harness ran externally against the identical hashed production build; its SHA is separately recorded. No product change for this QA mismatch. Original failed logs remain.',\n"+anchor)
s=s.replace('All test exit codes zero. Synthetic camera', 'All final acceptance exit codes zero; earlier failed attempts remain in evidence. Synthetic camera')
s=s.replace('vs tested snapshot:', 'vs tested snapshot plus the verified external mobile harness:')
s=s.replace('profileReplacementRecovery.test.ts.before and journal-e2e.mjs.before;', 'profileReplacementRecovery.test.ts.before, journal-e2e.mjs.before and mobile-e2e.mjs.before;')
s=s.replace('run-gates.ps1 and final-run/run-gates.ps1;', 'run-gates.ps1, final-run/run-gates.ps1 and run-mobile-retry.ps1;')
p.write_text(s,encoding='utf-8',newline='\n')
compile(s,str(p),'exec')
print('FINALIZER_UPDATED_ONLY')