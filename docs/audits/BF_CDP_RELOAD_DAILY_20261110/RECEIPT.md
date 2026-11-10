# BODYFORGE / CDP reload after daily reward - evidence receipt
Date: 2026-11-10
HEAD: d8e3859f1319601786067d2af066e3419bc87357
Scope: diagnostic-only update to docs/audits/BF_WEBGL_RELOAD_PROBE_20261110.mjs.
Rollback backup: docs/audits/BF_CDP_RELOAD_DAILY_20261110/probe.before.mjs.txt.
No App, Avatar3D, game economy, profile schema, external services or official qa/mobile source edited by this iteration.

## Problem / observed failure
Full npm run qa:mobile (fresh build on new HEAD): FAIL exit 12 at qa/mobile-e2e.mjs:66
TIMEOUT new document load immediately after first daily reward and isolated-profile wallet top-up.
7 PNG screenshots captured in docs/audits/BF_MOBILE_NEWHEAD_20261110.
Test browser cleanup also reported QA_CHROME_CLOSE_UNCONFIRMED and EPERM, not counted as app behavior.
Earlier full mobile test on older HEAD failed at a different checkpoint (GLB after full reload).
No evidence yet that the full mobile test's failure is caused by an app defect.

## Diagnostic change
Record Page.loadEventFired, Page.frameNavigated, performance.timeOrigin, document.readyState, DOM hydration.
Optional flags BF_PROBE_PROFILE=1 BF_PROBE_DAILY=1 follow:
onboarding -> camera -> daily reward once -> top-up in disposable test profile only -> full reload
-> arm upgrade + ember outfit -> full reload -> WebGL/GLB and saved wallet readback.
Fixed probe's own early-success assertion: an absent 3D status element must NOT count as a completed GLB load.
Official qa/mobile-e2e.mjs untouched.

## Verified observations
Focused isolated test after final correction: 2/2 independent runs PASS exit 0.
Both reloads in each run had Page.frameNavigated + Page.loadEventFired and a strictly newer document timeOrigin.
Each run ended with outfit=ember, arms=1, coins=95, GLB source=cc0, 3D active.
Both runs logged no webglcontextlost and no browser console errors.
First diagnostic attempt failed due to its own missing-element guard (false negative), which was then corrected.
Command: BF_PROBE_PROFILE=1 BF_PROBE_DAILY=1 BODYFORGE_QA_ORIGIN=http://127.0.0.1:52871 node docs/audits/BF_WEBGL_RELOAD_PROBE_20261110.mjs

## Gates
node --check: PASS, exit 0.
npm test -- --maxWorkers=1 --no-file-parallelism: PASS, 575/575, 49/49 files, exit 0.
npm run build: PASS exit 0.
npm run qa:bundle: PASS exit 0, entry 392200 B, reduction 21 percent at final check.
git diff --check: PASS exit 0, LF/CRLF warnings only.
Preview http://127.0.0.1:52871/: HTTP 200 with React root.
Important: other agents changed App/ForgeQuickDeck and QA files while tests were running.
This is a moving working tree; do not call these test gates a frozen-commit release receipt.

## Artifact
Edited probe: docs/audits/BF_WEBGL_RELOAD_PROBE_20261110.mjs
Bytes: 11643
SHA256: 15A8453E7018302D3DADD559E66575B2734BDB56F2851E71D9BA8F883308E38E
Baseline backup SHA256: 3D718874EF641C5A530A80E836B153659F647A4BB8018437C215A3BB22301E43
Screenshots: 7 PNG from failing full qa:mobile.

## Limit / decision
Diagnostic QA is TESTED_LOCAL (PASS); full qa:mobile still FAIL/BLOCKED.
Do not replace app code or suppress the main mobile load event gate without evidence.
Next: instrument a separate copy of the full mobile QA to distinguish Page.loadEventFired absence from a hung render/UI thread.
No mobile field validation, FPS claims, accuracy claims, commit, push, deployment or persistence.
Sources: https://chromedevtools.github.io/devtools-protocol/tot/Runtime/
https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event