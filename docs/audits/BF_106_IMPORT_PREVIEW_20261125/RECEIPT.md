# BF-106 - backup import preview, first acceptance gate

Status: IMPLEMENTED / TESTED_LOCAL for read-only comparison and cancellation. BF-106 replacement, backup/read-back/rollback transaction remains NOT_IMPLEMENTED in this batch.
HEAD 7caa598c873c92887ac2ae3071b13f433225312e; observed 2026-11-25T15:59:25.573657+03:00.
Existing manual-backup v1 envelope and storage keys retained. The preview reads storedProfileRaw, not the export display mirror. Reuses the BF-105 adapter and the backup inspector. Strict UTF-8, 16 MiB byte limit before file read, exact file size check, duplicate decoded keys, prototype keys, depth and token limits. No new dependency, network upload, reward replay, write or apply API.
Shows current and incoming XP, coins, total/available workouts, repetitions, plank seconds, tower floor, outfit count, identity relation and recognized grant count. Warnings for lower values, other/unknown identity, incomplete and inconsistent copies, fallback incompatibility, legacy/opaque receipts, pending/durable/quarantine records and auxiliary settings. Local identity match and recognized grant shape do not establish authenticity. Preview-ready does not authorize replacement. File contents stay in selected file; UI retains summaries only.
UI cancel invalidates generation; stale results discarded after profile revision, disabled state, cross-tab storage signal or unmount. First patch attempt stopped at exact UI anchor before modifying sources; corrected anchor and recorded original before files. No assertions weakened.
Targeted: 53/53 in four files (16 new). Full snapshot: 718/718 in 73 files; TypeScript and Vite build exit 0; bundle gate exit 0. Browser: 24/24 actual file input, 320/390px layout, valid comparison, invalid JSON/UTF-8, oversize not read, cancellation including delayed read, revision invalidation, exact primary and localStorage/IndexedDB durable journal unchanged, reload, no uncaught exceptions. Owned Chrome cleaned. Privacy: 12/12. No physical device testing or actual import execution.
Frozen inputs 263; output 64 files; exact HTTP preview index and entry matched. Entry assets/index-D7kqe2zZ.js SHA-256 495a4d38e30cbeb901a767d4b71605201c650efb301ee47773b56481e4488c33; entry 397283 bytes, camera chunk separate 154276 bytes. Existing large-chunk warning remains. Test servers stopped.
Live comparison: 0 changed, 0 new paths vs frozen snapshot. diff=0, cached=0, canon=0, syntax=0. Whole current-tree PASS only if corresponding manifests and HEAD match.
Commands: npm test targeted files; node qa/import-preview-e2e.mjs; vitest run --maxWorkers=1 --no-file-parallelism; tsc -b; vite build; node qa/bundle-on-demand.mjs; node qa/privacy-server-e2e.mjs.
No owner profile read/write, APK, Firebase, Git stage/commit/push. Next: design and test explicit replacement transaction on disposable profiles; preserve original primary/backup/auxiliary/journal state, handle conflict and partial failure, prove exact read-back and rollback before exposing replace.
Rollback: after comparing owned hashes, restore exact two .before UI files; remove only the three new owned source/test files if unchanged. Do not reset or clean unrelated work.

Owned paths | bytes | SHA-256
src/lib/progressImportPreview.ts | 8977 | 83feec5c52f3f30b0a6e3d1b2fb9829ccad6efc378e4ea8d1d96f3e4ac4dbbf2
src/lib/progressImportPreview.test.ts | 8153 | 2a2897140e12f58f579d264e7e1c5a41f7439a4884f360d93c52a33b569bdade
src/components/ProgressBackupPanel.tsx | 11574 | 40d8fc15cb08a0672cc44187efaecf2813a8cb8f92b38eb66be8e928f29c3b83
src/components/progressBackup.css | 4876 | b6ab3ea86a2938f1271aad02609ddd98546194eda4f8f41013a7d1cd3f8bf38e
qa/import-preview-e2e.mjs | 14849 | 352f20b0af60ed8a615d5681b166e6fd1de8b5263c12922026928c6960d1a8b1

References: https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/fatal ; https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
