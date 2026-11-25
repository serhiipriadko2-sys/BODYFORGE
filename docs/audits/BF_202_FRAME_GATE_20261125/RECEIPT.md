# BF-202 camera observation identity / verification

Status: IMPLEMENTED / TARGETED AND BROWSER PASS / FULL INTEGRATION PARTIAL (9 failing history/import tests on frozen inputs). No current whole-tree PASS.
Observed 2026-11-25T18:59:25.513286+03:00; workspace E:\github\BODYFORGE; tested HEAD 664ab80c89b244bab1014ec5c652d11c6a490470.

Dependency BF-201: separate receipt BF_201_CAMERA_VERIFY_20261125/RECEIPT.md confirms lifecycle 41/41, camera-runtime 26/26, tower 41/41 on exact prior integration build; previous memory blocker cleared. Mobile and 824 unit checks reused from exact BF-107 snapshot, not rerun there.
RED: prior verified entry reproduced a duplicate inference after dispatching resize on a frozen, already processed media timestamp. Exit 16, owner browser cleanup and preview stop verified.
Product change: VideoFrameGate keeps the media high-water mark through recalibration, discards the image present at interruption, preserves monotonic inference timestamps across stream switches, rejects unknown/nonfinite intrinsic dimensions before inference and retains the original 90ms throttle. Full reset only at stop; media-clock reset on a new stream. App uses the same actual dimensions for gate and detector. No changes to reward logic or detector movement thresholds.
Targeted: 103/103 across six camera/framing/counter/frame-loop files. New exact production build: TypeScript/Vite/bundle PASS; entry index-BkDKFDeH.js, 389334 bytes, 21.6% below historical baseline; separate camera chunk 154276 bytes. Existing large avatar chunk warning remains.
Frozen inputs 300; build files 72; pinned entry SHA-256 3453288bb0b6bfa005fec16197a51c5324e34df0db050a0bfa6fb208b8de73ae. All source/build bytes reverified. New browser frame gate 15/15, lifecycle 41/41, tower 41/41, camera-runtime 26/26; all exit 0. Both preview ports closed. Synthetic landmarks/fake camera; no physical phone or human accuracy claim.
Full unit: 831/840, 86/88 files; 9 failures. Retention and profile replacement tests failed. These modules are outside this patch; parallel changes observed. Cause and corrected live-tree status not independently verified by this run. Do not mask failures or overwrite parallel implementation.

Failing cases:
FAIL  src/lib/historyRetention.test.ts > BF-107 retained stored history > preserves every uncapped legacy record during a normal wallet update and repeated save
FAIL  src/lib/historyRetention.test.ts > BF-107 retained stored history > retains the 61st row instead of evicting the oldest saved original at cap crossing
FAIL  src/lib/historyRetention.test.ts > BF-107 retained stored history > preserves an identity-less uncapped legacy save during identity adoption
FAIL  src/lib/historyRetention.test.ts > BF-107 retained stored history > restores the exact uncapped backup, not its last-60 display projection
FAIL  src/lib/historyRetention.test.ts > BF-107 retained stored history > retains the full supplied history on the first save of a compatible uncapped profile
FAIL  src/lib/historyRetention.test.ts > BF-107 retained stored history > rejects conflicting original details or missing paid identities before any write
FAIL  src/lib/historyRetention.test.ts > BF-107 retained stored history > does not drop malformed or duplicated older originals in a retention operation
FAIL  src/lib/historyRetention.test.ts > BF-107 retained stored history > keeps exact prior history when primary write runs out of quota
FAIL  src/lib/profileReplacement.test.ts > BF-106 isolated replacement transaction > retains uncapped saved originals during compatible file replacement and blocks truncation or altered facts

