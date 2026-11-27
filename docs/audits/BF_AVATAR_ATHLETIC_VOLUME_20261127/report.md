# BODYFORGE athletic volume review - 2026-11-27
Status: technical PASS for scoped opt-in deformation; artistic acceptance PARTIAL (not AAA, not production). Local worktree, HEAD 5ef0bb170cfa411e5c9bf8be95739c6e85104d1e. No commit, push or deployment.

## Implemented
- Added a distinct athletic growth field for the existing arms/core/legs/back levels, with C2 radial profiles on actual measured bind-pose limb axes and broader chest/back envelopes; reduced localized rectus peaks. Independent gameplay groups and rest asset retained.
- First candidate rejected: 88,428 violating vertex-level states (including negative Jacobian). Revised compact cubic radial falloff and medial fade; final field passed all 93,757,824 vertex-level states (29,966,112 explicitly evaluated, others identity), 72,344 vertices across five actual raw meshes, 1,296 combinations. Min determinant 0.30367004436702055, max displacement 35.76648621736846 mm. This is a sampled bind-space gate, not a global collision proof.
- Finite-difference derivative QA: 10,200 directions, max error 1.6793211821131138e-9. Paid-level tests independently exercised all four groups at levels 1-5 on the actual posed rig; reset exact, no profile mutation, UV/index/weights retained.
- Targeted Vitest 22/22. Full Vitest 1,186/1,186 across 111 files. TypeScript + Vite build PASS after correcting test tuple syntax. Review profile and local scan textures excluded from production JS. Git diff --check PASS.
- Browser final scenarios: 171 passing assertions, 18 actual screenshots. Clothing visibility and real skin/shorts draws tested on front/rear torso and legs. Synthetic saved game bytes unchanged. The four neutral torso frames match the previous scan-complete review byte-for-byte.
- athletic-max: 57 assertions; 6 screenshots.
- athletic-neutral: 57 assertions; 6 screenshots.
- reference-max-final: 57 assertions; 6 screenshots.

## Visual judgment
The new maximum level is visibly broader at the upper arms, forearms, thighs, calves and chest. However, the forearm taper is excessive in volume relative to the upper arm, and several limb forms remain too rounded. These are artistic limitations, not evidence that the final goal is achieved. Retain the candidate as an optional dev-only review, not the default.

## Limitations and errors encountered
- Initial field rejected before integration. TypeScript rejected a spread expression in the test; corrected.
- First browser reference run used a torso-specific nipple-draw requirement in the legs camera. Corrected the QA condition to require actual bare-body and shorts draws with no shirt/covered-skin draws. Second run timed out during document startup; bounded the document-load allowance for this review and preserved failure logs. Passing scenarios still require actual load and actual draws.
- Additional section-measurement and Blender-export command was blocked before execution. No measured circumference results and no new athletic Blender scene claimed. Existing scan-torso-textured-review.blend is unchanged.
- Physical Android performance, complete posed-triangle intersections, clinical validity and AAA artistic quality remain unverified. Existing bundle-size warning and scan-license review remain open.

## Review URLs
Previous experimental: http://127.0.0.1:5173/?avatarScanTorso=1&avatarScanTorsoColor=1&avatarScanTorsoNormal=1
Athletic experimental: http://127.0.0.1:5173/?avatarScanTorso=1&avatarScanTorsoColor=1&avatarScanTorsoNormal=1&avatarAthletic=1
Stable: http://127.0.0.1:5173/

## Next quality gate
Replace excessive rounded forearm/calf expansion with proximal anatomical taper, compare against licensed neutral and athletic reference scans, validate clothing intersections in posed states and verify physical Android frame times. Do not equate larger displacement with realism.

## Research basis
Pratscher et al., Outside-In Anatomy Based Character Rigging, SCA 2005.
Roussellet et al., Dynamic implicit muscles for character skinning, Computers & Graphics 2018, DOI 10.1016/j.cag.2018.10.013.
Lewis et al., Pose space deformation, SIGGRAPH 2000, DOI 10.1145/344779.344862.
These inform the geometry approach, not the particular artistic coefficients or a claim of physical simulation.