# BODYFORGE - hip muscle progression V3

Date: 2026-11-25. Status: implemented locally, geometry and targeted tests passed; app-level browser verification blocked. PARTIAL toward AAA.

## Scope
- Added gluteus maximus, gluteus medius and medial thigh adductor envelopes to the existing legs progression. 31 named mirrored envelopes overall (7 arms, 8 core, 11 legs, 5 back). No new gameplay stats, price, schema, source GLB, topology or skin weights. The existing runtime field acts on body and garment surfaces.
- Anatomy reference: https://openstax.org/books/anatomy-and-physiology/pages/11-6-appendicular-muscles-of-the-pelvic-girdle-and-lower-limbs
- The coefficients are authored approximations, not physiological measurements or a muscle simulation. For comparison, Epic's ML Deformer example uses MRI, scan and offline simulation data: https://dev.epicgames.com/documentation/unreal-engine/ml-deformer-sample-in-unreal-engine

## Verification
- Red tests reproduced absent zones and almost no posterior hip growth (0.00615 mm at level one). First implementation passed progression but adductor displacement on the shorts was only 2.074 mm, below the new test's 3 mm target. Increased the adductor lateral amplitude from 8 to 13 mm; final body/shorts sampled peak for each new envelope: gluteus maximus 18.8561/18.3384 mm, gluteus medius 10.7783/12.2053 mm, adductors 4.9588/3.3086 mm. These are maximum vertex displacements on separately sampled meshes.
- Final targeted Vitest: 15/15 across five files, including actual purchase-to-growth transitions, five leg levels, reset, group isolation, garment fit and skeletal budgets. Posterior hip max displacement with fitted cloth pipeline: 18.6254 mm body (114 samples), 18.1139 mm shorts (77 samples).
- All 65895 body vertices tested for local Jacobian orientation; minimum determinant 0.5064368, maximum combined displacement 26.46454 mm. No global collision proof.
- Separate raw bind-space posterior ray probe (not final posed or tailored cloth): 28-30 successful matched rays per level; new minimum clearance 4.6679, 4.5402, 4.3561, 4.1806, 4.0052, 3.8145 mm for levels 0-5. No negative clearance in sampled rays. No proof of complete garment intersection freedom.
- Blender review generated from actual runtime recipe. Body subdivision preview 577344 triangles; 2513 body vertices and 680 shorts vertices affected by legs above 0.5 mm. Reopened and verified shared leg shape-key driver values 0, 0.4, 1 for levels 0, 2, 5 on body and shorts. Review scene is not a production high-poly asset and omits some runtime corrections.
- Full npm build blocked by three TypeScript TS2345 errors in unrelated src/lib/journalCheckpointBatch.ts at lines 118, 176, 178 (DurableJournalEntry vs Settled); file not edited this pass. Independent npx vite build PASS, Avatar3D 834.79 kB / 236.08 kB gzip, existing large chunk warning remains. Full Vitest suite not run.
- New browser scenario for rear/leg camera and real indexed shorts draw added. Current maximum-leg run exited 18 before the application/appearance readiness check; neutral run not reached. No new in-app screenshots or aesthetic improvement proof. Cause of browser failure not established. Previous refined scan-colour review also failed upstream browser readiness twice, despite its earlier 16 targeted tests and build passing. Broad first colour candidate rejected for misregistered nose and chin pigment; refined cheek-only asset remains an opt-in experiment, not promoted.
- Local work only. No owner save edits, commit, push or deployment. Physical Android performance not measured. AAA realism not achieved.

## Receipts (relative path; bytes; SHA-256)
- src/lib/avatarMuscleAnatomy.ts: 5676; 4d167106d31dd1aadbb3926e267cead3ef23f8cc450be08f899ef9cd8c2fdc86
- src/lib/avatarMuscleAnatomy.test.ts: 7576; 8d9959e2a57183a43e3384b142e84e93632770c085add385c1bf20af5c672e5b
- src/lib/avatarHipAnatomy.test.ts: 4087; e1a342c7e89d962c5adfc1a890cbf7971789c60478b043ff00a42914f473e62c
- scripts/author-avatar-anatomy-v2.py: 4825; ae038fe574b5e62d5f5d91be455c13c7a8588349d67606ea420d79ef9b8a1e2b
- qa/avatar-quality-e2e.mjs: 107106; 3effc7891b32e0d8c1f8c643b4961a1cc39af8b2a534bc5d2ac406bc61ca7bf9
- .bodyforge-qa/anatomy-v3-hips.json: 3840; 002ed98c3eff587f7294e872d505c2bb0c3ffc4df6a898349417765f40727b44
- .bodyforge-qa/anatomy-v3-hips-review.blend: 8339286; c8fac9429093cc48b516d1921e42581e08c413d600c1e0e343213bd293616025
- public/assets/bodyforge-athlete-efficient.glb: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- src/lib/athlete-skin-scan-review.jpg: 714727; 983d75f94cdd5d408bbce1aebbaa734cc27da7fe80deccdafa8af262df5d80e8
