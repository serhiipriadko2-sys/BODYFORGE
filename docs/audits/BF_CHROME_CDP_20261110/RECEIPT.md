# BODYFORGE — Windows Chrome CDP QA repair receipt

Date: 2026-11-10. Surface: Remote Desktop Commander / DESKTOP-ITUAMNF / C:\github\BODYFORGE.
Scope: qa/mobile-e2e.mjs (2 exclusively owned edit regions); docs/audits/BF_CHROME_CDP_20261110 (evidence only).
HEAD (read-back): 7144fc4c20d813979c82a9bd980f4b274c24af67. Local, not committed or deployed.

## A / Problem
Before patch, npm run qa:mobile on http://127.0.0.1:5176 returned exit 12: Owned Chrome exited 0 before the script reached CDP. This was a QA harness readiness failure, not an observed game UI defect.

## B / Evidence
Independent same-flags Windows Chrome diagnostic: launcher HasExited=True while DevToolsActivePort existed and /json/version answered CDP_OK=True; 12 owned Chrome processes seen for that diagnostic profile.
Current source had an early check of chrome.exitCode inside endpoint(); it aborted before trying the usable DevTools port.
Initial git status was clean. During this session other workers edited src/App.tsx, qa/bundle-on-demand.mjs and unrelated sections of qa/mobile-e2e.mjs. Their changes are not part of this patch and were not reset.

## C / Decision and cost
Use the reachable CDP endpoint and the profile-specific DevToolsActivePort as readiness evidence instead of launcher exitCode. Preserve Chrome security/media flags. After E2E, use CDP Browser.close against ONLY the temporary profile, then attempt profile removal with retries. Cost: up to 15 seconds on a truly unavailable CDP endpoint; no reduction of camera or browser security settings.
Alternative rejected: relaxing Chrome flags or killing all Chrome processes. Not needed and would risk the user's running browser.

## D / Changed (only the investigator-owned hunks)
1. qa/mobile-e2e.mjs: remove immediate throw on short-lived Chrome launcher exit; add explanatory comments. Existing CDP port + page lookup remains authoritative.
2. qa/mobile-e2e.mjs: replace single-line finally with owned browser-level CDP close, bounded open timeout, fallback child kill, and checked temporary-profile cleanup.
These are localized edits. Other contemporaneous diffs within qa/mobile-e2e.mjs belong to another worker. Do not revert the entire file to undo this repair.
Targeted rollback: compare current qa/mobile-e2e.mjs, then restore only the original early-exit line and original finally block from git HEAD. Preserve all adjacent hunks, especially downloadedPanels and DailyPlan tests. Never run git reset --hard or git checkout over a changed file.

