# BODYFORGE - scalp root density transition

Date: 2026-11-25. Status: locally implemented; targeted tests and maximum-growth browser comparison passed; fallback browser scenario incomplete. PARTIAL toward AAA.

## Scope
- The existing Blender-authored layered-v2 hair donor is unchanged. A normalized one-byte per-vertex scalp fraction matches its authored ellipsoid and irregular boundary. On the pinned body, 815 vertices are in the interior and 281 in the transition. Non-body skin primitives receive an inactive field. Original skin weights, topology, UVs, muscle envelopes and skeleton are unchanged.
- The existing skin shader mixes local hair color into the diffuse response and increases root roughness with a smooth bounded mask. It is enabled only for installed layered hair when crop/swept is selected, and disabled for buzz and legacy fallback. No additional texture, mesh, draw call or external runtime resource. This is an artistic color/density approximation, not a strand simulation.
- Sources: https://dev.epicgames.com/documentation/metahuman/mh-groom-hairstyle-generator ; https://dev.epicgames.com/documentation/en-us/unreal-engine/hair-rendering?application_version=4.27 ; https://jansenturk.artstation.com/projects/3oZZDo ; https://threejs.org/docs/pages/Material.html

## Verification
- Targeted Vitest: 7 files, 22/22 tests, exit 0, including skin, groom, face bake, and real growth pipeline. The initial test TypeScript tuple-spread diagnostic was corrected without changing the test's intended assertions.
- Production build: TypeScript and Vite exit 0. Existing >500 kB bundle warning remains; Avatar3D 831.54 kB, 235.00 kB gzip. Previous profileReplacement TypeScript error not reproduced in this build; unrelated profile code was not edited in this pass. Full repository test suite not run.
- BODYFORGE_QA_SCALP_DENSITY=max: 17 assertions, exit 0. Real linked skinned shader and its uniforms observed; same-camera before/after frames captured by QA-only temporary uniform override, immediately restored after each draw. Silver dye, buzz disable, swept enable, maximum growth and exact isolated game save verified; no uncaught browser exceptions. Later QA instrumentation was gated to the relevant mode only; max scenario ran before that QA-only gating change, which leaves its active behavior equivalent.
- Fallback attempts: both exit 18, timed out at upstream detailed-asset/readiness checks before the scalp fallback could be verified in-browser. Unit tests verify inactive uniform behavior. Cause not established; do not report full browser PASS or live fallback proof.
- Matched portrait crop [300,640,220,290]: summed absolute RGB difference >=15 in 1349 frontal and 1091 turned pixels; mean absolute per-channel difference 0.81338 and 0.71257. Below y=760: 3 and 0 pixels above threshold. Both paired images inspected: softer hairline and less contrast of detached fringe dots. Some stippling remains; face and hair are not photorealistic. No new Blender sculpt was created this pass.
- No physical Android performance measurement, full collision proof, commit, push, or deployment. Existing unrelated changes preserved. User game data not edited.

## Receipts (relative path; bytes; SHA-256)
- src/lib/avatarScalpDensity.ts: 4360; 868da5ed5517bfc7969e5e8986948b91e2c9f018b15b5361d07e4d4d8dcd5247
- src/lib/avatarScalpDensity.test.ts: 4182; 52ddd93a9c78151213c73fcedcdd6f5175ac8e0b61e9e30341868be8d125be9a
- src/lib/avatarSkinLighting.ts: 4151; 696cea45569eec3f5bf848e3d76bacd8df98844f388045b7955d9b6c449ed6fb
- src/components/Avatar3D.tsx: 59392; 8dcfd48b0a46cc221f6ac2957463af849975b0503cb2d03a2a230d2f0aa31914
- qa/avatar-quality-e2e.mjs: 97297; 1d24c091f088f83d829ddd1088056e481c90429703bc2d6a5ebd7c0d190f8a09
- public/assets/bodyforge-athlete-efficient.glb: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- public/assets/bodyforge-strand-groom-v2.glb: 805772; 1f1d2d3d40a043bfbebf185be3614854588f755d1ce3028e3498976436714bc1
- comparison-front.png: 132746; 1d41b03e179b31d44c3182281bfef942ea49d2485b81c804829823f21b3652cb
- comparison-turned.png: 117613; 2cf9afeb800b705916276bf884332032b3b11a8408376d117c52cc0439b08488
- scalp-max-after-front.png: 562550; 779892331b0f797ddfaaf33508ada809be0a28fa40d1a226e61060eb733bc5b5
- scalp-max-after-turned.png: 576475; 2868f88f9da7c61b3ff97e5ccc1be228e1f4484319163b49061e0e75a2378119
- scalp-max-before-front.png: 562837; 83b85f9ba9ce909dc5e4b6e10b519c5afc69308ee16c999b31327a7869e8e471
- scalp-max-before-turned.png: 576652; b9aa4c92af21b9534261bcc316b5fca87498ac683f192e782b775b348cb800ed
- scalp-max-silver.png: 584539; e0342b3c3cb78ca65fa207a2083dd805a10e98db4a4855fc7c484dc5d66d1bfe
- scalp-max-swept.png: 585567; e09a1d1b2be8ea00367e7d9d642a6bf3bf05dd5d15cc2ea1727960daaf4c6a5f
