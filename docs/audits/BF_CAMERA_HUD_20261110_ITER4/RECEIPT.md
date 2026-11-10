# BODYFORGE / Camera HUD Iteration 4 — Verified local engineering receipt
Date: 2026-11-10. Workspace: C:\github\BODYFORGE. Git HEAD observed throughout: d8e3859f1319601786067d2af066e3419bc87357.
Lifecycle: IMPLEMENTED → TESTED_LOCAL (SCOPED PASS), uncommitted. Production deployment / physical device: NOT VERIFIED.
Scope: exactly one production file src/forge.css; independently generated E2E kept under docs/audits only. No Firebase / push / merge / secrets / camera uploads.

## A / Problem
User-provided live camera framing showed oversized rep-count ring and angle overlay obscuring legs/feet. Baseline CSS positioned the 145px circle and diagnostics near the bottom of the portrait frame.

## B / Evidence & RED
Using the current unmodified qa/mobile-e2e.mjs source (SHA256 be9bee1912c556dd7b12153d9ea91b3a90f6ef777c4dab0ea2afcf9ecb526b2b), a standalone copy was generated with the four-width HUD geometry invariant from the previously verified audit patch. Generation is checksum-gated in make-hud-qa.mjs. It does not change the concurrently modified shared mobile runner.
Baseline Chrome fake-camera E2E returned exit 12 at exactly the new visual contract. For viewport widths 320/360/390/428, counter bottom from frame top = 425/496/550/587 CSS px; lower 65% boundary = 300/347/381/410. Baseline screenshot/log: hud-baseline-red.log.
The 65% frame limit is a project UX test threshold chosen to free the feet view; it is NOT a WCAG requirement or a measured accuracy metric. WCAG 2.2 Reflow separately recommends checking at 320 CSS px.

## C / Decision
Reuse just the CSS half of the archived, checksum-verified patch via git apply --include=src/forge.css. SHA256 checks confirmed HEAD, clean CSS, unchanged foreign mobile E2E and original patch before mutation. Only camera presentation changes on max-width 428px: counter-circle 106x106, position top 148px/right 8px, knee HUD top 148px/left 8px, narrow width, smaller typography. No change to MediaPipe, thresholds, camera permissions, reward calculation, profile storage, other CSS themes or avatar code.
The alternative of editing qa/mobile-e2e.mjs was rejected because another contributor owns its uncommitted diff. The geometry regression remains a stored standalone QA artefact rather than silently overwriting foreign tests.
Rollback: exact native patch hud-css-only.patch applied with git apply --reverse --check; or restoring forge-before.css ONLY after current hash and Git status are revalidated. Never reset foreign files.

## D / Changed and read-back
- src/forge.css: 26 added lines / 0 deletions, 21,570 → 23,012 bytes. Final SHA256 7adacc00887693cd0438591c3fa598b06f6499a1adfbfd4895c234642bbb1c9d. Original saved byte-identical forge-before.css SHA256 47c6b6be7ccf519ed5e637169f699e64977a1fa12671582da4c60ed0dbaac879.
- hud-css-only.patch: 1,109 bytes SHA256 c40d8fe2ed75380d19d18ed8cfa1bab9f042466813331daab2e7ead709f69a82.
- hud-mobile-e2e.mjs: 41,407 bytes SHA256 d790ab3ec6fc7619bd4f86cee2f117780c4f942f8c0c08a06aa65d61f2d6ba55. Created only in audit folder and node --check PASS. Derivative of same actual source with isolated added regression; original qa/mobile-e2e.mjs unchanged.

