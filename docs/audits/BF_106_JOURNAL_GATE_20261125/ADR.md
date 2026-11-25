# BF-106: cooperating durable-journal gate

Scope: local concurrency repair; no forward import, new reward, schema, retention deletion or publication.

Evidence: before the patch, five new regressions fail: ordinary stages/marks bypass journal coordination, cancellation can reach IDB before its queue permission, recovery reads its durable snapshot without an exclusive barrier. Existing 9 recovery tests remain green. Shared profile lock alone cannot cover immutable completion staging, intentionally performed before acquiring that lock.

Decision: one named `bodyforge:pilot:v1:durable-write` Web Lock. Stage and mark acquire SHARED mode, retain it across strict IDB transaction completion and fresh read-back, then release. Recovery holds PROFILE -> EXCLUSIVE JOURNAL across snapshot and synchronous exact rollback/read-back. No function acquires profile while retaining journal. Ordinary stage still proceeds while profile is busy. Queue timeout only, AbortSignal and unsupported API fail closed; do not steal locks. Copy mutable entry inputs before waiting. Schema/keys, reward amounts, target 20/30 and ledger semantics unchanged.

Alternatives: serialize stage behind the profile lock (rejected: breaks independent durable finish); check IDB twice (rejected: another stage can enter after final read); new IDB schema/epoch migration (deferred to forward finalization). Cooperative gate is not a security barrier against old versions, manual writes, disk failure or storage eviction.

Validation: RED five regressions; targeted GREEN; native two-tab Web Locks/IndexedDB scheduler test, existing crash/UI rollback, independent pre-profile staging, dedup, build and full suite. Browser work uses isolated disposable profiles only.

Boundary: this closes recovery snapshot vs cooperating stage/mark races. It does not decide what forward replacement should do with late workouts prepared before import; full import activation/finalization remains disabled. Existing settled/active/quarantine entries remain protected and may block rollback.

Rollback: compare final exact owned hashes, restore three before copies and remove new gate/tests/QA only if unchanged; never reset, clean or alter owner progress. No dependencies, commit, push, APK or Firebase.

Sources: https://www.w3.org/TR/web-locks/ ; https://www.w3.org/TR/IndexedDB-3/ .