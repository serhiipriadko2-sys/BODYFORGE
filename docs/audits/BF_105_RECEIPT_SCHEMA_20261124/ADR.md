# ADR-BF-105: versioned receipt compatibility, no activation

Status: PROPOSED / implemented pure preview candidate. No activation of schema v2.
Context: R1 BF-105 depends on the existing local reward and recovery contracts. The
v1 wallet is authoritative; the visible last-60 workouts are not a full ledger.
The source journal has completion identity, but not verified policy/version metadata.

Decision: introduce a receipt schema and typed future RewardGrant envelope.
Use the existing v1 parser and journal validator, not a replacement reward engine.
The adapter takes raw JSON, produces a read-only projection, preserves exact raw bytes
for reversal, and exposes no storage writes. Legacy provenance is explicitly recorded;
unknown timestamps, active time, validator and policy version are null. Existing
20-rep and 30-second units remain fixed. No historical grants are inferred from
wallet or current reward constants. Grant identity is a typed tuple of profile,
source type and source ID; changing policy does not change identity. A missing or
ambiguous identity ledger, duplicate history, contradictory supplied critical fields,
or unsupported version blocks preview. Old unidentified histories may be viewed
with explicit legacy-unproven evidence. Receipt count means available records, not
lifetime history.

Alternatives: recompute wallet from last-60 (rejected: destroys earned/spent state);
replace storage key immediately (rejected: activation and recovery untested);
pure compatibility preview (selected, reversible). No new economy, new target,
or proof of human movement. No camera frames, landmarks, or device identifiers.

Consequences: additive module and tests; production runtime does not import it
yet. Exact v1 source bytes are retained in the returned in-memory preview, not a
new persistent copy. No automatic repair, no inferred floor for legacy tower
records, no reconstructed itemized grants or full-history claim. The old reader
may normalize display data; contradictory supplied fields must be reviewed
rather than silently transformed.

Tests: exact legacy raw round trip, 20/30, wallet/totals/ownership/ghost,
last-60 versus full credited IDs, malformed/unknown/duplicate inputs, opaque IDs,
no storage API calls, deterministic 0..71-history sweep. Current preview is
idempotent, not proof of atomic persistent migration.

Diff: src/lib/receiptCompatibility.ts, src/lib/receiptCompatibility.test.ts,
this ADR only. Rollback: remove only these new files if unchanged since creation.
Activation remains a separate gate: strict import/backup inspection, copy-on-write
candidate under existing Web Lock, staged read-back, exact critical comparison,
explicit conflict/recovery, rollback and atomic activation fault tests. Do not
change bodyforge:pilot:v1 before those gates and governance decision.

Delta: versioned contracts/preview; Trace: tests + local receipts; Confidence:
limited to verified synthetic/local inputs; Revisit: full integration and
persistent migration acceptance before enabling the schema.
