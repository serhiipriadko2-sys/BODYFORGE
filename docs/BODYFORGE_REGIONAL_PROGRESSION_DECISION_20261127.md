# BODYFORGE — decision: regional muscle progression and interface baseline

Date: 2026-11-27
Status: OWNER-ACCEPTED design direction; local implementation present; production activation is a separate gate.
Owner input: the new group/subgroup progression, independent subgroup upgrades and associated interface changes are fixed/accepted.
Scope: product design and engineering baseline, not Iskra canon, not release authorization.

## Accepted invariants
- Four muscle groups with individually selectable subgroups and an individual upgrade action for each muscle zone.
- Preserve the new regional progression interface: 3D fighter preview, muscle progression panel, then shirt/motion controls and cosmetic disclosures. Do not restore the superseded clothing-before-muscles layout merely to satisfy an old test.
- Independent investment per zone; a purchase changes only the chosen zone and charges its defined cost exactly once. Preserve player progress, workout history, wallet integrity, and saved regional levels.
- Legacy broad-group progress remains compatible. Do not silently destroy or flatten an existing regional save. Migration is performed only by the existing valid-purchase path.

## Observed current configuration (not an independent balance-change authorization)
4 groups / 15 zones; 12 points per zone; 180 points total; 25 coins per point.
arms: shoulders, biceps, triceps, forearms
core: chest, abs, obliques
legs: quads, hamstrings, glutes, calves
back: traps, lats, midback, lowerback

## Source anchors
HEAD: 11d51edf407bed2ad7e1fd0a04332654fe46afcb (dirty working tree preserved).
src/components/ForgeWorld.tsx | 20259 bytes | SHA-256 1d71438813b6fa3dcfde69b8ec670201aea4e7caaf63a0605eeced508d0171e9
src/components/MuscleZonePanel.tsx | 4440 bytes | SHA-256 dae3e37651f0f266c35fabb332e6cab48b2888909e1e984e3e84e6928e6f5491
src/lib/muscleZones.ts | 6311 bytes | SHA-256 b59bd69d0ecfd498c0511b16d90124d105391c25379c6cc43c11d78b2d7bd29d
These three source files were preserved byte-for-byte during test adaptation.
Prior regional local review: docs/audits/BF_AVATAR_ZONES_20261127/REPORT.md.
Regression contract: src/lib/heroLayout.test.ts (updated for accepted order and subgroup controls), src/lib/muscleZones.test.ts (independent purchases, maximums, migration, malformed saves).
Focused run: 2 files, 7 tests passed; the economy suite walks all 180 purchases. Full release qualification is separate.

## Alternatives and consequences
Rejected: restore superseded layout or flatten the new zone system just to satisfy the old structural test.
Accepted: update the structural regression to protect the owner's accepted layout, retaining legacy compatibility and existing readiness gates.
Cost: old layout assumptions in downstream QA must be identified and corrected without weakening functional checks.

## Release and rollback
Do not enable experimental assets or regional purchase gates on production solely because the design is accepted.
Preserve existing DEV-only review flags and renderer readiness rules until the relevant art, storage, field and release checks pass. No commit, push, deployment, APK packaging, or live profile mutation authorized by this decision.
For rollback of a subsequent implementation patch, use exact scoped preimages after checking current hashes. Do not roll back this accepted design without a new owner decision.

Delta: accepted regional progression and interface baseline.
Trace: explicit owner input, source hashes and focused regression tests.
Confidence: owner decision and observed local source/test facts only.
Revisit: explicit owner change, source/contract drift, production activation qualification.
