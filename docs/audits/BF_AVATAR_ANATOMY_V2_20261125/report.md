# BODYFORGE - upper torso anatomy V2

Date: 2026-11-25. Status: locally implemented and verified; PARTIAL toward AAA.

## Scope
- 28 mirrored muscle envelopes instead of 23. Separate anterior/lateral/posterior deltoid heads, clavicular/sternocostal pectoral regions and serratus transition. Existing core driver now includes chest. UI label and descriptions updated; no new stat, price, save schema or progression rule.
- Existing compact skin and garments use the same analytic deformation and normal correction. Source GLB remains unchanged. Chest emblem refit after cloth deformation by bounded projection at its eight authored vertices. No per-frame extra draw call.
- Separate editable Blender review scene uses the runtime recipe, four shared growth controls, four relative shape keys per fitted mesh and non-destructive Catmull-Clark subdivision. Body preview 577344 triangles. This is an authoring preview, not a hand-sculpted high-poly or baked replacement asset. The review scene does not reproduce all runtime pose, garment and shading corrections.
- Sources: https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs ; https://docs.blender.org/manual/uk/5.2/animation/shape_keys/introduction.html

## Verification
- Blender scene generation exit 0; reopened scene, verified core driver values 0, 0.4 and 1 at levels 0, 2 and 5.
- All 65895 body vertices tested at maximum group and combined deformation: minimum sampled Jacobian determinant 0.5064368229; maximum displacement 26.4645441 mm. Each of 28 regions reaches real vertices. These are local orientation checks, not global collision proof.
- Chest growth front displacement at level five: body peak 20.13798 mm (784 sampled points); shirt 18.73767 mm (341); peripheral emblem 7.85970 mm (7). Initial emblem threshold was too large for its location. Further actual shirt projection found negative clearance of -1.20742 mm. Corrected with bounded fitting; sampled eight emblem vertices across six core levels with other groups max: 1.19999 to 1.20001 mm forward clearance in bind space. Not proof of full posed or triangle-interior collision freedom.
- Final targeted Vitest: 6 files, 18/18 tests; covers all 20 paid progression levels through actual skinned geometry, reset, garment and idle regressions. Production build exit 0, existing >500 kB warning; Avatar3D 826.54 kB / 233.77 kB gzip.
- Focused browser scenario BODYFORGE_QA_SLEEVE=max: 15 assertions passed, actual skinned repaired shirt draw, maximum growth retained, torso/turned/economy frames, exact isolated save unchanged, zero uncaught exceptions. Previous matched max-front frame compared with current frame: clearer pectoral volume but overall silhouette and shoulders still look stylized. No full browser purchase rerun or full suite in this pass.
- No physical Android FPS, thermal or power measurements. No claim of AAA equivalence. Local changes only; no commit, push or deployment.

## Receipts (relative path; bytes; SHA-256)
- src/lib/avatarMuscleAnatomy.ts: 5184; 7ac7f7301d1bbdef21177206051d27894a8464924384b3929b1c8db28390a76c
- src/lib/avatarMuscleAnatomy.test.ts: 7576; 4302e8601a98d152d969c8b8e99f2ccab35333c9ef1a68f9c7f9ee946d3853a7
- src/lib/avatarChestMarkFit.ts: 3074; bef4324448f5e19e7a5d861d7fba357b70a757fd3bcd3bb8fdb02a4a59d3a8a0
- src/lib/avatarPhysique.ts: 4352; 19257f6606fb49905d87cdf79ac5d6ac3fa4f25ca4915524654bac5d3dca414e
- src/lib/game.ts: 11398; 04dc00d3cafe9d65e8c73dbfbcf62a2230fd42b6b685251c3cfeda73cab4dbfd
- scripts/author-avatar-anatomy-v2.py: 4812; e2d7716d17d4e438e3a18c0fee26f2a9bac06a8adab0658767ddd6c156bc370c
- .bodyforge-qa/anatomy-v2-lobes.json: 3463; fb9f367412a84288aee29106f03986c2cb7347a2f98bf23895ad3f077515585e
- .bodyforge-qa/anatomy-v2-review.blend: 8329480; b9bf9fa47cfa7225f60fb78e915a3296dfdcc524d90139027156869cf3929e3b
- public/assets/bodyforge-athlete-efficient.glb: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- docs/audits/BF_AVATAR_SLEEVE_20261125/sleeve-max-front.png: 194772; 68bb119440f403843f69ccc8885bbb77fd5efe2136beb8de1b30da4e93ef5d4b
- sleeve-max-economy.png: 193767; dc7c83fa31754e71dedc2896e1a761f8eb51d1e439439886706b6e234bb260a1
- sleeve-max-front.png: 195091; 658d2bacdeb6d1bda4906f3437b022e1db2f1a091571f056efb37b7f00acef8e
- sleeve-max-turned.png: 197712; d0a87691692b8011bcc055591999af13600152c1fb8426b08de481df2d4ab2bf
