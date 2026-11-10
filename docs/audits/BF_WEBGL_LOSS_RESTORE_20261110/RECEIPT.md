# BODYFORGE / WebGL loss, fallback wording and Chrome observer QA
2026-11-10. Authorized Windows workspace: C:\github\BODYFORGE.
Git HEAD during test gate: e9762a215ec830be70922d138dfe13aa65c09cec. Post-QA observed HEAD: 733e18b5a9c33298b6c4ba9f8389423fb52f9412.
Lifecycle: IMPLEMENTED -> TESTED_LOCAL (scoped PASS) -> COMMITTED (observed post-QA, not executed by this session). Not deployed, not verified on physical hardware.

## A / Problem
The previous mobile E2E had one intermittent headless Chrome/WebGL shader failure after a genuine reload. The current Avatar3D.tsx already reacts to webglcontextlost by stopping the renderer and displaying an SVG fallback, but showed an overconfident message: "Устройство не поддерживает 3D" even when the same device simply lost its context. qa:avatar-observers also incorrectly treated a Windows Chrome launcher exiting 0 as a browser failure before opening the page.

## B / SIFT / Evidence
Code source: src/components/Avatar3D.tsx, currentRuntime.stopped and the webglcontextlost handler near lines 258-272, JSX fallback near line 476. Three.js WebGLRenderer and MDN webglcontextrestored specify the loss/restore boundary: a new context cannot assume its previous GPU resources survived.
Web sources: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextrestored_event and https://wikis.khronos.org/webgl/HandlingContextLost
Initially copied, checksum-gated an existing local WebGL reload probe into probe-baseline.mjs. On isolated stable server (http://127.0.0.1:5307), a disposable Chrome 390px profile with synthetic game progress passed normal GLB loading and two true new-document reloads, exit 0, without browser errors. Observed modelSource cc0, arms=1, outfit=ember and coins=95.
An independent controlled-loss script (probe-controlled-loss.mjs) used WEBGL_lose_context on #forge canvas after those steps; first completed run before the text edit returned PASS. It observed webglcontextlost, SVG fallback and exact byte-equal bodyforge:pilot:v1 storage, then restored GLB cc0 after a true Page.reload and kept game state. This does NOT prove restoration in the same document.
The first strict runtime attempt to assert the exact fallback text failed earlier at Runtime.evaluate timeout, before controlled loss, and leaked a disposable profile. That run is explicitly ENV FAIL, not a red assertion. Its seven Chrome processes were selected only by unique profile name, terminated, and profile deletion read back in owned-probe-cleanup.log.

## C / Decision and alternatives
Use a single more accurate fallback sentence that describes *current availability* rather than permanent device capabilities. Preserve the existing renderer lifecycle and privacy boundaries. Add a fast static copy test in the audit folder; it fails RED for the original false claim and passes GREEN for the new wording. No new dependency, MediaPipe change, animation, reward, localStorage migration, camera permission or shader alteration.
For the separate observed Chrome harness problem, read current qa/avatar-observers-e2e.mjs, confirm a clean HEAD-matching file, back it up and adapt only launcher readiness and scoped cleanup based on a successful independent copy. No alteration to Chrome security flags, shared user profiles or other agents' QA files.

## D / Changed
- src/components/Avatar3D.tsx: exactly one JSX fallback message changed to "3D сейчас недоступно — включён облегчённый персонаж". Original backup: Avatar3D-before.tsx, 41,088 bytes, SHA256 5097a85aeec3d1e73c33ae1a6dd82d6b8eeb39e9c3b7d5e02329c022b545db2e. Final source 41,071 bytes, SHA256 a3b525c5c84953d6a135352b1fbea121a6f0d6dd9487cb38c10282b6a20fdf44.
- qa/avatar-observers-e2e.mjs: DevToolsActivePort under its unique QA profile now proves readiness even if the launcher exits. finally closes the profile-owned browser through CDP Browser.close before retrying profile cleanup with bounded retries. Original backup avatar-observers-before.mjs 9,261 bytes SHA256 bc73c2d21e3248ff1038c3192866d816de71a37c17cfe89fd00735060025d977. Final QA runner 10,483 bytes SHA256 ef70a153a999d55c6b410a7563d76e258dac12e355f90a4c143091442204f27d.
- Separate executable audit files: fallback-message-check.mjs, probe-baseline.mjs, probe-controlled-loss.mjs and avatar-observers-isolated.mjs; none of these were added to application import graph or scripts.
- Exact rollback scope: scoped-fix.patch, 4,481 bytes SHA256 d9ef03af2b789ccfe863756cc952916f126b0ef640727001ce8faa54bdcc5b02, git apply --reverse --check PASS. To rollback, first reread exact current source hashes; reverse only that patch, not a global reset or another contributor's changes.

## E / Verification receipts
1. Text contract: node docs/audits/BF_WEBGL_LOSS_RESTORE_20261110/fallback-message-check.mjs -> before exit 1 with expected AssertionError, after exit 0 and FALLBACK_COPY_QA_PASS.
2. Browser controlled context loss: after patch exit 0, CONTROLLED_LOSS_FALLBACK fallback=true, eventObserved=true, savedBytesEqual=true, text is the new accurate message. CONTROLLED_LOSS_RECOVERY pass=true, model cc0, game arms=1, coins=95, outfit=ember, savedBytesEqual=true. Genuine new-document reload evidenced by performance.timeOrigin increase and CDP Page.loadEventFired.
3. npm run qa:avatar: exit 0, 23 assertions; event-driven draws, no idle RAF, lifecycle and listener cleanup confirmed.
4. npm run qa:avatar-observers original before fix: FAIL exit 19 before app opened with launcher exiting 0. The owned profile was cleaned explicitly; see owned-avatar-observers-cleanup.log. A copy with controlled harness repair passed 21/21. After patch, stock npm run qa:avatar-observers returned exit 0, AVATAR_OBSERVERS_PASS assertions=21, no leftover-profile warning.
5. npm run qa:athlete-glb: exit 0, efficient GLB QA PASS, 163 bones, 15 meshes, 23.2% optimized size reduction vs original GLB; no claim of device-frame performance.
6. Final npm test -- --maxWorkers=1 --no-file-parallelism: exit 0, 577/577 tests across 50 test files.
7. Final npm run build: exit 0.
8. Final npm run qa:bundle: exit 0, entry JS 393,787 bytes vs baseline 496,761, reduction 20.7% (gate at least 20% unchanged), MediaPipe camera chunk 154,276 bytes.
9. HMR-free localhost server http://127.0.0.1:5307/ returned HTTP 200 and root HTML; no claim that owner's VS Code browser tab refreshed automatically.
10. git diff --check exit 0. SHA256 of Avatar3D, qa:avatar-observers, App.tsx, forge.css and mobile-e2e matched before/after final test/build gate; no new HEAD drift while validating.

## F / Artifact and verification
Audit directory: C:\github\BODYFORGE\docs\audits\BF_WEBGL_LOSS_RESTORE_20261110
MANIFEST_SHA256.txt covers 36 non-empty evidence files, 170,363 bytes, no case-colliding paths, symlinks or detected common secret-key patterns. Manifest itself is 3,478 bytes SHA256 4ddfffb046bc150234305ec113768ea37cc9c51ba3991c00be58d3ab80b92b1f.
Logs include baseline.log; controlled-loss.log; message-baseline-red.log (ENV FAIL); copy-red.log; copy-green.log; controlled-loss-after-patch.log; avatar-lifecycle.log; avatar-observers.log (old FAIL); avatar-observers-copy.log; avatar-observers-stock-green.log; unit-after-runner.log; build-after-runner.log; bundle-after-runner.log; athlete-glb.log. The receipt's own size and SHA256 must be read back after writing.

## G / Status and nonclaims
SCOPED PASS: text is honest during WebGL fallback, and the current stock observer QA runner now launches/cleans its own headless Chrome. Local controlled-loss+full-reload recovery PASS. A headless WebGL shader failure from earlier work remains an independent, intermittent QA risk. NOT proven: automatic WebGL context restoration without page reload; accurate motion counting in vivo; physical mobile FPS/battery; live Firebase deployment; Git commit or push; native Android WebView quality; owner VS Code UI showing the latest localhost page.

## H / Next reversible 15-minute step
Review the isolated shader error from an owned Chrome profile against an actual Android WebView or Chrome device using explicit field QA, without changing GPU security flags. If WebGL fails on real devices, decide whether a constrained user-initiated 3D retry action is worth implementing, with strict no-double-dispose behavior and no interference with MediaPipe. Keep the current SVG fallback for unsupported devices.

## Post-QA Git read-back
After all scoped tests, HEAD advanced from e9762a2 to 733e18b through a separate process. Read-back shows both src/components/Avatar3D.tsx and qa/avatar-observers-e2e.mjs are now committed and their working hashes exactly match the tested snapshots. src/App.tsx, src/forge.css, and qa/mobile-e2e.mjs also match their final gate snapshots. This conversation did not invoke git commit, push or merge. RECEIPT.md itself remains untracked at the final read-back; its bytes and SHA256 are verified separately.

## Delta / D / Omega / Lambda
Delta: local fallback copy made accurate and stock observers QA repaired; verified safe context-loss fallback and reload.
D: code and archived logs -> isolated probe -> confirmed context loss and game bytes -> test RED/GREEN -> tiny JSX patch and CDP QA fix -> 577 unit, 23 avatar, 21 observers, GLB, build/bundle and read-back.
Omega: high for exact local browser experiments, lower for real device GPU behavior or intermittent headless shader causes.
Lambda: revisit on any physical phone failure, reoccurring WebGL context loss, source hash drift, or regression in avatar/observer tests.
