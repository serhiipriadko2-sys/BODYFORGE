# BODYFORGE - collapsed sleeve cap repair

Date: 2026-11-25. Status: locally implemented and verified; PARTIAL toward AAA.

## Changes
- Blender BMesh and exact packed mesh inspection located a collapsed left sleeve cap. Four near-coincident vertices had different normal and skin-weight values. Removed precisely 14 triangles, including eight degenerate ones; preserved four UV-split vertices with identical corrected position, normal and normalized weights. Kept original UVs, bones, vertex order, garment boundaries, rest-shape correction and gameplay.
- Runtime guards the pinned tailored mesh and exact triangle index fingerprint, then commits the bounded repair before physique baseline capture. No original GLB edit, extra draw call or new texture.
- Sources: https://docs.blender.org/manual/en/5.3/modeling/meshes/editing/mesh/cleanup.html ; https://docs.blender.org/manual/en/5.3/modeling/modifiers/modify/data_transfer.html

## Verification
- Blender 5.2 independent BMesh check: 8336 input triangles before and 8322 after; 328 boundary edges unchanged; zero non-manifold interior edges after welding; eight previously collapsed faces removed during the before-weld audit.
- Runtime topology and 28 sampled growth/idle combinations: maximum separation of four UV-split vertices 1.2326578887186754 mm before, 0 mm after. This is local bind/posed-model evidence, not proof of global cloth collision freedom.
- Vitest: 5 files, 13/13 tests passed; build passed after removing two unused test variables that triggered TypeScript TS6133. Existing >500 kB bundle warning remains (Avatar3D 824.38 kB / gzip 233.16 kB).
- Browser max: 15 assertions, passed. Neutral: first attempt timed out waiting for fitted asset readiness; isolated retry passed 15 assertions. Cause of first timeout not established. Both successful scenarios verified actual indexed skinned textile draw, torso and turned views, economy without shadow pass, exact synthetic save retained, correct muscle levels and no uncaught exceptions.
- Visual inspection of max front screenshot: previous dark sleeve spot no longer discernible at the tested framing. No claim of AAA visual equivalence; full suite and physical Android FPS/thermal tests not run.
- Local server returned HTTP 200 and VS Code opened the edited source. No commit, push or deployment; unrelated edits preserved.

## Receipts (relative path; bytes; SHA-256)
- scripts/inspect-avatar-sleeves.py: 1737; 48f6766c4f843687eb96ccec4d343f551284190a5ed4c30783e9bc3699a126d6
- src/lib/avatarSleeveRepair.ts: 3944; b56968d74e038838639ffcc43de5d89d28fb96a8a2e5f8e0161ccb1a37b42a8f
- src/lib/avatarSleeveRepair.test.ts: 5528; 2fb09c6e5da62c598aff2a585a7df078b65dfc8cf8e54504e18fec18ab544234
- src/components/Avatar3D.tsx: 58338; 730a1c815afae160caae6254f29015bf324117322e687bd3ead621c3ebc8d75e
- qa/avatar-quality-e2e.mjs: 89150; 5b0a38733a6a5d19c6eb468350253870b78dd4924b1e57796a23cb0c26cc204e
- public/assets/bodyforge-athlete-efficient.glb: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- sleeve-max-economy.png: 193758; 9d7f22b15f535acf7d0b8dae7ac7d214d36a3d708bec948bf88d66f330e057a2
- sleeve-max-front.png: 194772; 68bb119440f403843f69ccc8885bbb77fd5efe2136beb8de1b30da4e93ef5d4b
- sleeve-max-turned.png: 197658; 899ed608423901ae1c8a1114ec3bd896d4ff8cb94b026bcb2258a2c249619bb7
- sleeve-neutral-economy.png: 195455; f49ab2f31258b6be5f514383954de32cd43bc1bf181557afd3e8d182b24510cb
- sleeve-neutral-front.png: 195398; 5403578f62b37e69c3607ddf19c808d33c59b1306696474ceacace10e9dfba2b
- sleeve-neutral-turned.png: 198978; 5848a691ce2d1cf299275a3b4d3daa972b9b6542c1b53dcfeae0a8944df53dae
