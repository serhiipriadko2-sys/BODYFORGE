# BF-107 ADR - dual-format journal write contract and native version fence

Status: accepted for local candidate implementation and disposable browser verification; actual authority handoff deferred.
Context: source-to-candidate copying does not fence legacy writers. A v2 store must support normal stages, terminal acknowledgements and quarantine transitions before switching. IndexedDB native version upgrade fences explicit v1 opens.
Decision: implement candidate writer preserving the v1 immutable payload/baseline, active retries and terminal-state semantics. Atomic CAS over validated physical records with strict completion and fresh exact readback; packed terminal state changes materialize all originals in the same transaction. Test the existing v1 reader/writer against a disposable upgraded database. Keep production v1 unchanged; no pointer switch or upgrade of owner storage.
Alternatives: separate-DB pointer cutover rejected (split-brain); automatic schema upgrade rejected until a scalable live adapter and recovery policy are verified.
Consequences: candidate remains bounded (16 MiB / 4096 logical records), not a production retention solution. Full snapshot CAS is conservative and may reject concurrent changes. Version fence applies only to old code explicitly opening v1; not a guarantee about arbitrary writers or wallet operations.
Tests: exact staging, packed retries, conflict, active/terminal rules, quarantine materialization, abort, cancellation, readback loss, concurrent write, native version fence. Full suite/build/mobile/privacy.
Diff: journalMixedStorage.ts, journalMixedStorage.test.ts, qa/durable-journal-e2e.mjs. Rollback: restore only hash-matching owned files from before copies.
Delta: mixed writer implemented; trace: test logs/receipt; confidence: local candidate only; revisit before production activation.
