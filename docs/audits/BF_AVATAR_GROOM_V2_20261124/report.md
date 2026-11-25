# BODYFORGE — layered scalp-fitted groom V2

Date: 2026-11-24. Status: implemented locally, targeted tests and two browser scenarios passed; PARTIAL toward AAA.

## Scope
- Blender 5.2 generated two scalp-fitted haircuts on the pinned CC0 athlete: crop and swept. Each includes a nearly flush irregular cap, 260 directed locks and 384 fine transition ribbons. Each style: 10336 exported vertices and 11854 triangles. Original buzz style retained.
- V2 has bounded local geometry, vertex colour variation and matte opaque physically based shading. It is a ribbon approximation, not a full strand simulation. No new per-frame CPU deformation or texture pass. Original body mesh, growth system, skin, eyes and eyelash rig retained.
- Runtime validates the new donor before adoption. On unavailable/invalid V2, tries unchanged V1 strand model, then existing card fallback. New asset 805772 bytes; previous strand asset 383436 bytes retained. Higher geometry and asset cost require device measurements.
- Sources: https://docs.blender.org/manual/uk/5.2/modeling/geometry_nodes/hair/generation/interpolate_hair_curves.html ; https://jansenturk.artstation.com/projects/3oZZDo ; https://jennyb.artstation.com/projects/4b8vQ2 . These informed layered structure and density; no third-party hair geometry downloaded.

## Verification
- Blender export exit 0, both styles independently bounded. Targeted Vitest 11/11 (4 files), exit 0. Production build exit 0; existing large-chunk warning, Avatar3D bundle 746.66 kB / 203.63 kB gzip.
- BODYFORGE_QA_GROOM_V2=max: 18 assertions, exit 0. Actual indexed V2 draw, crop/swept/buzz switching, silver recolour, maximum levels in all four muscle groups, actual eyelash draw, native idle animation at max growth, motion stop and preserved exact synthetic game bytes. No uncaught browser exceptions. Five screenshots.
- BODYFORGE_QA_GROOM_V2=fallback: 12 assertions, exit 0. V2 network request blocked, unchanged legacy strand rendering, no V2 shader draw, exact synthetic game bytes preserved. One screenshot.
- Previous idle-suite final maximum-growth reload timeout is not reproduced in the focused max-growth scenario. The full previous suite was not rerun and the cause of its timeout is not established.
- Visual inspection of crop, swept, silver and V1 fallback: less glossy shell, finer hairline, more coherent shape. Hairline still contains visible stippling; hair and face remain visibly synthetic. The comparisons use different body-growth fixtures and are not a controlled photographic realism evaluation.
- Full repository suite and physical Android FPS/power/thermal measurements not run this pass. No Git push or deployment; existing unrelated local changes preserved.

## Receipt (bytes; SHA-256)
- public/assets/bodyforge-strand-groom-v2.glb: 805772; 1f1d2d3d40a043bfbebf185be3614854588f755d1ce3028e3498976436714bc1
- public/assets/bodyforge-strand-groom.glb unchanged: 383436; 3c424b36e83abfea646edefde112b7dd04ccfda9f6fd4308a44f29d5529fea9e
- scripts/author-strand-groom-v2.py: 6426; 333a26dd596aa4351586ea66e191f8684887777933ac372ec814e0e8e3941979
- src/lib/avatarStrandGroom.ts: 2375; 0b650d384fa13fb909773b55b45c3775fdc1eff8df4d42ca23f07faa21d8bbab
- src/lib/avatarStrandGroom.test.ts: 2154; be283d9c2058e290268615281ca13674af0f8a09c467236d3a90b41ab1f1ff59
- src/components/Avatar3D.tsx: 56576; dc9215907f62c889b37d73bb47587605272663034782782e82bfdc1778097c42
- qa/avatar-quality-e2e.mjs: 79729; f79fcacef898885ecb8638a8c4aa64e0ce91825f86e619f2285dc749a35db998
- public/assets/bodyforge-athlete-efficient.glb unchanged: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- groom-max-animated.png: 185721; 4bbed3fd4ef6a71aaa858ea744a02a62bd6c2c00503ca97fbb451e4c33328a64
- groom-max-buzz.png: 184090; baeedccc97bf44a19c1ae58853e651c8344d9fb818bba210d9093f480dcd6f33
- groom-max-crop.png: 183605; 8f617efaa4aabd1d68ce634b9a3bfd7db08e157f2a50fb0fe0cfa870e7ab0e94
- groom-max-silver.png: 185972; 124106a72f6cbbba1aa76e78ecf5fd4d58a3c56bd04d0403200771d3eeebdafb
- groom-max-swept.png: 185509; 9e4cc727f3cec0623eb628c7e69a169c9b2be71650d0e6e03829cf0cb6b9204e

Next priority: higher-quality facial skin and lip shading; improve scalp edge transition with a baked density mask and matched-camera comparisons, without increasing mesh cost unnecessarily.
- groom-fallback-crop.png: 189530; 5d1b752de93058aad690796ddde0d23739db499296329495c83b192531d20388
