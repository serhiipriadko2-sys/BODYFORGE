# BODYFORGE — Appearance/CDP QA investigation and targeted rollback

Date: 2026-11-10. Surface: Remote Desktop Commander / DESKTOP-ITUAMNF. Workspace: C:\github\BODYFORGE.
Outcome: **BLOCKED / OWN_PATCH_ROLLED_BACK**. No production source change by this investigation. No commit, push, deploy or live verification.

## A / Problem
The isolated Chrome appearance QA could not reach the application: `npm run qa:appearance` returned exit 18 with `Owned Chrome exited 0` before a CDP session. The existing launcher-exit guard was present in the initially unmodified `qa/appearance-e2e.mjs`.

## B / Evidence
Initial observed HEAD: `7144fc4c20d813979c82a9bd980f4b274c24af67`; concurrent contributor later moved HEAD to `ad0c23b86f9d1776807882c2fc7a8a43639573ce`. Initial target QA file was clean; many other files had concurrent uncommitted changes. Prepatch reproduction on dedicated production preview `http://127.0.0.1:5213/`: HTTP 200 with HTML #root, appearance exit 18, `Owned Chrome exited 0`. An earlier dated receipt also observed this browser-harness failure. This is not a demonstrated product UI defect.

## C / Decision and ownership
Scope originally only `qa/appearance-e2e.mjs`, with evidence in this directory. Preserve all other contributors' app, camera, CSS and navigation changes. Keep the original temporary-profile copy before editing. Do not relax Chrome security flags, touch personal Chrome profiles, or alter reward economy. Since the post-patch full E2E and updated shared-tree build did not both pass, choose **targeted rollback of only this investigator's hunks**, not a whole-file checkout.

## D / Changed, observed effects and rollback
1. Backed up initial clean target as `appearance.before.mjs`, 51972 bytes, SHA256 `44857fe85a4cf301984f7645630c7b818be1f5b0dc15c84f075bc70eddd21383`.
2. Temporarily replaced premature launcher-exit rejection with owned `DevToolsActivePort` readiness and added owned CDP `Browser.close` plus bounded temporary-profile cleanup. Preserved combined snapshot `appearance.partial-patch.mjs`, 54488 bytes, SHA256 `5e8e79ccc80b05ae4787fa8ad18c553085d69572c5ee31a7fe3ef2c2ac94c746`. **Snapshot includes concurrent contributor's navigation changes, not an independently owned patch.**
3. Post-change full appearance QA reached real React UI and passed 36 emitted checks (appearance preferences, workout bytes preserved, manual steps with manual provenance) but failed at `mint actual new control is rendered #daily-plan` after concurrent navigation moved visible panels. Exit 18. Browser temp profile cleanup also reported EPERM. An isolated `--graphics-only` run failed at `TIMEOUT created fighter dashboard lazy panels ready` on an actively changing dev tree, not evidence of a 3D defect.
4. Reverted **only** this investigator's CDP startup and cleanup hunks. Current `qa/appearance-e2e.mjs` still contains other contributors' test-navigation edits. Read-back: original launcher-exit guard present, the investigator's `Browser.close` block absent; `node --check` exit 0; `git diff --check` exit 0. At read-back the shared QA file was 52940 bytes, SHA256 `ce357d8619b1d686090717262668b11c3892dc9b7725fb5bb42bd069339ba92b`, mutable after other contributors edit it.