Final live drift relative to frozen snapshot: changed=['qa/forge-home-xp-faq-e2e.mjs', 'src/lib/historyRetention.test.ts', 'src/lib/profileReplacement.ts', 'src/lib/progression.ts', 'src/lib/settledImportHistory.ts'], new=[]. All four owned files retain measured hashes.
Final static gates diff=0, cached=0, canon=0, syntax=0.
No APK, Firebase, Git commit/push, dependency install, owner profile read, or real camera access. VS Code open requested for camera.ts; actual screen pixels not verified.
Next: reconcile parallel retention/import work and rerun complete current-tree unit/build/QA. BF-203 human pilot remains a separate gate; do not claim camera accuracy from synthetic data.
Rollback: restore only matching App.tsx.before, camera.ts.before and camera.test.ts.before; remove new QA only if matching hash. No destructive reset.

Owned files | bytes | SHA256
src/App.tsx | 82617 | 30cd05abed3240dc6b353ed7064e856841f9171c5ec30245641a4ebca009a503
src/lib/camera.ts | 8302 | c486ff257e0cd95476cd387cba3994107bf080162c37f6f5879319df8ea51ef2
src/lib/camera.test.ts | 10423 | 6277207b3f5390bae07f228766f631d20507c0d20d8df5e8c5210cf649e1c2ab
qa/camera-frame-gate-e2e.mjs | 9636 | 2c4ab558135b1054b35c8e2d6379e416c6053458e2122a500ef3a7e31d85bb98

Evidence | bytes | SHA256
App.tsx.before | 82613 | aed7c608fa02371bf5bc6aaf0620e135a94e37d38ded08ab208de903e512cc3d
build-manifest.json | 10632 | b4cf306d56ac2cf632299b732e8d95434407adb6d6e8c119a5ae2eb8699916ec
build.log | 2495 | 169050d61ebaf2ecc972360c2dd1925c94c4e208e48bbb0d87ca6519f3420c7b
bundle.log | 281 | 65623c775aa0ec412fb6a591d740b4b44f55d260861d762a2b34808de3ff9529
camera-runtime.log | 1666 | 60e9754f63bf0f94ac87108af4cec2f94f293c99b1d04b1abbc07be6e30eaa56
camera.test.ts.before | 8293 | ae71032f170a92ee78e15e7814226240096223c87a1fba32a89cdcb9c1887e01
camera.ts.before | 7254 | b016ffacb0eab6b05e0cb53139eb73fddaa60f12112c2cde972f574585af5d36
frame-gate.log | 902 | 11a0a6ac0245ca754078edb1418970d19b36ef21f3648126ac5442906f772b22
full-unit.log | 143455 | 026ae00c8a3c2cc6db450ba7330eeb831fde9bba22dabea4b06aed05426204b2
gates.json | 1312 | 2a4ff5be17d5f2a334fca4b49571d2addbdc3a9b7a19c03514f7dba59a2810af
lifecycle.log | 2331 | 782d61bf9465021886222ad0145865df854043a2b616765f5c5b3789ce871389
preview.log | 40 | 139089fd411aebddd7b5d9da6381f794204b3c9c35b01cce4ebcea7b50fab899
red-gates.json | 370 | f4476fc69c17af7a10fb1db36024e71d2991af83b4de11fc30fc5620d4e34135
red-preview.log | 40 | 934716c38736e8ec50e09dbb8f01df18b8516b6a72479c437753081d89374627
red.log | 646 | 570034d2d7824850882192660e0e3acb46cd330ae498863cc3fba6532ee2af41
screens/bf-qa-tower-victory.png | 144362 | 5051ad73490fc792dc9123403e19290d6d585d94a23d3299fbfcb52e2f011504
source.json | 43754 | 3651a60b4b00e9c8954a16de1b94aeb6720ff17b17791ce57a7c0f16c8145a1e
targeted-exit.txt | 3 | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354
targeted.log | 2504 | b0c9b930b0437161686ed57521d53413c7e0f7b05b385375478b5bf34b7270b6
tower-final.log | 2864 | 569780954065b4013ff243c9d254b88ee92de0d9a3c083cde470fdece90287f0
tsc.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
