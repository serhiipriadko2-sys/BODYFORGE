# BODYFORGE - body skin region response V1

Date: 2026-11-25. Status: local implementation and technical checks PASS; visual AAA objective PARTIAL.

## Scope
- Nine compact bind-space response masks for knees, elbows, shins, calves, forearms, wrists, hands, neck and chest. Existing three-byte normalized vertex attribute is reused; no new texture, shader feature, vertex attribute, draw call, polygon, UV, skeleton, reward rule or save schema.
- Parameters are artistic approximations based on source geometry bounds and bone landmarks; not measured human reflectance, skin thickness or calibrated subsurface scattering. Neck correction fades to the previous head field. Default body field enabled locally; developer-only URL flag avatarBodyDermal=base permits matched comparison. Production does not expose a user preference or save change.
- Sources: https://onlinelibrary.wiley.com/doi/full/10.1111/srt.13292 ; https://dev.epicgames.com/documentation/metahuman/materials-and-textures ; https://threejs.org/docs/pages/BufferAttribute.html

## Verification
- Actual rig: 22296 changed body vertex attributes, 18619 protected head vertices unchanged, ear attribute bytes unchanged, 197685-byte body attribute unchanged in size. Samples: 174 knees, 383 elbows, 235 calves, 9879 hands. Peak channel difference 87/255. Mesh positions/normals/UV/indices/weights unchanged by material installation. All four independent growth states, maximum growth and reset preserve the field.
- Targeted Vitest 14/14 in 4 files PASS. Full Vitest 1110/1110 in 104 files PASS (exit 0). TypeScript and Vite production build PASS; Avatar3D chunk 835.81 kB / 236.55 kB gzip, existing size warning remains. No physical device FPS or loading CPU benchmark.
- Browser baseline and new field on isolated loopback Vite server: 15 assertions each, exit 0, actual regional skin shader draws, normal/skin maps and HDR, torso/legs/turned views, maximum four-group growth, unchanged exact synthetic save, no uncaught exceptions. Six actual screenshots.
- Matched canvas crops: no pixels with summed absolute RGB difference >=15 in any of three crops. Mean absolute per-channel 8-bit change: torso 0.0124257, legs 0.0146744, turned 0.0163438. Leg comparison visually inspected; differences effectively imperceptible at this scale. These numbers measure difference, not realism. Retained the technically verified regional field as a future material foundation; not a claim of visual improvement or AAA equivalence.
- Local work only; no owner save mutation, commit, push, deployment or new Blender asset in this pass. More substantial scan/albedo/geometry or controlled lighting work is needed to close the artistic gap.

## Receipts (relative path; bytes; SHA-256)
- src/lib/avatarBodyDermal.ts: 1775; 5a2b50eaaba459ccb3ce40bed87d29178c9eb57c584e5b2f068bbf2935b5e567
- src/lib/avatarBodyDermal.test.ts: 4808; 31954d85a2e0b817a290152395a6bcc3c2531d462ce99375d50696ce3225185e
- src/lib/avatarDermalRegions.ts: 3799; 9df1d7340cda32f52dc1bfad523084af0c472eb3b4e51fb0bdd001ff16c38e03
- src/components/Avatar3D.tsx: 62095; 95cd90495adeb6eccbf9dc46f02d8a36a315bab5355e71a1fe8c1a146602f766
- qa/avatar-quality-e2e.mjs: 110425; 07a4d2a8058fb3a462e5b9401d153253815a5b6c038910a46f9611c3eaf8e879
- public/assets/bodyforge-athlete-efficient.glb: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- body-dermal-base-legs.png: 593399; 0e6ce4ddfc59fb3cd8a1398f93b70a6601355f0407af86042047605d1c9c6141
- body-dermal-base-torso.png: 585918; ef1b51c8a801db795ca5bc2f9368d57cb84134b137b5ee834fa9c2cdefb13e7f
- body-dermal-base-turned.png: 602189; 8384a7e533c8e236ddc4276e7a0d0212b7aeb89733a0baa817095ac43b97b0e6
- body-dermal-new-legs.png: 593529; d3aed5543883af8073fca55e4cb9bb03509df84edfb216f8a0e845fa0a4c908f
- body-dermal-new-torso.png: 585969; 40ef80f4b677be528dd1f43bd12c03304993cbfc57511f7bb19efe32a44008d8
- body-dermal-new-turned.png: 602554; 655c23a814a60c62b66b75e835349e2523893ac29113ab13e8001035f11d2047
- comparison-legs.png: 512203; 975be5944235035e9820b7989daaa888da2c5b75bd3cef0aa2ac1c0eaa18c10e
- comparison-torso.png: 484400; 244ffd1e627168eb5af50e4a2e41ac10f933629742d34983851afbd7b08f4f3c
- comparison-turned.png: 520274; 4e686093624b37055feee6ac3dc67cab32e76f67446a3a6e65812d83b253834a
- full-vitest.log: 48142; ec6cf230b618b40a5cf441334be4c11b5d62593bdd7441c26105550a976aaa88
- body-dermal-base.log: 3086; 5b030545c3d0cc1fbacd82593590afee500882bca925238fc8fb74d1ee5183d5
- body-dermal-new.log: 3072; c9bdfae8b56b2c897f20f056a3e50c95e5cd6669de91fd0dc7cd13f7efef5a6c
