# BODYFORGE — independent theme pseudo-element diagnostic / appearance QA handoff
Date: 2026-11-10. Remote authorized Windows workspace: C:\github\BODYFORGE.
HEAD at final gate: d8e3859f1319601786067d2af066e3419bc87357.
Status: AUDIT PASS / GLOBAL QA BLOCKED / TARGETED ROLLBACK VERIFIED. No release, commit, push, merge, Firebase or privacy setting change.

## A / Problem
Previous BODYFORGE camera HUD UX fix (compact visual counter keeping lower 35% clear) was preserved as a candidate, not installed because qa:appearance failed. Need distinguish a real purple theme CSS mismatch from a stale E2E harness and verify Chrome CDP lifecycle.

## B / Evidence
1. Official CSS custom-properties guidance explains inherited --* variables; CDP /json/version and Browser.close support browser-level control over an isolated QA Chrome profile.
2. An independent local-only browser test was created at docs/audits/BF_THEME_PSEUDO_20261110/theme-pseudo-diagnostic.mjs (6,341 bytes; SHA256 43b832d74d320ea49476e3ac030aeff7c719cd249de3df7c0369b5d89beb669f). It launches an isolated Chrome profile, uses localhost only, changes appearance through the actual UI, and reads the effective colors of #challenge .bf-guide-steps li::before.
3. Its first violet, settled violet, mint, and second violet samples matched the chosen --bf-accent variable and pseudo-element background: rgb(188,165,255) for violet and rgb(101,234,208) for mint. Exit 0, THEME_PSEUDO_DIAGNOSTIC_PASS. No app CSS source file was edited.
4. The full appearance runner on a valid stable localhost did reproduce an initial violet pseudo-style mismatch (mint actual, violet expected) after a longer interaction sequence. This remains unresolved. A one-second recheck was attempted in a temporary diagnostic patch but did not reach that point after the current app's navigation changed. Do not treat the simple independent PASS as overall appearance PASS.

## C / Decision / limited patch attempt
Read-only Git baseline first; original qa/appearance-e2e.mjs backed up exactly. Temporary QA-harness patch scoped to:
- ignore a short-lived Chrome launcher exiting 0 when an isolated DevToolsActivePort / CDP browser remains reachable;
- close only its own browser through CDP Browser.close and attempt bounded profile cleanup;
- align the initial dashboard-readiness check with the current Camera tab;
- measure pseudo style at 0/150/450/1000 ms if a mismatch occurs (diagnostic, no green-score suppression);
- route the integration check to Camera for daily plan and manual steps.
No changes to game logic, pose detection, rewards, camera permissions, app CSS or localStorage schema.

## D / Results
- Before harness patch, npm run qa:appearance returned exit 18 at 'Owned Chrome exited 0', without opening UI.
- After CDP fix on owned stable Vite QA server (http://127.0.0.1:5227), node qa/appearance-e2e.mjs --graphics-only returned exit 0 with BODYFORGE_MOBILE_GRAPHICS_PASS assertions=16. Changes to WebGL pixel budget and graphics preferences were read back without modifying game data. This uses an emulated DPR 3, not a physical device.
- Full qa:appearance initially got past Chrome but failed a full pseudo-element theme assertion; later, after HEAD progressed, it failed waiting for old dashboard-based daily-plan/step sections.
- Git diff of current uncommitted src/App.tsx confirms intentional removal of the DailyPlanBoard lazy import and JSX; src/lib/screenNavigation.test.ts explicitly expects that absence. The full appearance harness still requires #daily-plan, so its expectation conflicts with current in-progress code. The intended product behavior needs reconciliation; don't restore the component or weaken tests without reviewing that decision.
- Final full appearance test: FAIL exit 18, because 'Camera screen owns visible daily plan and manual steps' never became true. The diagnostic pseudo-settling branch was not reached in that final run.
- After targeted rollback to unchanged qa/appearance-e2e.mjs, full unit tests 575/575 PASS, npm run build exit 0, qa:bundle exit 0: entry JS 392,200 bytes, baseline 496,761, 21% reduction, with source-defined dailyPlanRemoved=true; git diff --check exit 0.
- Preview http://127.0.0.1:5176/ returned HTTP 200 and root UI. Temporary owned QA server http://127.0.0.1:5227 was shut down; existing user servers on 5173 and 5176 remained reachable.

## E / Rollback and nonclaims
The appearance test backup was confirmed to have the same git blob ID as HEAD before reversing the native patch. Reverse apply check and apply returned success. Because Windows line endings changed, original exact backup bytes were restored only after both blobs matched HEAD, with read-back SHA256 ce357d8619b1d686090717262668b11c3892dc9b7725fb5bb42bd069339ba92b (52,940 bytes). No diff remains for qa/appearance-e2e.mjs. Only the standalone audit diagnostic remains as a created test artifact.
Not claimed: full appearance QA, final real-phone camera accuracy, animation FPS, Firebase production, real WebGL hardware results, personal health data, or successful deployment.

## F / Artifact manifest
Folder: docs/audits/BF_THEME_PSEUDO_20261110.
MANIFEST_SHA256.txt lists 25 evidence files totaling 446,822 bytes; manifest 2,493 bytes, SHA256 72b7199a1b953f94d84660c4486797cea9334f2077a3427ce28535936f6005dd.
Core files: theme-pseudo-diagnostic.mjs, diagnostic.log, graphics-stable.log, appearance-full-stable.log, appearance-after-all-routing.log, appearance-scoped-native.patch, appearance-e2e.before.mjs, unit-postrollback.log, build-postrollback.log, bundle-postrollback.log. The receipt's own file size/SHA must be verified after writing.

## G / Status
INDEPENDENT_DIAGNOSTIC = TESTED_LOCAL (PASS).
QA HARNESS PATCH = CANDIDATE_TESTED_PARTIALLY then TARGETED_ROLLBACK_VERIFIED.
APP RELEASE = BLOCKED by mismatch between intended daily plan removal, current code and appearance E2E expectation. No deploy action performed.

## H / Next reversible 15-minute step
Read the current ADR/product decision that removed DailyPlanBoard. Decide whether the Camera experience should still have an editable personal daily plan or only missions and steps; do not decide from a green test alone. Then update the appearance test's panel contract narrowly and run it on a fixed commit with owned Chrome. When qa:appearance, unit/build/bundle/mobile all PASS on one frozen snapshot, reapply the saved HUD layout patch and measure its 320–428 px geometry and real-phone leg visibility.

## ΔDΩΛ
Δ: Direct measured proof that theme variables update correctly in a simple UI sequence; explicit evidence why full E2E remains blocked on latest source.
D: real browser 4 palette samples -> targeted CDP lifecycle patch -> 16 graphics PASS -> source-drift detection -> exact rollback -> unit/build/bundle and localhost verify -> 25 hashed evidence files.
Ω: high for independent CSS inheritance observation and byte-identical rollback; not enough to explain full E2E pseudo mismatch.
Λ: re-open when source product decision/QA contract is reconciled; field camera accuracy remains UNKNOWN.
