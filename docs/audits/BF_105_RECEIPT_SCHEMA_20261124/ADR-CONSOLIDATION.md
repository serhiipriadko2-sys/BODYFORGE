# BF-105 compatibility consolidation

Status: IMPLEMENTED / TESTED_LOCAL for the read-only compatibility projection.
This supersedes the separate provisional receipt definitions in this folder's
initial ADR. The persisted contract is the parallel BF-105 workoutReceipt.ts
implementation and its BF_105_RECEIPTS_20261124/ADR.md.

Decision: use the existing readWorkoutReceipt and canonical grant type.
WorkoutReceiptView is a projection, not a second persisted schema.
Classify missing, recognized, opaque and unpaid-journal evidence; expose only
explicitly stored recognized grant shapes with local-profile-unverified
provenance. Unknown legacy values stay opaque. No inferred old grants, tower
floor, historical policy, or active time. grantsComplete and
activationAuthorized remain false. Source raw is reversible; no storage API
or reward writer is invoked by preview.

Alternative: competing grant schemas (rejected: inconsistent authority).
Price: additive code and explicit preview limits, no new wallet or storage key.
The module is not yet wired to import UI. The separate live receipt writer is
untouched. Rollback: compare owned hashes and use before files, never reset
the workspace. No live migration, import, APK or deploy.
Tests: 54 targeted, 694 full Vitest, TypeScript/Vite/bundle, 33 actual browser
receipt checks and 12 privacy checks on frozen inputs.
Next: BF-106 strict backup envelope and preview-only UI; any actual replace
requires staged-copy/read-back/rollback tests and explicit confirmation.
Delta: one canonical grant contract. Trace: manifests/gates. Confidence:
verified local synthetic inputs. Revisit: physical device, current-tree release
gate, and activation/import acceptance.
