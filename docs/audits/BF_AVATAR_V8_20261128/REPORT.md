# BODYFORGE V8 - regional eye and gaze review

Status: PARTIAL / verified V8 eye rig and pigment, bounded gaze, prior progression and idle behavior; full artistic and animated acceptance open.

Scope: unchanged pinned V6 GLB and 33 growth fields, V7 head/neck weights and idle, 15 zones, 12 levels, 25 coins per point. V8 is opt-in loopback development only; earlier review flags remain available.

Research: Disney Research, High-Quality Capture of Eyes (2014), https://studios.disneyresearch.com/2014/11/19/high-quality-capture-of-eyes/ ; Practical Person-Specific Eye Rigging (2019), https://studios.disneyresearch.com/2019/05/06/practical-person-specific-eye-rigging/ ; Detailed Spatio-Temporal Reconstruction of Eyelids (2015), https://studios.disneyresearch.com/2015/07/27/detailed-spatio-temporal-reconstruction-of-eyelids/ . These motivate separate optical anatomy and measured pivot/eyelid deformation. No external texture or research dataset copied. The official Blender donor is CC0, https://www.blender.org/download/demo-files/ .

Read-only donor diagnosis: 245 pre-existing master pairs (23 facial, 222 foot-region); not repaired by V8. The official donor collection has three meshes and no authored shape keys/armature. Fitted eye radii ~11.735 mm. Exact donor ray sweep 180 cases, selected pitch 6 degrees and conjugate gaze +/-6 degrees, convergence +/-1 degree. Selected 30 sampled cases: min pupil visible fraction 1, iris 0.947450, exposed mask IoU 0.994801. This is sampled orthographic occlusion screening, not an exhaustive socket collision or optical simulation.

V8 implements head-bound globe rotations from immutable rest positions around fitted pivots. Separate prior iris shell hidden, not destroyed. Original deterministic 512x512 SRGB pigment map shared only within root, physical clearcoat approximation (not transparent refractive corneal simulation). 57 browser assertions: 30 states, 1156 exported vertices each, max position error 5.982246e-8 m, max gaze displacement 1.300792e-3 m. Body/garment positions, normals, topology, UV and skin weights match V7 across the sampled forms; eye radius, normals, head attachment, and exact reset verified.

Matched actual app portraits: 117 changed pixels localized to eye bounds, no paid-buffer changes. Separate diagnostic close-up using actual model and hardware renderer: 9548 gaze-only changed pixels with fixed head; exact zero pixel reset. Visual close-up shows improved pigment but rough lid edges, brow strands, uniform skin and missing lashes. Not AAA.

Blink research: 24 spherical field, 64 topological smoothing, 48 smooth boundary and 28 contact-local attenuation endpoints; total 164, 0 pass all predeclared gates (new pairs=0, area ratio>=0.25, <=5% remaining globe exposure). Some almost close the aperture but intersect or compress triangles. All rejected; no blink field integrated. A dedicated topology/shape-key authoring and collision-aware solve remains required.

Working tree concurrency: initial V8 integration aborted before any writes when Avatar3D.tsx hash changed. Current anchors reviewed, exact updated preimage retained, reconciled patch applied without replacing parallel work. Initial TypeScript unused constant corrected. Full suite passed before the test-only null-buffer guard correction; corrected four eye tests and TypeScript reran successfully; application source unchanged by that test fix. No blanket reset.

Actual browser: 1306 progression/interface checks, 540 purchases, 64 screenshots; 88 live idle checks, 18 screenshots; 15 matched app portrait checks, 4 screenshots; 4 diagnostic close-up checks, 4 screenshots. All synthetic disposable profiles. Motion toggle, reduced motion, economy, reset, migration, asset failure safety and storage unchanged.

Full suite: Test Files  132 passed (132); Tests  1290 passed | 1 skipped (1291). Final eye-only rerun: 4 passed; final TypeScript passed. Production build completed, zero experimental loader/asset markers, loopback pins and direct private/cross-site access denial checked. CSP unchanged. No commit/push/deploy/APK. ADB available, no connected physical device; actual handset QA not performed.

Remaining: authored lid animation and baseline facial contact repair, realistic face/skin/brow/hair/lashes, further full-body animation and garment physics, physical Android and production activation. No claim of exhaustive 13^15 level combinations, full optical simulation or AAA.

Preview (development computer only): http://127.0.0.1:5196/?avatarFoundation=8&avatarFoundationRelief=1 . Matched portraits and gaze close-ups in .bodyforge-qa/avatar-zones-20261127/browser-v8-portrait and browser-v8-closeup. See RECEIPT.json for exact verified file inventory.
