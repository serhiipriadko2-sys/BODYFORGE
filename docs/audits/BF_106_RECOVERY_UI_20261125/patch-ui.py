from pathlib import Path
from hashlib import sha256
a=Path('docs/audits/BF_106_RECOVERY_UI_20261125')
files={
'src/App.tsx':'8294cb3f9ff41da92ac85655b469536240b8b2737fdb0d798e571bc60c34f9c9',
'src/components/StorageRecovery.tsx':'8a41598cef6186193fa89588fb0de0f2f4f64431b86bc8157ab4e10ad941fe63',
'src/components/ReplacementRecoveryPanel.tsx':'c1263dc0698cc4aaedcb996866076947149070b1355c32261dce0eb1e2465308',
'qa/profile-replacement-e2e.mjs':'a72cde32f1e5147199f159110272067fc6080b43ba113573ef7470253612dc26',
}
old={f:Path(f).read_bytes() for f in files}
for f,h in files.items(): assert sha256(old[f]).hexdigest()==h,f
def once(s,old,new):
 assert s.count(old)==1,old
 return s.replace(old,new)
app=old['src/App.tsx'].decode('utf-8').replace('\r\n','\n')
app=once(app,"import StorageRecovery, { ResultQuarantineNotice } from './components/StorageRecovery';",
"""const StorageRecovery = lazy(() => import('./components/StorageRecovery'));
const ResultQuarantineNotice = lazy(() => import('./components/StorageRecovery').then(module => ({ default: module.ResultQuarantineNotice })));""")
app=once(app,"if (storageStatus !== 'ready') return <StorageRecovery status={storageStatus} backupAvailable={backupAvailable}",
"""if (storageStatus !== 'ready') return <Suspense fallback={<main className="storage-recovery" role="status">Проверяем сохранение…</main>}>
    <StorageRecovery status={storageStatus} backupAvailable={backupAvailable}""")
app=once(app,"onOpenCurrent={openCurrent} onRetry={retryStorage} onRecover={recoverStorage} onReload={reloadStorage} onQuarantine={quarantine}/>;",
"onOpenCurrent={openCurrent} onRetry={retryStorage} onRecover={recoverStorage} onReload={reloadStorage} onQuarantine={quarantine}/></Suspense>;")
app=once(app,"<ResultQuarantineNotice profile={profile} count={quarantined.entries.length} unavailable={quarantined.status === 'unavailable'}/>",
"""{(quarantined.entries.length > 0 || quarantined.status === 'unavailable') && <Suspense fallback={null}>
            <ResultQuarantineNotice profile={profile} count={quarantined.entries.length} unavailable={quarantined.status === 'unavailable'}/>
          </Suspense>}""")
rec=old['src/components/StorageRecovery.tsx'].decode('utf-8').replace('\r\n','\n')
rec=once(rec,"import { useState } from 'react';","import { useEffect, useState } from 'react';")
rec=once(rec,"import type { Profile } from '../lib/progression';","""import { PROFILE_REPLACEMENT_MARKER_KEY, profileReplacementPending, type Profile } from '../lib/progression';
import ReplacementRecoveryPanel from './ReplacementRecoveryPanel';""")
rec=once(rec,"  const title = status === 'checking'", """  const [replacementSeen, setReplacementSeen] = useState(() => {
    try { return profileReplacementPending(); } catch { return false; }
  });
  useEffect(() => {
    const inspect = () => {
      try { if (profileReplacementPending()) setReplacementSeen(true); } catch { /* Existing unavailable screen handles unreadable storage. */ }
    };
    const changed = (event: StorageEvent) => {
      if (event.key === PROFILE_REPLACEMENT_MARKER_KEY || event.key === null) inspect();
    };
    inspect();
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  if (replacementSeen) return <ReplacementRecoveryPanel
    disabled={isSaving || pendingResult !== null || journalEntries.length > 0}
    onResolved={onReload} onExportSession={() => { void exportProgress(profile, pendingResult); }}/>;
  const title = status === 'checking'""")
panel=old['src/components/ReplacementRecoveryPanel.tsx'].decode('utf-8').replace('\r\n','\n')
panel=once(panel,"interface Props { disabled: boolean; onResolved: () => void }","interface Props { disabled: boolean; onResolved: () => void; onExportSession: () => void }")
panel=once(panel,"({ disabled, onResolved }: Props)","({ disabled, onResolved, onExportSession }: Props)")
panel=once(panel,"generation.current++; active.current?.abort(); setConfirm(null); setBusy(false);","generation.current++; active.current?.abort(); setConfirm(null); setBusy(false);")
panel=once(panel,"      <small>Данные остаются на устройстве. Не очищай хранилище браузера.</small>",
"""      <button type="button" data-action="export-session" onClick={onExportSession}>Экспортировать данные этой страницы</button>
      <small>Данные остаются на устройстве. Не очищай хранилище браузера.</small>""")
