# BODYFORGE — anatomical growth envelopes and matte textile

Date: 2026-11-24. Status: implemented locally and browser-verified; PARTIAL toward AAA.

## Scope
- Replaced 16 broad sculpt envelopes with 23 mirrored, compact anatomical envelopes (arms 5, core 5, legs 8, back 5). Inclined centrelines are fitted to the existing bind-pose body measured in Blender. Same field for body and clothing; analytic Jacobian for normals. These are artistic deformation fields, not biomechanical muscle simulation.
- Dry textile shading: bounded mapped roughness, weaker specular and environment reflection, broad fibre sheen, existing measured maps and outfit tint retained. No added downloadable asset.
- Existing growth levels, prices, skinning, idle animation, fitted hems, model and HDR remain intact.

## References
- https://openstax.org/books/anatomy-and-physiology/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs
- https://teachmeanatomy.info/lower-limb/muscles/leg/posterior-compartment/
- https://threejs.org/docs/pages/MeshPhysicalMaterial.html

## Verification
- Full Vitest: 64 files, 646/646 tests. Build exit 0 on retry; initial Node native Zone Allocation OOM; existing >500 kB chunk warning.
- All 65895 body vertices evaluated for maximum individual groups and combined growth; min sampled Jacobian determinant 0.5064368229, max displacement 0.0264645441 m (bind space). Every named lobe affects real vertices. This checks local orientation at sampled points, not global collision freedom.
- BODYFORGE_QA_ANATOMY_ONLY=1 node qa/avatar-quality-e2e.mjs: exit 0, 75 assertions. Linked matte textile shader on real skinned geometry; all 20 actual UI purchases made from disposable 1500-coin fixture, group isolation and exact costs, visible region changes, level cap, all level-five values and zero coins persist after reload; no uncaught exceptions.
- Changed pixels in matched camera crops after each group purchase sequence: arms 6498, core 13437, legs 14793, back 24103. These measure visible change, not anatomy accuracy or realism.
- Nine screenshots, eight distinct byte hashes (core-before equals arms-level5). Maximum-level full frame visually inspected: matte fabric and changed silhouette evident; face, hair, cloth shape and overall proportions still visibly synthetic.

## Receipt (bytes, SHA-256)
- src/lib/avatarMuscleAnatomy.ts: 4365, 0ab08c51e68e0e5469d370562d4a6b4dfd251f476864cceaf869539a6767475f
- src/lib/avatarMuscleAnatomy.test.ts: 3834, 2ab38a8e711e3e48547b84c231dd6a4c9364354debd13b69b963b17e963d1d44
- src/lib/avatarPhysique.ts: 4185, 2bfd9c26fe4c347502c1d153bb2acd300aa88a09823b3fb112b412a65acfbcfc
- src/lib/avatarFabric.ts: 3985, 39ac6d567a56cf9ff7a4edbd4393c84eb77be74d26c609ee3c286a5541ce5322
- src/lib/avatarFabric.test.ts: 3904, a00ea1fe2abfb23f50f0d1ab7e84469551f2d2e2a7c350844a198a4a854bd944
- src/components/Avatar3D.tsx: 54625, 3d622c406f030a0b72e661dcafa0dec4e28578ceb5327ad11eed736f00611bcc
- qa/avatar-quality-e2e.mjs: 69460, bc977a756ba1d47d8297ae02c5188e853f4e0569e45bd0b62940d61d99c195fe
- Original public/assets/bodyforge-athlete-efficient.glb: 4639184, df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- anatomy-all-level5-full.png: 200875, 98eb3fc1cec2ab964f57f9470db07f6c5a4603a33ddd9eba7edf6b969b8b92bf
- anatomy-arms-before.png: 196569, 7397bfd58b69e49fd8b514d688073eae28e5804f1d56c3f1c3d6ca09f96f117c
- anatomy-arms-level5.png: 196993, a457c643341690a6514fa9cefa730ce0832dd1e63932e392c5f0741f2e5f182d
- anatomy-back-before.png: 192099, f9f785e6e54e8a5fc6e472f0888c8bce2caa9a3cc995f4e87409b7874dd65d18
- anatomy-back-level5.png: 191637, eab4f7863f3e19202f6c7ccd6ecae345df96670d5b30c4c9851f0526420e09a8
- anatomy-core-before.png: 196993, a457c643341690a6514fa9cefa730ce0832dd1e63932e392c5f0741f2e5f182d
- anatomy-core-level5.png: 197867, 956de1a5659f1471813f8e9c1b0ca4408eb678fa6f0193caeadd292045c93061
- anatomy-legs-before.png: 201791, 599850a613fb09b6c1c384f163a43c92e735f92513cac8556f02f748fa10812a
- anatomy-legs-level5.png: 203682, 135e728b547a0e71e3e0c612a9502b5fc1d485b63010d7ddf69e850f4ff26184

No claim of AAA equivalence, physical Android performance, production deployment, or Git push. Existing unrelated local changes preserved.
