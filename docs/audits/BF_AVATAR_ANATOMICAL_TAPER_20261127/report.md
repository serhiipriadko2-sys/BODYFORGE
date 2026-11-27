# BODYFORGE anatomical taper review V2 — 2026-11-27
Status: technical PASS for scoped opt-in geometry; artistic AAA PARTIAL. Local working tree, HEAD 5ef0bb170cfa411e5c9bf8be95739c6e85104d1e. No commit, push or deployment.

## Implemented
- Refined forearm and calf geometry growth using asymmetric proximal-to-distal envelopes on the existing measured skeleton axes. Calf posterior gain is stronger than anterior gain; wrist/ankle taper is preserved. Artistic parameters, not clinical growth predictions.
- Deduplicated actual GLB skin vertices (>=60% segment skin weights) measured in proximal/middle/distal axial bins. Before/after mean radial displacement (mm): forearm 9.4905/7.2756, 11.3168/5.8782, 6.0641/1.8073; calf 12.7709/10.4765, 14.0098/8.8790, 6.8243/2.6304. Upper arm and thigh essentially unchanged. These are vertex sample statistics, not girth measurements.
- All 93,757,824 discrete bind-space vertex/level states across five meshes passed the existing local Jacobian and displacement gates; 29,966,112 explicitly evaluated, remaining identity. Minimum determinant 0.30367004436702055. No proof of global collision freedom.
- 23 targeted tests and all 1,187 full tests in 111 files passed; TypeScript+Vite build passed. Development review excluded from production JS. Git diff --check passed.
- Browser: 114/114 assertions in two isolated synthetic profile scenarios, 12 actual screenshots. Correct runtime review marker, real body/garment draws, exact saved synthetic game bytes after reload. At zero growth, 5/6 frames identical to V1 bytes; the sixth differs by one pixel out of 1,316,640 (channel delta 1/255), outside the avatar viewport at x=310,y=1542. No claim that every future render is deterministic.
- New editable Blender scene: .bodyforge-qa/athletic-taper-review-v2.blend; 13,178,310 bytes, SHA256 3d8dc6ffe49bb20c069995f3bebd6797ff6f83114053b878d3dc836ca9b69d79. All five canonical triangle-index hashes match source GLB. Exact runtime deltas applied by verified index on preserved Blender basis (max pre-existing coordinate difference 28.19 micrometres); reopened shape coordinates verified. All 120 independent driver cases passed. Two packed skin maps preserved. Blender is a bind-space authoring review, not the complete posed browser pipeline.

## Visual judgment
Actual browser frames show better forearm taper and less lower-calf bulk while maintaining developed shoulders and thighs. The calf heads and facial/skin realism still limit the result. More volume alone is not a quality metric. Keep this mode optional, not the production default.

## Limitations and errors encountered
- First Blender transfer stopped at an overly strict 2-micrometre position-matching gate. Diagnostic established sub-28.2-micrometre coordinate differences and the same index order. Final transfer required exact triangle topology hashes and a 30-micrometre basis bound, then verified every reopened shape-key coordinate. Cause of original basis difference not proven; old scene unchanged.
- Python PIL absent; pixel comparison and image composition completed with existing System.Drawing instead. No package install.
- Physical Android performance, complete posed-triangle intersections, clinical validity and AAA artistic quality are unverified. Existing bundle-size warning and scan-license review remain open. No user game data modified. Other ongoing journal/profile edits outside avatar scope were left untouched.

## Preview
http://127.0.0.1:5173/?avatarScanTorso=1&avatarScanTorsoColor=1&avatarScanTorsoNormal=1&avatarAthletic=1
Stable: http://127.0.0.1:5173/
Comparison: comparison-taper.png. V1 source backup: athletic-v1.before.txt.

## Research basis
The digital human forearm and hand — https://pmc.ncbi.nlm.nih.gov/articles/PMC6183001/
Dorsal forearm muscles: US anatomy — https://pmc.ncbi.nlm.nih.gov/articles/PMC3552760/
3D characterization of the triple-bundle Achilles tendon — https://pmc.ncbi.nlm.nih.gov/articles/PMC10686703/
These support the anatomical distinction between compartments and muscle-tendon transitions, not the chosen artistic gains.

## Next quality gate
Prioritize a genuinely improved baseline face/body asset and physically plausible materials, then assess pose and clothing intersection clearance and measure physical Android frame times. Do not claim AAA from successful mathematical or browser tests alone.