# BF-107 - guarded backup-bound v2 activation

Status: IMPLEMENTED / TESTED_LOCAL for explicit backup-bound migration API. No UI call site or owner activation. See ADR.md for decision and rollback boundaries.
Frozen HEAD 5ef0bb170cfa411e5c9bf8be95739c6e85104d1e; current HEAD 5ef0bb170cfa411e5c9bf8be95739c6e85104d1e; observed 2026-11-27T15:18:02.618025+03:00.
Scope: strict preview and exact local primary/fallback/auxiliary evidence, quiet profile/journal, existing v1 database inspection with no creation. In-memory frozen single-use plan. Explicit confirmation reacquires profile and exclusive journal locks and rechecks every original; native versionchange rechecks exact rows/count and local epoch/profile snapshot before metadata commit. Fresh post-commit read-back checks all logical originals and local snapshot. No automatic migration or change to wallet/reward rules. Low-level preparation primitive remains available for isolated QA only; no owner call site.
TypeScript, full Vitest 1186/1186 in 111 files, build and bundle exit 0. Real IndexedDB 127 checks including 17 new activation checks; pinned production v2 game flow 77 checks.
Activation fixture uses actual workout persistence and backup in a disposable origin. Cases: read-only plan, fake token, consumed cancellation, exact checkpoint mismatch, incomplete/invalid/pending file, mismatched wallet, unresolved result, interrupted replacement, epoch drift, durable drift, injected in-transaction mutation/rollback, blocked connection, aborted confirmation, successful activation preserving local and row bytes, replay refusal, lost read-back after native commit, no database creation on missing DB. All sample flags true. The post-commit ambiguity is explicitly unverified rather than falsely reporting rollback.
Production game flow retained exact packed history and reward identity after rollback and same-history file import; final synthetic 2 workouts / 360 XP / 120 coins. Mobile 124 and privacy 13 PASS lines. Preview HTTP 200; entry and pose digests verified. Entry 383794 bytes vs 496761, 22.7% reduction. Existing large chunk warning remains.
Verified 360 frozen source paths, 79 build paths, 11 PNG signatures/dimensions/hashes (not independent visual review). All three owned paths match workspace. Concurrent live drift: 5 changed, 5 new paths; see final-readback.json. Both owned servers stopped and dependency junction removed; shared dependencies unchanged.
Diff check=0; canon=0; QA syntax=0.
Limitations: plan compares local evidence, not proof of backup provenance, physical disk download or full recovery from device loss. Caller must be quiescent including RAM-only results. No physical device or field pose claim. Native version upgrade cannot be downgraded by restoring source. Owner-facing activation requires device/compatibility acceptance and explicit owner approval. No owner DB migration, APK, Firebase, Git commit or push. Roadmap not complete.
Rollback: after checking owned hashes, restore only durableJournalV2.ts and durable-journal-e2e.mjs from exact .before files and remove unchanged journalActivationProof.ts. Do not downgrade any migrated database. Other work untouched.
Commands: node --check; tsc -b; native durable-journal-e2e.mjs; full Vitest threads; vite build; bundle gate; production tower20-e2e.mjs --journal-v2; production mobile/privacy; verify_canon.py.

Owned path | bytes | SHA-256
src/lib/durableJournalV2.ts | 25721 | 2f5686d31951b2ef640633a245fc14e7491a2e684624dd83d9933099d6341c75
qa/durable-journal-e2e.mjs | 82792 | fc0754dcd0988e0e8a86db8d68ce087f3ddefc08fbba17632ff8560e8d684ef9
src/lib/journalActivationProof.ts | 4576 | 2e9d5992a394accaee133bebb372920594cd69d0ae5f9362c0d1458411e29d09

References: https://www.w3.org/TR/IndexedDB/ ; https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
