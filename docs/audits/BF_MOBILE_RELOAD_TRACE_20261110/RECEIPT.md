# BODYFORGE / full mobile CDP trace 2026-11-10
HEAD at verification: d8e3859f1319601786067d2af066e3419bc87357
Worktree: CONCURRENT_MODIFICATIONS_PRESENT (not a frozen release commit).

## Scope and changed files
Only this audit's mobile-e2e.trace.mjs was authored from a snapshot of qa/mobile-e2e.mjs then instrumented.
Original qa/mobile-e2e.mjs NOT edited by this iteration, but changed concurrently in the shared worktree.
No app source, save format, camera config, Firebase, privacy permission, canon, or release state changed by this iteration.

## Root problem
Prior full qa:mobile had TIMEOUT new document load at reloadApp, and earlier WebGL failure after reload.
Current Chrome DevTools official protocol distinguishes Page.reload response from Page.frameNavigated and Page.loadEventFired.
Reference: https://chromedevtools.github.io/devtools-protocol/tot/Page/

## Trace probe
Instrumented existing reloadApp without relaxing any existing assertions.
Emits reload-start, reload-command-ack, reload-load-event, reload-hydrated.
On a timeout only, obtains bounded Page.getFrameTree and Runtime.evaluate(document readyState/timeOrigin/hasNav).
No personal browser profile was read. Both runs used fresh disposable QA Chrome profiles.
Trace observed: after daily reward, Page.loadEventFired and app hydration; after purchase, Page.loadEventFired and app hydration; both progressed.

## Verification receipts
node --check docs/audits/BF_MOBILE_RELOAD_TRACE_20261110/mobile-e2e.trace.mjs: PASS exit 0.
Full diagnostic copy on origin http://127.0.0.1:52871: BODYFORGE_MOBILE_E2E_PASS, TRACE_EXIT=0.
Official npm run qa:mobile on same preview: BODYFORGE_MOBILE_E2E_PASS, OFFICIAL_MOBILE_EXIT=0.
npm test -- --maxWorkers=1 --no-file-parallelism: PASS, 577/577 across 50 files, exit 0.
npm run build: PASS exit 0.
npm run qa:bundle: PASS exit 0, entry 393787 B, baseline 496761 B, reduction 20.7%.
git diff --check: PASS exit 0 with line ending warnings.
Preview: http://127.0.0.1:52871/ HTTP 200.
Diagnostic screenshots: 10 PNG.
Official run screenshots: 10 PNG.

## Artifact evidence
Trace script: docs/audits/BF_MOBILE_RELOAD_TRACE_20261110/mobile-e2e.trace.mjs
Trace bytes: 40989
Trace SHA256: E4E8AFE49724C8CA2EABB3936ECDAC62C70BCB10C3583B8D593CAA7CEFD3A4D3
Original qa/mobile-e2e.mjs SHA256 at receipt: BE9BEE1912C556DD7B12153D9EA91B3A90F6EF777C4DAB0EA2AFCF9ECB526B2B
Rollback scope: delete this audit's trace script/receipt/screenshots only (do not touch concurrent work).

## Nonclaims
Prior intermittent FAIL is NOT root-caused, not proven permanently fixed.
No physical Android field validation, on-device GPU FPS, camera pose accuracy, production Firebase validation or deployment.
These runs on an unfrozen working tree are TESTED_LOCAL, not release certified.