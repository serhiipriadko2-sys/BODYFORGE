# BF-209 leg-raise geometry and observation continuity - engineering receipt

Status: IMPLEMENTED / TESTED_LOCAL on pinned snapshot. Overall BF-209 PARTIAL: human/device field validation NOT_RUN. Experimental recognition retained.
Observed 2026-11-25T20:15:33.190098+03:00; workspace E:\github\BODYFORGE; HEAD at freeze 664ab80c89b244bab1014ec5c652d11c6a490470.

Scope: BF-209/CV-LR from master roadmap and execution prompt. Preserve existing 150/110 hip angles, 145 knee minimum, floor torso ratio, time thresholds, reward constants, exercise ID, model, and save schema. Require visible same-side shoulder, hip, knee, ankle, in-range supplied confidence, existing 3.5% crop margin. Independently require a horizontal projected leg for the lowered phase and non-horizontal upward leg with ankle above knee above hip for engaged phase, using the existing 1.15 floor-view ratio. This is a conservative engineering projection rule, not a field-calibrated threshold. It can reject legitimate low-amplitude or oblique-view movements. One visible side is measured; simultaneous movement of both legs, floor contact, and safe technique are not established.
FSM: apply strict continuity and same-side calibration to leg-raise, reset partial on invalid/missing joint or >400ms gap, require consecutive active/return evidence, preserve completed reps. Existing resize invalidation exercised. Update coaching; no other exercise thresholds changed.
RED: initial 15 failures among 32 cases. Before production changes, strengthen the downward-motion fixture to reproduce the intended defect while remaining within frame; final RED 16 failures / 16 passes. Original test and RED evidence retained. GREEN: 32/32 new tests, 288/288 focused tests in 12 files. Cases cover torso-only movement, downward swing, bent/cropped/missing joints, side substitution, disjoint lifts, incomplete return, stale clocks, long gaps, mirror/aspect/scale and two tempos.

Integration snapshot: 326 source/build/QA inputs; 73 outputs; all recorded bytes and SHA-256 verified. TypeScript forced build, Vite, lazy bundle gate exit 0. Entry index-DQoZ1LQv.js SHA256 5bde1316589e5b12eb365b060b09ac5483522ef4c711dd36981f793d6f36803b; 394174 bytes, reported 20.7% smaller than historical baseline. Camera chunk 154276 bytes. Existing large avatar chunk warning remains.
Browser integration: isolated owned Chrome, fake camera, finite synthetic landmarks, real observation timestamps. Leg raise 30/30 and crunch regression 30/30. Invalid patterns zero, raised-only not completed, resize invalidates partial with camera live, two valid reps then cancel preserves exact test profile, 20 valid reps create one saved workout and one +120 XP/+35 coins reward, camera/model released, reload preserves paid profile. Startup calibration restart allowed after initial gap; motion intervals remain <=400ms. Twenty-leg-raise max gap 96.7ms. Both browsers cleaned, preview port closed. No human accuracy claim.
Initial full Vitest forks run: exit 1; 992 passed, 92 files, eight worker startup errors (spawn UNKNOWN), no full PASS claim. Retry on exactly the same verified source/build snapshot with --pool=threads --maxWorkers=1 --no-file-parallelism and normal isolation: exit 0, 1066/1066 tests, 100/100 files. Both attempts retained. No source or test exclusions made to bypass worker errors.

Final static checks git diff=0, staged diff=0, canon=0, QA syntax=0.
Current live drift relative to tested snapshot: changed=['qa/durable-journal-e2e.mjs', 'src/components/Avatar3D.tsx']; new=['src/lib/avatarViewFraming.test.ts', 'src/lib/avatarViewFraming.ts', 'src/lib/journalMixedStorage.test.ts', 'src/lib/journalMixedStorage.ts']. All four owned final hashes match. Later parallel changes are outside this acceptance.
No APK generation, Firebase deployment, dependency install, Git commit/push, real user profile or actual camera access. VS Code open requested; screen pixels not independently inspected.
Next: BF-210 plank timer/pose-loss, then full integration and separate real device/participant validation gates.
Rollback: restore only owned source files from exact .before copies if current hashes still match; remove only matching new test/QA files. Preserve concurrent changes.
Reference: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker .

Owned files | bytes | SHA256
src/lib/exerciseCounter.ts | 19800 | 66ae266f8ec8fa45d58b44a071702609e441ea2b29fe1f088ac1bc8c78a4d21e
src/lib/trainingCatalog.ts | 8755 | 6ee3267ce58dcc1d1a78ea1517f2655fe1a6367c1f6e551bf5827b03a95d95cc
src/lib/legRaiseReplay.test.ts | 9049 | e1ec1a4829fcde1dfcf61f18d037a3b9cbebc3cb08e3e6f53865b197b4604927
qa/leg-raise-replay-e2e.mjs | 14522 | ab850ff28ed16e919c763b50584483e5b4ba6c1493dd6e189b34072870a7002b

Evidence | bytes | SHA256
baseline.json | 855 | dd41cfda1aa03befa5892c3791836d46ba354665a30699c5090a74a82b877b02
build-manifest.json | 10787 | b87620c401e5079858b82fe1afdb9cf83c18b58f9dc97f41f3ac7705cfdc720f
build.log | 2495 | 99ed1f9a8ea9331706fb2887e86ab389d9cdba9a7e2dab3c7027f5ca09a424ac
bundle.log | 281 | f52ace238d139e5673476e65ff18818b3c8d5cf31d857ec1d2b5be24749d0ce5
crunch.log | 2143 | 08a327caac6ae773ff6f7d3ced7b96905e1f7c9ddd55d957c27eec73062c98e6
exerciseCounter.ts.before | 19062 | 47e1d273fc55658c9a57477206b626dee3374d741540d34e5c40110a5fc16f48
full-unit-threads.log | 15770 | 22d9630fe17c7d64eaa9378d25b1d55074f62b64a449252f502458bde69cddcf
full-unit.log | 32901 | fe9c84943c35a022bdb88e77023468c24a173dfc97645bfc51e2f10ecb5515e3
gates.json | 1385 | efdb16dc3e672c093895e201f3f21f3768dd267e8a46110f0953f13042a17ddf
green-exit.txt | 3 | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354
green.log | 2018 | b3a91a50adbb26fa8a399a4df50c5d9aea79d7ae7d08b9f619e7c852565def81
initial-red-exit.txt | 3 | f1b2f662800122bed0ff255693df89c4487fbdcf453d3524a42d4ec20c3d9c04
initial-red.log | 23716 | 0c4abedd214ad95b80c3552e57d2022c8262dbc59175f598e68551983127d34c
leg-raise.log | 2221 | bbab2be833d9f841880498d0d070b38ebb92b71b0804a8481a9ef69a698ef2fc
legRaiseReplay.test.ts.initial | 8946 | b1629adaf080b338fbdb90748913df83c722c5fefd846d4e333b990b39a19a75
preview.log | 40 | 130649b46c75fe991be1c7ec1639b6f22ce9360331c28a9784cda44b05dc1d7e
red-exit.txt | 3 | f1b2f662800122bed0ff255693df89c4487fbdcf453d3524a42d4ec20c3d9c04
red.log | 25256 | 1cf25ebca8c3c8eaf4cd86442bb74e1ae8f477c84887a15b6862e4f82153fd42
source.json | 47562 | 13620559ac1ce61199bc78914dc9719e59016920a767156885ed0af972edab05
trainingCatalog.ts.before | 8504 | ea61e9a7f26c9fab1cd7985da957dac16c842b7641b462a0b80e8d223b4dcbdb
tsc.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
unit-retry.json | 402 | 59b944723ff43cbf0da02997e651f96ee8b3a2e1cef416a211834e536b06b72b
