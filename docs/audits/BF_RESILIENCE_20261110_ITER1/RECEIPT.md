voice=ISKRA; phase=BUILD → VERIFY; intent=BODYFORGE / P0 resilience browser and storage failure paths

# BODYFORGE · P0 Resilience / controlled Chrome E2E · 2026-11-10
Workspace: `C:\github\BODYFORGE`.

**Verdict: IMPLEMENTED → TESTED_LOCAL / PASS for one QA-harness change.**
This is NOT a production-game feature, COMMIT, DEPLOYMENT, physical-device validation, or Firebase live verification.

## A / Problem
On the initially inspected working HEAD `d8e3859f1319601786067d2af066e3419bc87357`, `npm run qa:resilience` reached 61 passing assertions and then exited **12** in the missing-3D fallback case. The test asserted exactly five `.mobile-nav button` elements, while current `src/App.tsx` (lines 1237–1243) defines **six** with a separate “Настройки и FAQ” action. This is a confirmed stale QA expectation, not a proven broken 3D renderer.

The original test also used a fixed Chrome remote-debugging port `9742`, and `finally` only killed the Windows launcher. After the failing run, 16 Chrome processes in the **owned temporary profile** remained live. This is verified QA lifecycle debt; other browser processes were not targeted.

## B / Source evidence (SIFT)
- Executable code: `qa/resilience-e2e.mjs` and `src/App.tsx`; saving dependencies: `src/lib/progression.ts`, `src/lib/profileLock.ts`, `src/hooks/useProfileStorage.ts`.
- Original `qa/resilience-e2e.mjs` had no previous local edits: snapshot `resilience.before.mjs` **22394 bytes**, SHA256 `2dc5a3e27b8271b3738e67e4a9e608d26e32054e1c9e76dcd7d117c593fbbf55`. Input was copied and hash-confirmed **before** any edit.
- `resilience-before.log`: **61 PASS**, `BODYFORGE_RESILIENCE_E2E_FAIL`, `exit 12`; precise failing assertion: `missing 3D module cannot crash navigation`. No other failed product assertion.
- The current GDD is requirement scope, not executable code; the old GDD Git HEAD is historical.
- `SOT30_VERIFY_PASS`, 30 files, 4054425 bytes: canonical content verified; no live external memory/Guard services implied.
- Official browser sources checked: https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API (storage availability/QuotaExceededError), https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event (other-tab storage events), https://chromedevtools.github.io/devtools-protocol/tot/Browser/ (CDP Browser.close), https://chromedevtools.github.io/devtools-protocol/tot/Page/ (browser document lifecycle). These references do not substitute for local QA.

## C / Decision, smallest scope, rollback
**Changed exactly one tracked QA file:** `qa/resilience-e2e.mjs`. Supporting evidence exists only under `docs/audits/BF_RESILIENCE_20261110_ITER1/`. The final diff contains four hunks, **61 added / 6 removed**. The six-button expectation is stronger than changing 5→6: it checks all six actual labels and visible button geometry while the Avatar3D network request fails.

For safety, remote-debugging now uses port 0 and waits for `DevToolsActivePort` in the unique disposable `bf-resilience-*` profile. The test no longer binds a global fixed port and its cleanup sends `Browser.close` only to the verified loopback browser endpoint from that profile, then retries deletion of that *exact* temporary directory. Any cleanup error is reported as a nonzero exit. Existing Chrome flags, webcam permissions, gameplay code and storage key are unchanged.

**Rollback:** only after verifying the target matches the current SHA, restore `qa/resilience-e2e.mjs` from `resilience.before.mjs`; if another process edits this file meanwhile, compare and revert only investigator-owned diff hunks in `resilience.patch`. No `reset --hard`, `clean`, mass overwrite, or changes to foreign uncommitted files.

