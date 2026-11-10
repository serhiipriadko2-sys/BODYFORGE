# BODYFORGE — Camera HUD visibility / Iteration 3

Date: 2026-11-10. Surface: authorized Windows desktop, C:\github\BODYFORGE.
Status: BLOCKED / TARGETED ROLLBACK VERIFIED. No code deployment, Git commit, push, merge or Firebase mutation performed by this session.
Inspected Git HEAD: ad0c23b86f9d1776807882c2fc7a8a43639573ce.

## A / Problem
User-supplied real workout recording showed the circular rep counter and angle diagnostics hiding legs/feet inside the portrait camera view. This is a framing UX issue; CSS overlays do not modify the raw video passed to MediaPipe, and recognition accuracy cannot be inferred from a screenshot.

## B / Evidence (pre-patch)
Baseline current-state read: src/forge.css 21,570 bytes SHA256 47c6b6be7ccf519ed5e637169f699e64977a1fa12671582da4c60ed0dbaac879, qa/mobile-e2e.mjs 41,522 bytes SHA256 623c84166b241ca2b4f81722ea2af77cca3e288d86a77f5bf113455f01d8dbbd; both matched HEAD.
Baseline full unit: 573/573 PASS, production build PASS, qa:bundle PASS (entry 394,517 bytes, reduction 20.6% against 496,761-byte historical baseline). Prior red browser geometry found counter bottom y=425/496/550/587 px vs accepted boundary y=300/347/381/410 px at 320/360/390/428 viewport widths. The 65% boundary is a visual design invariant, not a movement-accuracy threshold.

## C / Decision
Apply the existing scoped two-file patch, only if Git HEAD, source hashes and patch hash matched. It adds a camera-only @media(max-width:428px) compact counter and relocates angle HUD to top:148px; appends a 4-width browser geometry contract. Preserve all foreign uncommitted changes in other files. In case of any overall QA FAIL, restore only these two hunks and keep the candidate patch as evidence.
Original native patch SHA256 aa2696d5323640164e0dfd624dddc2efc7235fe9004ccb909149f97b93011dfb.

## D / Changed during candidate
src/forge.css: 26 lines. qa/mobile-e2e.mjs: 25 lines. git apply --check PASS; git diff --check PASS. No change to game.ts, progression.ts, camera detector, confidence thresholds, MediaPipe model, user-profile key, rewards (120 XP / 35 coins), or Firebase.
The exact patch is archived as hud-candidate-native.patch (3,696 bytes, SHA256 aa2696d5323640164e0dfd624dddc2efc7235fe9004ccb909149f97b93011dfb). Binary/text copies of candidate files also retained under this audit folder.

## E / Tests while candidate applied
- 573/573 unit tests PASS, npm run build PASS, qa:bundle PASS (20.6% reduction), preview http://127.0.0.1:5176/ HTTP 200 with root element.
- npm run qa:mobile: exit 0, 91 PASS records, 0 recorded browser-error markers. Chrome fake-camera profile only.
- All 4 HUD geometry records PASS: 320px limit y=300, 360px 347, 390px 381, 428px 410; counter bottom y=261 for all; angle HUD bottom y=250–261; coach warning bottom y=101–114. No panel overlaps detected.
- The 390px screenshot bf-qa-mobile-camera-hud-390.png (66,953 bytes; SHA256 371af56eca1e0c40d795ae533b93634f5c5e1a5ae382011bf6baec8d5541b165) was opened and visually checked. It depicts a synthetic green test image, not human pose accuracy.
- npm run qa:camera-runtime: exit 0, 26 PASS assertions, including stopping capture without rewards and cancelling a pending module import.
- npm run qa:appearance on the existing localhost preview (5176): FAIL before the page opened because owned Chrome launcher exited 0 before CDP readiness. The appearance runner was modified by another process, which was not edited here.
- Re-run qa:appearance against QA dev origin http://127.0.0.1:5174 after another worker's Chrome startup repair reached 250 PASS assertions, then FAIL: violet #challenge .bf-guide-steps li::before backgroundColor actual rgb(101,234,208), expected rgb(188,165,255). This is a real observed theme mismatch or a pending style update; root cause not proved. No threshold was weakened. Other changes to App.tsx/neonPulseV2.css/navigation tests occurred concurrently.
- No claim of full appearance PASS, physical Android/iOS performance, field squat precision, medical assessment or live deployment.

