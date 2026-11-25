# BF-107 ADR - guarded legacy to candidate transfer

Status: accepted for local candidate implementation and disposable browser tests only.
Context: v1 remains the production authority. Separate databases cannot share an atomic transaction. Old clients may continue writing v1.
Decision: validate bounded exact v1 rows under exclusive journal gate. Copy only to an empty candidate via strict atomic transaction. Check source and target again. Equal nonempty candidate unchanged, mismatch conflict, observed source drift stale, uncertain commit/readback unverified. No source writes, DB opener, automatic activation, wallet authority or owner-data migration.
Alternatives: automatic pointer switch rejected (split-brain); destructive in-place upgrade deferred pending compatibility and recovery gates; evidence-only transfer selected.
Consequences: temporary duplicate storage, 16 MiB/4096 record candidate budget; cooperative lock only. No durable cutover claim. Device, eviction, actual quota unverified.
QA: exact states, queue cancellation, abort, packed retry, conflict, source race, lost readback, unknown version, old target refusal; full suite/build/preview.
Diff: journalMixedStorage.ts, journalMixedStorage.test.ts, qa/durable-journal-e2e.mjs. Rollback: restore only hash-matching owned files from before copies.
Delta: bounded transfer capability; trace: source/target readback; confidence: local QA only; revisit: before actual cutover.
