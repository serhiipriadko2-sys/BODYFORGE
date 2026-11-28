# BODYFORGE — arm taper and contour review, 2026-11-27

Status: PASS_LOCAL_TECHNICAL / PARTIAL_VISUAL. Local loopback development previews only. HEAD 226429ae1080d000336a7430926d64e4bb54a89b. Existing worktree edits retained. No commit, push, deployment, production-default promotion or owner-save change.

## Research and diagnosis

The prior narrow-pose shoulder corrective used a spatially localized virtual opened shoulder as a target. It improved shoulder deformation but also displaced distal upper-arm surface near the elbow. Anatomical landmarks inform the longitudinal coordinate rather than treating the entire upper limb as one volume. Sources:
- OpenStax Anatomy and Physiology, 8.2 Bones of the Upper Limb, https://openstax.org/books/anatomy-and-physiology/pages/8-2-bones-of-the-upper-limb
- StatPearls, Anatomy, Shoulder and Upper Limb, Elbow Joint, https://www.ncbi.nlm.nih.gov/sites/books/NBK532948/?report=printable
- Zhu et al., Adaptable anatomical models, Eurographics 2015, https://users.cs.utah.edu/~ladislav/zhu15adaptable/zhu15adaptable.pdf
- ACM SIGGRAPH 2014 course, Skinning: Real-time Shape Deformation, https://www.skinning.org/
These support anatomically localized deformation and caution against bending artifacts. They do not establish numerical artistic gains or physiological accuracy.

Pinned GLB and prior actual skinned samples were verified by SHA-256. Blender 5.2.0 LTS, NumPy and BVH checks on original bind-space triangle regions: 5,994 shoulder, 14,088 expanded, 3,188 elbow-region triangles; 1,288 unique distal control vertices. Ten initial attenuation configurations, nine further contour configurations. Each measured 18 states (13 paid profiles and five max-growth idle samples); reset separate. Count thresholds are engineering proxies.

## Implementation and decision

Two optional modes within existing development-only pose corrective:
- avatarArmTaper=1: uniform longitudinal quintic attenuation, from .50 to 1.10 of bind humerus axis, lateral body gate .21-.29 m. Reduces distal motion but some captured arm contours look too sharply bent.
- avatarArmTaper=2: selected further review candidate, earlier and longer attenuation on outer arm, preserving medial shoulder response. Humerus coordinate from pinned actual bone endpoints; lateral surface factor smoothly varies the fade start .50 to .10 and end 1.30 to 1.50. Quintic smoothstep. Existing 35 mm posed-space correction cap applied before attenuation. Both skin and repaired shirt use the same field. Previous mode remains available for comparison. No changes to actual bone transforms, UV/index/skin weights, GLB, growth algorithms, asset requests or polygon counts. No per-idle-frame correction solve. Artistic parameters, not a medical model or a general exercise-pose solver.
- Scoped edits to avatarPoseCorrectiveReview.ts, Avatar3D.tsx, QA runner and two new tests. Backups of previous and axial-stage versions retained. Opt-in requires avatarPoseCorrective=1; ordinary preview unchanged.

## Independent measurements on actual runtime output

Baseline arrays matched the previous exported samples byte-for-byte; source and new output hashes checked. Geometry exported from actual Three.js rig and independently analyzed in Blender. Same skeleton matrices, unchanged geometry outside mask, immutable UV/indices/skin weights, and exact reset verified by tests. No additional sampled seam separation (17,397 body duplicate pairs, 88 shirt pairs and 68 body/nipple rim anchors; 19 snapshots). Candidate agrees with offline prediction to <0.001 mm.

| Aggregate over 18 states (reset excluded) | Prior narrow corrective | Uniform taper | Lateral contour |
|---|---:|---:|---:|
| Shoulder compression count | 1388 | 1388 | 1388 |
| Severe compression count | 219 | 219 | 219 |
| Expanded shoulder overlap pairs | 2772 | 2772 | 2772 |
| Elbow-region overlap pairs | 0 | 0 | 0 |
| Shirt signed nearest depth below -2 mm | 338 | 337 | 335 |
| Shirt signed nearest depth below -5 mm | 8 | 8 | 8 |
| Mean distal-region RMS displacement, mm | 25.7869 | 10.1822 | 13.4769 |
| Mean correction second-difference RMS, mm | 0.40097 | 0.65037 | 0.47978 |

Displacement and second-difference metrics are separate: the latter measures variations of averaged displacement vectors in fixed bind-space bands, not an objective naturalness score. Relative to the prior corrective, contour reduces mean distal RMS displacement by about 47.7%, but raises the second-difference proxy by about 19.7%; relative to uniform taper the proxy decreases about 26.2%. No count regression or increased worst signed depth relative to the prior corrective in the 18 samples. Remaining collisions are not eliminated; signed nearest-surface distance is only a penetration proxy. Some max states retain overlaps and visible arm/shoulder shape imperfections. Visual inspection of matched actual RTX 3070 front/rear torso images: uniform taper introduces a sharper transition near elbow; contour is a better balance between distal correction and smoothness, though neither is an independent visual acceptance or AAA proof.

## Verification
- Intermediate axial stage: 5/5 targeted tests, full suite 1,231 passed (122 files), one pre-existing opt-in sweep skipped. Four real hardware browser scenarios, 66 checks each, 32 screenshots.
- Final contour stage: 8/8 targeted tests, final full suite 1,234 passed (123 files), one pre-existing opt-in diagnostic skipped; that sweep passed in the previous shoulder audit. TypeScript + Vite build exit 0. Both builds in ignored directories. Review markers absent from production JS. Existing chunk-size warning remains.
- Final contour browser scenarios on RTX 3070 D3D11: max and neutral, 66 checks each, 16 screenshots. Across both stages: six browser scenarios, 396 checks, 48 screenshots. Verify linked regional skin shader draws, normalized profile buffers, wardrobe, reload, synthetic save bytes, and no uncaught exceptions. 16 comparison sheets/32 matched pairs (shared baseline). Browser logs describe stage-specific sources; final full tests exercise all three modes. No real Android device authorized (ADB count 0). No frame-time or memory benchmark. No new donor assets.
- Prior licensing questions, remaining shoulder collisions, anatomical shape, face/hair/eye/skin/cloth fidelity, continuous motion and independent AAA acceptance remain open.

## Local review

Selected contour: http://127.0.0.1:5173/?avatarScanTorso=1&avatarScanTorsoColor=1&avatarScanTorsoNormal=1&avatarAthletic=1&avatarSkinDiffusion=1&avatarHeadVolume=1&avatarGroomV3=1&avatarBuzzSurface=1&avatarMuscleRelief=1&avatarMetricSkin=1&avatarRegionalMicro=1&avatarPoseCorrective=1&avatarArmTaper=2

First taper: same URL with avatarArmTaper=1. Prior corrective: omit avatarArmTaper. All are experimental, development-only.
