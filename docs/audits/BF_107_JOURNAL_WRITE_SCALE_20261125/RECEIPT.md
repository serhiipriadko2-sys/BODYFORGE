# BF-107 - skip redundant terminal journal writes

Status: IMPLEMENTED / TESTED_LOCAL. Actual IndexedDB and production web preview verified. Not an at-rest compression migration or Android physical-device acceptance.
HEAD 664ab80c89b244bab1014ec5c652d11c6a490470; observed 2026-11-25T19:43:33.017677+03:00.
Decision: validate all requested rows and preserve complete exact readback receipts; skip put only when an existing settled/quarantined row has the same terminal state. Inserts, active retries and actual state changes retain strict put. Schema, immutable original payload, first baseline, quarantine semantics, full readback and reward authority unchanged. No deletes, compaction, checkpoint pruning, or migration.
Regression: initial browser launcher and cold Vite preflight attempts failed infrastructure checks. Full frozen run passed 25 durable checks before its legacy CDP expression failed because unwrapped await was not valid. Corrected only two QA expressions. On a separately verified identical source snapshot except that QA file, original production module fails the new terminal-duplicate assertion; new module passes all 32 checks. Both disposable QA profiles cleaned up. Production and other tests are byte-identical to the first frozen run.
Scaling fixture: 256 terminal originals plus one active original; exactly one put, 257 acknowledged originals and exact original bytes preserved. Second reconciliation issues zero puts. Conflict aborts before writes; no-op still waits for strict completion and a separate readback. Old implementation issued put for every expected row; 257 is the code-derived baseline, not a physical disk benchmark. No claim of latency, bytes-on-disk reduction or quota recovery.
Full Vitest 960/960 in 95 files; TypeScript, Vite build and bundle gate exit 0. Durable journal 32 PASS lines, dedup/recovery 34, mobile 118, privacy 13 (12 private paths plus app). Preview HTTP 200 and exact HTML/entry hashes. All owned servers stopped.
Frozen inputs 317; build files 73; entry assets/index-xcC4r_N_.js, SHA-256 d94dbfa7d755882ce4cf5c8cb52722059bfa2c1ee90028e0a0e5e771ffe1c67e; 10 PNG headers and hashes checked. Existing bundle >500 kB warning remains. No independent visual review claimed.
Live parity: 2 changed and 2 new paths versus corrected QA snapshot; owned source hashes match. See final-readback.json. Concurrent changes outside frozen inputs are not covered.
Limits: full journal readback and retained baseline storage still grow; physical device, power loss, eviction, and disk use not measured. No owner browser/storage accessed. No APK, Firebase deployment, Git commit or push by this task.
Rollback: restore only hash-matching owned files from durableJournal.ts.before and durable-journal-e2e.mjs.before; keep other concurrent edits. Intermediate QA copies retained for traceability.
Commands: vitest run --maxWorkers=1 --no-file-parallelism; tsc -b; vite build; node qa/bundle-on-demand.mjs; node qa/durable-journal-e2e.mjs (original and corrected module in disposable dev QA); node qa/journal-e2e.mjs --dedup-only; node qa/mobile-e2e.mjs; node qa/privacy-server-e2e.mjs; verify_canon.py.

Owned paths | bytes | SHA-256
src/lib/durableJournal.ts | 11022 | 99b5ab24987995dca1845c0c6256e27cb6ddb55958d4d7adf632fd4a99f3b062
qa/durable-journal-e2e.mjs | 19094 | 38415ab1673693948f6efd5c8f13db9c87193adc81ffa1cea08bf81125f7c554

Reference: https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability
