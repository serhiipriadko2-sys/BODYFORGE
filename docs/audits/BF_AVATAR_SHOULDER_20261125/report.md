# BODYFORGE - bounded skeletal proportions

Date: 2026-11-25. Status: locally implemented and verified; PARTIAL toward AAA.

## Cause and correction
- Legacy local radial scaling compounded through the spine and successive limb bones. On the detailed rig, maximal back growth also thickened the arm basis. Replaced this path for the recognized 65895-vertex groom-v2 rig with independent absolute cross-section budgets for 35 named bones. Legacy compatibility path retained for unrecognized rigs.
- Each frame restores the posed baseline, then assigns bounded linear transforms in hierarchy order. Joint origins follow their parent; original pose quaternions, skin weights, topology, the 28 muscle envelopes and save schema remain unchanged. Coefficients are artistic choices, not measured human growth predictions.
- Source research: https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs ; https://pmc.ncbi.nlm.nih.gov/articles/PMC11064717/ ; https://docs.blender.org/manual/en/4.4/modeling/modifiers/deform/corrective_smooth.html . No new Blender sculpt or GLB was generated this pass.

## Measured comparison
- Square root of world linear determinant ratio at maximum growth, zero breath, same rig: spine01 1.3248 -> 1.1250; upperarm02L 1.5740 -> 1.0900; lowerarm02L 1.7189 -> 1.0450; upperleg02L 1.1990 -> 1.0950; lowerleg02L 1.3094 -> 1.0450. These are bone transform metrics, not skin circumference measurements.
- Head origin drift in neutral pose: approximately 39.3 mm before, below 0.001 mm after. Upper/lower arm and leg lengths preserved in tested neutral maximum-growth state. Head, wrist and foot world linear bases preserved.
- Tests cover 24 isolated group/level combinations, combined max, 12 animated samples with yaw and nonuniform outer scale, deterministic repeat/reset, unknown-rig rejection, previous 20 paid growth transitions, protected eyes, seam and eyelash checks.
- First regression run: 26/27 passed; historical detail-rig test required head translation greater than 1 mm, incompatible with the new axial-preserving behavior. Updated the assertion specifically for both recognized detailed rigs and added compact rig coverage, while retaining the original expectation for legacy rigs.
- Final targeted suite: 38/38 across 7 files. Full Vitest: 764/764 across 78 files, exit 0. Production build exit 0; Avatar3D bundle 828.81 kB / 234.27 kB gzip; existing large-chunk warning remains.
- Browser BODYFORGE_QA_SLEEVE=max: 15/15 assertions, exit 0, three screenshots. Verified actual fitted garment draw, maximal muscle levels, unchanged isolated test save, no uncaught errors, economy rendering. Matched before/after front screenshots reviewed: noticeably narrower shoulders and forearms, more natural relative head/body proportions. Aesthetic result remains stylized, with no AAA equivalence established.
- No physical Android FPS, thermal or power measurements. No Git commit, push or deployment. Other local changes preserved.

## Receipts (relative path; bytes; SHA-256)
- src/lib/avatarGrowthBudget.ts: 4774; 864a19299199077e0adb3d7cbfe27fcd08202be74195bf443d194fbc621f0e49
- src/lib/avatarGrowthBudget.test.ts: 4754; c1a319a891bbe7ec69ddcd22fcde43bbed508bdeb028b371f5fc76e29f86c383
- src/lib/avatarGrowth.ts: 4146; b7724e1a0d34c6aaed08bb3ec10fab9c4b3e0e0630d7f816d351586d6a839164
- src/lib/avatarGrowth.test.ts: 5824; 939ed3ee004fedd0ca5ea34b517005eb430c377a4cf3de8c611691c10921d281
- public/assets/bodyforge-athlete-efficient.glb: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- docs/audits/BF_AVATAR_ANATOMY_V2_20261125/sleeve-max-front.png: 195091; 658d2bacdeb6d1bda4906f3437b022e1db2f1a091571f056efb37b7f00acef8e
- sleeve-max-economy.png: 195440; 65c33ea16b885e784e4166a309d0d0ca886ea4ad58c65c86afc5f030479ce779
- sleeve-max-front.png: 195496; d0ee9aba2e9b242de8dcd097d320a4ac8fcf43eead8a5c5b69c3f6b22711ce62
- sleeve-max-turned.png: 198907; e49893e0a17a7bd2995b9d7157414a0ca5104af5ba90d4f52e8f92985ce9df2c
