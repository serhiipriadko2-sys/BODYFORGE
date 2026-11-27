# BF-107 - receipt-only activity projection

Status: IMPLEMENTED / TESTED_LOCAL for production statistics reader. Current journal v1 remains authority. Compact physical storage activation and migration NOT RUN.
Frozen HEAD 5ef0bb170cfa411e5c9bf8be95739c6e85104d1e; current HEAD 5ef0bb170cfa411e5c9bf8be95739c6e85104d1e; observed 2026-11-27T14:37:47.597840+03:00.
Decision: share the existing paged readonly snapshot scanner using an explicit projection callback. Full recovery/backup reads preserve all original fields; write readback retains requested originals only; activity statistics retain only settled key/raw/state receipt fields. All physical rows, including excluded states, are still validated; cancellation, corruption or an incomplete page yields unavailable and no trusted partial data. Activity caller now forwards its AbortSignal. No schema, wallet, retention deletion, baseline or backup-format change.
The previous native large-history step was TESTED_LOCAL_WITH_HARNESS_RETRY. Previous retry-gates.json reported mobile exit 0, preview 200, source/build unchanged and stopped preview; previous receipt reported 124 passed scenarios. First failed harness run remains recorded.
Initial TSC exit 2 (local variable shadowed the for-loop value; TS6133/TS2448). Renamed projected variable, retained initial manifests/logs and pre-fix bytes. Corrected TSC, focused 20/20, full Vitest 1171/1171 in 110 files, build and bundle all exit 0.
Actual IndexedDB 85 PASS lines (eight additional checks). Synthetic 4105 settled records plus active record; full JSON 19952627 bytes versus receipt-only 360131 bytes, 98.20% reduction in serialized projection. Not a measured heap or disk reduction. 129 pages <=32 rows. All physical originals retained; late-page corruption and cancellation fail closed. Actual readActivityHistory returns same exact complete history as full original reader for 65 paid receipts (5 restored), without profile or journal writes.
Production mobile 124 PASS lines; privacy 13 (12 denied paths plus app). Entry 394968 bytes vs 496761, 20.5% reduction, mandatory budget PASS. Existing large chunk warning remains. Preview HTTP 200 and exact entry/index hashes; owned dev/preview stopped. Synthetic browser camera, not device/field accuracy.
Verified 352 frozen source files and 74 build files; 10 PNG headers, dimensions and hashes (no independent visual review). All four owned paths match current workspace. Other live drift: 7 changed and 1 new paths, listed in final-readback.json; not included in tested snapshot. The owned temporary dependency junction removed, shared dependencies unchanged.
Diff check=0; canon=0; QA syntax=0.
Limitations: getAll still clones each bounded physical page; full backup/recovery retains full originals. No measured memory ceiling, quota, eviction, physical Android test or production v2 authority handoff. No owner data accessed or modified; no APK, Firebase, Git commit or push.
Rollback: verify current owned SHA-256 values and restore only these four files from their original .before copies, leaving concurrent work intact.
Commands: tsc -b (initial failure, corrected pass); focused activityHistory/historyRetention Vitest; native qa/durable-journal-e2e.mjs; full Vitest threads; vite build; bundle gate; production mobile/privacy E2E; verify_canon.py.

Owned paths | bytes | SHA-256
src/lib/durableJournal.ts | 13225 | e38aa80f94ed3c152179b247a8a93d9d66728ace298c700e73ac1595ce134b6a
src/lib/activityHistory.ts | 6521 | c47b727df66b2dc2f308083f515d661e9272d1655a07df04f258c23879f86e49
src/lib/activityHistory.test.ts | 5963 | 3b0f4e1528f3e3fa893396d32fc6635b52c499003a8491e970c3d3a89d42014c
qa/durable-journal-e2e.mjs | 58045 | a2a7b01ee53eb7e2fdca6007a80c97114361e376b3f1d83bf29d659fcf72788d

Reference: https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getAll
