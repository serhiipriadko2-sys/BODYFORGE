# BODYFORGE — narrow athletic pose corrective, 2026-11-27

Status: PASS_LOCAL_TECHNICAL / PARTIAL_VISUAL. Local development-only, loopback review. HEAD 226429ae1080d000336a7430926d64e4bb54a89b. Existing worktree edits preserved. No commit, push, deployment, production-default promotion or owner-save edit.

## Research and decision
- Lewis, Cordner, Fong, Pose Space Deformation (SIGGRAPH 2000): example-based corrective deformation. https://www.cs.toronto.edu/~jacobson/seminar/lewis-et-al-2000.pdf
- Kavan et al., Geometric Skinning with Approximate Dual Quaternion Blending (2008): rotation interpolation and volume preservation. https://dcgi.fel.cvut.cz/publications/2008/kavan-tog-adqb
- Le, Lewis, Direct Delta Mush Skinning and Variants (SIGGRAPH 2019). https://www.ea.com/seed/news/siggraph2019-direct-delta-mush
These support the direction of local correction, not the numerical parameters or a claim that the implemented algorithm is the published PSD, DQS or DDM algorithm. No donor assets.

Previous widened-arm review changes actual upper-arm rest pose. This stage uses it only as a virtual target. Seven initial and ten refined offline local target configurations were measured from prior actual skinned samples. Aggressive geometry and normal offsets to cloth caused regressions; rejected. Selected compact smoothly tapered support and 35 mm posed-space correction cap. The actual original joints remain at the narrower athletic pose.

## Implementation
avatarPoseCorrectiveReview.ts: prepare alternative weight candidate without mutating actual weights; evaluate source and virtual local bone transforms (12-degree virtual opening), blend by spatial mask, limit displacement in posed space, map through inverse blended linear transform into bind-space position delta. Transport authored normals using local welded differential geometric normals. The welded graph never modifies runtime topology. Both body and shirt edits prepared before mutation. Guards for pinned rig, required garment repairs, determinant, finite values and correction bounds. Cache per sanitized muscle-level signature; no additional idle-frame solve. Existing base sculpt and bone growth are unchanged. This is a fixed athletic-pose corrective refreshed on growth changes, not a general pose-dependent exercise animation or collision solver. Both review flags requested: new corrective takes precedence, avoiding double application.

New module, two tests, scoped integration and QA changes; backups of component and QA runner in this audit folder. Original GLB, avatarPose.ts, avatarPhysique.ts and previous shoulder review unchanged. No new mesh, polygons, source assets or network fetch. Normal/position attributes are updated on growth changes; no frame-time claim.

## Actual runtime geometry
Pinned GLB loaded into Three.js. Thirteen muscle profiles (zero, four isolated max, mixed, all-max and six intermediate configurations) plus five max-growth idle samples. 18 distinct sampled states; reset measured separately. Four meshes exported and independently measured by Blender. Original 5,994-triangle shoulder region and expanded region include nearby arm surface. Identical skeleton world matrices across enabled/disabled cases; no modification to UV/index/skin weights. Outside mask and emblem/nipple geometry exactly unchanged in the exported samples. Reset to zero exactly reproduces initial neutral positions; repeated same-level calls do not accumulate. The measured maximum posed correction is approximately 35.0001 mm (float precision); max changed counts across samples 6,595 body and 2,081 shirt vertices (distance >1 micrometre).

| Aggregate across 18 states (exclude reset) | Original narrow | Corrective |
|---|---:|---:|
| Triangle-state area ratio < 0.55 | 2070 | 1388 |
| Triangle-state area ratio < 0.25 | 362 | 219 |
| Original shoulder non-adjacent BVH overlap pairs | 4296 | 2772 |
| Expanded shoulder non-adjacent BVH overlap pairs | 5136 | 2772 |
| Expanded-region shirt nearest-surface signed depth below -2 mm | 698 | 338 |
| Expanded-region shirt nearest-surface signed depth below -5 mm | 53 | 8 |

No sampled state increases any of the seven count metrics. Neutral overlap 114 -> 0; maximum 260 -> 258 in original shoulder region. Individual worst depth at max worsens by 0.3494 mm, although aggregate worst depth remains about -5.83 mm. Signed nearest-surface depth is a proxy, not volumetric collision proof. No added gap for 17,397 body duplicate pairs, 88 shirt duplicate pairs, 68 body/nipple rim anchors (19 snapshots incl. reset). Maximum absolute sampled logo distance unchanged (~1.185 mm).

## Verification
- New tests 2/2; first test run exposed missing optional UV on a measured mesh, fixed the test to compare optional attributes. Full Vitest 121 files, 1,228 passed, 1 existing opt-in sweep skipped (previous audit executed it separately). TypeScript + Vite build exit 0. Review markers absent from production JS. Existing chunk-size warning remains.
- Four real browser scenarios: corrective on/off at neutral/max; 66 checks each, total 264. 32 screenshots, 16 pairs, 8 comparison sheets. RTX 3070 D3D11 renderer, not software. Verify enabled/disabled markers, skin GPU draws, wardrobe, reload, synthetic save bytes and no uncaught exceptions. Desktop mobile viewport emulation, not real Android hardware.
- Visual inspection confirms original hand placement and less squeezed shoulder/underarm geometry. Upper-arm and elbow transition looks bowed/less natural in some views; further refinement required. Remaining shoulder overlaps at max, cloth creases, face/hair/eye/skin appearance, arbitrary exercise poses and exhaustive levels remain unresolved. Candidate is not visual AAA acceptance. No physical Android device attached in ADB. Frame-time/memory unverified, prior licensing issues open.
- No canonical production replacement, public release, or GitHub mutation.

## Local review
http://127.0.0.1:5173/?avatarScanTorso=1&avatarScanTorsoColor=1&avatarScanTorsoNormal=1&avatarAthletic=1&avatarSkinDiffusion=1&avatarHeadVolume=1&avatarGroomV3=1&avatarBuzzSurface=1&avatarMuscleRelief=1&avatarMetricSkin=1&avatarRegionalMicro=1&avatarPoseCorrective=1

Baseline: same URL without avatarPoseCorrective. Previous wide review: replace avatarPoseCorrective=1 with avatarShoulderTransition=1. The ordinary preview is not replaced.
