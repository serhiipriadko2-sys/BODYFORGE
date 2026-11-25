from pathlib import Path
import hashlib
p=Path('qa/journal-e2e.mjs')
a=Path('docs/audits/BF_102_JOURNAL_TIMING_20261124')
original=p.read_bytes()
assert hashlib.sha256(original).hexdigest()=='3cb62fc8c3296e432f312b66b299f6e08ff0afb5a0e16ec3faf973f194b3de5d'
assert hashlib.sha256(Path('qa/tower-squat-fixture.mjs').read_bytes()).hexdigest()=='2201c53e64d7ef867c7753f249fe0e0278ed3c98ddb1003361780527165b2ecd'
s=original.decode('utf-8')
def once(old,new):
 global s
 assert s.count(old)==1, 'anchor: '+old
 s=s.replace(old,new)
once("import { spawn } from 'node:child_process';","import { spawn } from 'node:child_process';\nimport { createTowerSquatFixture } from './tower-squat-fixture.mjs';")
once("'--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',","'--headless=new', '--disable-webgl', // Persistence QA, not avatar rendering.")
once("&& profile.workouts[0].id === id && profile.creditedWorkoutIds.filter","&& profile.workouts[0].id === id && profile.workouts[0].repetitions === 20 && profile.creditedWorkoutIds.filter")
once("async function startTower() {\n  await page.js(", "async function startTower() {\n  await page.cdp('Page.bringToFront');\n  await page.until(\"document.visibilityState==='visible'\", 'owned workout page visible');\n  await page.js(")
# Insert independent fixture factory into browser expression. No product counter/clock patch.
once("    const mp=await import(url),rep=[170,170,170,158,144,132,125,120,119,124,138,151,165,170,172,173];\n    const angles=[170,170,170,...Array.from({length:20},()=>rep).flat()];",
     "    const mp=await import(url),factory=("+chr(36)+"{createTowerSquatFixture.toString()});")
once("mp.PoseLandmarker.createFromOptions=async()=>({close(){window.__modelsClosed++},detectForVideo(video){\n      const angle=angles[Math.min(window.__poseCalls++,angles.length-1)],r=(180-angle)*Math.PI/180;",
     "mp.PoseLandmarker.createFromOptions=async()=>{const fixture=factory();window.__towerFixture=fixture;return {close(){window.__modelsClosed++},detectForVideo(video,time){\n      window.__poseCalls++;const angle=fixture.sample(time),r=(180-angle)*Math.PI/180;")
once("    }});return true;\n  })()"+chr(96)+");","    }}};return true;\n  })()"+chr(96)+");")
once("  await page.until(\"!!document.querySelector('.live-tag')\", 'synthetic camera active');\n}","  await page.until(\"window.__poseCalls>0 && !!document.querySelector('.live-tag')\", 'synthetic camera processes real observations');\n}")
helper="""// Finite independent pose fixture may stop at the twentieth credited rep before
// its final standing dwell completes. Stored result must independently be 20.
function validFixture(timing) {
  return !!timing && timing.failure === null && timing.cycles >= 19 && timing.cycles <= 20 &&
    timing.frames > 0 && timing.maxGapMs <= 850;
}
function assertFixture(timing, label) {
  console.log('QA_FIXTURE_TIMING', label, JSON.stringify(timing));
  check(validFixture(timing), label + ' finite timestamp-paced pose stream without timing failure');
}
async function waitCameraBoundary(expression, label) {
  try {
    await page.until('('+expression+') || !!window.__towerFixture?.diagnostics().failure || !!document.querySelector(".camera-error")', label, 90000);
    const info = await page.js('({fixture:window.__towerFixture?.diagnostics(),reached:!!('+expression+'),error:document.querySelector(".camera-error")?.textContent})');
    if (!info.reached || info.fixture?.failure || info.error) throw Error('Camera boundary not reached: '+JSON.stringify(info));
    return info.fixture;
  } catch (error) {
    const diagnostic = await page.js("({poseCalls:window.__poseCalls,fixture:window.__towerFixture?.diagnostics(),modelsClosed:window.__modelsClosed,cameraError:document.querySelector('.camera-error')?.textContent,counter:document.querySelector('.counter-number')?.textContent,completion:document.querySelector('.completion-stage')?.dataset.resultPersistence,visibility:document.visibilityState})").catch(() => null);
    console.error('QA_CAMERA_BOUNDARY_DIAGNOSTIC', label, JSON.stringify(diagnostic));
    throw error;
  }
}
"""
once("async function armPause(kind, tab = page) {",helper+"\nasync function armPause(kind, tab = page) {")
once("poseCalls:window.__poseCalls};debugger;","poseCalls:window.__poseCalls,fixture:window.__towerFixture?.diagnostics()};debugger;")
once("""  await page.until("document.querySelector('.completion-stage')?.dataset.resultPersistence==='durable-pending'",'real App strictly staged 20-rep completion before '+kind,65000);""",
     """  assertFixture(await waitCameraBoundary("document.querySelector('.completion-stage')?.dataset.resultPersistence==='durable-pending'",'real App strictly staged 20-rep completion before '+kind), 'prelock '+kind);""")
once("  const result=JSON.parse(staged.raw);\n  const current=", "  const result=JSON.parse(staged.raw);\n  check(result.repetitions===20&&result.profileId===player.profileId&&result.floor===1,kind+' freezes exactly 20 reps and the original identities');\n  const current=")
start=s.index("  try {\n    await page.until(\"!!document.querySelector('.completion-stage')\", '20th rep queues its journal write'")
end=s.index("\n  check(await page.js(\"document.querySelector('.completion-stage [role=status]')",start)
s=s[:start]+"""  assertFixture(await waitCameraBoundary("!!document.querySelector('.completion-stage')", '20th rep queues its journal write'), 'queued completion');"""+s[end:]
once("await waitFor(() => page.paused, '20-rep journal boundary', 65000);","await waitFor(() => page.paused, '20-rep journal boundary', 90000);")
once("check(boundary.result.value.poseCalls >= 320, 'first crash follows the complete synthetic 20-rep App sequence');","assertFixture(boundary.result.value.fixture, 'journal-before-primary crash');")
once("""  await page.until("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='unavailable'", 'journal quota after 20 reps', 65000);
  check(await page.js('window.__poseCalls>=320'), 'journal quota is exercised by a complete synthetic App workout');""",
     """  assertFixture(await waitCameraBoundary("document.querySelector('[data-storage-status]')?.dataset.storageStatus==='unavailable'", 'journal quota after 20 reps'), 'journal quota after actual finish');""")
# Make fixture failure diagnostics available for paused scenario without evaluating a paused renderer.
once("  console.error('BODYFORGE_JOURNAL_FAIL', error.stack || String(error));","  console.error('BODYFORGE_JOURNAL_FAIL', error.stack || String(error));\n  if (page && !page.paused && !page.crashed) console.log('QA_LAST_CAMERA', JSON.stringify(await page.js('({fixture:window.__towerFixture?.diagnostics(),counter:document.querySelector(\".counter-number\")?.textContent,visibility:document.visibilityState})').catch(() => null)));")
assert 'window.__poseCalls>=320' not in s
assert 'angles[Math.min' not in s
a.mkdir(exist_ok=False)
(a/'journal-e2e.mjs.before').write_bytes(original)
assert p.read_bytes()==original
p.write_bytes(s.encode('utf-8'))
print('PATCH',p.stat().st_size,hashlib.sha256(p.read_bytes()).hexdigest())