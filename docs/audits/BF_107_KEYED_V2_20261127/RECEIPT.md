# BF-107 - key-preserving compact journal v2

Status: IMPLEMENTED / TESTED_LOCAL for versioned production-compatible facade and explicit maintenance on disposable browser profile. Existing user journal activation, real migration, device/field acceptance NOT RUN.
Frozen HEAD 5ef0bb170cfa411e5c9bf8be95739c6e85104d1e; current HEAD 5ef0bb170cfa411e5c9bf8be95739c6e85104d1e; observed 2026-11-27T14:49:32.216525+03:00.
Decision: ADR.md. Native v2 retains original keys and adds one metadata revision store. Ordinary opens never upgrade. Explicit preparation validates exact legacy rows inside versionchange and only creates metadata. Versioned stage/mark uses strict atomic revision and selected-record CAS plus exact logical readback. Compact settled checkpoints use existing lossless codec. Active, quarantined, oversized and incompressible originals remain plain. Bounded maintenance can compact or restore settled rows without deleting history. Revision-checked pages and final read prevent trusted partial history if cooperating writers change state.
The first attempted command exceeded the Windows process command-length limit and made no source edits; prepared smaller staged files, rechecked original hashes and applied successfully. Preserved staged sources and original .before copies.
TypeScript, full Vitest 1175/1175 in 110 files, build and bundle exit 0. Native IndexedDB 110 PASS lines (25 new keyed v2 assertions: 20 basic + 5 large); exact original bytes, absent/blocked/invalid upgrade, idempotent preparation, legacy fence, compact/restore, settlement, quarantine, strict abort, stale CAS, readback loss, oversized fallback, revision drift and corrupt packed checkpoint. Synthetic 4105 legacy originals plus new result; more than 16 MiB of baseline text. No total journal cap. No partial trusted view under tested revision drift.
Production preview HTTP 200, exact entry/index verified. Mobile 124 and privacy 13 PASS lines; standard v1 application flow tested in production preview, v2 storage facade exercised natively via isolated dev browser. Entry 383784 bytes versus 496761, reduction 22.7%; existing large-chunk warning remains. Difference against baseline is aggregate, not solely due to this patch.
Verified 355 frozen source files, 79 build files, 10 PNG signatures/dimensions/hashes (not visually reviewed). Four owned paths match workspace. Other live drift: 3 changed, 0 new paths, not covered by snapshot. Owned dev/preview stopped, dependency junction removed without changing shared dependencies.
Diff=0; canon=0; QA syntax=0.
Limitations: revision fences cooperating v2 writers, not arbitrary same-origin mutation. Reads and post-write validation remain O(history); no measured mobile memory, latency or storage-pressure guarantee. Materialization does not downgrade the IndexedDB version. No automatic activation, owner data, APK, Firebase, Git commit or push. Full UI workout/backup/recovery through prepared v2 and device/activation gates still required; roadmap not complete.
Rollback: for source-only local rollback, verify owned hashes; restore durableJournal.ts and qa/durable-journal-e2e.mjs from exact .before copies; remove only unchanged new schema/v2 source files. Do not downgrade any activated database; existing owner v1 remains untouched.
Commands: tsc -b; native durable-journal-e2e.mjs; full Vitest threads; vite build; bundle gate; production mobile/privacy E2E; verify_canon.py.

Owned paths | bytes | SHA-256
src/lib/durableJournal.ts | 13998 | 962f5e51498d679304a34ef203b78da1d7cd7dba515ecae742bbba4ce195ff9a
qa/durable-journal-e2e.mjs | 72901 | ad488ff4f9a39bc719f8adc40cff1c521e897d769a680b1073c22e86c487597a
src/lib/durableJournalSchema.ts | 678 | ac4701dd2d97161fab044e2d81f12f405e924777bb92939fd8c030b0962df2a2
src/lib/durableJournalV2.ts | 18436 | 8e4cb526cae1545cd18dd613a1b0c931434d9411dd19892c774784d81d386834

References: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB ; https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction
