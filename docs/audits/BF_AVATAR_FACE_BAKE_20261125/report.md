# BODYFORGE - bounded high-to-low facial relief bake

Date: 2026-11-25. Status: implemented and locally tested in the requested VS Code workspace. PARTIAL toward AAA; the overall project verification is NOT GREEN.

## Scope and authoring
- Blender 5.2 uses the pinned 65895-vertex body and Face V2 profile. The offline high surface has 325853 vertices and 577344 triangles. Authored secondary folds affect 2286 high vertices by more than 0.025 mm; maximum displacement is 0.1822855 mm. This is bounded procedural geometry, not a scanned person, hand-sculpted AAA model or new silhouette.
- Actual Cycles selected-to-active tangent normal bake at 2048, with a padded frontal-face mask. Zero missed bake texels in the checked mask. Reoriented composition preserves existing body normals away from the face.
- Initial 2048 runtime candidate was visually almost indistinguishable at the tested mobile camera. Rejected the extra resolution cost; runtime output is 1024 x 1024, the same size and number of texture samples as the previous map. It is 231443 bytes versus 425857 bytes for the old PNG. Vector-space reduction and numeric PNG encoding avoid display-color transforms.
- Final atlas: 38608 texels differ from the original. Independent decoder found maximum normal-length error 0.00782764 and minimum tangent normal Z 0.827451. Source GLB, original normal atlas and face profile are unchanged.
- Reopened the final .blend: 65895 low vertices, 577344 high triangles, packed 1024 image, connected normal-map material, high source hidden from viewport/render. The source is an editable offline review scene, not an equivalent live-app rendering or a rigged replacement.

## Integration and tests
- Preferred compatible face loads athlete-face-relief-normal.png, validates its dimensions, retains numeric color space/orientation, and falls back to athlete-normal.png on failure. Existing scan-pore bump, regional skin, UVs, muscle fields and skeleton are retained.
- Superseded scene-owned normal textures are released exactly once. A new red-to-green test verifies replacement, reuse and shared ORM/bump preservation. Missing-asset and compact-dimension tests were also observed failing before the asset satisfied them.
- Final targeted suite: 6 files / 15 tests passed, including real growth transitions and idle regression.
- Final compact browser scenarios: fallback 18 assertions and baked 16 assertions, both exit 0. Selected normal asset, real regional skin draw, turned view, all four muscle groups at level five, unchanged synthetic game bytes, zero uncaught exceptions. Separate disposable Chrome profiles; no owner saves edited. Four raw final frames in compact/ and two matched crops (left original, right baked).
- Final full suite: 81 files, 80 passed / 1 failed; 787 tests, 772 passed / 15 failed. All failing cases are in src/lib/profileReplacement.test.ts, a file not modified in this pass. Failures include missing finalizeProfileReplacement and expected blocked versus actual planned. Full list remains in tests-final.log. Do not equate avatar checks to a green repository.
- Final TypeScript build: exit 2, TS2724 at src/lib/profileReplacement.test.ts(4,37), finalizeProfileReplacement is not exported. Vite-only production bundling: exit 0, Avatar3D 829.19 kB / 234.39 kB gzip, existing >500 kB warning. The combined build is blocked. An earlier native build process exited -1073741819 without a diagnostic; its cause is not established.
- QA syntax and scoped git diff --check passed. No commit, push, deployment, database or memory writes; unrelated local changes preserved.

## Visual verdict and limits
- The final matched frontal crop (220 x 290) differs in only 312 pixels at summed RGB difference >=5, and 2 pixels >=15. Turned crop: 133 and 0 respectively. Mean absolute per-channel difference 0.0720/0.0580 on the 0-255 scale. These are change measures, not realism scores.
- Both pairs inspected: relief is subtle and the face remains visibly synthetic. This pass establishes a verified bake workflow and a smaller map, not a significant visual leap. Do not present triangle counts or passing tests as evidence of AAA appearance.
- No physical Android frame-time, thermal, power or GPU memory measurements. Equal nominal atlas dimensions preserve the normal-map resolution budget; this is not a benchmark. No global deformation-collision proof.

