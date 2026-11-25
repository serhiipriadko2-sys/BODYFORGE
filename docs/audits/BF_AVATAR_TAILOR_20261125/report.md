# BODYFORGE — tailored garment rest-shape correction V1

Date: 2026-11-25. Status: implemented locally, targeted QA passed; PARTIAL toward AAA.

## Scope
- Blender 5.2 projects smoothed garment edge corrections onto the pinned body surface, retains clearance and spreads movement over neighboring rings. Adds small outward panel ease, with conservative triangle-orientation backoff. No change to body mesh, garment topology, original UVs, skin weights, prices or game schema.
- Exact runtime vertex order extracted from pinned GLB and capped seam index order. Recipe validates both garments' source coordinates/index fingerprints before committing either. Runtime checks quantized triangle orientation and adjusts normals while preserving source normal splits. Fallback: no correction on incompatible geometry. Rest-shape correction precedes muscle sculpt capture.
- 3,132 shirt vertices + 1,334 shorts vertices = 4,466. Recipe 69,424 bytes; no new draw call. Source: https://docs.blender.org/manual/ru/5.0/modeling/modifiers/deform/shrinkwrap.html ; https://studio.blender.org/training/realistic-human-research/workflow/

## Blender evidence (bind space, before quantization)
- Shirt: scale backoff 0.5184, max displacement 2.50184 mm, minimum sampled signed gap 3.57711 mm, max gap loss 0.06516 mm, minimum signed triangle area ratio 0.31854.
- Shorts: scale 1.0, max displacement 1.45108 mm, minimum sampled signed gap 3.74028 mm, max gap loss 0.0000476 mm, minimum signed triangle area ratio 0.41214.
- Mean squared angle between successive boundary edges, before -> after: collar 0.639792 -> 0.459898; shirt hem 0.061294 -> 0.039216; sleeves 0.162024 -> 0.114361 and 0.172379 -> 0.122811; leg hems 0.075899 -> 0.046651 and 0.075616 -> 0.046422; waist 0.281766 -> 0.155008. This measures local edge angularity, not visual realism. Sampled clearance is not proof of global collision freedom.

## Verification
- Targeted Vitest: 3 files, 7/7 tests, including both garment shapes, unchanged attributes, all seven contours, individual muscle growth at 2 and 5, combined maximum, reset, and atomic rejection of changed source.
- Production build exit 0. Avatar3D bundle 822.16 kB / 232.47 kB gzip; larger than prior recorded build, existing chunk warning persists. No sustained device-performance measurements.
- Browser baseline: 26 explicit assertions, four screenshots. Browser final: 28 explicit assertions, four screenshots. Actual skinned matte draw, both correction recipes installed, full/torso/legs/rear views, all muscle groups level 5, exact disposable synthetic save unchanged, zero uncaught browser exceptions. Local server restored at loopback 5173; HTTP 200. No owner save changed.
- Matched torso and rear screenshots visually inspected. Improvement is modest, with slightly smoother edges. Small dark defect on front sleeve remains, and cloth and overall body shape still visibly synthetic. No claim of high-poly body sculpt, full collision proof or AAA equivalence. Next step: inspect sleeve defect topology and weight transfer, then create and compare a genuinely redesigned garment/body silhouette rather than another small edge-only correction.
- Scoped git diff --check and QA syntax check passed. Full test suite not run. Existing unrelated work preserved, no commit/push/deployment.

## Receipt (bytes; SHA-256)
- scripts/export-avatar-garment-fit.mjs: 1363; a9a08c76249bd0c09d2ca4be3da1565d5ee915669f28d078c56c20e2080f54e1
- scripts/author-avatar-garment-fit.py: 6896; 53e0e07b6c3910dac2944a487bb788f37feed1eb1fe659be869b1c0d0435b639
- src/lib/avatarGarmentFit.json: 69424; 40b4fd36413e8736a6377ae385a0a33ebad14e78acb8e506acb92626f53c0764
- src/lib/avatarGarmentFit.ts: 4086; aeefd2f27393af54ee3e5f05d54177c590d320c9cdd4d01f081f883e575f85e5
- src/lib/avatarGarmentFit.test.ts: 4090; dc4140739511053f97fc18651c9b87aabb2b3cc1cbc565005486e53c7fc8be25
- src/components/Avatar3D.tsx: 58092; 1d9cb10dee6bcdc8727902849899eb27dcbf2177c1b25372df113c17a3b932da
- qa/avatar-quality-e2e.mjs: 86859; fdc4452d63b62fdec24f6c6168987610d1b33921f44ab55004efb724fe3ef2c5
- public/assets/bodyforge-athlete-efficient.glb unchanged: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- tailor-baseline-full.png: 200077; d61c3945cd89ebca0e0af5b9811b08e86b9c9aa55036f484a82f3c7c6a93db59
- tailor-baseline-legs.png: 200759; f4103c49b88b6164911950a83b3be232395c2b2c182f6bb6a0ea32e03211552c
- tailor-baseline-rear.png: 190573; 868c77188b2d5f08b7a1436507ab058ab9612e8537fd6e23c68b3fda1e0d0e0b
- tailor-baseline-torso.png: 194808; a5c2c8cc75b7f01da9599caa36e1688c107b20569dd8b8812b2f0d1147c36a54
- tailor-final-full.png: 199997; 567a7fba35d48d22872437b52d8bf9e97347904ffecb4dce69f27fbdddca9379
- tailor-final-legs.png: 200761; 05d5c93496d2d984e9f2d23819aa89e47d9fb93c5a17e552da6a1b7dc5dd9c4f
- tailor-final-rear.png: 190447; d1c68b72778db19591989c55586d5e5d319b1313d6c9404717f4d993132ef0a1
- tailor-final-torso.png: 194837; 975bc82d3503d5387a1e6cad383926ef33d1e761e76f46e986e5681d0555d5be
