# V28 local technical checkpoint / V29 face diagnostic

Status: PARTIAL - VERIFIED LOCAL TECHNICAL PASS, NOT AAA OR RELEASE ACCEPTANCE.
HEAD: 11d51edf407bed2ad7e1fd0a04332654fe46afcb
Preview: http://127.0.0.1:5231/?avatarFoundation=28&avatarFoundationRelief=1

V28: selected graph30protected upper-arm volume redistribution from V27. Six sparse channels across skin, torso and shirt changed; 126/132 identical. Biceps peak 41.49 -> 36.63 mm; triceps 40.35 -> 36.14 mm (geometric field estimates, not physiology). Editable Blender source reopened; only BICEPS_VOLUME and TRICEPS_VOLUME keys changed on four meshes; shorts unchanged. Five integration files pinned with exact preimages; rollback dry-run passed, not executed. No owner-save modification or deployment.

Validation: 1419/1419 sampled contact cases (473 per build); no new body pairs and no garment intersections in tested cases. Minimum shirt clearance 0.221878 mm; shorts 3.104279 mm. Existing baseline self-intersections and untested states are not certified. Seam 588/588, 544 matched pairs, max added gap 0 mm. Browser 1341/1341, 540/540 purchases, 134 motion assertions, six exact pixel resets and full blink. Unit 1383 pass, one skipped, 143 files. Serial TypeScript/Vite build succeeded; large-chunk warning remains. Route policy 23 checks; 80 production files, no review markers. Previous checkpoint entries: 781 verified without drift using exact per-version preimages.

Groom diagnostic: 20 screenshots, true 4-sample MSAA versus no MSAA; supersampled same-model reference, not a human photo. Retain MSAA and current coverage policy; disabling alpha-to-coverage was not consistently better. First exact repeat attempt failed; avoid redundant resize and quantify repeat variability. Revised maximum hair ROI repeat MAE 0.000106, restored hair ROI identical.

V29 face reflectance: 15 matched captures, two local shader variants, unchanged geometry and draw workload. Normal-incidence baseline reflectance estimate 0.01566; stronger candidate target 0.02778. Torso control identical; no near-white clipping in tested images. Visual inspection: more noticeable forehead/nose shine, excessive microtexture on deep skin tone; stylized eyes, eyebrows and hair remain. No objective calibrated reference or consistent aesthetic improvement established. Do NOT integrate either variant. Diagnostic only.

Issues and limits: initial PowerShell invocation had undefined path variable, stopped owned build process; outside target E:/dist-v28 verified absent. Next parallel build failed Node memory allocation; serial build with process-local 4096 MB heap succeeded. Blender child ExitCode unavailable in wrapper; complete JSON, hashes and logs verified, empty stderr. One existing skipped unit test. Physical Android absent on ADB check. No exercise motion certification, sustained device performance, AAA target or production release. No external asset imports, commit, push or deployment.

Evidence: 124 new PNG captures plus JSON/logs/scripts/source and prior candidate pins. Production manifest separately verified. Receipt inventory is scoped to this checkpoint, not a whole repository audit.
