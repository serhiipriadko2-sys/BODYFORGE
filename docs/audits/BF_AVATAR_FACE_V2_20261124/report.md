# BODYFORGE — Face V2 and fitted eyebrow geometry

Date: 2026-11-24. Status: locally implemented and verified; PARTIAL toward AAA.

## Scope
- Expanded facial form from 7 to 13 zones: nasal bridge, tip, wings, philtrum, chin, jaw. Original body topology, skeleton, eyes and lips retained; application refuses a second facial sculpt on an already marked mesh.
- Blender 5.2 shape-key review: 3604 vertices over 0.05 mm displacement, peak 3.876 mm; 4264 sampled visible ocular rays both before and after, zero newly exposed or covered in the sampled frontal aperture.
- New fitted brows: 840 authored hairs, 2520 triangles, 7545 exported vertices, maximum source projection lift 0.6793 mm. Local optional donor, bound to existing head joint, preserves selected hair tint, original brows remain on failure.
- Normal Jacobian ordering was checked and already correct in the current repository; not changed in this pass.

## Verification
- Initial face unit test expected Blender's threshold count (3604); runtime count measured 3606. Corrected the exact runtime expectation; original displacement bound retained.
- Full Vitest: 65/66 files, 665/666 tests in one run. Only failure: pre-existing avatarPhysique test timed out at 5 seconds. Separate unchanged test file rerun: 2/2 passed, relevant test 2280 ms. Do not label as one clean full-suite pass.
- npm run build: exit 0; existing >500 kB chunk warning.
- BODYFORGE_QA_FACE_V2=1: 23 explicit assertions, exit 0. Real skinned indexed eyebrow draw, front and turned portraits, maximum growth, blocked donor with original fallback, unchanged synthetic profile, no uncaught browser exceptions. Baseline capture: 14 assertions, exit 0.
- References: https://docs.blender.org/manual/en/5.3/animation/shape_keys/introduction.html ; https://archive.threejs.org/docs/api/en/materials/MeshPhysicalMaterial.html
- Visual comparison shows denser eyebrows; face is still visibly synthetic. No claim of AAA equivalence or physical Android performance.

## Receipt (bytes; SHA-256)
- src/lib/avatarFaceProfile.json: 2052; e51dc7b5631443400da7e04022aa9bf696b27a99ebec200c531e87390dc243f9
- src/lib/avatarFace.ts: 4371; 69f7bd76266f623f1bad0b5b955705d094ab34d6458b580fdd349ac99cd5af64
- src/lib/avatarFace.test.ts: 5376; dd972f0c397aef45cd24ba4c5e9251eb9670017ad288c9c583fe90e7d28bf2a1
- src/lib/avatarBrows.ts: 4076; 9f22154f59aee279398cbbf01586a43cbd190cba3f3b1c1314a23910da57201a
- src/lib/avatarBrows.test.ts: 3687; 93ce36da1c0c15ed647e59d48d9a1594dcaa23806b445876442da1cf73d0cc92
- public/assets/bodyforge-brows-v2.glb: 257884; dde831c44d835a7c6e078cba6d1654f0f4cd8b9833581985ca87c88ac9302bad
- scripts/author-avatar-brows-v2.py: 3771; 2336df8cc8c5d1ef8c7a2f968d338035b4ef02197cd6e487c1ece9ad3b1a6820
- src/components/Avatar3D.tsx: 55491; 67bbee4dc64a0bfa572ba1cdc4175acd63bdf0106789bd2e14808d42df25c671
- qa/avatar-quality-e2e.mjs: 73227; 25236d0783681ad45784257d0605e02bf886889b5f672551be7643624bcd3423
- bodyforge-athlete-efficient.glb unchanged: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- .bodyforge-qa/face-v2.blend: 7261213; 7a4b9c0fd024a536a1db9b7cc53b5c4b03e23aa1f2fc3cf95cf0295b0c57c533
- baseline/face-front.png: 189301; 3dd8e8b6fe17df0ae5bbbdee0f33c1ef7d99110317d0672031faa7aa3aaddb05
- baseline/face-three-quarter.png: 193705; 317a5dbf7f8124ddc321ef7b2467e1202765906c8fecedcddf0569eb82659c87
- final/face-front.png: 189512; b6e88f9866b0a491ec109ec2b6bf046df335cb6dfb63133ad834156d0fdde3af
- final/face-three-quarter.png: 193758; a3cef5a944f800450c46290804f8d4a9fa6e5535b953207f49acaea126618dd1
- final/face-level5.png: 184408; a2128fd0fbcdac6d214f6109750cd38c58530cc36ab7aeec030b9b7883b6310c
- final/face-fallback.png: 184335; cb2b593fb9bd9892458340c3ceadcb515b1835bb0005eed2d5bb3ff0130c31f0

Local changes only; no Git push or deployment. Concurrent unrelated work preserved. Remaining priorities: hair silhouette, eyelashes, more realistic facial texture and overall anatomy.
