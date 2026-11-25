# BF-211 workout HUD -- local engineering acceptance

Status: PASS on pinned local source/build. Human recognition accuracy and physical device UX are not certified.
Head: 664ab80c89b244bab1014ec5c652d11c6a490470
Snapshot: .bodyforge-qa\bf211-workout-hud-v2
Source files: 338; production outputs: 73

Implemented: observation-backed calibrationRemainingMs (existing 145/160/300 ms gates; no new wait); explicit lost/stalled/prepare/calibrate/ready/move/return/hold UI; stale metric suppressed; exercise-specific prompts; paid reward only when credited; same stop handler moved near capture, 48 px hit area.
Verification: 41 new unit tests, 1151/1151 full tests, 106/106 files. TypeScript/build/bundle PASS. Start entry 397075 bytes, baseline 496761 bytes, 20.1% smaller (strict threshold preserved). Camera lazy chunk 154276 bytes.
Browser: HUD/catalog 41/41; plank 53/53; pushup 25/25. Four screen sizes, actual stop hit and camera/model release; missing and hidden observations, actual recalibration and return; paid and cancelled fixture profiles separated; plank recorded 30007.5 ms; 20 pushups; exact reward/reload.
Correction log: two guarded text-anchor patches aborted without writes; Unicode transport corruption identified in text and test expectations, repaired before acceptance and independent readable-Russian assertions added; first bundle rejected at 398562 bytes; concise cues reuse existing guide text; no threshold relaxation. First rejection retained.
Scope: no APK, Firebase, git staging/commit/push or real profile/camera use. Test Chrome isolated, cleanup confirmed. Production preview stopped. Browser landmarks are synthetic; actual field measurements required.
Concurrent live changes after freeze: ["qa/durable-journal-e2e.mjs", "src/components/Avatar3D.tsx", "src/lib/journalMixedStorage.test.ts", "src/lib/journalMixedStorage.ts"]
New after freeze: ["qa/pose-worker-spike.mjs", "src/lib/avatarLookDev.test.ts", "src/lib/avatarLookDev.ts"]
Owned hashes matched after full verification. No global latest-tree PASS asserted for concurrent edits.

## Owned files

- src/App.tsx: 78477 bytes; SHA-256 e050140c6d2630b461b67904021ec0d3b19cb9141b48c241e70c0d281001c95c
- src/lib/squatCounter.ts: 11804 bytes; SHA-256 5bf166210e230003166df59a6ecedb1e58b70af8754d7be0cf1d5677fdce03e4
- src/lib/exerciseCounter.ts: 21003 bytes; SHA-256 93710e78e06445f70ca3a1fbb1eab8b2dc6c1768e0158c347cf04da425b12b14
- src/trainingExperience.css: 15251 bytes; SHA-256 5b0f82b6b4827b23dc31b0315ae17fcfbb8d211f1b2bff32d146d6464480a21e
- src/lib/workoutHud.ts: 7675 bytes; SHA-256 95bf17d35eeb244f774508fb83eb65d3d1b6fb55093f97d71ccb199ed8192ed1
- src/lib/workoutHud.test.ts: 6396 bytes; SHA-256 914c2c5eaeea8b26967d135fbaf5d0678d5e2a860737f9eb6577c8df078465e3
- src/lib/calibrationHudReplay.test.ts: 3204 bytes; SHA-256 80ed8dae7f9b0a802ec6f1a80abce6bedcea2ce8a41ba848203e49934b584d7e
- qa/workout-hud-e2e.mjs: 13666 bytes; SHA-256 875dd576d20f3a8f1b887a422efea8d3c74241457f3a469885316003c9d1e7b5

## Evidence

- source.json: 34988 bytes; SHA-256 a385e7b2b67c10eccfdd48b94f2e1bc797ffbe99e0743e0de340af6347becc2f
- build-manifest.json: 7657 bytes; SHA-256 210dea0a59368c38a63b3a533ef4fbbec03116f6d021bdbb3684389982a8787c
- gates.json: 1845 bytes; SHA-256 5572431bd963fa4872dc3e3eb92d11fad4a31bc096b54dfe5a0a365c7bdb6d57
- syntax.log: 0 bytes; SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- tsc.log: 0 bytes; SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- build.log: 2495 bytes; SHA-256 5a2ed786e5f72b6c720fa2e7f19647a1107d89e120606a9ef3894222de22cb82
- bundle.log: 280 bytes; SHA-256 58afd15174ba6d423f1aff4dbb6fb21357fa2a71a695575e9a301fdf26e459ff
- workout-hud.log: 2454 bytes; SHA-256 7e68a75aca6950d883879a20b1ef4d6d5153109e10468fdfac4e932c53fe261f
- plank.log: 4622 bytes; SHA-256 7fa8797101141cfdca1e4ef8f1e569958d7854c6c21c8efc8b91e50afdd6efa0
- pushup.log: 1672 bytes; SHA-256 12bd4e4c6c99a60e848d393a073c3fd0a527f5257ade76024788f92e80f1cedc
- full-unit.log: 16659 bytes; SHA-256 4a4fea6b73fdb9ecd5c31312ee210853a08d709ff78df6f29d10fe3d0b4aaee2
- bundle-rejected/bundle.log: 835 bytes; SHA-256 01b93a05c3a87c13b18c56d409bb3a9f04f59bc3c398f6358fb32d3be6726ec9
- bundle-rejected/gates.json: 1064 bytes; SHA-256 1c84f1cc85de3f7f7c73522576b31df59f55ced09111ff3aca0372bc6820ca6a

Next: BF-212 comparative experiment; retain main-thread fallback until field-backed advantage. BF-213 requires independent consented human holdout.
