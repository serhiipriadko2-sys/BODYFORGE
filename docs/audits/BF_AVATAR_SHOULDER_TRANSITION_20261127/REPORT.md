# BODYFORGE — shoulder transition review, 2026-11-27

Status: PASS_LOCAL_TECHNICAL / PARTIAL_AAA. Local development-only, loopback-gated review. Original GLB unchanged. HEAD 226429ae1080d000336a7430926d64e4bb54a89b; unrelated worktree edits retained. No commit, push, deployment, production-default promotion or owner-save edit.

## Investigation

Actual CPU-skinned vertices from the pinned 65,895-vertex body were inspected in Blender 5.2.0 LTS. The shoulder region uses original triangle centroids with abs(x) in [0.10, 0.34] m and y in [1.25, 1.49] m; excludes degenerate bind triangles (cross magnitude < 1e-10). 5,994 triangles. Area ratios are posed cross magnitude divided by original bind cross magnitude. Strong compression means ratio < 0.55; severe means < 0.25. These are engineering thresholds, not clinical or anatomical measurements. At neutral original pose 124 compressed; some individual triangles in grown states fall below ratio 0.10. Exact coincident duplicate positions did not separate in the initial diagnostic; the fault is not simply a UV split.

Seven angle trials, nine initial weight/pose combinations, and ten additional collision-sweep combinations. Blender Corrective Smooth (6, 12, 24, 40 iterations, .55 factor and 12 mm displacement bound) worsened compression counts and was rejected. Aggressive weight smoothing (24 iterations, blend 1) rejected the shirt contract. Initial 26-degree closure + 16 iterations/.85 blend reduced aggregate compression but worsened worst shirt depth during idle and several overlap counts, so it was rejected as the final choice. Original GLB and ordinary runtime remained intact during experiments.

## Selected implementation

22-degree closure instead of 34 degrees (a 12-degree opening of each upper arm relative to the existing athletic pose). Upper-arm angle from vertical in unscaled neutral rig is approximately 18.8 degrees instead of 6.8. Wider stance is an explicit artistic tradeoff, not a physiological claim. Local topology-graph smoothing of skin weights: 16 Jacobi steps, bounded spatial mask, .85 blend, four joint influences, exact 65,535 normalized integer sum for edited vertices, maximum total-variation bound .25. Welded graph for solver only; no welding or vertex/UV/index changes to runtime mesh. 4,175 body and 1,923 shirt vertices changed; emblem and nipples untouched. Both candidates prepared before any mutation. Original full body index retained only for opted-in review, before normal wardrobe partition. Runs once before growth and idle capture; no new per-frame pass, asset, or network request. Existing sculpt/growth functions unchanged. Original asset SHA-256 verified.

## Final installed-candidate measurement

Independent Blender BVH measurements on exported actual CPU-skinned mesh of final installer, with original body, repaired shirt, emblem and nipples. Seven paid profiles (neutral, each of four groups at level 5 independently, mixed, all-max), three max-growth idle samples at 0.8, 2.1, 4.2 seconds; reset excluded from aggregate totals. This is a sampled test, not exhaustive 6^4 profiles or continuous animation.

| Metric across ten states | Baseline | Candidate |
|---|---:|---:|
| Compressed triangle-state occurrences | 1150 | 709 |
| Severe triangle-state occurrences | 192 | 114 |
| Non-adjacent shoulder BVH triangle overlap pairs | 2248 | 1380 |
| Shoulder-shirt vertex signed nearest surface depth below -2 mm | 351 | 173 |
| Shoulder-shirt vertex signed nearest surface depth below -5 mm | 30 | 3 |

All ten samples have fewer compressed occurrences and no increase in detected shoulder overlap pairs. Neutral overlap pairs 114 -> 0; neutral severe 18 -> 0. Max overlap pairs remain 258 (baseline 260), so not collision-free. Signed nearest surface distances are local clearance proxies, not volumetric penetration proof; worst sampled depth about -5.83 mm for both overall, with some individual max/idle depths slightly worse (up to ~0.35 mm in the all-max state). Emblem maximum absolute nearest-surface signed distance 1.175 mm in both. All four measured meshes return exactly to their neutral positions after growth/idle reset. The source rig remains unchanged on disk.

## Runtime verification

- Full Vitest: 120 files passed, 1,226 passed tests, 1 explicitly opt-in diagnostic skipped; that diagnostic was separately executed and passed. New file includes 4 ordinary tests plus the opt-in sweep. Full suite includes unrelated current worktree changes. TypeScript + Vite build exit 0 into ignored .bodyforge-qa/shoulder-transition-build-20261127; no shoulder review markers in production JS. Existing chunk-size warning remains.
- Four isolated browser cases: on/off at max/neutral, all 64 checks per case, total 256; RTX 3070 D3D11 renderer, not software. 32 actual PNG screenshots, 16 matched pairs, 8 comparison sheets. Verified flag activation/absence and reload, actual regional skin draws with expected buffers, exclusive shirt/skin draw ranges, four intended paid growth levels, synthetic save bytes unchanged, no uncaught browser exceptions. Not an exhaustive app E2E suite or frame-time benchmark.
- Visual inspection: more open arms and reduced compressed shoulder transitions. Remaining max-growth creases, stiff-looking stance, skin/material and sleeve edge defects remain; cannot isolate all image differences to weight changes because pose also changed.
- ADB at standard SDK path: no attached device listed. Physical Android performance unverified.
- No new third-party asset. Earlier scan licensing questions remain open. Local receipt records exact source and evidence hashes; no release or deployment claim.

## Preview

New: http://127.0.0.1:5173/?avatarScanTorso=1&avatarScanTorsoColor=1&avatarScanTorsoNormal=1&avatarAthletic=1&avatarSkinDiffusion=1&avatarHeadVolume=1&avatarGroomV3=1&avatarBuzzSurface=1&avatarMuscleRelief=1&avatarMetricSkin=1&avatarRegionalMicro=1&avatarShoulderTransition=1

Baseline: same URL without avatarShoulderTransition=1. The flag additionally requires the existing relief review, known rig, removable wardrobe and sleeve repair. The default preview is not replaced.

## Remaining acceptance

A real corrective pose-dependent deformation model (rather than simply opening arms), anatomical shoulder/scapula volume and growth-dependent soft tissue, all-level and continuous collision tests, independent visual approval, face/hair/eye/cloth fidelity, mobile frame-time/memory, and licensing are open. This is a verified local review, not final AAA or a zero-defect result.
