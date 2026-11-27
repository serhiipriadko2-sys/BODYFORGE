# BODYFORGE — metric skin gradient review, 2026-11-27

Status: implemented and verified locally in the opt-in development preview; AAA acceptance PARTIAL. No commit, push, deployment, or real player-save modification. Scope: surface shading, not new anatomy or new mesh.

## Rationale and method

- Blender 5.2.0 LTS, original GLB and existing scan-derived 256x256 tile. The old 24x24 UV repeat has area-equivalent median physical tile widths of 46.21 mm (face), 68.60 (torso), 101.40 (upper arm), 114.44 (forearm), 82.51 (hand), 123.33 (calf), 89.57 (thigh). See uv-measurements.json for triangle counts and quantiles. These are area-equivalent widths, not biological pore diameters.
- New development-only metric field: 45 mm repeat in bind space, artistic 1 mm full-range height scale. Original height R, signed gradient GB, second moment A; periodic central differences, bounded slopes, mip-filtered variance. Independent raw PNG decode matched all 65,536 packed texels; FNV1a 624768ed; SHA-256 4bccf6e5a656428e263f1ca92615352a5a3ce74b500e8375877a10d1bf7860cf.
- Original bind positions and normalized normals copied once, 69,871 vertices, 1,257,678 bytes. Surface gradients transform into the posed view-space tangent plane and preserve skin attachment during growth. Three triplanar samples with explicit texture gradients; bounded roughness adjustment from unresolved slope moments. Existing macro normal, diffusion, rig, clothing, and source geometry retained. No added polygons, new texture network requests, or render pass.
- Existing texture credit: Lee Perry-Smith / Infinite-Realities, Infinite 3D Head Scan, CC BY 3.0; see public/assets/athlete-scan-source.md. No donor mesh or additional donor texture imported.

Research references: Epic Games MetaHuman documentation, Materials and Textures; Epic Games Creating Human Skin; Morten S. Mikkelsen, Surface Gradient-Based Bump Mapping Framework, JCGT 9(3), 2020 (https://jcgt.org/published/0009/03/04/); Google Filament material documentation (https://google.github.io/filament/Filament.html); ANGLE hardware backend documentation. These motivate the approximation; they do not establish clinical calibration or AAA equivalence.

## Evidence

- Targeted suite: 22/22 (initial run; full final suite includes the corrected hash helper). Full final suite: 1,214/1,214 tests, 117/117 test files; final build exit 0. See full-vitest.log and RECEIPT.json.
- Five software WebGL runs (SwiftShader): on-max 50, off-max 44, on-neutral 50, off-neutral 44, missing source fallback 45; total 233/233. Six frames per scenario.
- Separate hardware QA script: 51/51; six frames. Actual canvas renderer: ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002488) Direct3D11 vs_5_0 ps_5_0, D3D11). No software fallback. All 579 observed metric draws across enabled software and hardware scenarios sampled the expected packed tile (including reload). Zero mismatches.
- Synthetic game bytes unchanged in passing scenarios, no uncaught browser exceptions. These are instrumented functionality checks, not independent performance benchmarks.
- Comparison: four sheets and comparison.json, 12 paired camera views; left = original UV detail, right = metric gradient. Close view: visible increase in skin texture, particularly under lateral illumination; at full body scale the change is modest. Some texture looks too coarse/directional; regional artistic tuning remains open. No pixel-delta statistic is a realism score.
- Production build passed after fixing a test helper's TypeScript ArrayBufferView typing; source bytes converted via explicit Uint8Array view. Review markers absent from production JS. Existing bundle-size warning remains.
- First browser attempt failed on an incorrect assumption that initial yaw was zero; measured initial yaw and checked angular difference instead. First-attempt logs and screenshots retained. No successful test assertion was removed.

## Local review

New: http://127.0.0.1:5173/?avatarScanTorso=1&avatarScanTorsoColor=1&avatarScanTorsoNormal=1&avatarAthletic=1&avatarSkinDiffusion=1&avatarHeadVolume=1&avatarGroomV3=1&avatarBuzzSurface=1&avatarMuscleRelief=1&avatarMetricSkin=1

Baseline: same URL without avatarMetricSkin=1. The metric review flag is development-only and loopback-gated; no default production change.

## Open acceptance gates

Physical Android: ADB executable present, zero authorized Android devices; not verified. Desktop hardware smoke passed; no FPS or mobile memory benchmark. Physical pore height not measured; same cheek source tile reused, not authentic region-specific scanned skin. Full-body anatomy, collision checks, regional material calibration, independent visual approval and scan-related asset licensing remain open. No claim of zero defects or final AAA realism.
