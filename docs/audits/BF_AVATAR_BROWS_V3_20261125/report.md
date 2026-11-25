# BODYFORGE - directional fitted eyebrows V3

Date: 2026-11-25. Status: locally implemented; targeted verification PASS; PARTIAL toward AAA.

## Scope
- Blender authoring uses the actual pinned Face V2 surface. 1120 stratified tapered ribbons instead of 840 mostly upward ribbons. Variable direction, thickness, length and curvature; lower root lift and reduced surface separation. One existing skinned mesh; no new draw call, texture or rig. V3 has 7840 exported vertices and 5600 triangles; V2 had 7545 vertices and 2520 triangles. V3 asset 285860 bytes, V2 257884 bytes. Original GLB and V2 donor retained.
- V3 is preferred; incompatible or failed donor falls back to V2, then original rigged brows. Bounds, metadata, index, normal, colour and original head weight checks precede adoption. Preserves selected dye and existing skeleton/bind. Geometry is a real-time ribbon approximation, not a full strand simulation.
- Anatomical and rendering references: https://doi.org/10.1007/s40257-022-00729-5 ; https://dev.epicgames.com/documentation/en-US/metahuman/controlling-metahuman-levels-of-detail-lods ; https://docs.blender.org/manual/uk/5.2/modeling/geometry_nodes/hair/generation/interpolate_hair_curves.html

## Verification
- Blender 5.2 export and glTF read-back PASS. Authored all-vertex nearest signed gap 0.06005 to 0.30967 mm. V2 authoring lift specified 0.48 to 0.68 mm; this is a comparison with previous authored lift, not an independent measurement of old nearest gap. Mean projected hair slope medial 0.81775, lateral -0.20193.
- Targeted Vitest: 5 files, 12/12 tests PASS. 118 sampled donor vertices, 10 growth/blink states, maximum sampled distance to the matched body triangle 0.30472 mm. Actual skeleton and bind retained; tint, rest geometry, old fallback adoption, invalid donor rejection, face/eyelash and paid growth regressions passed. Not a full collision or facial-expression simulation proof.
- TypeScript and Vite build PASS; existing large chunk warning remains (Avatar3D 832.30 kB / gzip 235.26 kB). First browser run timed out because the draw instrumentation still expected the old index count; corrected QA instrumentation to observe both 7560 and 16800 indices. Final new and fallback browser scenarios each passed 16 explicit assertions, exit 0. Actual indexed skinned V3 draw, blocked V3 request and actual V2 draw, portrait and turned views, silver selection, all muscle groups level 5, exact synthetic game bytes unchanged, no uncaught browser errors.
- Five actual app screenshots and two matched portrait comparison crops. At threshold summed RGB difference >=15, frontal 558 changed pixels, turned 439; mean absolute per-channel difference 0.28984 and 0.22865. Visually inspected both pairs: more coherent brow shape and less detached stippling; the tail is still narrow and graphically defined. No AAA equivalence, larger facial anatomy redesign or physical Android performance measurement established. Full suite not rerun.
- Local work only, no owner save mutation, commit, push or deployment. Other local changes preserved.

## Receipts (path; bytes; SHA-256)
- scripts/author-avatar-brows-v3.py: 5307; e6d8aae7c19b777332feb2afc75bd2ae043f108d5585a60aaaec3dae14a80a23
- src/lib/avatarBrows.ts: 4560; 73dd8702759a93eed6c9cec27d17cf60537e8b40d8086036564692a42157e250
- src/lib/avatarBrowsV3.test.ts: 6089; df0f4a64bb2cf69f440ceb0e78359bb007a4d2324a1292aebb589f659b6344b3
- src/components/Avatar3D.tsx: 60130; 061a92a3f4e3a88b51dd915d741f9cf9801ebcd9cda5cd34eedf103f843e9679
- qa/avatar-quality-e2e.mjs: 103720; f9b008d9eb22a49bfbeb4a333b7ded4536ea105dfa225528f0a02b52140f62a2
- public/assets/bodyforge-brows-v3.glb: 285860; 57ebb9ddeab1b5cfd43c9efc89348a931e3aef64fd7c2af663c4baf58316b98e
- public/assets/bodyforge-brows-v2.glb: 257884; dde831c44d835a7c6e078cba6d1654f0f4cd8b9833581985ca87c88ac9302bad
- public/assets/bodyforge-athlete-efficient.glb: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- brows-fallback-front.png: 562509; b47eda732188e4667e14114a540bdd094afbd350868a7cb2a69264392b51be02
- brows-fallback-turned.png: 576464; a1da1ac17a2f80bd1674394bec1f830a61dcbf8eff23d43962da224b87c8dba8
- brows-new-front.png: 562452; af4fbcd517f972463cae93b73ea31d77919dd1fc4baf7fe52d07b3d0e67743e0
- brows-new-silver.png: 584387; 20a51fb54c812068637e1f29d2ae4950c3e04704fc31444e175b9a110a94eb57
- brows-new-turned.png: 576372; 9020b59ccaa666a114f4b6124d4196cab773d408b9ad7d2d10fd8b7294fe0d2a
- comparison-front.png: 129764; 1e8276a6306208b6be55821edf57ac791ecb8d3cb8d18762fd39c77d9e501b71
- comparison-turned.png: 115394; 127dfa7bd5c3ee5232dbe8b672d7271ee31a170f4125a6c35c987f391446b821