## Primary technical references
- https://docs.blender.org/manual/en/5.0/render/cycles/baking.html
- https://threejs.org/docs/pages/MeshStandardMaterial.html

## Artifact receipts (relative path; bytes; SHA-256)
- scripts/bake-avatar-face-relief.py: 11937; ea23b8c74e652624746e8d8136fd8308f54cdd8098ca598bee8e21714768b5ea
- public/assets/athlete-face-relief-normal.png: 231443; 1740a2f83974d90745684454302d65951ebbaeeca8cb275f5e528a139251c830
- public/assets/athlete-face-relief-source.md: 1959; 364c12908e002018bbfa7eb9685973d98e2d0e8cc26f5a1a6166024fcd544d7f
- src/lib/avatarBakedNormal.test.ts: 1744; e61c63df90985d19d215e9bdb4364812ad752f4240efa25143290149b474bd5c
- src/lib/avatarFaceBake.test.ts: 3623; 69588689a6ed82c2a98ccae6585243683f41ddf278713cc23cbb34bd5f8aa5af
- src/lib/avatarDetailMaps.ts: 1258; 981fd74758cb17faa57d541b4aebc86d9799dff06ff4a72cf76ad4ebd7790ec4
- src/components/Avatar3D.tsx: 59109; 97768c0e03f97502a10f6307994e3645e1dceff1ebd3974bd6e44ba002627729
- qa/avatar-quality-e2e.mjs: 92021; 720afd688322b6d61f5f5b2a0a019a328653032baa446bc469d1b5c55715aae1
- .bodyforge-qa/face-bake-20261125/face-normal-compact.json: 641; 2493aaa3ff6c534961b3f280e6096c2526542318a52530aeda260892bc63308f
- .bodyforge-qa/face-bake-20261125/face-relief-compact-review.blend: 24078110; ecef00ae7114134ab523335fb35b5ee3587e6864ee9211429da9aa56795468ce
- public/assets/athlete-normal.png: 425857; e95565df62af0349a6bfeb266f505ee23e0789bcb3f83fee0ae9c84c718ed67c
- public/assets/bodyforge-athlete-efficient.glb: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- src/lib/avatarFaceProfile.json: 2052; e51dc7b5631443400da7e04022aa9bf696b27a99ebec200c531e87390dc243f9
- docs/audits/BF_AVATAR_FACE_BAKE_20261125/compact/comparison-front.png: 135413; c9a6c62a26ba46c8623179dd1394647774544769a037d6d7efe17107e3ca684f
- docs/audits/BF_AVATAR_FACE_BAKE_20261125/compact/comparison-turned.png: 119066; 3902497f4583d9ae4e90d9a837a0e544d7fe3875ce88e1a1e2c2275cc481d149
- docs/audits/BF_AVATAR_FACE_BAKE_20261125/compact/face-bake-baked-front.png: 562837; 83b85f9ba9ce909dc5e4b6e10b519c5afc69308ee16c999b31327a7869e8e471
- docs/audits/BF_AVATAR_FACE_BAKE_20261125/compact/face-bake-baked-turned.png: 576652; b9aa4c92af21b9534261bcc316b5fca87498ac683f192e782b775b348cb800ed
- docs/audits/BF_AVATAR_FACE_BAKE_20261125/compact/face-bake-fallback-front.png: 562808; deb11ca55ec0df02b31e3b3d72d7f835dc26eb780d30b46fc77dac7e864e8474
- docs/audits/BF_AVATAR_FACE_BAKE_20261125/compact/face-bake-fallback-turned.png: 576769; f78149990f052cdb65ddcb717d25cf6407c7d6ea24451c17e1996284a712f280
