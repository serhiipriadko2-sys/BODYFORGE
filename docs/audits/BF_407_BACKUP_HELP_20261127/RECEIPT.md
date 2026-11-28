# BF-407 — backup help / safe recovery navigation

Date: 2026-11-27
Workspace: E:/github/BODYFORGE (authorized Windows workstation, VS Code workspace).
Status: TESTED_LOCAL for this scoped help/navigation patch. BF-407 whole feature and BF-703 release gate are not declared complete.
HEAD at patch and final verification: 11d51edf407bed2ad7e1fd0a04332654fe46afcb.
Source requirements: BODYFORGE_MASTER_ROADMAP_20261124.md R4 BF-407; BODYFORGE_EXECUTION_PROMPT_20261124.md sections 2, 3, 8, 9. WCAG 2.2 focus / target size: https://www.w3.org/TR/WCAG22/ (project target 44 CSS px).

## Scope and invariant

FAQ previously described file checking but did not explain compatible explicit replacement and rollback, and offered no direct path to the inspector. Separate recovery from unsupported clean-phone transfer. Reveal the existing lazy-loaded inspector and move keyboard focus to its summary; do not select a file, inspect, download, replace, merge or write the player profile. Preserve all existing reward, storage, camera and avatar contracts. Use native details/summary and existing design tokens rather than a new modal, storage API or design system.

Other local work (including avatar changes) was already present and continued independently; HEAD changed during initial preflight from 226429ae1080d000336a7430926d64e4bb54a89b to the HEAD above. Target components were re-read and verified clean with exact preimages before editing. No global reset, clean, stage, commit, push, deployment, APK, dependency or asset installation. No real player storage read or mutation. Dev server left running.

## Exact scoped files

| Path | Before SHA-256 | After SHA-256 | Bytes after |
|---|---|---|---:|
| src/components/SettingsFaq.tsx | 0BBD1D1930502E6D79229B78785CD1FD4D6A8C5E8904A64BB1E6D2DA10E590D1 | 2C8473815DCCAE4B812764889E2D743300FD12A66EC421C4A894E4B6579DE8DA | 6531 |
| src/components/ProgressBackupPanel.tsx | B3CFF6CDBFC159D18306D5AEE0EFAC5EDF0CAFCB40A202F2589BF1C9B3E00EDF | 67704E6740675A65C265DA6306C52A1F01ED317308B28FE00A3163FBF28C3E78 | 32354 |
| src/lib/settingsFaq.test.ts | absent | CFD00F68CD0F3DA5FA70A8C2B9EFA3F561D165CBD479D8ED9D3F1A0255413C43 | 1755 |
| qa/backup-help-e2e.mjs | absent | D21065A4C7AA4463D9083A24AC351A200BCD42AF60D74754D43E1EE3C01BAAB0 | 9631 |

Production diff: 2 files, 35 insertions, 7 deletions. The new QA files are additional.

## Verification

- Canon integrity: python .iskra/scripts/verify_canon.py PASS (30 files). No canon edits.
- Red test on pre-patch UI: 3 failed as expected, exit 1. Focused post-patch suite: 5 files, 87 tests PASS, exit 0.
- Full preflight: 123 files, 1234 passed, 1 skipped. HEAD changed during the initial preflight, so not an exact current-tree receipt.
- Full post-patch: npm.cmd test -- --maxWorkers=1 --no-file-parallelism: exit 0, 124 files, 1237 passed, 1 skipped (avatarShoulderTransitionReview.test.ts), duration 112.93 s. No source drift across 408 measured inputs; HEAD unchanged. git diff --check exit 0 (line-ending warnings only).
- Build: npm.cmd run build -- --outDir E:/github/BODYFORGE/.bodyforge-qa/bf407-backup-help-20261127/dist, exit 0 (tsc -b + Vite). Existing dist untouched. Vite warning: Avatar3D chunk 842.30 kB exceeds 500 kB; no claim that performance is fully optimized.
- Bundle: node qa/bundle-on-demand.mjs with CWD at isolated QA directory: exit 0, initial 386774 bytes (118805 gzip), camera 154276 bytes, 22.1% smaller than historical 496761-byte entry. Not attributable solely to this patch.
- Production loopback preview verified HTTP index and entry hashes; entry /assets/index-B2aQ0_rX.js; index SHA-256 035590f8e2726bfc523022b65bfb70d49cb9122ceed45b8ffa94cd06f2654c07; entry SHA-256 8f0e96eda920b04b653ed93e6b13f07318914d1546fbe731dd9062e8af10147d. Final owned preview http://127.0.0.1:63156 was closed after checks.
- node qa/backup-help-e2e.mjs: exit 0, 24 assertions, 320/390/428 CSS px. Actual trusted Enter activation, visible unobscured summary focus, 44 px shortcut, no horizontal overflow, no selection/replacement, repeat open/close, all synthetic BODYFORGE localStorage bytes unchanged, no camera attempt or uncaught exceptions. Owned Chrome cleanup PASS. Screenshot reviewed (390 px).
- node qa/tower20-e2e.mjs on same pinned production preview: exit 0, 26 assertions. Synthetic 20-rep tower fixture, exact reward IDs/awards, floor, ghost and reload. No actual human motion accuracy claim. Owned Chrome cleanup PASS.
- Existing dev server http://127.0.0.1:5173: both modified source modules returned HTTP 200 and contained new markers. Derived dev QA harness verified actual App module and same 24 assertions, exit 0. Owned Chrome cleanup PASS.
- node qa/import-preview-e2e.mjs on dev: exit 0, 51 assertions. Invalid/compatible preview, stale approval, staged exact primary/fallback, rollback, exact settled durable journal, gzip adoption, no duplicate reward. Owned Chrome cleanup PASS.
- npm.cmd run qa:privacy: exit 0, 12 blocked paths HTTP 403, app HTTP 200. HEAD request for own preimage backup returned HTTP 403. No private file contents read via HTTP.
- First post-patch full test attempt was interrupted by PowerShell treating npm stderr notice as NativeCommandError; no test verdict assigned. Rerun used cmd redirection and passed.
- First browser attempt exit 16 at viewport-320: CDP keyDown lacked text/unmodifiedText, no observed open/focus. QA-only correction added actual Enter text and native key code; trusted click observed on all three widths and no product code change after build. Replayed exact same index and entry successfully. Initial wrapper relative-path error was corrected using absolute path; no application mutation.

