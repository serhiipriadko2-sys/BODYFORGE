voice=ISKRA; phase=BUILD → VERIFY; intent=BODYFORGE / P0 multitab persistence

# BODYFORGE · P0 Multi-tab/Web Locks QA · 2026-11-10
Workspace: `C:\github\BODYFORGE`. HEAD at start / final: `d8e3859f1319601786067d2af066e3419bc87357`.
**Result: IMPLEMENTED → TESTED_LOCAL / PASS for the narrow QA-harness fix.**
**NOT COMMITTED / NOT DEPLOYED / NOT VERIFIED_LIVE.** Game economics, storage schema, privacy permissions, camera, GLB, and user profile data were not edited by this investigation.

## A / Problem
The unmodified `npm run qa:multitab` on a fresh non-HMR local origin `http://127.0.0.1:5321/` failed before assertions with `Owned Chrome exited 0` (exit 16, 0 assertions). On Windows the launcher can exit after handing control to an existing Chrome browser process in the same disposable profile. A premature launcher-exit check falsely marks the browser as failed and can leak temporary Chrome processes.

## B / SIFT, evidence and sources
[FACT] `qa/multitab-e2e.mjs` was clean relative to Git at intake: 26257 bytes; SHA256 `98bf80892ecdcddf8c4f7e3077ce1b37db7edf21eaea1f5f225190e958d2a24f`. Exact copy: `multitab.before.mjs`.
[FACT] Test opens two real Chrome page targets, imports the product `src/lib/progression.ts` and `src/lib/profileLock.ts` on the same loopback origin, and later mounts two actual React app pages. The user-local `bodyforge:pilot:v1` storage on their usual browser is not used.
[FACT] `SOT30_VERIFY_PASS`: 30 canonical files / 4054425 bytes, `canon-check.log`; this verifies bytes, not a live memory/Guard executor.
Official references (accessed for research): W3C Web Locks Working Draft (2026-11-09), https://www.w3.org/TR/web-locks/ ; MDN https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API ; Chrome custom user-data-dir requirement https://developer.chrome.com/blog/remote-debugging-port ; CDP Browser domain https://chromedevtools.github.io/devtools-protocol/tot/Browser/ .
The project already supplies its own disposable non-default Chrome profile: no debugging/security flags were weakened.

## C / Decision, scope, rollback
Exactly one tracked code file: `qa/multitab-e2e.mjs`; evidence only in `docs/audits/BF_MULTITAB_20261110_ITER1/`. Two diff hunks, **48 lines added / 5 removed**. No changes to `src/lib/profileLock.ts`, `src/App.tsx`, tests' lock safety assertions, wallet values, camera, Git or live hosting.
Alternative rejected: mass Chrome termination, silent broad retry, changing Web Locks behavior or weakening expected results. Rollback: if current target SHA matches the hash below and nobody else has edited it, restore **only** `qa/multitab-e2e.mjs` from `multitab.before.mjs`. For a changed target, compare `multitab.patch` and revert only the owned hunks. Never use `git reset --hard` or overwrite parallel work.

## D / Changed
1. CDP startup: wait up to 15 seconds for a valid `DevToolsActivePort` in the unique temporary profile. A launcher exit code 0 is not interpreted as browser failure; nonzero launch failure still aborts.
2. Cleanup: close browser via `Browser.close` on `ws://127.0.0.1:<owned-port>/devtools/browser/*`, only after checking `/json/version` and the profile-derived loopback port; then bounded temporary-profile deletion, with nonzero result if cleanup is blocked. No personal Chrome process terminated.
3. One unintentional trailing space detected by `git diff --check` was removed before the final test/rebuild. No test assertion, reward rule or security threshold was relaxed.

## E / QA, including failures
| Gate | Observed | Status |
| --- | --- | --- |
| Prepatch `npm run qa:multitab` | `multitab-before.log`: exit 16, `Owned Chrome exited 0`, 0 assertions | FAIL (reproduced) |
| Initial owned-profile cleanup | `close-owned-multitab.mjs`, `owned-cleanup.log`: exit 0, 0 remaining processes and 0 remaining profile directories for `bf-multitab-ub3hJL` | PASS |
| First browser E2E after patch | `multitab-after1.log`: **31/31** PASS, exit 0 | PASS |
| Initial unit command `npm test -- --maxWorkers=1 --no-file-parallelism` | `unit-after.log`: exit 1; 260 test assertions PASS; 17 file workers fail to start: Windows `spawn UNKNOWN` (not an assertion failure). OS virtual memory was constrained | FAIL / environment |
| Same exact unit command after stopping only our QA server | `unit-retry-after-server-stop.log`: **577/577** PASS, 50 files, exit 0; no change to Vitest flags, isolation, expected assertions or user processes | PASS |
| Initial build/bundle | `build-after.log`, `bundle-after.log`: exit 0 each. Initial diff-check found an owned trailing whitespace and was FAIL | PASS / diff repaired |
| Final browser E2E after whitespace-only fix | `multitab-final.log`: **31/31** PASS, exit 0 | PASS |
| Final unit after stopping only own QA server | `unit-final.log`: **577/577** PASS, 50 files, exit 0 | PASS |
| Final production `npm run build` | `build-final.log`: exit 0; lazy 3D chunk >500 KB warning remains | PASS |
| Final `npm run qa:bundle` | `bundle-final.log`: exit 0; entry 393787 bytes / 120116 gzip, baseline 496761, **20.7% smaller**; independent MediaPipe chunk 154276 bytes | PASS |
| Final syntax and `git diff --check` | exit 0 each | PASS |
| Production preview HTTP/asset smoke | `http://127.0.0.1:5293/`: HTML HTTP 200, `id="root"` present; entry JS HTTP 200, 393787 bytes | PASS (HTTP only) |
| Physical Android/iOS, field pose accuracy/FPS/battery, true multiplayer, Firebase live | not run | NOT VERIFIED |

