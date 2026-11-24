# BODYFORGE — Forge chronicle disclosure (2026-11-24)

Status: IMPLEMENTED / TESTED_LOCAL. No Git commit, push, Firebase deploy, or physical-device validation.

## Scope
Actual workspace: E:\github\BODYFORGE (previous C: path unavailable; VS Code project located on E:).
HEAD: 4ddbfa7e74d876ed866ae5cdb1da9a807fa33095.
User requested the Forge screen's Chronicle of the Forge card be collapsed by default and expandable using a chevron.
Only production files changed: src/App.tsx and src/index.css.
A native button toggles local React UI state with aria-expanded and aria-controls; the existing records and history are hidden when closed, without changing saved progress. Reload defaults to closed. Arrow points down when closed and up when open; touch target 44 x 44 CSS px.
The expanded card's original three-column layout overflowed at 320/390 px; <=480 px now uses two metric columns with the third across the full width. No camera, economy, storage or workout logic changes.

## Verification
- Full unit command: npm test -- --maxWorkers=1 --no-file-parallelism, exit 0: 577/577 tests in 50 files (final source).
- npm run build: exit 0 (final source). Existing Vite >500 kB chunk warning remains.
- npm run qa:bundle: exit 0; entry 394001 bytes, reduction 20.7%; MediaPipe separate chunk 154276 bytes.
- git diff --check: exit 0. Git reports LF/CRLF advisory for index.css.
- Development http://127.0.0.1:5173/ and production preview http://127.0.0.1:5176/: HTTP 200; preview serves final index-NaC7M7C9.js.
- chronicle-e2e.mjs: exit 0, 15/15 assertions, isolated Chrome on production preview. Default closed, 44 px target, visible persisted fixture workout, 320/360/390/428 px expanded layout with no overflow, second pointer click closes, keyboard focus and Enter opens with correct ARIA state, exact synthetic save preserved after toggling and actual reload, no uncaught browser exceptions.
- Initial FAIL logs preserved: chronicle-e2e-before-layout.log (320 px overflow) and chronicle-e2e-before-keyboard.log (CDP keyboard simulation timeout); fixed CSS and corrected keyboard simulation respectively, without relaxing assertions. Final PASS log chronicle-e2e.log.
- Screenshot files captured at 390 px, hash/read-back checked; independent visual inspection not established. Zero owned Chrome processes and temporary profiles after QA.
- VS Code file-open and browser-open commands issued on the owner's machine. No independent proof of what the user's visible window displays. Dev server left available for user review.

## Source and evidence fingerprints
| Path | Bytes | SHA256 |
|---|---:|---|
| src/App.tsx | 82090 | 8facd4faa2b4a5aa26e39dffb64bddfc28b9630293a25bd85da6166ca85be22b |
| src/index.css | 28424 | b841e98262956ded909ba0d64378006551a70a5364f75e0ffb72599e0a71daf0 |
| chronicle-e2e.mjs | 8907 | 939bd9e29a83d60f95a20d47daf74ce4783dfd608bfe95fb57b6918a556ee94d |
| chronicle-e2e.log | 1797 | 2c6d0d1470372e72e2f146616e3d58f15f05850dccce0189b7b9c13b7b5fa940 |
| chronicle-collapsed-390.png | 208734 | 8b32e267c4d982bd9d0cfc4514e03e6f860e7ad26e5ecbe96c4e4e6858af20aa |
| chronicle-expanded-390.png | 126904 | 431f106af328d6fce685084742d66512176408b3e7594225bec15c872221586a |

Rollback: compare current Git diff and source hashes before reverting only the two owned source changes; original copies are in this audit directory. Never reset/clean unrelated work. No source changes after final verification.
Next: open local Forge screen and toggle the chronicle. Real physical phone and live release remain unverified.
