voice=ISKRA; phase=BUILD → VERIFY; intent=BODYFORGE / isolated appearance Chrome QA

# BODYFORGE · Windows appearance/CDP · investigation / targeted rollback
Date: 2026-11-10. Workspace: `C:\github\BODYFORGE`. Branch: `main`.
**Result: BLOCKED / OWN_PATCH_ROLLED_BACK.** No accepted app or QA change from this iteration; docs/audits evidence is durable. No commit, push, merge, reset, Firebase deploy or live verification.

## A / Problem
Current `qa:appearance` aborted before mounting the app with `Owned Chrome exited 0` (exit 18). A similar fault was documented in the previous handoff. Goal: make one owned Chrome disposable-profile E2E reliable, while preserving other agents' work and retaining all UI assertions.

## B / Evidence
- Fresh HEAD: `ad0c23b86f9d1776807882c2fc7a8a43639573ce` (not the 10.11 GDD's older `bfecc83f`).
- At intake `qa/appearance-e2e.mjs` was **already modified by another contributor** (navigation and camera selectors); original file preserved at `appearance.before.mjs`, 52940 bytes, SHA256 `ce357d8619b1d686090717262668b11c3892dc9b7725fb5bb42bd069339ba92b`.
- Prepatch `qa:appearance`, origin `http://127.0.0.1:5216/`: **exit 18**, `Owned Chrome exited 0`, 0 PASS assertions. File: `appearance.red.log`.
- Fresh prepatch baseline: unit **573/573** (49 test files), build exit 0, `qa:bundle` exit 0; entry 394517 bytes from baseline 496761, **20.6%** reduction; MediaPipe split chunk 154276 bytes.
- Chrome official note (2025-03-17): non-default `--user-data-dir` required for remote debugging in normal Chrome 136+. BODYFORGE already uses a disposable profile; flags and permission scope were not relaxed: https://developer.chrome.com/blog/remote-debugging-port .
- Vite `preview` serves compiled `dist` only; HTTP 200 and #root verified at `http://127.0.0.1:5215/`. Docs: https://vite.dev/guide/cli .

## C / Decision
Temporarily tested **only** `qa/appearance-e2e.mjs`:
1. Trust the unique profile's `DevToolsActivePort` instead of treating an exited Windows launcher as a fatal browser exit.
2. Attempt browser-level `Browser.close` via that same owned CDP port, then bounded temporary-profile cleanup.
3. Diagnose graphics and bring the test tab to foreground (CDP `Page.bringToFront`), without changing WebGL assertions or security options.
4. Wait up to 500 ms for computed theme values, keeping the same exact token and contrast requirements.
The last three are QA-harness changes, not product changes. Rejected: modifying camera/3D/rewards, silencing assertions, weakening Chrome flags, terminating unknown Chrome sessions, or editing concurrent UI files.

## D / Changed and rollback
- Test candidate snapshot: `appearance.candidate.mjs`, 55758 bytes, SHA256 `fd0fb6d7fb5d69243853f56223382707615d024af4fedd66c4dec728ba7cd2a1`. Contains all pre-existing contributor modifications, plus our bounded attempted hunks. Exact before→candidate diff: `appearance.attempt.patch`, 6040 bytes, SHA256 `c01d285d97614a8a269fcfeec84c50cb24654d59b427e463ab7a58592607e5b1` (4 diff hunks; not meant for blind application).
- Browser and server outcomes did NOT meet the full-iteration acceptance contract. Rolled back only the investigator's hunks via exact block substitutions. **Read-back SHA256 of current `qa/appearance-e2e.mjs` equals the prepatch hash exactly**: `ce357d8619b1d686090717262668b11c3892dc9b7725fb5bb42bd069339ba92b`. Foreign navigation edits retained. Syntax and `git diff --check` exit 0.
- Only other investigator-created files are this evidence directory. Game wallet, `bodyforge:pilot:v1`, camera permission semantics, GLB, styling and existing user profiles were not edited.

## E / QA — separated, all attempts recorded
| Gate / evidence | Exit and observation | Verdict |
|---|---|---|
| Before patch `appearance.red.log` | 18, Chrome launcher false negative, 0 PASS | FAIL |
| Candidate `appearance.green-attempt.log` | 18, reached app, 2 PASS, economy framebuffer timeout | FAIL |
| Candidate `graphics-diagnostic.log` | 0, **16 PASS**, real same WebGL canvas reduced 516×436 → 344×291 at emulated DPR 3; profile bytes preserved | PASS (synthetic only) |
| Candidate `appearance.full-2.log` | 18, fresh page timeout after owned QA stable server died (server exit 1, ~316 sec lifetime) | FAIL / environment |
| Candidate `appearance.full-3.log` | 18, **250 PASS** then computed pseudo-element background in Violet stayed mint: actual rgb(101,234,208), expected rgb(188,165,255) | FAIL (visual QA) |
| Candidate `appearance.full-4.log` | 134, Node fatal `JavaScript heap out of memory` before E2E assertions | BLOCKED |
| Source rollback `node --check` and `git diff --check` | exit 0 each; SHA exact match to baseline | PASS |
| After rollback `unit-after-rollback.log` | **575/575**, 49 test files, exit 0 | PASS |
| After rollback `build-after-rollback.log` | TypeScript + Vite, exit 0; >500 KB 3D lazy chunk warning remains | PASS |
| After rollback `bundle-after-rollback.log` | exit 0, entry 394517 / baseline 496761 = **20.6%** reduction | PASS |
| Current preview `preview-smoke.log` | HTTP 200, contains `id="root"`; not an in-device UI interaction | PASS limited |

The 573→575 unit-count change occurred concurrently in other contributors' test files; not attributed to this patch. Three synthetic 390px screenshots were saved: `integration-mint-daily-plan.png`, `integration-mint-manual-steps.png`, `integration-mint-catalog-guide.png`. Their creation is confirmed; visual review/full 320–428 matrix was NOT completed. No physical phone, camera accuracy, pose TP/FP/FN, real FPS or battery evidence.

## F / Browser cleanup and boundaries
- Observed at failure: 8274 MB free physical RAM, only 817 MB free virtual memory, 151 Chrome processes (24 under `bf-appearance-*`). **Possible system commit-pressure explanation**, not a proven cause of every Chrome timeout.
- Cleared 3/4 own identified temporary profiles through their unique CDP endpoint or safe filesystem cleanup. The fourth (`bf-appearance-mOmnSW`, belonging to our own failed full test) could not respond on CDP; verified and terminated ONLY its exact six owned Chrome processes (parent exit also closed children), then verified zero remaining and removed its temporary directory. Other QA Chrome profiles, personal browser and user servers were not terminated.
- No access to personal Chrome tabs, secrets, camera recordings, clinical information or remote Firebase was used. Logs stored here were redacted of the Windows personal-user directory when present.
- The local stable QA server on 5217 was our own and was stopped; the separate 5215 preview was not deliberately stopped. An HTTP 200 alone is not proof of a current React mount.

## G / Artifact receipts
Working folder: `C:\github\BODYFORGE\docs\audits\BF_APPEARANCE_CDP_20261110_ITER2\`.

Representative immutable evidence after redaction:
- `appearance.red.log`: 436 bytes; SHA256 `0ad135e138a594ab57d5a6f47b6d5402b81770db16df08fd930af93ff34870d5`
- `graphics-diagnostic.log`: 1353 bytes; SHA256 `148882ffc09f871602eeb81f0636bcc2de50b6ed9d73826ea20bf5ef5b71b6b4`
- `appearance.full-3.log`: 38826 bytes; SHA256 `3d99b363395ec2c7a84c998d319b212ff50126debd399ae1d5cb04f8df4e83a3`
- `appearance.full-4.log`: 802 bytes; SHA256 `c0767616702cdbd6a27bc090557462ddf4cd7a0c467302e0bc3cf6a64019eafd`
- `unit-after-rollback.log`: 6848 bytes; SHA256 `43de657bbbec7e332fdccb79961c2fc65ddbd2338e39872285af3f14269e370d`
- `build-after-rollback.log`: 2378 bytes; SHA256 `f11bf99f5390a77148ce49d385fac6d3dbbb1609ec15b7c75646462080271e52`
- `bundle-after-rollback.log`: 414 bytes; SHA256 `faea3ffc6e48f12ea895b7a8467f827d9d5a19059ef0833098eab9b8af689a61`
- `preview-smoke.log`: 37 bytes; SHA256 `447d169600b9dfcce092db865be49fcffc8badda5691c282`
- `integration-mint-daily-plan.png`: 79772 bytes; SHA256 `918892fec012d38aeb45c089fe4fe7ca6d311e6ef50f965769f32f784603b52a`
- `integration-mint-manual-steps.png`: 87994 bytes; SHA256 `8292ad20689711d8af05bb148a4ba04b456f6e598b423726422e38f2235e6559`
- `integration-mint-catalog-guide.png`: 85662 bytes; SHA256 `5ef6f7a9b717c2e9d986714a595a6ad382ddc5f2d5f5be57695d9b9f8493deec`

The receipt is verified and its hash reported externally (not self-embedded).

## H / Status and next reversible action
**Audit evidence: CREATED / READ-BACK pending final checksum.** QA candidate: IMPLEMENTED-TEMP → FAILED → ROLLED_BACK; gameplay files unchanged by this investigator. Current repository: TESTED_LOCAL for unit/build/bundle after rollback, **not** full appearance E2E. COMMITTED by investigator: NO. DEPLOYED / VERIFIED_LIVE: NO.

Next ≤15 minutes: once the other contributors' uncommitted source work is stable and Chrome session/resource pressure is reduced, run one fresh isolated `qa:appearance` on a fixed input SHA and private loopback server. Reproduce/measure Violet pseudo-element token mismatch without weakening exact color/contrast checks; verify that owned Chrome fully closes. Only then re-apply a minimal Chrome readiness helper and require full E2E + unit/build/bundle PASS before accepting it.

## ∆DΩΛ
∆ — separated a reproducible Chrome launcher false negative from an independent CSS computed-color mismatch and a system-resource failure.
D — current Windows source reads, RED → bounded QA candidate → synthetic graphics PASS / full E2E FAIL, scoped process cleanup, exact SHA rollback, unit/build/bundle PASS, receipt with hashes.
Ω — high for local logged exits, SHA equality and constrained cleanup; insufficient for a commercial mobile-release claim.
Λ — reopen after stable browser environment, completed full appearance/CDP run, and independent Android field QA.