## Evidence (local-only QA directory)

Base: .bodyforge-qa/bf407-backup-help-20261127/
- SettingsFaq.tsx.before: 4692 bytes; SHA above.
- ProgressBackupPanel.tsx.before: 31376 bytes; SHA above.
- sources-retry-before.txt: 39254 bytes; SHA-256 4320729FBDD72C8490AB18702CC36245CA3EC778E7ACD0BCB8B6A51C15C6C60A.
- sources-final-before.txt and sources-final-after.txt: each 39254 bytes, identical SHA-256 039AED4F6A578D560FDD26FB407C145E7D585E9D4FBD554588F8D2EE3EF836AA, 408 entries. Only QA harness hash changed between build input inventory and final test inventory; production inputs identical.
- dist-sha256.txt: 7847 bytes, SHA-256 6BD6F05375DEFF1B1ED42E27719BAE3FCBB6F92F1C2D33064081B7ECE77D0E46. Recomputed all 76 dist files / 35919679 bytes: exact manifest match.
- unit-retry.log: 61970 bytes, SHA-256 E9A540FFFF01DBE6CF520208B019CBAA3F0A744B1312984F58D8EC001392AB1B.
- build.log: 4036 bytes, SHA-256 BE87259399454591B22212A560516FA3CEF5DEBFF9431A510C1D24122DD583C4.
- bundle.log: 281 bytes, SHA-256 9C51D1E62FDB3B0ABEBAE22185763752660861B1A58606C5DD01794B96325517.
- import-preview.log: 3147 bytes, SHA-256 A528426AF5FF22E8E7D8EABC7AF23E78AF6A65C5A97659A55E540E6E1665EA31.
- verify-preview.mjs: 2328 bytes, SHA-256 BACF6B4CAAA90F527A7E567821554B23C0BBC310970CD476D274671F290933F9.
- verify-dev.mjs: 9302 bytes, SHA-256 45E543AD5D0EFF5945E82D265F65E79320ECDCE4E53C83EC9F803E924FAF30F0.
- browser-evidence-retry/inspector-390.png: 163242 bytes, SHA-256 6ED1546B8A29F48FB68500178E0D510FB70AF42508F5B8342BA35CD89C60B7D9. Visual review confirmed focused visible summary, open file inspector, no dock overlap.
- Browser/tower/dev exit codes and assertions observed in remote tool read-back. Raw console transcript for these three runs not separately saved.

## Rollback and limits

Only if each current component still matches its after SHA, restore the corresponding exact .before file from the QA directory. Only if each newly created test still matches its after SHA, remove that test (no other files). If any SHA differs, stop and reconcile with owner/parallel work. Verify git diff --check, relevant tests and build again. No rollback performed.

No physical phone, field accuracy, screen reader, complete WCAG conformance, APK, external preview/live, cross-device transfer or full release claim. BF-703 prior receipt remains PARTIAL (integrated synthetic-mobile exit 12 at mobile-e2e.mjs:419:3). BF-603 local runtime exists but pinned model/license/field evidence gate unresolved; do not jump to BF-604 or R5 release claim. Next: isolate and reproduce current integrated mobile gate on a pinned artifact after parallel avatar work settles. Retain local patch, do not overwrite parallel work.
