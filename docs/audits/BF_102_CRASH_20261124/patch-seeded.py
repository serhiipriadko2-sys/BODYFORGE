from pathlib import Path
import hashlib
root=Path.cwd()
p=root/'qa/journal-e2e.mjs'
original=p.read_bytes()
assert hashlib.sha256(original).hexdigest()=='d97cc41f3908c44ce9f315f94481fab626f5bc9274a847e05e2bdd603cd7e979'
s=original.decode('utf-8')
def once(old,new):
 global s
 assert s.count(old)==1,old
 s=s.replace(old,new)
scenario=(root/'docs/audits/BF_102_CRASH_20261124/seeded-scenario.txt').read_text(encoding='utf-8')
once('async function stageContracts() {',scenario+'\nasync function stageContracts() {')
once("  if (process.argv.includes('--identity-only')) { await identityRecovery(); }","  if (process.argv.includes('--seeded-crash-only')) { await seededCrashBoundaries(); }\n  else if (process.argv.includes('--identity-only')) { await identityRecovery(); }")
once("  console.log(process.argv.includes('--identity-only') ? 'BODYFORGE_JOURNAL_IDENTITY_PASS' :", "  console.log(process.argv.includes('--seeded-crash-only') ? 'BODYFORGE_SEEDED_CRASH_PASS' :\n    process.argv.includes('--identity-only') ? 'BODYFORGE_JOURNAL_IDENTITY_PASS' :")
once('// --identity-only checks malformed IDs, distinct keys and strict quarantine replay.','// --identity-only checks malformed IDs, distinct keys and strict quarantine replay.\n// --seeded-crash-only isolates real persistence crash boundaries from camera timing.')
once("  await page.until(\"!!document.querySelector('.completion-stage')\", '20th rep queues its journal write', 65000);", """  try {
    await page.until("!!document.querySelector('.completion-stage')", '20th rep queues its journal write', 65000);
  } catch (error) {
    const diagnostic = await page.js("({poseCalls:window.__poseCalls,modelsClosed:window.__modelsClosed,cameraError:document.querySelector('.camera-error')?.textContent,counter:document.querySelector('.counter-number')?.textContent,completion:document.querySelector('.completion-stage')?.dataset.resultPersistence,visibility:document.visibilityState})").catch(() => null);
    console.error('QA_CAMERA_BOUNDARY_DIAGNOSTIC', JSON.stringify(diagnostic));
    throw error;
  }""")
a=root/'docs/audits/BF_102_CRASH_20261124'
(a/'journal-before-seeded.mjs').write_bytes(original)
assert p.read_bytes()==original
p.write_bytes(s.encode('utf-8'))
print('PATCH',p.stat().st_size,hashlib.sha256(p.read_bytes()).hexdigest())