## E / Verification
- Focused RED → GREEN: same standalone E2E using a disposable Chrome profile and synthetic camera, baseline exit 12; patched exit 0 and BODYFORGE_MOBILE_E2E_PASS. All four camera HUD widths PASS. Counter bottom 261px at 320/360/390/428; pose HUD bottom 250/250/250/261; coach bottom 114/114/114/101; no panel overlap or horizontal overflow.
- Screenshot bf-qa-mobile-camera-hud-390.png: 71,625 bytes SHA256 6ca1d8c68fc8317dc49ef8782e6d58126de5717aaf2a98c294c54175a37725fe, opened and visually checked. Synthetic green camera view, NOT a person's body or landmark-accuracy proof. Small 'LIVE' badge remains near bottom; only large panels were moved.
- Full npm test -- --maxWorkers=1 --no-file-parallelism: 577/577 PASS, exit 0.
- npm run build: PASS, exit 0.
- npm run qa:bundle: PASS, 393787-byte entry JS against 496761 baseline = 20.7% reduction (gate ≥20% unchanged), lazy camera chunk 154276 bytes, removed daily-plan UI absent.
- npm run qa:camera-runtime: PASS, 26 checks, includes cancel pending module import, stream release, no rewards after manual stop.
- npm run qa:appearance: PASS, 616 checks, themes/reduced transparency/high contrast/mobile layout and save read-back.
- One original npm run qa:mobile run FAILED: exit 12, headless Chrome reported 13 WebGL shader errors and timed out measuring a fresh GLB after reload. Screenshot/session showed app's SVG fallback. This is a genuine observed QA failure and NOT attributed causally to the CSS patch without evidence.
- Exactly six processes explicitly tied to the failed run's unique bf-mobile-JcqSw3 test profile were closed, directory removed and read-back verified (owned-stock-chrome-cleanup.log). NO global Chrome kill or edits to Chrome security flags.
- One controlled, explicitly logged rerun of original npm run qa:mobile on the same CSS/JS returned PASS, exit 0, 86 checks, 0 BROWSER_ERROR and 0 BROWSER_EXCEPTION lines. Original QA runner hash was unchanged. Both logs retained; do NOT call the WebGL flake conclusively solved.
- A separate HMR-free qa:serve-stable server on 127.0.0.1:5281 served actual root UI HTTP 200. Production build and browser tests run on same source SHA snapshot; no live release.
- Git diff --check exit 0; source hashes for src/forge.css, App.tsx, neonPulseV2.css, screenNavigation.test.ts, qa/mobile-e2e.mjs and qa/appearance-e2e.mjs remained identical across unit/build/bundle and appearance. HEAD unchanged. Other contributors' uncommitted files were untouched.

## F / Audit inventory and exact checksums
Audit root: docs/audits/BF_CAMERA_HUD_20261110_ITER4.
MANIFEST_SHA256.txt: 68 evidence files; total 6,537,432 bytes; manifest 7,634 bytes SHA256 58a7f02358b03b0a2c6713bc1d62af62d07b04afc490ff5b5dfeeb2a99d9692c.
Logs include hud-baseline-red.log, hud-green.log, mobile-stock-final.log, mobile-stock-recheck.log, unit-final.log, build-final.log, bundle-final.log, camera-runtime-final.log, appearance-final.log. Forty-seven PNG screenshots including appearance and mobile QA. Exact path, size and SHA for every evidence file are in manifest. This receipt's size/SHA must be computed after its write, not invented.

## G / Status & nonclaims
HUD geometry regression and core app: IMPLEMENTED + TESTED_LOCAL with all final focused / unit / build / bundle / camera / appearance / mobile commands passing. Initial intermittent WebGL mobile E2E FAIL remains an OPEN QA risk, therefore full hardware/release readiness is NOT established.
NOT COMMITTED, NOT DEPLOYED, NOT VERIFIED_LIVE; no proof of in-vivo accuracy, GPU frame time, battery impact, HTTPS camera permission or physical phone UX. CSS does not modify processed raw camera video.
The locally opened VS Code project C:\github\BODYFORGE contains the change; it was not implemented in a separate clone. No claim that user's VS Code preview tab was refreshed automatically.

## H / Next reversible 15-minute step
Have a human squat in the frame on an actual mobile phone and check full-body legs/ankles visibility at 320–428 CSS px including landscape and large text. In parallel, isolate the intermittent headless Chrome WebGL shader / context error using exact-profile reproducibility; avoid changing GPU safety flags or touching another agent's files. Integrate the currently independent geometry test into the shared QA suite only when the concurrent qa/mobile-e2e ownership conflict is resolved, after fresh diff.

## Delta / D / Omega / Lambda
∆: Compact camera HUD is NOW applied locally and measured as RED→GREEN on four widths.
D: source/QA checksum gate → synthetic Chrome baseline FAIL → CSS-only patch → standalone Chrome geometry PASS → unit/build/bundle/camera/appearance PASS → stock Chrome transient WebGL FAIL → exact owned Chrome cleanup → stock recheck PASS → manifest/receipt.
Ω: high for local layout and narrow scoped rollback; limited for physical camera safety/accuracy; intermittent headless WebGL unknown.
Λ: reopen if current worktree hash drifts, any required test fails, or physical mobile shows obstructed feet.
