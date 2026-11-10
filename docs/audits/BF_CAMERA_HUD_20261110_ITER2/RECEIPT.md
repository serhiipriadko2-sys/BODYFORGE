# BODYFORGE — Camera HUD visibility iteration · receipt
Date: 2026-11-10. Location: C:\github\BODYFORGE, authorized Windows desktop.
Status: BLOCKED / TARGETED ROLLBACK VERIFIED. This document is an engineering receipt, not a release declaration.
Current inspected Git HEAD: ad0c23b86f9d1776807882c2fc7a8a43639573ce. No commit, push, merge or deployment by this operation.

## A / Problem
User's real workout screen recording showed an oversized counting circle and knee-angle HUD covering portions of legs/feet. Root UI source: src/forge.css (.counter-center, .counter-circle, .pose-hud). Overlay positioning did not modify raw camera pixels or pose detection, but made visual self-framing difficult.

## B / Evidence and reproduced baseline
Added a four-viewport Chrome geometry regression to qa/mobile-e2e.mjs, measuring bounding rectangles on 320/360/390/428 CSS px while a disposable fake-camera stream ran.
Baseline expected FAIL: 320px counter bottom 425 vs allowed 300; 360px 496 vs 347; 390px 550 vs 381; 428px 587 vs 410. Evidence: hud-baseline-red.log (browser exit 12 for new regression).
The 65% frame boundary is a UX design invariant chosen for this test, not a scientific recognition/accuracy threshold.

## C / Patch candidate (now rolled back)
CSS in src/forge.css: camera-only @media(max-width:428px); place the compact circle and angle HUD at top:148px with width 106px circle, clear lower 35% of video.
qa/mobile-e2e.mjs: after pose model starts, check 4 viewport widths for panel bounds, overlap and coach clearance, then capture the camera HUD screenshot. No camera threshold, storage, training reward or model dependency changes.
A byte-accurate reversible patch is saved as rollback-native.patch and a human-readable diff as hud-current-patch-before-rollback.diff (both describe the candidate BEFORE reversal).

## D / Observed effect (before rollback)
Four viewport assertions PASS on candidate: counters' bottom y=261 px at each width (relative to frame); angle HUD bottom y=250–261; all below respective 65% frame boundary. No overlay overlap found by the test. Candidate completed full npm run qa:mobile with BODYFORGE_MOBILE_E2E_PASS (exit 0). Test still synthetic and does not measure precision on a human.
Candidate npm run build exit 0 and npm run qa:bundle exit 0, 20.3% initial JS reduction. Evidence: hud-build.log, hud-bundle.log, hud-green-attempt.log and bf-qa-mobile-camera-hud-390.png (visual screenshot inspected).

## E / Full-app gate and reason for BLOCKED
The final npm test -- --maxWorkers=1 --no-file-parallelism FAILED due to concurrent, unrelated work:
1. First full run: 569 PASS / 2 FAIL in new foreign src/lib/forgeHomeXp.test.ts while src/App.tsx was concurrently changing. When settled, the focused rerun of those 2 tests PASS.
2. Second full run: 571 PASS / 1 FAIL in foreign src/lib/screenNavigation.test.ts, asserting camera guidance moved to SettingsFaq. Focused 4-case rerun still 1 FAIL, not resolved by HUD CSS.
Other processes had uncommitted modifications to src/App.tsx, src/components/ExerciseCatalog.tsx, src/components/ProgressPulseBoard.tsx, src/components/SettingsFaq.tsx, src/neonPulseV2.css and their tests. These are not part of this HUD scope and were not modified or reset by this agent.
No claim that global tests, Android/in-vivo movement accuracy, 3D rotation, production Firebase, FPS or privacy field QA passed.

