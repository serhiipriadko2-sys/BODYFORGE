# BODYFORGE refined athlete — provenance and runtime contract

The primary `bodyforge-athlete-realistic.glb` is an independent local derivative
of `bodyforge-athlete.glb`. The latter and the original MakeHuman-based GLB are
unchanged runtime fallbacks. Source licensing and attribution are retained in
`docs/AVATAR_ASSET_LICENSE.md` and `athlete-skin-source.md`.

Authoring: `scripts/refine-athlete.py`, isolated Blender 5.2.0 LTS
`--background --factory-startup --python-exit-code 1`. The script pins the input
GLB, original skin PNG and eye PNG by SHA-256. It does not read camera footage.

- Input GLB SHA-256: `e08a53c9833b43b80924d64123681fceeeea5bf3347e4339db07d03e1e722f97`.
- Skin source: the same CC0 MakeHuman image documented in `athlete-skin-source.md`,
  retained at 2048 square pixels as `athlete-skin-detail.jpg`.
- Eye source: official [MakeHuman system assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html),
  author `makehuman_system`, `brown`, listed as CC0.
- Exact archive: `https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip`.
- Member: `eyes/materials/brown_eye.png`, 610,817 bytes; SHA-256
  `4659691c7295ad6206c78b003e5fd0e5f91dcd53032fa914a229bb48cabe424b`.
- Retrieved 2026-10-27 through verified HTTPS with ZIP CRC32 and byte-count
  checks. The runtime derivative `athlete-eyes.jpg` is 512 square pixels.
  The eye UVs are deliberately remapped: the incoming GLB used another atlas.

The face refinement is a bounded, smooth deformation, not a scan or a claim of
matching a real person's identity. Body UV coordinates and normalized bind
weights are retained; maximum sculpt displacement is below 3.6 mm. Eye UVs are
the explicit exception. Individual eyebrow hairs and three opaque, head-bound
hair meshes are newly authored for this project.

`athlete-normal.png` is a 1024-square tangent normal map baked from procedural
micro-relief. `athlete-orm.png` is 512 square pixels: local baked AO in R,
authored roughness variation in G, metalness=0 in B. These maps are artistic
surface detail, not measurements of human skin. Use NoColorSpace and flipY=false
for both; use sRGB and flipY=false for color images.

`art/bodyforge-athlete-realistic.blend` is an editable, packed source with studio
lights and a Cycles skin material. Its non-destructive clothing mask is a preview
modifier; full body geometry remains editable. Cycles subsurface scattering is
not represented as an equivalent feature in the application's standard PBR skin.
The application supplies its own bounded studio IBL and ownership/disposal rules.

Exact output sizes and hashes, regression results and visual evidence are stored
in the local `BODYFORGE_REALISM_20261027` audit/receipt. A successful export is not
a claim of complete photorealism or verified physical-phone performance.
