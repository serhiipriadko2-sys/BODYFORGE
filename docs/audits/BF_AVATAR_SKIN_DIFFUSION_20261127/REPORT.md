# BODYFORGE — angular skin diffusion and head scan feasibility

Date: 2026-11-27. Scope: local experimental development, no release. Status: PARTIAL toward AAA; PASS for the scoped implementation and QA.

## Implemented
- New avatarSkinDiffusion.ts, tests, guarded integration in avatarSkinLighting.ts and Avatar3D.tsx, dedicated browser QA modes.
- Normalized solid-angle cap convolution of clamped cosine irradiance, RGB widths, two-lobe mixture, curvature proxy, separate diffuse macro-normal. 129 x 33 RGBA8 LUT = 17,028 bytes. One additional texture lookup per direct light. Texture ownership tied to material disposal.
- This is a local angular scattering approximation, not volumetric SSS or measured human optical coefficients. Artistic widths and curvature scaling are implementation choices. Existing GGX/Fresnel, normal maps, regional skin material, scan bump, independent muscle growth and appearance controls preserved.
- Dev-only query switch avatarSkinDiffusion=1. Build verified that experimental shader marker, query flag and LUT uniform were excluded from production JS.

## Verification
- Targeted Vitest: 21/21, 5 files; full Vitest: 1191/1191, 112 files; npm run build PASS. Existing bundle-size warning remains.
- Isolated browser QA: on 19, off 20, fallback 20 = 59 assertions, 12 actual frames. Instrumented linked shader draw counts: 99 on, 0 off, 90 fallback. Four growth groups at maximum in synthetic state. Synthetic game bytes unchanged. No uncaught browser exceptions. Fallback blocks optional lip and pore maps. Browser software rendering; physical Android GPU, sustained FPS and memory not benchmarked.
- Same scripted viewport crop, off/on comparison: diffusion-comparison.png, rows front/turned, left off and right on. pixel-comparison.json measures decoded normalized Blender channel values; despite its legacy field name meanAbsoluteLinearDelta, no independently calibrated linear-light interpretation is claimed. Visible change is subtle. No numerical photorealism score.
- Original GLB and torso color/normal atlas hashes unchanged. Unrelated worktree changes not edited by this stage.

## Face experiment in Blender 5.2
- Existing Artec body scan source: local-only; source archive marked CC BY 3.0, current source page CC BY 4.0; distribution scope not resolved. No public asset transfer or release. Source photo atlas 8192 x 8192; inspected head/neck region (height cutoff 1.49 m): 92,985 vertices, 185,220 triangles; target region 19,587 vertices, 27,574 triangles. These counts are not complete standalone head meshes.
- Raw head feasibility preview: head-feasibility.json. Donor eyes/hair fused in scan; no replacement of the head, rig, or morphs.
- Offline candidate: manual coarse front alignment, bounded high-pass photo residual, protected eyes/lips/ears and all non-face UV overlaps. 2048 x 2048 candidate PNG: 3,863,925 bytes; 40,143 changed pixels; 53,855 mask pixels; zero changed pixels outside mask after reopening PNG. Existing base atlas preserved. Not calibrated albedo, not independent geometry improvement.
- Compared actual UV projections: candidate effect too subtle to justify promotion. Kept private under .bodyforge-qa/scan-reference-artec; NOT integrated. No claim that this candidate has passed runtime/browser validation.

## Preview
Local Vite server started on loopback 5173. HTML HTTP 200; current shader module and integration marker verified after initial dependency optimization timeout. Browser rendering verification performed on isolated 5201, not a second full rendering run on 5173.
http://127.0.0.1:5173/?avatarScanTorso=1&avatarScanTorsoColor=1&avatarScanTorsoNormal=1&avatarAthletic=1&avatarSkinDiffusion=1

## Decision
Do not claim AAA or project complete. Local shading implementation passed its scope, visual acceptance remains PARTIAL. The next meaningful quality lever is scan-informed head geometry with compatible eye/mouth/ear topology, preserved rig/animation, groom quality and physically credible materials; then on-device performance and visual acceptance. No production deployment, push, or user-save mutation performed.