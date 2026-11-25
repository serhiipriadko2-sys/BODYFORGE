# BF-107 - storage capacity and inspectable backup boundary

Status: IMPLEMENTED / TESTED_LOCAL for advisory storage measurement, compact lossless export and explicit oversized evidence handling. Does not close scalable history archive or physical-device acceptance.
HEAD 664ab80c89b244bab1014ec5c652d11c6a490470; observed 2026-11-25T19:13:04.919007+03:00.
New read-only capacity observation counts localStorage key/value UTF-16 code units times two, not actual browser disk usage or remaining quota. 3 MiB is a conservative advisory policy threshold, not a platform limit. The origin usage/quota estimate and persisted status are read separately with a two-second timeout; unsupported/invalid/late results are unknown. No probe writes, clear operations, persistence permission request or new network calls. UI invalidates stale observations.
Manual backup serialization uses compact JSON envelope; original opaque strings including durable baseProfileRaw are retained exactly. UTF-8 byte size determines within-limit, near-limit (75 percent of 16 MiB) or oversized. Export source-read completeness stays independent from inspection capacity. Oversize output uses evidence filename, explicit warning and download-for-analysis button; built-in file reader remains bounded at 16 MiB. No silent truncation, replacement or reward creation.
Focused Vitest 41/41 in four files. Full Vitest 865/865 in 91 files, TypeScript exit 0, Vite build exit 0. Actual disposable production-browser test pads the origin with a synthetic non-BODYFORGE key, observes the advisory warning, verifies no mutation or persistence request, removes only its fixture and verifies invalidation. Oversized multibyte opaque journal evidence is injected under test locks; export is preserved and selected-file inspection refuses the oversized blob. Wallet unchanged. No owner browser or storage accessed.
Mobile production browser 101 PASS lines; privacy 13 PASS lines (12 private paths plus app HTTP). Initial dev import test failed with CDP navigation error after 33 PASS lines; full retry on identical frozen source and harness passed 36 assertions, including exact rollback, keep, and no new reward. Both attempts retained. All owned QA servers stopped.
Frozen source 307 files; production build 73 files. Entry assets/index-ZCKo1_E1.js SHA-256 14bf036094aade06ec83b2b6d78e7fd1523d405e1b3112a711624d9330723975; 391816 bytes, 21.1% below baseline. Camera chunk 154276 bytes. Existing large-chunk warning remains. Preview HTTP 200, exact entry/index read-back. 10 PNG headers and hashes verified; no independent visual review claimed.
Current source parity: 5 changed and 4 new paths versus frozen source. Owned hashes match. Diff=0, cached diff=0, canon=0, QA syntax=0. See final-readback.json. Parallel changes not covered by this frozen run.
Limits: actual quota, storage eviction, physical power loss, installed Android WebView, and very large archive memory usage remain unverified. 16 MiB built-in inspection limit unchanged. Large JSON evidence is downloadable but is NOT a verified restorable file. No automatically deleting or pruning history, no IDB schema migration, no APK/Firebase/Git commit/push.
Commands: targeted vitest; full vitest run --maxWorkers=1 --no-file-parallelism; tsc -b; vite build; node qa/bundle-on-demand.mjs; node qa/mobile-e2e.mjs; node qa/privacy-server-e2e.mjs; node qa/import-preview-e2e.mjs (one unchanged retry).

Owned paths | bytes | SHA-256
src/lib/progressBackup.ts | 4143 | f1affce4f28336a3e8147401c9669078886d920eae8ed93d686b9584c1cb1993
src/lib/progressBackup.test.ts | 10160 | 12d9d9a9e715b391590bdf71173d45cb51bd6afb363d775702d6755e014e1545
src/lib/progressBackupInspector.ts | 9040 | c0303d46d4586ce7d962ab9422e396923d5b2a7a5a488d8c0d0c739fd03fe8a2
src/lib/progressBackupInspector.test.ts | 7979 | 9868ce56dd00281b5e55091388bb28b7fab36f42dc083ce5516d75fc29cc9c2a
src/components/ProgressBackupPanel.tsx | 19889 | cebe5db74e06634e407b83af9261b7c7732a9cb0083833d67f098a97181a79ae
src/components/progressBackup.css | 5267 | 6b930b8ebb01546f83696ba807efb55d3359b793e7ed05b30fd866d493d9b9bd
src/lib/storageCapacity.ts | 3492 | 79505d32c6a6b18856a1041bca86e0323ff4f06e669cee954a316497456a8c98
src/lib/storageCapacity.test.ts | 4120 | 15032317c91d824774a6b130de932ba15bb963261e5967feb1897ead9c36f94d
qa/mobile-e2e.mjs | 45700 | b83a15cbf457d2b3b88a11a030498f49d9c8057bf49a6e0be4805e2351f51b08

References: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate ; https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
