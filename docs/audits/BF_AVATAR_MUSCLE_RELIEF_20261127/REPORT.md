# BODYFORGE — muscle relief review V1

Date: 2026-11-27. Status: local experimental geometry implemented and verified; overall AAA acceptance remains PARTIAL. No publication or deployment.

## Scope and implementation
- Added 34 anatomically oriented compact C2 controls (arms 8, core 11, legs 8, back 7). The actual source body was ray-probed in Blender; control radii, signed amplitudes and orientations are artistic settings, not measured clinical hypertrophy.
- Mirrored controls and single midline controls, independent additive contributions proportional to paid levels 0–5, analytic Jacobian. Existing athletic V2 growth, scan, rig, materials and topology retained. Shared field for body, shirt, shorts, nipples and chest mark; existing fitted cloth and normal pipeline.
- Local DEV opt-in `avatarMuscleRelief=1` on top of existing athletic/scan review. No new runtime texture or mesh. No modifications to actual player saves, purchase prices or production deployment. Original asset hash unchanged.
- Local preview: http://127.0.0.1:5173/?avatarScanTorso=1&avatarScanTorsoColor=1&avatarScanTorsoNormal=1&avatarAthletic=1&avatarSkinDiffusion=1&avatarHeadVolume=1&avatarGroomV3=1&avatarBuzzSurface=1&avatarMuscleRelief=1

## Verification
- Actual raw bind-space asset: 72,344 vertices, 5 meshes, all 1,296 discrete level combinations. 93,757,824 covered vertex-states, 29,966,112 explicitly calculated; remaining states covered by identity. Zero failures against local determinant/displacement conditions. Minimum determinant 0.2666533938; combined growth/scan/relief maximum displacement 39.794299 mm.
- Fitted shirt and shorts: 5,983 vertices, 7,753,968 states, zero failures, minimum determinant 0.2552601493 (threshold 0.25). This is a narrow positive acceptance margin, not proof of unrestricted collision safety.
- Finite-difference derivative checks: 408 directions, maximum absolute error 1.550634620e-9. Actual prepared meshes: 76,310 triangle orientation comparisons across selected single-group/combined/mixed states, minimum signed area ratio 0.868155439. Global self-intersection, arbitrary motion and clothing collision freedom are not established.
- Additional relief at maximum: arms 1,103 body vertices >0.1mm, peak 4.3534mm; core 1,367, peak 3.99625mm; legs 698, peak 3.96687mm; back 921, peak 4.1544mm. Combined 4,089 body vertices >0.1mm, 42,348 defined protected vertices unchanged. Monotonic paid levels, exact reset, unchanged profile/indices/UV/skin weights verified.
- Targeted Vitest: 15/15 across 3 files. Full suite: 1,208/1,208 across 116 files, exit 0. Production build exit 0. Experimental code markers excluded after lazy initialization correction; existing large chunk warning remains. Git diff --check exit 0 (line-ending warnings).
- Browser: four paired scenarios, 60 assertions each, 240/240; 24 actual frames, including front/rear torso, shirt and legs. At level zero all 6 paired avatar crops have zero changed pixels; one channel differs by 1/255 at one pixel outside the crop in the full rear-leg frame. At maximum all six paired avatar crops contain changes above 2/255. Visual inspection: modest abdominal and arm definition improvements, overall form still comparatively smooth. Pixel statistics are descriptive, not calibrated realism scores.

## Editable Blender review
Private local file: `.bodyforge-qa/muscle-relief-v1/muscle-relief-review.blend` (9,440,627 bytes). Select BF_Review_Controls, Object Properties → Custom Properties: arms/core/legs/back 0–5, relief_strength 0–1.
- Basis plus 8 keys on each of five meshes = 45 keys, 40 driven non-basis keys. Reopened saved scene: 80 mixed-level driver checks passed, saved shape-key coordinate error 0.
- Independent NumPy evaluation matches exported relief on raw positions with max component error 1.162e-10 m. Blender import nearest-position correspondence max 0.02819mm; relief delta comparison on imported coordinates max 0.002387mm. This is measured correspondence with tolerance, not identical source coordinates.
- Raw bind-pose volume and relief only, excludes scan relief, cloth fitting, pose, bone scaling and runtime materials. Scene is not a full clone of the application.

## Corrections and limitations
- Initial exact text anchor failed before integration writes; corrected. TypeScript unused variable/literal-type errors corrected. Experimental table survived first production build due to eager top-level initialization; lazy initialization fixed and verified.
- Initial Blender rounded-coordinate lookup and 2-micron nearest-position gate failed. Preserved logs. Used nearest-position mapping with declared 0.05mm position and 0.01mm relief-delta tolerance; verified independent field and reopened file.
- Review remains opt-in, not default, because artistic acceptance, licensing for earlier scan assets, real-device Android performance, complete pose/collision coverage and visual quality still require verification. No guarantee of absence of all defects. Next significant visual gate is improved base anatomy and skin detail rather than indefinitely increasing geometric amplitudes.

## Evidence
See field-qc-verified.json, targeted-verified.log, full-vitest.log, build-verified.log, on/off-max/neutral logs and frames, comparison.json, matched-relief-max.png, matched-relief-neutral.png, blender-shape-readback.json, RECEIPT.json. 
