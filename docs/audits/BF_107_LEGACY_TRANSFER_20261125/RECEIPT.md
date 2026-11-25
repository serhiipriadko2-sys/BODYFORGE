# BF-107 - guarded legacy journal transfer and verification

Status: IMPLEMENTED / TESTED_LOCAL for guarded v1-to-candidate transfer and read-only comparison. Production activation, durable cutover, live owner data migration, physical-device acceptance: NOT RUN. Production still uses v1.
HEAD 664ab80c89b244bab1014ec5c652d11c6a490470; observed 2026-11-25T20:37:26.992050+03:00.
Decision and scope: see ADR.md. Both DB handles are supplied by the caller. Exact v1 source and candidate identity/version/store checks precede the exclusive journal gate. Read-only source snapshots are bounded and reject unknown records. Copy only to empty candidate with strict atomic compare-and-swap; a nonempty exact logical copy is unchanged, including packed records. A nonempty mismatch is conflict, never overwrite. Source reread before and after candidate transaction detects observed drift; no claim of cross-database atomicity. No automatic activation or wallet authority. Every result explicitly has cutoverAuthorized=false.
QA includes wrong target identity, no lock fallback, queued cancellation, abort after add, exact copy of all states without a source write, idempotent packed candidate verification, conflict on later legacy activity, deliberately noncooperating concurrent source write, missing readback after commit, and unknown source schema. No user database accessed. Candidate handles and disposable profile only.
Focused Vitest 17/17. Initial PowerShell python -c invocation failed before source writes due quoting; corrected to a file-based patch with input hashes and before copies. Initial live TypeScript run reported unused avatarLookDev import in parallel Avatar3D.tsx; no change by this task. That concurrent code was independently completed before final frozen snapshot, which passed TypeScript. All final source/test hashes verified.
Full Vitest 1155/1155 in 107 files. Native IndexedDB journal 57 checks including 9 new transfer checks. Production preview mobile 124 PASS lines; privacy 13 (12 denied paths plus application HTTP 200). Build, TypeScript, bundle gate and QA syntax exit 0. Both owned servers stopped. Exact HTML/entry and frozen source/build verified.
Frozen inputs 341, build files 73, entry assets/index-BvnGjNof.js SHA-256 c08bf12af3bffe6c3cd1bd7d2477acd8e2a0aaeacc86d6ecf94c1d2c1e21da67; 10 PNG headers and hashes checked, no independent visual review claimed. Existing >500 kB chunk warning remains. Bundle entry 397075 bytes, 20.1% smaller than baseline.
Live parity: 7 changed and 2 new paths against frozen source; all 3 owned hashes and v1 journal source match. Exact paths in final-readback.json. Concurrent edits outside snapshot not covered.
Remaining gates: real version coexistence, guarded durable authority handoff and recovery, quota/eviction and physical-device verification. Copy observation alone cannot authorize activation; older writers are not fenced. Do not modify or delete the authoritative source. The 16 MiB / 4096 record candidate bounds remain, not an unlimited history guarantee. No APK, Firebase, Git commit or push.
Rollback: restore only the three hash-matching owned files from their respective before copies. Preserve other work.

Commands: focused Vitest, tsc -b (initial live and frozen), native journal E2E, full Vitest --pool=threads --maxWorkers=1 --no-file-parallelism, vite build, bundle gate, mobile E2E, privacy E2E, verify_canon.py.

Owned paths | bytes | SHA-256
src/lib/journalMixedStorage.ts | 20595 | 9e3f8abaf7bdf0f5cbcb2804218f172f34af764c57afc73be7f5f3b66dd783ab
src/lib/journalMixedStorage.test.ts | 5960 | 039e5ad7f8e2aebc7db43756edac694d980a3ffd2b71ab2798102cc254d0f530
qa/durable-journal-e2e.mjs | 38610 | c273763be83bb339a062604ab7f23c2398456723b5c7db13a2e0144a18c279dd

Reference: https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction ; https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