## D / Actions and lifecycle
1. Read live Git status, source, relevant QA and design docs; made immutable baseline copy; checked SoT.
2. Ran one isolated stable server `http://127.0.0.1:5335/` (HTTP 200) and observed failing test.
3. Confirmed current six navigation items in `src/App.tsx`, including Settings/FAQ. Modified the stale assertion.
4. Scoped cleanup of one `bf-resilience-K4OPOV` profile: a first CDP-only helper failed closed (fixed-port Chrome had no `DevToolsActivePort`); independently verified 16 exact `--user-data-dir` Chrome processes; the audited `close-scoped-resilience.ps1` stopped only those 16 and removed only that temporary directory. Verified zero remaining. No blanket process kill.
5. Replaced fixed QA port with Chrome-owned ephemeral port and added verified CDP/browser cleanup, then ran full postpatch E2E.
6. After E2E, another contributor independently committed the parallel UI/QA work as `e9762a215ec830be70922d138dfe13aa65c09cec`. No commit/push was performed by this investigator. Read-back hashes confirmed `resilience-e2e.mjs`, `App.tsx`, progression/lock/storage sources were byte-identical before, after and presently at E2E time. The new HEAD was then used for full unit/build/bundle.
7. Stopped only the owned stable QA server; kept previously existing preview server. Copied three synthetic test screenshots into this audit directory.

## E / QA results (honest gates)
| Gate | Observed result | Status |
| --- | --- | --- |
| Before patch `npm run qa:resilience` on 5335 | 61 PASS, exit 12 at obsolete five-button assertion | **RED** |
| Target syntax `node --check` | Exit 0 | PASS |
| Browser `npm run qa:resilience` after patch | **63/63 assertions PASS, exit 0**, temporary Chrome profile removed | PASS (synthetic) |
| Damaged backup/recovery/quarantine | Original remains until confirmed, backup restored, fresh-start requires extra confirmation | PASS in browser |
| Storage quota/permissions, daily reward A→B→A, 65 credited identities | No silent data loss/duplicate payment, old identity survives history rotation | PASS in browser |
| Frozen camera, permission denied, delayed stream/zoom, pagehide | No fake repetitions/XP, tracks released and cancelled requests cannot revive camera | PASS in synthetic browser |
| MediaPipe model failure and 3D module blocked | Camera track released; navigation remains visible and correctly labelled; 360px fallback fits screen | PASS in synthetic browser |
| `npm test -- --maxWorkers=1 --no-file-parallelism` on new HEAD | **577/577**, 50 test files, exit 0 | PASS |
| `npm run build` | Exit 0; 3D lazy chunk **651.08 kB** warning >500 kB remains | PASS |
| `npm run qa:bundle` | Exit 0: entry **393787** bytes, baseline **496761**, reduction **20.7%**. MediaPipe **154276** bytes in separate on-demand chunk | PASS |
| `git diff --check` | Exit 0 | PASS |
| Production preview `http://127.0.0.1:5293/` | HTML HTTP 200, React `id="root"` present, entry JS HTTP 200 / 393787 bytes | PASS, HTTP smoke only |
| Final E2E source SHA, final build source SHA and HEAD | No content drift in measured paths across each gate; final HEAD `e9762a215ec830be70922d138dfe13aa65c09cec` | PASS |
| Owned Chrome cleanup after postpatch E2E | **0** `bf-resilience-*` Chrome processes and **0** temporary profile directories | PASS |
| Android/iOS physical camera, field TP/FP/FN, FPS, battery, HTTPS live, Firebase | Not run | NOT VERIFIED |

Screenshots produced by the synthetic E2E and copied to `screenshots/`: `bf-audit-recovery.png`, `bf-audit-frozen-camera.png`, `bf-audit-3d-fallback.png`. They were file/hash checked, but **not independently visually reviewed**. No real camera video was recorded.

