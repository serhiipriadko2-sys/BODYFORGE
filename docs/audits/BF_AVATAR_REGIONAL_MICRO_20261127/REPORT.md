# BODYFORGE — regional microrelief review, 2026-11-27

Status: PASS_LOCAL_TECHNICAL / PARTIAL_AAA. Local development-only opt-in. HEAD 226429ae1080d000336a7430926d64e4bb54a89b at verification; unrelated working-tree changes retained. No commit, push, deployment, production-default promotion or owner-save edit.

## Rationale and implementation

The previous metric-gradient review retained a single cheek-derived tile and generated excessive visible microcontrast on parts of the portrait. The new regional profile is an artistic calibration, not measured regional skin scans. Two normalized bytes per immutable bind vertex: slope amplitude and sampling-footprint bias. Compact smooth regions for the cheek, nose, eyelid, ear, forehead, chin, neck, shoulder, chest, back, elbow, forearm, wrist, hand, knee, shin and calf; left/right mirrored. No new asset, polygon, draw pass, network fetch, or bump-map lookup. Existing three triplanar textureGrad samples retained. Filter footprint multiplies only texture derivatives, not the geometric Jacobian. The direct diffuse approximation uses the mesoscopic normal captured before the pore gradient; direct GGX specular retains the final normal. Indirect lighting and the existing Fresnel factors remain unchanged. No claim of a physical BSSRDF or a measured skin BRDF.

Research: Mikkelsen, Surface Gradient-Based Bump Mapping Framework, JCGT 9(3), 2020, https://jcgt.org/published/0009/03/04/ ; Measurement-based synthesis of facial microgeometry, SIGGRAPH 2012, https://doi.org/10.1145/2343045.2343057 ; USC ICT, Skin Microstructure Deformation, https://vgl.ict.usc.edu/Research/SkinStretch/ ; Epic, MetaHuman Materials and Textures, https://dev.epicgames.com/documentation/metahuman/materials-and-textures ; Filament materials, https://google.github.io/filament/main/materials.html . These support separation of scale, regional appearance, and filtered specular response, not the chosen numeric amplitudes.

Existing source: Lee Perry-Smith / Infinite-Realities, Infinite 3D Head Scan, CC BY 3.0; public/assets/athlete-scan-source.md. No added donor asset. Prior scan-related licensing questions remain unresolved.

## Verification

- 5 new tests; targeted suite 23/23, full suite 1,219/1,219 in 118 files. TypeScript + Vite build exit 0 into .bodyforge-qa/regional-micro-build-20261127, no new or previous review markers in production JS. Existing chunk-size warning remains.
- Real rig: 69,871 skin vertices, 139,742 bytes; 18,695 exact coincident duplicate positions share identical profile bytes. Tested zero, mixed, maximal and reset paid levels; immutable metric coordinates, UVs, weights and index preserved. Synthetic game bytes unchanged in passing browser scenarios.
- 6 browser scenarios: hardware regional-max 56, hardware metric-max 53, software regional-neutral 55, software metric-neutral 52, software missing-source fallback 46, hardware no-diffusion 56. Total 318 checks, 36 actual PNG screenshots. Real RTX 3070 D3D11 renderer verified in the hardware scenarios. 576/576 observed regional draws used the normalized two-component UNSIGNED_BYTE attribute and correct packed metric texture; 970/970 total observed metric draws used expected texture. All three live regional buffer hashes identical across enabled neutral/max, reload and no-diffusion. No uncaught browser exceptions in passing runs.
- Four matched image sheets, 12 paired camera views. The regional version reduces the excessive lateral-light texture, particularly on shoulder and upper chest. In eight fixed interior screenshot crops, local neighboring-pixel RMS decreased by about 8–44%. This is a descriptive decoded-image contrast statistic, not calibrated radiance, biological pore scale, or a photorealism score.
- Disabled regional flag: against the prior review, 10/12 PNGs are byte-identical; remaining two contain only 3 and 1 changed pixels respectively, maximum 1 of 255 per channel. Exact parity not claimed. Baseline parity log retained.
- Browser failure mode: blocked source tile returns to prior material with no metric or regional shader. No-diffusion hardware smoke uses a derived QA script, changing only expected diffusion predicates in the metric branch.
- Source paths and evidence files hashed in RECEIPT.json, with read-back. Existing source backups allow scoped rollback without overwriting concurrent changes; compare hashes before rollback. Audit directory HTTP 403, standard dev preview not replaced.

## Local review

New: http://127.0.0.1:5173/?avatarScanTorso=1&avatarScanTorsoColor=1&avatarScanTorsoNormal=1&avatarAthletic=1&avatarSkinDiffusion=1&avatarHeadVolume=1&avatarGroomV3=1&avatarBuzzSurface=1&avatarMuscleRelief=1&avatarMetricSkin=1&avatarRegionalMicro=1

Baseline: same URL without avatarRegionalMicro=1. New flag requires existing metric review; both development-only and loopback-gated.

## Remaining acceptance

The portrait is less coarse, but still visibly a game character. Facial anatomy, shoulder/neck and other large-scale forms, regional measured source detail, hair/eye/cloth fidelity, dynamic collisions and independent visual approval remain open. No hardware frame-time benchmark; physical Android: ADB available, zero authorized devices. No final AAA, mobile performance, or zero-defect claim. The material is a review candidate, not an accepted production default.
