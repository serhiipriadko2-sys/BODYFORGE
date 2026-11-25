# BODYFORGE — regional dermal response V3

Date: 2026-11-24. Status: locally implemented, targeted tests and two browser scenarios passed; PARTIAL toward AAA.

## Scope
- Three-byte normalized per-vertex field for oily T-zone, thin/vascular tissue response and pore strength. Regional diffuse-wrap approximation, mapped roughness and bounded microrelief preserve the existing PBR shader and scan map. These are authored regional responses, not measured tissue properties or volumetric subsurface scattering.
- Blender 5.2 verified the pinned lip surface and generated a local 256x128 linear packed height/roughness PNG. Second UV channel on the existing lip surface; original albedo UV, positions and skin weights retained. Optional map failure keeps matte lips.
- No new body mesh, texture pass, or per-frame geometry update. The existing body, outfit, hair, eyes, lashes, growth and gameplay schema are retained. Source references: https://dev.epicgames.com/documentation/metahuman/materials-and-textures ; https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-14-advanced-techniques-realistic-real-time-skin .

## Verification
- Blender export exit 0, PNG 48119 bytes, R range 83–149, G range 122–169.
- Targeted Vitest: 4 files, 19/19 tests passed. Real body attribute: 65895 vertices, 197685 bytes; 370 vertices with oil channel >170/255, 3012 ear vertices with scatter channel >150/255. Region attribute and lip UV preserved across maximum growth. Production build exit 0 after correcting Texture.image typing; existing chunk-size warning.
- First browser attempt failed on sequential outfit readiness assertion. Replaced with simultaneous anatomical asset/outfit readiness condition; cause of the initial inconsistent state not conclusively established.
- BODYFORGE_QA_DERMAL_V3=max: 16 assertions, exit 0. Linked regional skin and lip shader draws, actual tone change, all four muscle levels five, unchanged exact synthetic save and no uncaught exceptions. Changed pixels in face and lip-area crops: 5621 and 720, respectively; measures tone response, not realism.
- BODYFORGE_QA_DERMAL_V3=fallback: 11 assertions, exit 0. Both optional response maps blocked, regional skin and fallback lips retained, save unchanged, no uncaught exceptions.
- Final QA script syntax and scoped git diff --check passed after removing trailing whitespace (no behavioural change).
- Inspected the maximum-growth portrait: incremental visual improvement, not a photorealistic face. No full-suite rerun or physical Android FPS/thermal measurement. No commit, push, or deployment.

## Receipt (bytes; SHA-256)
- src/lib/avatarDermalRegions.ts: 3534; 3756f37571eb15088bb966bcdfc57d412022ea32329a1a724cddb0d721d4ea1d
- src/lib/avatarDermalRegions.test.ts: 6066; 68dace4e633da3edbb56933d1ecf96c62b39b095de71ef24a86b2d3e9b08da2f
- src/lib/avatarLipResponse.ts: 2124; 69575620b188391c662698e9208000d6a158b669093cbbd875c0731e41e6802d
- src/lib/avatarSkinLighting.ts: 3647; c2ef7f08f72eb035db30df9d610d7c891a01aa3b3a76c65efdd67055bae98e10
- scripts/bake-avatar-lip-response.py: 2419; d8596670657196a3e0f769b2ed6294ace9ede934afab15d95aa1b287169eeee4
- public/assets/athlete-lip-response.png: 48119; 8a2ca0bb0b5889304cfa03d858c03befb17f900a768b5f9974ddc4608c0ac7fc
- src/components/Avatar3D.tsx: 57857; 4b1e9bb806022cf66ce89f9c0ebba4c35021fa8b77dd97df947a49157be4b413
- qa/avatar-quality-e2e.mjs: 84748; 897a94909440e9aa9259cb8457ca34c03991e194e2d945f7a8c40d7ba015c3fa
- public/assets/bodyforge-athlete-efficient.glb unchanged: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- dermal-max-deep.png: 181367; da4df7ff5c498cd4cc8aa45e4e5b890a0fba35630180e0979adc198860f660c5
- dermal-max-portrait.png: 182951; 7105b77bab7b815217ba13a214762f58b4da921474cca6d40587a84d83da16d0
- dermal-max-torso.png: 196507; b9edc13bab051b7d6f7083bea428f78b6c4d2bfc7da67f20b3739e10bd006491
- dermal-fallback-portrait.png: 187600; 06ee53cb6c42654fd5c1fe895ec096d9a8a296945830a12d68e6c4f2f0d91bf8

Next priority: matched-camera high-resolution visual reference and deeper anatomy/face mesh improvements; realistic proportions and material definition, with measured mobile GPU budget.