## F / Rollback and postcondition
Because an appearance-layer required gate remained FAIL and unrelated source changes occurred concurrently, the candidate was reversed using the exact native diff after SHA256 and Git HEAD read-back. git apply --reverse --check and apply: PASS. Git blob read-back matched HEAD before CSS byte normalization; only target file was normalized from its own committed bytes.
Targeted rollback read-back: src/forge.css 21,570 bytes SHA256 47c6b6be7ccf519ed5e637169f699e64977a1fa12671582da4c60ed0dbaac879; qa/mobile-e2e.mjs 41,522 bytes SHA256 623c84166b241ca2b4f81722ea2af77cca3e288d86a77f5bf113455f01d8dbbd. No Git diff for either target, no foreign files reset.
After rollback: full unit 575/575 PASS (additional concurrent tests), build PASS, bundle PASS (entry 394,517, reduction 20.6%), localhost preview HTTP 200, git diff --check exit 0.
Postrollback npm run qa:mobile: exit 12 at Page.captureScreenshot timeout while camera was running. The test emitted a synthetic capture/pose feedback view but did NOT finish. Temporary QA Chrome profile cleanup initially failed with EPERM. Exactly six Chrome processes with unique bf-mobile-SCLqq6 command-line profile ownership were identified, terminated, and profile directory removed. Independent second read-back: profile absent and zero matching processes. Owner's other browser profiles untouched. Last mobile PASS still belongs ONLY to the tested patched version, not the final rollback build.

## G / Files and receipts
Audit folder: docs/audits/BF_CAMERA_HUD_20261110_ITER3. Programmatic manifest MANIFEST_SHA256.txt indexes 55 evidence files, 3,694,663 combined evidence bytes, and per-file SHA256. Manifest size 5,789 bytes; SHA256 5b03e06ca60e6c91b4dfd70f9ba3bbeae0543abfc5114bc6d62c386176d1c643.
Core evidence: unit-baseline.log, unit-after.log, unit-rollback.log, build-after.log, build-rollback.log, bundle-after.log, bundle-rollback.log, mobile-after.log, mobile-rollback.log, camera-runtime.log, appearance-stable.log, owned-mobile-profile-cleanup.log, hud-candidate-native.patch and bf-qa-mobile-camera-hud-390.png.
The RECEIPT.md size/SHA256 and total artifact count must be verified after this write; not self-embedded.
Lifecycle: SPECIFIED → IMPLEMENTED_CANDIDATE → HUD_TESTED_LOCAL → GLOBAL_QA_BLOCKED → TARGETED_ROLLBACK_VERIFIED. NOT COMMITTED by this session; NOT DEPLOYED; NOT VERIFIED_LIVE.

## H / Next reversible 15-minute step
On a stable, frozen source snapshot, investigate the violet pseudo-element actual/expected style including inherited CSS variables and frame/update timing; fix without lowering QA assertions. Confirm qa:appearance PASS on a verified local origin. Only then, after fresh source-hash checks, apply saved camera HUD candidate and rerun 4-width E2E, unit/build/bundle, camera runtime and appearance. Independently compare human squat reps with manual annotation; synthetic Chrome stream does not measure actual recognition accuracy.

## Delta / D / Omega / Lambda
Delta: a verified camera HUD improvement exists as an exact reversible candidate, while user workspace was preserved by rollback after a separate appearance QA gate failed.
D: fresh read -> unit/build/bundle baseline -> two-file candidate -> 91 mobile/26 camera checks and 4 geometry widths PASS -> appearance FAIL -> scoped rollback/read-back -> 575 unit/build/bundle PASS -> postrollback E2E environment FAIL/owned Chrome cleanup.
Omega: high confidence in candidate geometry on synthetic mobile Chrome and in the exact two-file rollback; medium confidence diagnosing appearance mismatch, no inference about real squat accuracy.
Lambda: reconsider candidate when appearance and Chrome screenshot lifecycle are stable and final full browser QA reaches PASS on unchanged source.