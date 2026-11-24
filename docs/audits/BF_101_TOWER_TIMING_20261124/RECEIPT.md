# BF-101 final tower cap / time-aware QA - engineering receipt

Status: FINAL-FLOOR REGRESSION PASS on two verified local production builds. Whole BF-101/R1 and physical camera accuracy are not automatically accepted.
Observed: 2026-11-24T21:27:15.670278+03:00; workspace E:\github\BODYFORGE; HEAD 6b2319ac517883857aad2140e50e09c229d63245.

Prior BF-101 tower-cap application patch preserved byte-for-byte (App.tsx, workoutJournal.ts, workoutJournal.test.ts). Prior two browser runs stopped at 19 reps. Fixed observation-count fixture was sensitive to variable sampling; exact historical missed-rep cause remains unproven.
New QA-only finite fixture uses real detectForVideo timestamps, calibration/down/up dwell intervals, no production counter feedback, no clock mocking, at most 20 cycles, explicit failure on non-monotonic timestamps or gaps >850 ms. The browser stops on the final credited repetition before the fixture finishes its last standing dwell; cycles=19 in the final diagnostics is expected, independently verified 20 reps in actual stored workout. Default first-floor fixed pose sequence retained. Final-floor Chrome uses --disable-webgl to isolate camera/reward tests from software 3D load; avatar rendering not covered by this scenario.
Fixture unit: 9/9 tests, seven interval patterns x three frame aspect ratios through real StableKneeTracker and SquatCounter; rejects broken timing and extra cycles. First fresh snapshot 235 inputs: 643/643 unit PASS, tsc exit 2 due to optional HDR loader fields in avatarLighting.test.ts. Existing avatar file and report preserved. Minimal test-only runtime guard plus decoded RGBA length assertion; no avatar rendering or asset modified. Focused HDR tests 3/3 PASS.

Browser pass 1: byte-exact previously verified build index-DSvNuNFm.js, 37/37 checks, exit 0. Final floor reward 185 XP/65 coins; canceled partial has two counted reps and exact unchanged profile; ordinary workout gives only 120 XP/35 coins; quest adds 55 XP/20 coins; reload exact wallet and reward IDs. Camera/model releases verified, ghost splits 20, no uncaught errors. Max gaps 152.6ms and 96.8ms in complete workouts.
Integration snapshot: 237 tracked/unignored web/QA/root build inputs, all hashes checked before and after; full Vitest 646/646 (64 files); fixture node tests 9/9; tsc/build/bundle all exit 0. 61 build files. Entry index-9Z6QrhK6.js; SHA256 fec81a2bcfd40319c19ce7c54a0812ddd373f8375a0a58fdc3ea44c078d847ff; 395443 bytes (20.4% smaller than recorded historical baseline); separate pose chunk 154276 bytes. Existing lazy Avatar3D >500kB warning retained.
Browser pass 2: exact new integration build, 37/37 checks, exit 0, final floor and ordinary workout both credited, partial cancel, quest, reload. Max observation gaps 284.8ms and 103.7ms on full workouts; no fixture timing failure. Both disposable Chrome profiles removed, both owned previews stopped.

Final readback: git diff=0, staged diff=0, syntax={'qa/tower20-e2e.mjs': 0, 'qa/tower-squat-fixture.mjs': 0, 'qa/tower-squat-fixture.test.mjs': 0}, canon=0; owned hashes match; owner HTTP={'5173': 200, '5176': 200}; owned preview listeners=[].
Current source drift relative to integration snapshot: changed=['qa/avatar-quality-e2e.mjs']; new=[]; production drift=[]. Do not infer validation of unrelated modified QA files or physical device.
Only four files changed in this batch: qa/tower20-e2e.mjs, new qa/tower-squat-fixture.mjs, new qa/tower-squat-fixture.test.mjs, src/lib/avatarLighting.test.ts. No product runtime changes, save access, APK, Firebase, Git stage/commit/push, dependency changes or destructive reset. VS Code file open requested, pixel-level UI observation not performed.

Next: BF-102 full camera-to-journal crash path remains partial per separate BF_102_CRASH_20261124 receipt (seeded crashes 18/18; full camera path interrupted). Reuse independently tested timestamp-aware pose fixture in that harness, with ownership checks; then remaining economy and recovery gates. No automatic full roadmap acceptance.
Rollback: exact .before copies for existing QA script and HDR test; restore only after matching owned hashes, remove only matching new helper files; do not reset/clean concurrent edits. References: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame ; https://developer.mozilla.org/en-US/docs/Web/API/Performance/now .

