# BODYFORGE — mobile QA navigation repair (2026-11-10)

## A / Problem
The mobile E2E harness failed with exit 12 before camera testing. Its fallback daily-plan reload target measured 0x0 CSS px on the Forge dashboard, and its later backup wait timed out.
The current app intentionally displays daily-plan/quest content on the Camera tab and the backup panel under FAQ; the test was measuring hidden dashboard content. The video-based camera HUD obstruction is an independent open issue.

## B / Evidence
- Scope: C:\github\BODYFORGE, remote Windows device DESKTOP-ITUAMNF.
- Original branch HEAD at investigation: 7144fc4c20d813979c82a9bd980f4b274c24af67. Concurrent process later advanced HEAD to ad0c23b86f9d1776807882c2fc7a8a43639573ce.
- Current CSS: src/neonPulseV2.css, challenge-only #daily-plan / #quests / #step-log and settings-only #settings.
- Before patch, E2E log: DAILY_PLAN_RELOAD_TARGET width=0 height=0; subsequent backup panel timeout.
- Fail screenshot and logs are under docs/audits/BF_CAMERA_HUD_20261110/ (from prior isolated run). They are synthetic app QA images, not the user's recorded video.
- Reversible pre-edit backup: docs/audits/BF_CAMERA_HUD_20261110/mobile-e2e.before.mjs, SHA256 212b72d59297eab72600453351507aa1f6dc7622dc76850bcfb6462e86d613d7.

## C / Decision
Fix ONLY the test's navigation to match shipped UI. No edits to camera, reward rules, profile storage, CSS layout or Chrome security flags in this mini-iteration.
Rejected: forcing hidden panels visible on the wrong screen or weakening the 44 CSS px assertion. Cost: extra navigation within disposable E2E session.

## D / Changed
File: qa/mobile-e2e.mjs, three small location-specific changes:
1. After fighter creation, navigate to Camera before measuring/reloading daily plan.
2. Navigate to FAQ before backup inspection; return to Home before checking dashboard CTA.
3. Navigate to Camera before the daily reward test.
The file contains other contributors' modifications; only these scoped hunks are owned by this run.
Rollback: compare with the saved mobile-e2e.before.mjs and revert only these navigation insertions using minimal diff; never replace the entire concurrent file.

## E / QA
- Node syntax check: exit 0.
- npm test -- --maxWorkers=1 --no-file-parallelism: exit 0; 572/572 tests (48 files).
- npm run build: exit 0.
- npm run qa:bundle: exit 0, entry 395725 bytes, original baseline 496761, reduction 20.3%; MediaPipe is a separate 154276-byte chunk. No threshold change.
- npm run qa:mobile on http://127.0.0.1:5176: exit 0, 90 PASS assertions, 0 recorded BROWSER_ERROR/BROWSER_EXCEPTION/E2E_FAIL/cleanup-error markers.
- Preview HTTP 200 with root UI, plus active Chrome UI assertions. Synthetic camera stream only.
- Real recovery button measured 164x48 CSS px, visible above bottom navigation. Screenshot bf-qa-mobile-plan-error.png manually inspected.
- Source SHA256 of src/App.tsx, src/forge.css, qa/mobile-e2e.mjs and src/neonPulseV2.css did not drift between test start and end.
- git diff --check exit 0.
- Not tested: human repetition accuracy, Android field frame-rate, Firebase production, server authentication, real 360-degree garment fit.

## F / Evidence and receipts
Artifacts are local, under C:\github\BODYFORGE\docs\audits\BF_MOBILE_QA_ROUTING_20261110.
- qa/mobile-e2e.mjs: 41522 bytes; sha256 623c84166b241ca2b4f81722ea2af77cca3e288d86a77f5bf113455f01d8dbbd.
- unit.log: 13606 bytes; sha256 bde1df5e01f4a44e1b74fccdfeaf930a2cc50291bf86337741b018a38b74b704.
- build.log: 5518 bytes; sha256 f3c538eef952527b96528ad13a4688b39628ffb6ad9dcc17bd8361bdf40d5029.
- bundle.log: 1528 bytes; sha256 2c342473dee436223268335be5ef863b8aaa4e01b82509887d005553d605b3f8.
- mobile.log: 17940 bytes; sha256 64de0bef65cd33355521db31539960ea9db3499b5e771dc0ea3b57cb33802dd6.
- HTML preview: http://127.0.0.1:5176/ (remote desktop only).
- HEAD ad0c23b was produced by another process and contains the tested qa/mobile-e2e.mjs blob, checked by git hash-object vs git rev-parse HEAD:qa/mobile-e2e.mjs. No commit/push/deploy was performed by this run; remote hosting state was not checked.

## G / Status
TESTED_LOCAL for the mobile E2E navigation fix. Current Git commit contains the tested version (observed read-back), but deployment and physical phone behavior are NOT VERIFIED_LIVE.

## H / Next reversible 15-minute action
Make a standalone camera HUD visibility regression matrix for 320/360/390/428 CSS px, and only then rework the camera-only overlay without changing the pose detector. Stop on any failed unit/build/bundle/browser gate.

## Delta / D / Omega / Lambda
Delta: restored the E2E harness to cover current user-visible navigation.
D: initial 0x0 hidden target / timeout -> navigation-only patch -> full tests/build/bundle -> 90 Chrome checks -> SHA and Git read-back.
Omega: high confidence in current Windows synthetic QA path; no physical accuracy claim.
Lambda: re-evaluate on further tab structure changes or if the source SHA/version changes.