## F / Artifact receipts, bytes and SHA256
Audit folder: `C:\github\BODYFORGE\docs\audits\BF_RESILIENCE_20261110_ITER1\`.
- Modified QA source `qa/resilience-e2e.mjs`: **25705 bytes**, SHA256 `2c5697f9ab6b7db0406fd5f86eca0d8dc3e276b0cd6f7a2c02fa506c76710639`.
- Original `resilience.before.mjs`: **22394 bytes**, SHA256 `2dc5a3e27b8271b3738e67e4a9e608d26e32054e1c9e76dcd7d117c593fbbf55`.
- Minimal source diff `resilience.patch`: **6787 bytes**, SHA256 `5b49c38f0ef0dd12e35a7cf4b7875d7ab2dfb235485d063969e5dc4b587f9e5a`.
- `resilience-before.log`: 4017 bytes, SHA256 `d7dde30343954d4353261248d636574949f685b697a0c6c13ca99257020c0182`.
- `resilience-after.log`: 3715 bytes, SHA256 `a9f2f39744e1d4ebd51fc85eb0568b1db1702240a302c37bfe67d6b0cf3c81e6`.
- `unit-final.log`: 6707 bytes, SHA256 `19e75207b9e06b72aaa9b7e5e7882dc7a3432e398b6e3069a570e68b6c98b6cb`.
- `build-final.log`: 2220 bytes, SHA256 `cdfd62b1c81ae436a4bdade51020e0760600cbf705e128e65e107232a5e2eff6`.
- `bundle-final.log`: 366 bytes, SHA256 `93d5d81c0e22d5174df13ddf29527f51ee7633cb92637682dc04424b5f9090f3`.
- `preview-smoke.log`: 99 bytes, SHA256 `69777188907ef2f15650b9090db5a489f9211f44cfcc68eb55f6514420eb8ece`.
- `screenshots/bf-audit-recovery.png`: 50430 bytes, SHA256 `f6ce13be97391724b1864df5bfaeb505ac070073985567f613e08110d6a6ba5f`.
- `screenshots/bf-audit-frozen-camera.png`: 76887 bytes, SHA256 `31e33ebeb518d77b93275fbfb353cfff3983c256da177f09356d3fbfc33990f9`.
- `screenshots/bf-audit-3d-fallback.png`: 185339 bytes, SHA256 `064b679f265b4b5914836b948c8ae947160a9f32c18326dc88316c377383a870`.
- `MANIFEST_SHA256.txt`: **25 evidence files** checked by read-back, 0 missing/invalid; 2477 bytes; SHA256 `740999c946e4d85e5c2f5215c1b3a97a34c3e8c6f8804c306d9b4f3944f4cbde`. Manifest excludes itself and the final receipt. An initial attempt to build the manifest was rejected because Windows PowerShell lacks `[IO.Path]::GetRelativePath`; `make-manifest.ps1` regenerates/validates the corrected manifest.
- All user-profile paths appearing in test logs were replaced with `<USERPROFILE>` before final manifest calculation. Screenshots use synthetic fixture player “QA ONLY”.

## G / Lifecycle and nonclaims
**IMPLEMENTED → TESTED_LOCAL / PASS** for QA harness changes only; not a new end-user workout feature.
**COMMITTED by this investigator: NO; DEPLOYED: NO; VERIFIED_LIVE: NO.**
The new HEAD was created by a separate process during this investigation. User work and its git history were preserved. No Firebase, secrets, camera recordings, storage schema migrations, permissions, cloud accounts, synthetic popularity or false health data.

## H / Next reversible ≤15-minute action
On a stable source SHA, verify `qa:camera-runtime` isolated on its own loopback origin and disposable Chrome profile. If CDP initialization or camera cancellation fails, reproduce first and apply only a bounded QA fix; require focused E2E + unit/build/bundle/preview before moving on. Separately schedule real-device Android camera/manual counting QA before release; this cannot be replaced by synthetic pose fixtures.

## ∆DΩΛ
∆ — corrected one stale UI assertion and hardened resilience QA's owned-browser lifecycle without modifying production gameplay.
D — HEAD/status/source read → 61 PASS + exit 12 RED → exact scoped Chrome cleanup → minimal QA patch → 63/63 E2E → source-hash comparison across parallel HEAD change → 577/577 unit + build/bundle/preview PASS → SHA screenshot/manifest receipts.
Ω — high for logged local browser/unit/build observations and byte integrity; not enough evidence for field camera accuracy or live deployment.
Λ — revise if any source SHA changes, Chrome/Vite/CDP behavior drifts, or physical-phone evidence contradicts this synthetic PASS.