qa=old['qa/profile-replacement-e2e.mjs'].decode('utf-8').replace('\r\n','\n')
qa=once(qa,"  const rolledBack=await run('rollback');\n  check(rolledBack.result.status==='rolled-back','explicit core rollback still works while app is blocked');\n  original(rolledBack,expected,'app restart rollback');",
"""  target=appTarget;socket=appSocket;
  await until("document.querySelector('[data-replacement-recovery]')?.dataset.replacementRecovery==='applied'",'dedicated recovery panel verified exact marker');
  check(await ev("!!document.querySelector('[data-action=export-replacement-evidence]')&&!document.querySelector('[data-action=retry-save]')"),'marker evidence can be exported and ordinary retry is hidden');
  await ev("document.querySelector('[data-action=request-replacement-rollback]').click()");
  await until("!!document.querySelector('[data-action=confirm-replacement-rollback]')",'explicit rollback confirmation required');
  await ev("document.querySelector('[data-action=cancel-replacement-rollback]').click()");
  check(await ev("!document.querySelector('[data-action=confirm-replacement-rollback]')"),'cancel hides confirmation');
  target=observerTarget;socket=observerSocket;
  const cancelled=await run('inspect');
  check(cancelled.afterMarker===pendingReplacement.afterMarker && cancelled.after.pair.primary===pendingReplacement.candidate.primary &&
    cancelled.after.pair.backup===pendingReplacement.candidate.backup,'UI cancellation leaves exact staged bytes unchanged');
  target=appTarget;socket=appSocket;
  await ev("document.querySelector('[data-action=request-replacement-rollback]').click()");
  await ev("document.querySelector('[data-action=confirm-replacement-rollback]').click()");
  await until("document.querySelector('[data-replacement-recovery]')?.dataset.replacementRecovery==='none'",'confirmed rollback completes in actual recovery panel');
  check(await ev("!!document.querySelector('[data-action=open-restored-profile]')"),'explicit reopen available after verified rollback');
  target=observerTarget;socket=observerSocket;
  original(await run('inspect'),expected,'UI restart rollback');""")
qa=once(qa,"  await cdp('Page.bringToFront');\n  await cdp('Page.reload',{ignoreCache:true});\n  await until(\"!!document.querySelector('.app-shell[data-fighter-created=true]') && !document.querySelector('[data-storage-status]')\",\n    'app resumes original profile after explicit rollback');",
"""  await cdp('Page.bringToFront');
  await ev("document.querySelector('[data-action=open-restored-profile]').click()");
  await until("!!document.querySelector('.app-shell[data-fighter-created=true]') && !document.querySelector('[data-storage-status]')",
    'app resumes original profile after explicit rollback');
  await ev("localStorage.setItem('bodyforge:pilot:v1:replace-pending:v1','{broken');true");
  await cdp('Page.reload',{ignoreCache:true});
  await until("document.querySelector('[data-replacement-recovery]')?.dataset.replacementRecovery==='conflict'",'malformed marker opens safe recovery panel');
  check(await ev("!document.querySelector('[data-action=request-replacement-rollback]')&&!!document.querySelector('[data-action=export-replacement-evidence]')&&localStorage.getItem('bodyforge:pilot:v1:replace-pending:v1')==='{broken'"),'malformed marker preserved, only evidence export offered');
  // Explicit disposable-fixture cleanup; production UI cannot delete malformed marker.
  await ev("localStorage.removeItem('bodyforge:pilot:v1:replace-pending:v1');true");
  await cdp('Page.reload',{ignoreCache:true});
  await until("!!document.querySelector('.app-shell[data-fighter-created=true]') && !document.querySelector('[data-storage-status]')",'fixture cleanup restores ordinary startup');""")
updated={'src/App.tsx':app,'src/components/StorageRecovery.tsx':rec,'src/components/ReplacementRecoveryPanel.tsx':panel,'qa/profile-replacement-e2e.mjs':qa}
for f,data in old.items():
 with (a/(Path(f).name+'.before')).open('xb') as out:out.write(data)
for f,data in old.items():assert Path(f).read_bytes()==data,f
for f,s in updated.items():
 p=Path(f);p.write_bytes(s.encode('utf-8'));print(f,p.stat().st_size,sha256(p.read_bytes()).hexdigest())