**Cross-tab invariants measured via Chrome:** one held exclusive Web Lock / one queued; first writer stores 110 fixture coins, second stale writer receives `conflict`, backup remains original 100; `AbortController` cancel leaves bytes unchanged; closing a holder unblocks a queued peer; closed or reloaded page cancels obsolete writes; real `storage` event marks stale UI and offers explicit reload; pending write prevents coin spend; after success muscle upgrade to level 1 survives reload; damage recovery is quarantined and waits for the live lock; missing Web Locks refuses writes.
No fake user ratings, medical measurements, actual camera accuracy or live sync claimed. Loopback React E2E is not real-device proof.

## F / Receipt and integrity
Evidence directory: `C:\github\BODYFORGE\docs\audits\BF_MULTITAB_20261110_ITER1\`.
- Current `qa/multitab-e2e.mjs`: **28761 bytes**, SHA256 `5eaf53a583a87da1df0d1b1ebcd8600f74535b8e434f676583e3fc93c604c9ca`.
- Original `multitab.before.mjs`: **26257 bytes**, SHA256 `98bf80892ecdcddf8c4f7e3077ce1b37db7edf21eaea1f5f225190e958d2a24f`.
- Diff `multitab.patch`: **4163 bytes**, SHA256 `07a072c7382930d9197d9a93acfaeff052d0fb65092cce862ccf976911fbea33`, 2 hunks.
- `multitab-final.log`: **4135 bytes**, SHA256 `3aad91668bfc1b0e13a3f8708fe462324f24f76e9bab735c4f466897af9cbebe`.
- `unit-final.log`: **6704 bytes**, SHA256 `c4fbb8cc090df6d42f126e4bd4eed91d5150234e3693e971aeb4810028d20b16`.
- `build-final.log`: **2220 bytes**, SHA256 `315fa88b6d320618cb93074e24cacedf8e6f8dcd23b1cda0dd9999e604862877`.
- `bundle-final.log`: **366 bytes**, SHA256 `c0131214bc64be18defcd90060ccb6512ae5b56d6b5645709a2f76b60d787db1`.
- `preview-smoke.log`: **99 bytes**, SHA256 `f82c9b5700390d3496e1fe668a1dc119d2f80587b5b6fbc8afa6f609df884b6d`.
- `MANIFEST_SHA256.txt`: 31 evidence files, 2992 bytes, SHA256 `ba8d06f041647bbea963af3b0d459cf780f9b7acffe0375c7d1831bb26a44b0a`. The manifest excludes itself and this receipt; all item bytes/hash are verified separately.
- Source hashes for QA and critical save code/React/CSS remained stable during both final E2E and unit/build/bundle; HEAD unchanged. Old temp paths in logs have been redacted. After browser QA: **0 `bf-multitab-*` Chrome processes and temporary-profile directories**.
- The QA servers 5321 and 5322 were started and stopped by this investigator. Existing preview on 5293 left available for the owner. No screenshot, because patch and test concern two-tab storage logic, not visual styling.

## G / Lifecycle & nonclaims
**IMPLEMENTED + TESTED_LOCAL:** QA runner only; initial FAIL addressed and postpatch 31/31 and 577/577 obtained on stable source. **COMMITTED: NO / DEPLOYED: NO / VERIFIED_LIVE: NO.**
Parallel uncommitted UI, camera and appearance code was neither overwritten nor reset. Security boundary unchanged. Production preview HTTP does not assert physical phone interaction. No claim of PvP, Web Locks across different origins/devices, or actual cross-device sync.

## H / Next reversible ≤15-minute action
On a fixed source SHA, run a single `qa:resilience` test in its own temporary Chrome profile, looking for new storage/camera regressions with exact error reproduction before modifying any code. Keep P0 savings/data safety ahead of graphics polish. No production deployment without mobile field QA.

## ∆DΩΛ
∆: isolated Windows Chrome launcher false negative and prevented disposable profile leaks; cross-tab reward and persistence safety locally verified.
D: live working-tree inspection → red E2E → scoped CDP wait/cleanup patch → 31/31 E2E → recorded unit worker-spawn failure → stopped only owned QA server → 577/577 unit → whitespace fix → final 31/31 E2E + 577/577 unit + build/bundle/preview → source/hash receipt.
Ω: high for reproducible local browser tests, file hashes and observed exit codes; unknown for real phone, long-run browser stability and Firebase.
Λ: reconsider if Chrome/CDP, useProfileStorage, profileLock, navigation or system resources change, or field QA contradicts this result.
