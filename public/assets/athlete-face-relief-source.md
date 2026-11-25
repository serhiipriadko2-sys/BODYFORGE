# BODYFORGE authored facial relief normal map

The base is the existing CC0 MakeHuman-derived BODYFORGE body and UV atlas; original source and attribution remain in athlete-skin-source.md and athlete-realism-source.md. No external person's facial scan or identity was imported in this pass.

Source GLB: bodyforge-athlete-efficient.glb, SHA-256 df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e.
Face profile: bodyforge-facial-planes-v2, SHA-256 e51dc7b5631443400da7e04022aa9bf696b27a99ebec200c531e87390dc243f9.
Previous normal map: athlete-normal.png (1024 x 1024), SHA-256 e95565df62af0349a6bfeb266f505ee23e0789bcb3f83fee0ae9c84c718ed67c.

Authoring: scripts/bake-avatar-face-relief.py, Blender 5.2. A SIMPLE-subdivided surface is deformed with bounded original secondary facial folds and baked in tangent space. High surface: 325853 vertices, 577344 triangles. Maximum authored displacement 0.182286 mm. This is procedural authoring, not a hand-sculpted high-end digital human or a physiological model.

The 2048 working bake is composited with the previous map and reduced by vector averaging to 1024. Unaffected blocks retain the old texels exactly. Literal RGB8 PNG channels are numerical data, not display colors. Runtime uses NoColorSpace, flipY=false and the existing .65 normal scale. The old atlas remains the failure fallback.

Output athlete-face-relief-normal.png: 1024 x 1024, 231443 bytes.
SHA-256: 1740a2f83974d90745684454302d65951ebbaeeca8cb275f5e528a139251c830.
No new runtime geometry, render pass or remote texture request. Nominal GPU resolution is unchanged. Subtle local normal detail does not change silhouette and is not proof of photorealism.

Primary technical references reviewed 2026-11-25:
- https://docs.blender.org/manual/en/5.0/render/cycles/baking.html
- https://threejs.org/docs/pages/MeshStandardMaterial.html

Verification, visual comparisons and limitations: docs/audits/BF_AVATAR_FACE_BAKE_20261125.