## E / QA (the second, logged run)
- node --check qa/mobile-e2e.mjs: exit 0 (verified before first successful patched run).
- npm test -- --maxWorkers=1 --no-file-parallelism: exit 0, 564/564 tests; 46 files. Evidence: unit.log.
- npm run build: exit 0. Evidence: build.log. Vite still warns about 651.09 kB lazy Avatar3D JS chunk; this is not an FPS result.
- npm run qa:bundle: exit 0, entry=396967 bytes, baseline=496761 bytes, reduction=20.1%; camera chunk=154276 bytes. Evidence: bundle.log. Threshold unchanged.
- npm run qa:mobile (BODYFORGE_QA_ORIGIN=http://127.0.0.1:5176): exit 0, 85 emitted PASS checks, 0 browser exception/error/failure/cleanup-warning lines. Evidence: mobile.log.
- Production preview HTTP 200; HTML contains #root; E2E proved a mounted, navigable app with onboarding, studio, upgrades, backup read-back, camera stop/no XP, lens changes, 360px layout.
- git diff --check: exit 0. Evidence: diff-check.log.
- Browser: headless local Chrome on Windows, synthetic media stream and isolated temporary profile. Physical Android/iOS, camera accuracy, real FPS and GPU drain remain UNTESTED.
- Process inspection after successful run found only older bf-mobile process cohorts started at 17:34 and 17:48, before the final logged run (17:58+); they were deliberately left untouched because their ownership was not independently established. No fresh leftover cohort was observed.

## F / Artifact receipts
All paths below are within C:\github\BODYFORGE. SHA-256 values are lowercase.
- qa/mobile-e2e.mjs TESTED SNAPSHOT at the logged E2E run | 39182 bytes | d462139e9244ce4ca585823f22fe71afcb34b633915e82c60e405a813f4d7e91
- docs/audits/BF_CHROME_CDP_20261110/unit.log | 14898 bytes | 20a264fd1488be03706801065b265239894978db0c53cf0d6cd662fea6dd2b0e
- docs/audits/BF_CHROME_CDP_20261110/build.log | 4878 bytes | 63ae15279292651d38981503c4606224311a36fdad2ae9874107d694fd733665
- docs/audits/BF_CHROME_CDP_20261110/bundle.log | 1526 bytes | 21c94af463948abf4b0b76a5c5d12fa7f47e6edb5d2d5e3c40e58ae01926c695
- docs/audits/BF_CHROME_CDP_20261110/mobile.log | 16168 bytes | bfdda33a611fa433c208a3106a60328eb587645c3f7e355ec9479d52fee70e21
- docs/audits/BF_CHROME_CDP_20261110/bf-qa-mobile-home-360-premium.png | 160577 bytes | 61d9975bc8930493823d99219b788eb2368e70e9d138116ad792432d32c2188e
- docs/audits/BF_CHROME_CDP_20261110/bf-qa-mobile-forge-upgraded.png | 201049 bytes | 4d39f4ecd5de1f0e224fd4097ed3f1c0a4ff294345308f7c7f11b7db4de5f4a8
- docs/audits/BF_CHROME_CDP_20261110/bf-qa-mobile-performance-panel.png | 89657 bytes | f878c71d2346f74ef67de6a4e6a34163587b22ac00fe8721f288125a925a6a95
The separate receipt file itself is hashed after read-back in the chat report; its hash cannot be self-embedded.

## Visual screenshot inspection
- The recorded 360 CSS px home screenshot was opened and checked: the СТАРТ button is readable and lies above the bottom navigation.
- The recorded forge-upgraded screenshot was opened and checked: the 3D fighter, clothes and shoes are visible in the static front view. This does NOT prove bone attachment in motion, a 360-degree fit, physical mobile fidelity or GLB performance.

## Concurrent file drift after the verified E2E
- At 18:05:33 a different process extended qa/mobile-e2e.mjs with new screenshot output and a 44px recovery touch-target assertion. Read-back of the new file: 40232 bytes, SHA-256 65268cfe7a5a2665ff9663ef139e2f669fdce6bbdbd04b101b8b0a2bca0b7cbe.
- Both CDP/cleanup hunks remain present. The new post-test additions were NOT covered by the recorded 85-check E2E. Thus TESTED_LOCAL applies to the hashed tested snapshot, not automatically to the latest entire working tree. Other workers also modified src/lib/camera.ts and cameraSelection.test.ts after the recorded run. No code was reset.

## G / Status and non-claims
IMPLEMENTED and TESTED_LOCAL for the qa/mobile-e2e.mjs CDP readiness/cleanup correction. NOT COMMITTED; NOT DEPLOYED; NOT VERIFIED_LIVE.
NOT asserted: Chrome repair across all other QA scripts, field camera precision, correct GPU fps on an Android phone, cloud sync, production Firebase version, or a P0 gameplay defect.

## H / Next reversible 15-minute step
Read and run qa:camera-runtime or qa:finish-save on the fixed preview, confirm whether their owned-Chrome startup checks repeat this launcher/port error. If so, propose a shared tiny harness helper with a separate regression; do not sweep-rewrite every QA script.

## Delta / D / Omega / Lambda
Delta: one reproducible QA environment blocker is removed without editing gameplay.
D: initial exit 12 -> independent CDP proof -> scoped source changes -> exit 0, 85 E2E checks + full build/unit/bundle -> file hashes.
Omega: high confidence in this Windows local E2E correction; unknown on physical phones and unrelated test harnesses.
Lambda: re-open if future Chrome changes break CDP readiness, cleanup leaves a new owned profile, or a different Chrome script still fails.
