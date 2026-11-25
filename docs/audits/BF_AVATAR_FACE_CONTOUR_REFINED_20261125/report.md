# BODYFORGE - lower face contour V3, refined

Date: 2026-11-25. Status: locally implemented; targeted verification PASS; PARTIAL toward AAA.

## Scope and visual decision
- Six compact anatomical corrective zones on the evaluated Face V2, modifying the cheek, submalar plane, jaw angle, chin and nose. Original body GLB, topology, UVs, skin weights, head rig and gameplay preserved. Correction occurs before training rest-shape capture; normals corrected analytically.
- Initial candidate: 1748 runtime vertices above 0.05 mm, peak 5.00048 mm; local orientation ratio 0.65813. Build, 12 targeted tests and two browser scenarios passed, but matched portrait inspection revealed exaggerated cheek and jaw bulges. Rejected this stronger profile on artistic grounds. Candidate scene and comparison images are retained as evidence, not the final profile.
- Refined profile: 1540 runtime vertices above 0.05 mm, peak 2.64995 mm. Measured cheek forward shift 1.42953 mm, jaw lateral shift 1.33063 mm, chin forward shift 2.46041 mm, nasal retreat 1.48918 mm. 60850 protected runtime vertices unchanged, 3266 affected nondegenerate triangles sampled, minimum orientation ratio 0.82506. No claim of global collision proof.
- Blender authoring: 1536 vertices above threshold, 60852 protected vertices, 3318 affected triangles, minimum ratio 0.82494. Small differences arise from the Blender/import and packed runtime representations. Editable refined scene reopened successfully, with Basis, Face V2 and relative Face V3 correction keys.
- Workflow reference: https://studio.blender.org/training/realistic-human-research/creating-facial-shapes/ ; https://studio.blender.org/training/realistic-human-research/the-shapes-approach/

## Final verification
- Refined candidate: 5 Vitest files, 12/12 tests PASS, including all four growth groups, protected regions, topology, normals, existing brows/lashes and paid growth pipeline. Production TypeScript/Vite build PASS. Existing large-chunk warning remains (Avatar3D 834.42 kB, gzip 235.94 kB).
- First refined browser attempt exited 18 at upstream fitted garment readiness; cause not established. Isolated repeat at maximum growth passed 17 assertions, including actual contour installed, indexed eyebrow draw, portrait/turned camera, silver colour selection, unchanged synthetic save, zero uncaught exceptions. Refined neutral browser scenario not rerun after the first failure; neutral coverage is from unit tests, not final browser proof. Initial stronger candidate neutral browser PASS does not transfer to the refined candidate.
- Refined matched portrait crops inspected: exaggerated first-candidate bulges substantially reduced; subtle contour differences remain relative to baseline. No independent artistic or photorealism validation; no claim of AAA equivalence. Full suite and physical Android performance not tested in this pass.
- Scoped diff check, QA syntax check, Blender reopen and local HTTP checks. Local work only; owner game data, unrelated work and source asset preserved. No commit, push, deployment or new high-poly model.

## Receipts (path; bytes; SHA-256)
- src/lib/avatarFaceContour.json: 791; 4d7c2665c0abe5428c10f88274b23708007506b4ee1bd21daf88690e148f6330
- src/lib/avatarFaceContour.ts: 2919; a5bf2257e1116218a970e645892914f0f9d0de4ba2af311e07567c868b6f100b
- src/lib/avatarFaceContour.test.ts: 6879; af3a217ba647526d5f69761fe0b257c063a7ad77bd16b61ee7f0d7d97424dd10
- scripts/author-avatar-face-v3.py: 3232; 8e46ada3db4d4ca7517ea6979fd3f582ac744f8bc727eaa7b68ad90b30e43a39
- src/components/Avatar3D.tsx: 60390; 10211d4dbee19d37385c1c7fcc5f3fc5d28a6bca1b89320d6fcc0bfb1a6c510f
- qa/avatar-quality-e2e.mjs: 103972; 6eb2796ec80df3c1e315dce566056b5d34edd931d83dcf42a0b6431a7a1d9945
- .bodyforge-qa/face-contour-v3.blend: 7691198; 8458ad70b159dc8d90fc0fa466275253694eedd7a1e858bf3ee41b4ec61c489f
- .bodyforge-qa/face-contour-v3-refined.blend: 7691199; 3f013f1ab022058be72e8080472e2e86ff1f26b56588fd00ad980de486d44c3b
- public/assets/bodyforge-athlete-efficient.glb: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- docs/audits/BF_AVATAR_BROWS_V3_20261125/brows-new-front.png: 562452; af4fbcd517f972463cae93b73ea31d77919dd1fc4baf7fe52d07b3d0e67743e0
- docs/audits/BF_AVATAR_BROWS_V3_20261125/brows-new-turned.png: 576372; 9020b59ccaa666a114f4b6124d4196cab773d408b9ad7d2d10fd8b7294fe0d2a
- brows-new-front.png: 562469; be6b7ad972876726aeae6e8d9e550b7918188fc98769de9211be0850908800ff
- brows-new-silver.png: 584596; ef122ec307927e41eab144a0e6436b697653254df5e118925423536cf922c258
- brows-new-turned.png: 576592; 4fc48178ec9f0b737357ec198df29651a52dd1db5bdda0db89f5e10624b9c80d
- comparison-front.png: 142707; 39f926c40beabafe9a131d464925d6d8a76170e5032d0db2a2074c57f34175be
- comparison-turned.png: 128043; f358fcfe835303126e71dec15fc4e052c7e06cd64617618d9c50ed41c8acd443