## Verified paths (path | bytes | SHA-256)
qa/tower20-e2e.mjs | 22761 | 9b2af080913803f4e050785784fb3f16d970908f28b30f29b7639485e75ca517
qa/tower-squat-fixture.mjs | 1738 | 2201c53e64d7ef867c7753f249fe0e0278ed3c98ddb1003361780527165b2ecd
qa/tower-squat-fixture.test.mjs | 2348 | c1aa810b96eb5eac04a86f537d15a2f3e9f710edea293607f8e2bcba78bc118b
src/App.tsx | 82942 | 27407a9eb3e88b4beea59c1c5600b1534f13f869e1930b0c7fd5988cf7b871ab
src/lib/workoutJournal.ts | 13312 | 77d4e32f79403f294a86f71378f6065d889e797a2c2ae98cb11b28dee2fefc70
src/lib/workoutJournal.test.ts | 22701 | f69fac98c767102521c86f467c19f8e01226e921c68199b9f64343fda53e1797
src/lib/avatarLighting.test.ts | 3191 | 9c5d7ef618fce6857c12ff88a2f7ccac6873e343d8ff8d1c03ba7e9ce631b861

## Evidence (relative path | bytes | SHA-256)
avatarLighting.test.ts.before | 2824 | 44a3605c946dc2bdbb3733c60de9c600bc6eedf15f5d40839cb7c993868db174
fixture-exit.txt | 3 | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354
fixture-frozen.log | 764 | be2829327747a178c47f7db15b76aed3b3433bf3d1e1c60eab8ee93fc2195766
fixture-unit.log | 1566 | 1271a2b1ef5664e3f8782544dea2778e916d607a3091d27eb608409b817153c9
frozen-source.json | 34087 | 7f665f245fe4d89774aeeda6323c45dfc60db1b0b97c009c73324602b074ebe7
full-unit.log | 5375 | 9180962fb742839ae2bd2cea605e94c730c81ba82b49e5a5f24425ceec7102a2
gates.json | 765 | 4a9775e76282ee44539ece7e69e96878731087b51aee6996d402a53f1c649ef2
hdr-focused-exit.txt | 3 | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354
hdr-focused.log | 900 | 456c00b46cc8fcba5f57904c8457ae92365462e847325ac485cd7919f1c34444
integration-build.json | 8955 | 6000fa9ee588cad85a16b7b4bec59b0d653711f14b90dad6b5a00df62ae19bba
integration-build.log | 2107 | fa4bcfc71c75c3b0ffe6933b0cfcdf7d3f7fe6bc846f381999ca9ce8ba222e33
integration-bundle.log | 281 | a275c5c7fed2fd30a5c22b9a76b3c138f7acd590fd47db06c2db775cede65020
integration-fixture.log | 766 | 360cc6f1b77f62c5ba3fed7e379e11e754e1fef69a47b2b5182d22298a4c5427
integration-full-unit.log | 5570 | 694ef4024e781b4c8118630a40f54dca65bbddb4d42932bf334d49eb7b59cf93
integration-gates.json | 1290 | 82c483140326d3b49cf4ca671793bb2f75b8c8373d9753822cbd6287fa40e207
integration-preview.log | 40 | 8fb8a5fa1572937c229b7c6492a22a2ce879d1e74f4464aaa35641f043fd2011
integration-source.json | 34386 | d470372ca10d03faf15c026a729a9faf93bbe31790680c7f51f758eee9584b15
integration-tower-final.log | 2633 | 944016a22903d50afd919dd7d631ce496673d2d0fb249df8586003d7e7e9d7d1
integration-tsc.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
screens-integration/bf-qa-tower-victory.png | 146505 | e1910dd6933ef2462785269fa2e2d4e79ae8a6fb208c38d2915b1a5130d419af
screens-verified-base/bf-qa-tower-victory.png | 146505 | e1910dd6933ef2462785269fa2e2d4e79ae8a6fb208c38d2915b1a5130d419af
tower20-e2e.mjs.before | 21750 | 64833e8d06d91d82fcde18abebeef14e84366616016276d57ff8cfcb59d32e11
tsc.log | 643 | 193a29b38dd2f78447c1f5e0d2d0e5a3b20849e98b798625171fd7eceae02e79
verified-base-gates.json | 1098 | 628b4fe5502b85e0ac6111e0a1904063b5ce1c65cdf64c99bf0d6c2cc49e9a44
verified-base-preview.log | 40 | 58f0581f3d6545995eca311b0c22ce5f37185cdb7d6c6aa97714db76dffdf10d
verified-base-tower.log | 2618 | 0bbef9c539bea6b597eb21d1f7308b740510251737ae414f230a60bf905f8405
