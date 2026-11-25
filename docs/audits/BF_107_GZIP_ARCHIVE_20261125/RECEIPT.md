# BF-107 - lossless GZIP backup archive

Status: IMPLEMENTED / TESTED_LOCAL for optional compressed export and strict selected-file import. Not an at-rest journal migration or physical-device acceptance.
HEAD 664ab80c89b244bab1014ec5c652d11c6a490470; observed 2026-11-25T19:29:01.176388+03:00.
Decision: wrap the existing v1 JSON envelope in standard gzip, retain plain JSON fallback. Do not alter any IndexedDB schema, stored workout bytes, reward policy, wallet, or baseline snapshots. Native browser CompressionStream and DecompressionStream only. Source compression budget 32 MiB; selected compressed input and inflated JSON each bounded to 16 MiB. Read chunks with a 15-second timeout, cancellation, exact UTF-8 round-trip verification before offering download. No extra import authority: strict existing comparator and replacement gates receive the decoded JSON. Stale prepared archive invalidated on local profile changes, cross-tab changes, pagehide and unmount.
Limits: compression is optional, not guaranteed to reduce every file; unsupported browsers or too-large source retain JSON fallback. Chunked decoding bounds accumulated output but cannot promise native inflater memory usage. A small compressed file with oversized decoded JSON is evidence only, not a restorable backup. No actual device test, memory/eviction/power-loss guarantee, archive of owner data, new APK, Firebase deploy, commit or push.
Focused Vitest 35/35; full Vitest 924/924 in 94 files. TSC, Vite build and bundle gate exit 0. Production browser mobile 118 PASS lines; privacy 13 PASS lines (12 private paths plus app HTTP); dev import 37 PASS assertions including compatible gzip replacement, exact original journal and no reward replay. Owned QA servers stopped.
Measured disposable synthetic normal backup: 1599 bytes JSON -> 589 bytes GZIP (63.16% reduction). Repetitive stress fixture: 16778921 -> 17080 bytes; original evidence preserved and decoded-size import correctly refused. These are test fixtures, not an estimate of the owner history.
Frozen source 315; production build 73 files. Entry assets/index-CkYoKppD.js SHA-256 3d616830af51a39c521515e4764f88ab6c8af1c5912a46d87b6ec499ba7452f2, 392604 bytes; 21% below previous baseline. Camera chunk 154276 bytes. Existing >500 kB chunk warning remains. Preview HTTP 200 and entry/index hash check. 10 PNG headers and hashes checked; no independent visual review claimed.
Current source parity: 0 changed and 0 new paths against frozen source. Owned hashes match. Diff=0; cached diff=0; canon=0; QA syntax=[0, 0]. Parallel changes not covered by frozen test run. Exact paths in final-readback.json.
Next: design an atomic compatible journal/checkpoint retention migration; no automatic pruning of existing baseProfileRaw.
Rollback: restore only hash-matching owned pre-edit files from the first before copies; use .before-qa for CSS/mobile QA and import-preview-e2e.mjs.before; remove only unchanged newly introduced backupArchive.ts/test.ts. Do not roll back unrelated work.
Commands: targeted Vitest, full Vitest, tsc -b, vite build, qa/bundle-on-demand.mjs, qa/mobile-e2e.mjs, qa/privacy-server-e2e.mjs, qa/import-preview-e2e.mjs; verify_canon.py.

Owned paths | bytes | SHA-256
src/lib/backupArchive.ts | 5568 | da43b805f52f4506045fdae15e78be24f42753272f1aad0845f9485a3db48489
src/lib/backupArchive.test.ts | 4627 | 9ffde048b410d228c5b6bfbb26df0cd31b369cb004b019917b2db3541dd7f8ee
src/lib/progressImportPreview.ts | 10019 | cc85af6b931d5ba6093d537ced81e9ab77201e021088a8620e2f3185abf1a051
src/lib/progressImportPreview.test.ts | 9918 | e018e757cfe2e89630a4e0144ab41193baee328a1f4e37a22a54fe9aeaa61c57
src/lib/progressBackup.ts | 4331 | d4098f57f38ab3ca1206eed32532cd8098dda67b5bab9dc6a337359b72a4367b
src/components/ProgressBackupPanel.tsx | 24073 | 63b0d4e7bba2b463b7938cfc3c0ada32705c3c3355a4567332ee8a154623f3d1
src/components/progressBackup.css | 5335 | 0c7a1b487e9bcc30a8a01e0e8800411b46afb3c5447ee8e1c22c52de0c324f84
qa/mobile-e2e.mjs | 51775 | c6588ef16d7852fc3631d7d13bdf011ff5d5e4182c9df3f1d796f4baa449bcc6
qa/import-preview-e2e.mjs | 21301 | fe83e87ed9c6d0527dbfce7451a3d535b67503ea1d0b567ced5808a2b964ec2e

References: https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API ; https://compression.spec.whatwg.org/ ; https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
