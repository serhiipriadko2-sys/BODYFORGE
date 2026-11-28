# BODYFORGE V9 - neutral face repair and offline eyelid candidate

Status: PARTIAL, local V9 verified; blink remains offline at this checkpoint.

Preserved V6 asset pins and all 33 growth channels, V8 gaze, 15 zones x 12 points, 3 starting shapes. No source GLB, saves, or owner profile changed.

Research: Realistic Eye Motion Using Procedural Geometric Methods (Pinskiy & Miller, Disney Animation), https://media.disneyanimation.com/uploads/production/publication_asset/66/asset/realisticEyeMotion.pdf ; Blender Studio Creating Facial Shapes, https://studio.blender.org/training/realistic-human-research/creating-facial-shapes/ ; Detailed Spatio-Temporal Reconstruction of Eyelids, https://studios.disneyresearch.com/2015/07/27/detailed-spatio-temporal-reconstruction-of-eyelids/ .

Neutral diagnosis: 23 original face pairs (15 left lid, 8 lips). Local separating-axis solver failed gate; nearest-coordinate reflection had ambiguous mappings; exact quad edge propagation matched 42342 vertices and 42340 faces with zero conflicts. Clean counterpart is used as normal reference because one original triangle was reversed relative to counterpart. Selected six-ring reflection, 319 master vertices moved, max 1.9915 mm. Zero facial/new pairs on master and actual Float32 export. 222 preexisting foot contacts remain.

Actual export skin: 511 changed positions, 705 corrected normal rows, all outside paid fields, unchanged UV/indices/weights. Runtime parity across six forms and rigid head pose checks; exact position match, normal error below 2e-7. All 30 gaze cases pass pupil visibility. Matched portraits and diagnostic close-ups show localized differences, not new photorealistic face.

Blink research: after repairing neutral source, endpoint area projection and coupled area/globe-clearance solve yielded first acceptable sampled 21-knot trajectory. 41 states, no new master selfpairs, minimum triangle area ratio 0.325045, max remaining sampled globe visibility 2.69%, zero exposed pupil rays and no newly penetrating previously separated vertices per five sampled gaze constraints. Actual exported head triangle screen 81 interpolation samples, no new pairs and min ratio 0.325048. Existing internal socket contacts not classified as errors; sampling not exhaustive collision certification. Offline binary created but NOT used by V9.

Browser tests: 1306 progression and UI, 540 purchases; 88 live motion, 14 exact runtime repair, 15 app portrait, 5 close-up checks. 92 screenshots; synthetic disposable profiles. Test Files  134 passed (134); Tests  1301 passed | 1 skipped (1302). TypeScript and production build passed, dev-only marker scan clean. Chunk-size warning persists.

No production promotion, commit, push, APK, or physical device acceptance. Remaining: install and visually validate blink runtime, photoreal skin/brows/hair/lashes, foot repair, full-body motion and cloth, physical Android. Preview: http://127.0.0.1:5197/?avatarFoundation=9&avatarFoundationRelief=1 .
