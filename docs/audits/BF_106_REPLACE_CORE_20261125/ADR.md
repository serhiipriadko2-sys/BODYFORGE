# ADR-BF-106: replacement transaction core, activation deferred

Status: proposed activation / implemented isolated transaction core.

Context: a multi-key localStorage update is not a browser transaction. Existing
profileLock coordinates cooperative writers, not arbitrary scripts or old
versions. Replacing an older wallet while settled journal rows remain can
replay rewards. A successful read-back is not proof of physical disk durability.

Decision: start with a fixed profile primary/fallback pair, exact byte-level
optimistic checks, explicit replace/cancel and a canonical write-ahead marker
containing both before/after pairs. Never touch journals or auxiliary keys.
Pilot planning requires ready/empty journals (including settled rows), matching
auxiliary sources, same identified current fighter or empty destination, and
validated supported incoming history. No >60-record source activation before
BF-107 retention; no unproven paid ledger, unknown root fields or differing
fallback identity. The port is injected and is NOT connected to app storage.
Caller must eventually supply real read-back under existing exclusive lock.

Write marker -> verify -> incoming fallback -> verify -> incoming primary ->
verify. Success is applied-pending-finalization, not a completed import; keep
original bytes in marker. On observed failure, restore exact pair in reverse
order only from recognized prefix states. If rollback fails or a competing
revision appears, preserve marker and report recovery-required. Explicit
restart recovery requires matching marker and decision. No arbitrary keys,
storage.clear, reward replay or live profile operations.

Alternatives: immediate saveProfile (normalizes raw, overwrites fallback and
doesn't offer multi-key rollback); single localStorage write (loses fallback
semantics); full cross-store replacement now (unsafe without recovery gate).
Selected narrow state machine is reversible but quota-sensitive and not a
durable cross-store transaction. No guarantee against noncooperating writers,
storage eviction, or power loss.

Tests: no-write cancel/invalid/stale, exact raw pair round-trip, fault before/
after/no-op at each write, recovery from every interrupted prefix, rollback
fault and retry, competing revisions, stale marker, no-op; real isolated
browser testing. Scope: profileReplacement.ts/tests and QA. No UI replace
button or runtime startup integration. Next gate: actual locked source
collector, startup/replay/writer guard, safe marker retention/finalization,
full backup/journal handling and explicit confirmation. Rollback code: remove
new owned files only if hashes match; never touch owner save or parallel work.

References: https://www.w3.org/TR/2021/SPSD-webstorage-20210128/ ;
https://www.w3.org/TR/web-locks/ .
Delta: exact replacement core. Trace: tests/read-back. Confidence: local
synthetic inputs only. Revisit: integrated startup and fault acceptance.
