# BODYFORGE avatar local context checkpoint — 2026-11-27
Status: technical PASS for this scoped experiment; AAA PARTIAL. Local working tree, no commit/push/deployment. HEAD 5ef0bb170cfa411e5c9bf8be95739c6e85104d1e. Parallel journal/profile changes not edited by avatar work.

## Actual work
- Reproduced the zero-position/nonzero-Jacobian normal regression (normal-before.log); changed avatarPhysique to transform normals and fold gradients on non-identity Jacobian. Regression now passes.
- Exhaustive discrete raw bind-space deformation: 72,344 real vertices, 5 meshes, 1,296 level combinations, 93,757,824 covered states (21,566,736 explicit, remaining identity), zero failures against determinant >0.25 and displacement <50 mm. Min determinant 0.4731525777573089; max displacement 28.876879588249945 mm. Not a global collision or posed triangle proof.
- Local photographic atlas: 2048 square, 353,443 texels modified, unchanged outside transfer mask on reload. Local mesoscopic normal atlas: 1024 square, 67,214 texels changed; 981,362 unchanged; positive Z on changed texels, max decoded angle 16.75508281463 degrees. Existing mesh count, UVs and rig retained.
- Blender scene .bodyforge-qa/scan-torso-textured-review.blend, 13,093,268 bytes, SHA256 9057d807f671e24b45b5676f376dd05108dbe388efc6da0d05c7028638c10b8a. Reopen verified two packed images, 8 shape keys, 24 group/level cases; original review also verified 120 surface/group/level cases.
- Latest full Vitest: 1,175/1,175, 110 files. TypeScript+Vite build PASS, git diff --check PASS. Both local image assets excluded from production output by identifier and byte hash; raw scan and audit routes remained HTTP 403. Both image routes served expected SHA on isolated loopback server.
- Browser: 319 assertions, 32 actual screenshots, across 8 scenarios in two revisions. Synthetic profile bytes unchanged; no uncaught browser exceptions in passing runs. The complete mode selected both atlases and fallback blocked both URLs.
- base-neutral: 40 assertions; 4 screenshots.
- scan-neutral: 39 assertions; 4 screenshots.
- base-max: 40 assertions; 4 screenshots.
- scan-max: 39 assertions; 4 screenshots.
- scan-fallback: 40 assertions; 4 screenshots.
- complete-neutral: 40 assertions; 4 screenshots.
- complete-max: 40 assertions; 4 screenshots.
- complete-fallback: 41 assertions; 4 screenshots.

## Local review
- Stable: http://127.0.0.1:5173/
- Geometry + photo + normal: http://127.0.0.1:5173/?avatarScanTorso=1&avatarScanTorsoColor=1&avatarScanTorsoNormal=1
- Comparison: comparison-complete.png (matched crops, original and complete at 0/20).
- The two generated PNGs are explicitly git-ignored; development flags are off by default. Revert to standard URL; no game save migration or asset replacement.

## Evidence / limitations
Source: Body scan by Artec 3D https://www.artec3d.com/3d-models/body-scan. Original archive says CC BY 3.0 Unported; source web page says 4.0. Preserve both provenance records, review before distribution. No raw scan release, no claim of calibrated albedo, pore scan or full physical SSS.
Quality: real scan residual improves chest/back relief and surface variation, but original stylized base/head, lighting and garments still constrain realism. The experimental maps are not accepted as AAA or a production default. Physical Android performance not measured; adb unavailable. Build chunk-size warning remains. Blender emitted a material use_nodes deprecation warning; no execution failure. Initial normal-integration shell helper conflicted with PowerShell alias and was corrected before write.
Next gate: compare full-resolution matched frames and assess a neutral-pose licensed scan retopology/full-body detail and head/eyes/cloth; verify dynamic collisions and physical Android frame times before release.