## E / QA gates
| Gate | Observation | Status |
| --- | --- | --- |
| Initial full unit | 572/572, 49 files, exit 0 | PASS at earlier shared tree |
| Initial production build | `npm run build`, exit 0 | PASS at earlier shared tree |
| Initial bundle | 395725 entry bytes vs 496761 baseline; 20.3% reduction; MediaPipe chunk 154276 bytes, exit 0 | PASS at earlier shared tree |
| Isolated preview | 127.0.0.1:5213, HTTP 200, HTML root | PASS, earlier built snapshot only |
| Appearance before patch | `Owned Chrome exited 0`, exit 18 | FAIL |
| Appearance after temporary patch | 36 PASS lines then hidden `#daily-plan` failure; cleanup EPERM, exit 18 | FAIL (not Chrome-start failure) |
| Focused `--graphics-only` | lazy dashboard timeout, exit 18 | FAIL / environment drift |
| After concurrent changes, full unit | 571/571, 49 files, exit 0 | PASS |
| After concurrent changes, build | exit 2: `src/lib/forgeHomeXp.test.ts` has unused imports `createElement`, `renderToStaticMarkup`, `FighterLevelProgress` (TS6133) | FAIL, foreign uncommitted file |
| Bundle after failed build | Not run | NOT RUN |
| Post-rollback syntax/diff | `node --check` exit 0; `git diff --check` exit 0 | PASS |
| Screenshot in this receipt directory | 0 | NOT CAPTURED |

Unit/synthetic browser checks are not field tests. No physical Android/iOS, human pose accuracy, true FPS, GPU/battery data, Firebase live, camera recording or permission modification claimed. The root preview serving HTTP 200 is not a claim that the new working tree builds.

## F / Files and SHA256 read-back
All paths relative to `C:\github\BODYFORGE\docs\audits\BF_APPEARANCE_CDP_20261110` unless noted:
- `appearance.before.mjs`: 51972 bytes, `44857fe85a4cf301984f7645630c7b818be1f5b0dc15c84f075bc70eddd21383`
- `appearance.partial-patch.mjs`: 54488 bytes, `5e8e79ccc80b05ae4787fa8ad18c553085d69572c5ee31a7fe3ef2c2ac94c746`
- `appearance.after.log`: 12710 bytes, `1776d2e7996542547aa24cc3856fd048166707a83e7766700d246d01ab29b07e`
- `graphics-only.log`: 1828 bytes, `a27afad2c2e5f371e6073e6dada00862575d862ac43457888035a6bcf49f2ad0`
- `unit.after.log`: 6962 bytes, `409a3a2a54254a370bd4b9ec52973f1d69cc141f57c18275e87e5b031505b9d5`
- `build.after.log`: 758 bytes, `05caa27a14a4645ce1c3aa6d7a6e6a230f5174473bc478fedf6e7e22d2ca1d10`
- Also `source-head.txt`, `source-status.txt`, `input-hashes.json`, `output-hashes.json`, `diff-check.log`. Personal user-profile path redacted from copies of relevant logs. Receipt itself is intentionally not self-hashed.

## G / Lifecycle
QA repair candidate: investigated, temporarily implemented, **not fully verified, explicitly rolled back**. Documentation: recorded after read-back. Shared worktree: **BLOCKED** by concurrent unstable sources and compile failure. Not committed by this investigator; not deployed; not verified-live; no completed technical iteration claimed. Do not reinstate the patch without a frozen tree and a working full E2E.

## H / Next reversible 15-minute step
Once the parallel editor stabilizes `src/lib/forgeHomeXp.test.ts` and navigation, freeze SHA/source-hash evidence and rerun unit, build, qa:bundle on one input snapshot. Then isolate appearance CDP in a single-file diff, run complete appearance and mobile browser gates, and accept only if both browser cleanup and affected UI assertions PASS. If they do not, roll back the narrowly owned patch again.

## ∆DΩΛ
∆: separated actual CDP startup weakness from changed navigation and foreign TypeScript compile failure; declined a false green status.
D: Windows repo read → baseline pass → appearance red → bounded temporary repair → browser proof/FAIL → targeted rollback/read-back → receipt.
Ω: high confidence for logged local exits and file read-back; not enough evidence for a stable production fix or mobile quality.
Λ: revisit after stable Git tree, green build, full local Chrome E2E, and clean temporary-profile teardown.