## F / Targeted rollback and verified local state
The exact candidate hashes and current Git diff were inspected before rollback. Git reverse-apply check against a native-byte diff passed, and only our candidate hunks in src/forge.css and qa/mobile-e2e.mjs were reversed. The CSS file's raw bytes were restored from HEAD only after git hash-object proved semantic equality.
Read-back after rollback:
- src/forge.css: 21,570 bytes, SHA256 47c6b6be7ccf519ed5e637169f699e64977a1fa12671582da4c60ed0dbaac879, no Git diff.
- qa/mobile-e2e.mjs: SHA256 623c84166b241ca2b4f81722ea2af77cca3e288d86a77f5bf113455f01d8dbbd, no Git diff.
- Counter focused unit (squatCounter+poseGuidance): 37/37 PASS, exit 0.
- npm run build after rollback: PASS, exit 0.
- npm run qa:bundle after rollback: PASS, entry 394517 bytes, 20.6% reduction against 496761-byte baseline.
- Local preview http://127.0.0.1:5176/ returned HTTP 200 and root element; no physical device verification.
- git diff --check: PASS.
The historic 9 screenshots in docs/audits/BF_CAMERA_HUD_20261110 were restored to committed bytes after new copies were preserved under this ITER2 folder. Other contributors' files left untouched.

## G / Artifact inventory
Root: docs/audits/BF_CAMERA_HUD_20261110_ITER2
- rollback-native.patch | 3,696 bytes | sha256 aa2696d5323640164e0dfd624dddc2efc7235fe9004ccb909149f97b93011dfb
- hud-current-patch-before-rollback.diff | 3,766 bytes | sha256 446157484da1e6815f8c79a8d011c6283edbc53013562e7c54d78b59e6438066
- hud-baseline-red.log | 24,252 bytes | sha256 a4cb01dd272cc950ea5a120b28c0ebdfb5cda076ad7aa54e98da1424e75e2799
- hud-green-attempt.log | 18,974 bytes | sha256 6161f4c2b26ddf651679adad6ac102897c93fa5da27619ee4e296626d6f5919f
- bf-qa-mobile-camera-hud-390.png | 71,172 bytes | sha256 5859d3ae7ef9b9b95cbe9d84702b673f28d0009ff9f973afe5e3cbcca7237930
- unit-stable.log | 221,294 bytes | sha256 5c7ef83d9f72f3d00eeee7fe26134db104ea2c10d65f85abdc4ae17b91a3e66b
- screen-navigation-recheck.log | 12,958 bytes | sha256 c09335b229818b7ce0ed635224fec76068172b940b4d3acb42979ff56f3c7c5d
- counter-focused-after-rollback.log | 2,150 bytes | sha256 c43eb3c826d7c939611ceda436280dafb31a84e5e76d1be135746831d37e43e7
- build-after-rollback.log | 5,518 bytes | sha256 7d85704341249cda9f034e18f0edaf4a7e6bfbe01552bea85e33a303b0ee30b4
- bundle-after-rollback.log | 1,528 bytes | sha256 07b0a493cef3da10cf6244f6d3c9fe2c140681b2bbe5c5f24bb7de2fe89d4e23
The hash and size of THIS receipt itself are verified after writing, outside this document. Older media/video is not copied into the public repository.

## H / Next 15 minutes
When the other agent's Settings FAQ migration has a stable source snapshot and its full unit gate is green, re-apply the saved scoped patch using native Git diff (only if context still matches). Run 4-width synthetic HUD E2E, full unit tests, production build, bundle, camera-runtime, appearance and local browser smoke on frozen source before calling TESTED_LOCAL. Independently field-test real human squat count; synthetic landmark tests are not accuracy measurements.

## ΔDΩΛ
Δ: Measured and locally solved the camera HUD obstruction in a reversible candidate; user workspace returned to pre-candidate CSS due unrelated failing global tests.
D: video observation -> browser baseline FAIL -> candidate HUD four-width PASS -> full regression blocked -> targeted rollback -> hash/read-back and build PASS.
Ω: high for geometry improvement on a synthetic Chrome window; no claim for physical-camera accuracy or active release readiness.
Λ: reopen when concurrent foreign suite becomes green; stop/revert if any targeted or full gate fails again.
