# BF-107 - mixed candidate writer and native version fence

Status: IMPLEMENTED / TESTED_LOCAL for candidate write semantics and native v1 version rejection. Overall acceptance BLOCKED_BUNDLE_BUDGET. Actual migration, production adapter integration, authority cutover and physical device verification NOT RUN. Production still uses v1.
HEAD 664ab80c89b244bab1014ec5c652d11c6a490470; observed 2026-11-25T20:53:30.142748+03:00.
Decision: candidate writer snapshots input, validates immutable raw result, preserves first baseline, applies existing active/settled/quarantined state rules. Shared journal gate; strict full-physical CAS; changed packed batch materializes all originals and state transition atomically. Terminal retries do not rewrite unchanged packed data. Fresh exact physical and logical readback required. Commit/readback uncertainty is not success. Bounded candidate only (16 MiB / 4096 records), no production opener, automatic upgrade or wallet authority.
Native fence: disposable v1 database upgraded to v2 by QA; old explicit v1 open rejects VersionError, existing journal read/stage/mark fail closed and records remain exact. This tests existing v1 implementation, not arbitrary earlier clients, wallet operations or production cutover.
Focused 19/19; full Vitest 1165/1165 in 108 files. TSC/build exit 0. Native journal 69 PASS lines (11 new mixed-writer checks and one version fence). Tests include active baseline retention, packed retries, conflicting/missing inputs, atomic abort, exact quarantine materialization, cancellation, lost readback, competing changes. Owned browser cleanup passed.
Required bundle gate FAIL: entry 398302 bytes; baseline 496761; strict maximum integer 397408 bytes (entry must be < 80% of baseline); exceeds by 894 bytes, reduction 19.8% rounded. Counterfactual control on same 345 frozen input paths differs only in the three task-owned files restored to before versions. Both build exit 0 and bundle exit 1; identical entry length and SHA-256 prove this patch did not change the initial bundle in the controlled snapshot. No weakening of gate. No attribution to a specific concurrent file without a separate causal test.
Diagnostic runtime checks against the exact failing-budget build: HTTP 200, exact index and entry hash, mobile 124 PASS lines, privacy 13 (12 private paths plus app), owned preview stopped. These are diagnostic passes, not overall acceptance. Existing large-chunk warning remains.
Frozen 345 source files, 73 build files; 10 PNG signatures and hashes checked, no independent visual review claimed. Current owned hashes match=True; v1 source matches=True; live drift 2 changed and 1 new paths. See final-readback.json. No changes to parallel files.
Diff check=0; canon=0; QA syntax=0.
Remaining: resolve shared initial bundle budget, then integrate and test bounded migration/retention and guarded versioned authority handoff, including existing larger journals, recovery, quota and real devices. No owner profile accessed or changed. No APK, Firebase, Git commit or push.
Rollback: restore only task-owned files if current SHA-256 matches owned.json, using their .before copies. Preserve other concurrent work.
Commands: focused Vitest; tsc -b; frozen full Vitest threads; qa/durable-journal-e2e.mjs; vite build and qa/bundle-on-demand.mjs (current/control); production diagnostic mobile/privacy E2E; verify_canon.py.

Owned paths | bytes (frozen) | SHA-256
src/lib/journalMixedStorage.ts | 25772 | 2583437cb8a585604a7ae439336614ff9388eef8e44b58c327431f04da539382
src/lib/journalMixedStorage.test.ts | 7856 | d6113c7f692daed70d14fac999dbdb0bcc615a8c6b484bca7a05ce41e3988bf3
qa/durable-journal-e2e.mjs | 46902 | c28d08806f242f1813375fd47fd45d9d8b2790a2435da6eac0b21cd97e91fad4

References: https://www.w3.org/TR/IndexedDB/ ; https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
