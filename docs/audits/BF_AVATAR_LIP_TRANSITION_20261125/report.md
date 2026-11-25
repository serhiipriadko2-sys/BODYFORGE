# BODYFORGE - perioral skin transition

Date: 2026-11-25. Local implementation; PARTIAL toward AAA.

## Scope
- The previous portrait and dermal recipes explicitly excluded a rectangular region around the mouth, creating a visible hard pigment/stubble boundary. The new Blender recipe uses the convex projection of the real 2320-vertex lip mesh (49 hull points), protects the lip region, feathers stubble from 1.2 to 7.2 mm outside the projected outline and pigment from 0.8 to 5.5 mm. Reconstructs a bounded mouth neighbourhood from the pinned clean CC0-derived atlas and blends back into the old dermal texture.
- Blender 5.2 generated 2048x2048 sRGB JPEG, 55957 mask texels, 51590 changed linear texels. Pixels outside the mask are unchanged before encoding; JPEG recompression may affect other texels. First bake stopped at the conservative 50000-texel limit; limit adjusted to 120000 and measured region remained 55957 (1.34 percent of atlas). New JPEG 714818 bytes versus old 714509. Source GLB, old atlases, UVs, materials' existing microdetail, skeleton and gameplay unchanged.
- Compatible detailed rig selects the new atlas, validates dimensions and falls back in order to previous dermal, portrait and detail maps. Old rigs retain the base path. Both skin and lip materials share the selected atlas.
- Technical references: https://anatomy4sculptors.com/blog/realistic-human-3d-model-skin/ ; https://dev.epicgames.com/documentation/metahuman/materials-and-textures ; https://threejs.org/docs/pages/MeshStandardMaterial.html

## Verification
- Targeted Vitest 5 files / 21 tests PASS. Tests verify exact pinned JPEG hashes, dimensions, fallback ordering, skin material regressions, real facial geometry and muscle progression. Production TypeScript and Vite build PASS; existing >500 kB chunk warning persists (Avatar3D 831.87 kB, gzip 235.12 kB). Full suite not rerun.
- Actual Chrome QA: new atlas 16 assertions PASS, fallback 16 assertions PASS on isolated retry. Initial fallback attempt timed out at upstream fitted-asset readiness; cause not established. Both successful scenarios used all four muscle groups level 5, selected atlas, actual linked regional/lip shaders, static portrait and turned view, exact unchanged synthetic game save and zero uncaught exceptions. New scenario additionally checked deep skin selection. Fallback scenario blocked the new network request and confirmed the old dermal atlas was loaded.
- Prior-pass versus new matched crops inspected: rectangular border less prominent; improvement local and modest. Final comparison pairs use current fallback and new runs. Counts below quantify pixel differences, not aesthetic quality.
- No change to the geometry of the face itself, no new high-poly sculpt. No physical Android FPS, thermal, or power test. No Git commit, push, or deployment. No owner game data altered. Existing unrelated local edits preserved.

## Final image comparison
COMPARE front changed15=591 meanChannel=0.148103448275862
COMPARE turned changed15=455 meanChannel=0.109169278996865

## Receipts (path; bytes; SHA-256)
- scripts/bake-avatar-perioral-transition.py: 7192; 68d6a576c03173ca89349a0ed218c0e2247177bfa86e3d5ea1a9a15474a480f3
- src/lib/avatarSkinAtlas.ts: 921; 90cb1624648ec49d9ae0e0511a1c4c59ce48259f60353cd79315ebab91e09d30
- src/lib/avatarSkinAtlas.test.ts: 2392; 31f998d5d1d8b57d4de3a645ace8d798ecb2b7d9d0f60e4b8bbb1d824e6df976
- src/components/Avatar3D.tsx: 59570; 25d2ad04bdc5aff70c559aacbafc3ad8ec47961b07b05878f3801483b5be1c4b
- qa/avatar-quality-e2e.mjs: 100434; 3efc2af6667e7a8be5b7094380209e6fb4e272810e63735d34f27b7b36ccf9f7
- public/assets/athlete-skin-perioral.jpg: 714818; 8cb93dfdb95c20fcb73d5eb9b5e3f0f9e636855cf44733074cec259c87eb19c0
- public/assets/athlete-skin-dermal.jpg: 714509; 3d5fd26f0241d9f21097b619421b0cca3352b4398e2bdbb0c67bc08bb0fe14ab
- public/assets/bodyforge-athlete-efficient.glb: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- comparison-front.png: 140172; 6c2389cd54d8b07c4e0619fe344efd497bbe3fdd600fa4dddfa3c0521177f7fe
- comparison-turned.png: 123984; b1874475e84faa01edc3e47f9038802d111f859e55a450bdd8ded5d1a3b35cc8
- final-comparison-front.png: 140172; 6c2389cd54d8b07c4e0619fe344efd497bbe3fdd600fa4dddfa3c0521177f7fe
- final-comparison-turned.png: 123984; b1874475e84faa01edc3e47f9038802d111f859e55a450bdd8ded5d1a3b35cc8
- perioral-fallback-front.png: 562547; 24a07874886a4e0cf4640a0e80ef24eaf60538837fdc17b33df0f5c7b234299b
- perioral-fallback-turned.png: 576475; 2868f88f9da7c61b3ff97e5ccc1be228e1f4484319163b49061e0e75a2378119
- perioral-new-deep.png: 572739; 777df2681f871e60e6b12604b4446ec39d73139258468d316bfff276f8c5ab98
- perioral-new-front.png: 562509; b47eda732188e4667e14114a540bdd094afbd350868a7cb2a69264392b51be02
- perioral-new-turned.png: 576464; a1da1ac17a2f80bd1674394bec1f830a61dcbf8eff23d43962da224b87c8dba8
