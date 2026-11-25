# BODYFORGE - exposed torso and independent shirt

Date: 2026-11-25. Local feature implemented and technically verified; AAA visual goal remains PARTIAL.

## Scope and design
- Default/legacy cosmetic looks without an explicit shirt flag now show the bare upper body. Shirt toggle is immediately below the 3D character; free cosmetic choice, persisted separately from profile, rewards, stats and owned outfits. Existing short and shoe coverage remains. A shirt already explicitly selected persists after reload. Unknown derived rigs retain a conservative clothed fallback if reversible masking cannot be validated; the original painted legacy body and simplified fallback also support the requested visual toggle.
- A single preallocated index partition replaces the one-way shirt occlusion mask on recognized athletes: 92580 skin triangles rendered bare versus 78350 clothed, restoring 14230 triangles when removing the shirt. Original vertices, UVs, skin weights and skeleton preserved. Shirt, chest badge and nested shirt seams hidden together; permanent lower-body mask retained. Draw range changes do not recreate index buffers. Body and clothing remain connected to the same 31 muscle regions.
- Appearance persistence accepts the optional Boolean in v1 saves; canonical serialization prevents field-order-dependent rejection. No new paid item, gameplay change, source GLB modification, commit or deployment.
- Development-only lighting review profiles AgX and Neutral PBR, compared against current ACES-based studio. Both change lighting and tone mapping together, so comparison is not a controlled isolation of the tone mapper. AgX desaturates the skin and softens muscle definition; Neutral PBR increases warm saturation without solving the geometry deficit. Baseline remains the production default, alternatives only for development preview. No new sculpt or source asset this pass.
- References: https://threejs.org/docs/pages/Object3D.html ; https://threejs.org/docs/pages/BufferGeometry.html ; https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html ; https://threejs.org/docs/pages/WebGLRenderer.html ; https://www.khronos.org/gltf/pbr ; https://docs.blender.org/manual/en/4.5/render/color_management.html

## Verification
- Targeted Vitest: 43/43 across seven files. All four recognized GLB variants verified against exact original triangle partitions, repeated reversible toggles, shared index identity and permanent shorts mask. Test exercises 20 independent muscle level transitions and exact reset, fitted seams, valid old and new cosmetic saves and rejection of invalid inputs.
- Full Vitest: 1163/1163 in 108 files, exit 0. TypeScript and Vite production build PASS. Existing >500 kB chunk warning remains, Avatar3D 838.03 kB / 237.43 kB gzip.
- Four separate disposable Chrome scenarios: baseline 0/20 and 20/20 muscle states, AgX 20/20, Neutral PBR 20/20. Each 37 assertions, all exit 0: 148 total assertions (74 baseline, 74 experimental). Actual compact rig, linked skin/textile shaders, draw count for restored body and nipple surface vs masked body and repaired shirt, shorts in both states, real front/rear images, persistence across reload, exact synthetic game bytes unchanged, no uncaught browser exceptions. Hardware used software WebGL for reproducibility, not a physical Android performance benchmark.
- Six matched comparison crops: growth (zero then max), clothing (bare then shirt), lighting (base, AgX, Neutral PBR), each front/rear. 16 original browser captures. Visual inspection shows recognizable chest, abdomen, shoulders and back progression, no obvious open torso holes at sampled angles. Muscle shape and surface detail still stylized; no complete collision proof, independent artistic validation, or AAA equivalence. Torso focus deliberately crops top of head; full/portrait views remain available.
- Work is local. No owner save edited, physical phone FPS/thermal/battery test, Git commit, push, or deployment.

## Receipts (path; bytes; SHA-256)
- src/lib/avatarOcclusion.ts: 7941; 521441e15c2293a0b993066248d6dec549417d19925f4c3a0fa14a237d5c630b
- src/lib/avatarWardrobe.test.ts: 7688; dd0c26e9632dfe465160c3ae0496fd2487af32c613f4158c88c43b5b9c3a3bc6
- src/lib/avatarLook.ts: 5260; 136f0b9b2474eabf1d3c3c7bbdd6daa1bca849ea07e0ada2c8c241c456025294
- src/lib/avatarSurfaceFit.ts: 3518; d14935382d92c78b798f0427b4fc7d5199fdd098a9e37952e8fae22f626222b2
- src/components/Avatar3D.tsx: 62930; 9de180186c674df45d8ca216f925cf8e4dc5bf7138e6cbf5bac6ef04c9c999ed
- src/components/ForgeWorld.tsx: 18820; 712cab858a4d4e0c0b275270fd60ecd1de5b8b75ec1e245cdbadea1e65c32ce5
- src/components/Avatar.tsx: 12227; 23296f609cc679bbab45f06f54f884ed756a2a878a753783f7acfd3a267b6ecc
- src/lib/heroLayout.test.ts: 2206; 1216ec88535969c558aa464a254cb53eb1d4d82a2bf0d18ff00f8ddd9a28d9a9
- src/lib/avatarLookDev.ts: 1867; 9f97711fd01b93b932d952130f437e99eb8fc3263aafcce920e498204f75a6cf
- src/lib/avatarLookDev.test.ts: 1632; cc0860ce828b526fa53528b795a3ef24095dd29a5b87b255f8fa88832efeacf3
- qa/avatar-quality-e2e.mjs: 116313; 205ff6a6a57711a064bfccd21f213fdc0b32e4689839db091aa2435939d37c00
- public/assets/bodyforge-athlete-efficient.glb: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\clothing-front.png: 518397; b50ed5a03c6ed4e068971fe97d4eb1832a8767f769dbab7aa06802fd22a0f8e4
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\clothing-rear.png: 522259; ae99ccf35c8a1bd13b9f760028271a9ea6029430a8f2bce1eb145081a5f991b4
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\growth-front.png: 680927; b34158513645d8920d7fcb45b5512ee18a5cd7b4904f38355773c472fe0aa690
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\growth-rear.png: 719587; b1f8275971e95f4dcc17b89eb776192372bf412a9fa2ef40b6909830bff6b987
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\lighting-front.png: 1034629; c76afa01bef2666c611148632f8134e01bee286804eef9d47998ef2d7ffdf2fd
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\lighting-rear.png: 1063442; eb4a3a5bef97bb8f24f535f18b74341fb9d5c8291ef43305cf7f9e118a898dc0
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\lookdev-filmic\wardrobe-max-bare-front.png: 605512; 18602caaeb1cf1e7adbc9df1e5f91f20747f0c9e006ca39474e9a33662e7bb54
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\lookdev-filmic\wardrobe-max-bare-rear.png: 601187; b6e653fa37afb9884826ac8ae18dcedddd372fb903260181840dd8918c878512
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\lookdev-filmic\wardrobe-max-shirt-front.png: 591663; 0f0a0ed4df153dcdb1990dd5993eac067baafa1fcb5c6c2bb6fc0296dbb98930
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\lookdev-filmic\wardrobe-max-shirt-rear.png: 572331; 9638fce79bac7bb1432cbe4c475d1170d6de7e72e96ae09a5266fbb0f64597cb
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\lookdev-neutral\wardrobe-max-bare-front.png: 617967; e61fbfee4ab2c17d268fa65a3a3f18b525cb65429e71e44ac83776e4aaaa72cf
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\lookdev-neutral\wardrobe-max-bare-rear.png: 614055; 86bc249580618f229349a22940395500ac2d99cecad6af843ea22d365c011b66
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\lookdev-neutral\wardrobe-max-shirt-front.png: 585321; d819394ecc6ab6a2d36bd33525a27bacd8a5af67b45881c08450f51c68835150
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\lookdev-neutral\wardrobe-max-shirt-rear.png: 561885; 9e234eaafe825068f8f776ba2cc4175cddb7b10408a35d8fc94381d81bc4034b
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\wardrobe-max-bare-front.png: 620567; 60920439aa2df2503dd24dbbcb977dd8e95f9a828ab33d9373497560135acb72
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\wardrobe-max-bare-rear.png: 617394; a12cbce798fef29dbe7d0da3eb19e9fb9189dad7f73733723f020d0d75d23371
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\wardrobe-max-shirt-front.png: 592454; a09a31a60269934a799ef962aa4d0905abca072a96da46590c0ef7563d55a62d
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\wardrobe-max-shirt-rear.png: 570196; 5a9bd08da7d9c9db0e5530b02d34a90feb8907941ec97974ed2f5da1e716b1c5
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\wardrobe-neutral-bare-front.png: 619840; f3267267d608f40da5091dff3507b27d8e160f4a4fc817352e18ac11c5569b93
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\wardrobe-neutral-bare-rear.png: 618125; 095794a13006fdeb49dcbc1db798e6238b39d2fcd35176f4860f120c16992dff
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\wardrobe-neutral-shirt-front.png: 592582; ec74a7ff5c9bc4d452c15b29896cd0c619c94f711bedfe391d5377eadd2c0797
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\wardrobe-neutral-shirt-rear.png: 573142; 7d5598a8f4dc4967fa8d3e17f0106c30edc0a63523e7b594c46f95127878a115
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\build.log: 5844; 5a31aeae97a2a4c47ffb72538ac0a9685db46a2b5ab09674878a77d48e714126
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\full-vitest.log: 50124; 358ad5e25d78dda44959653ada6e18ddb17db4e23d6e38953fd2459df8f28c6d
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\wardrobe-neutral.log: 5672; 0530225a87f7707a79bcd2e656edda94f37890b39f3811802052985885215e0b
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\wardrobe-max.log: 5600; 83fa6e2056250b7033e2ad1c8bdbd451de5dc79142ec4b699ea766df279a2dc4
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\lookdev-filmic.log: 5852; 352c63298cde49789e0e77a566e9c3efe93bba80680f9867afd5976a8e014439
- docs\audits\BF_AVATAR_SHIRTLESS_20261125\lookdev-neutral.log: 5870; f1f857baa9b482bf0dc603598e60448b11092d1b3fc306a314bd3521d112114b
