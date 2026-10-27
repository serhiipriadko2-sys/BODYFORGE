# BODYFORGE 3D avatar — source and license

Current primary derivative: `public/assets/bodyforge-athlete-detail.glb`.
Hair-card adaptation and exact CC0 source hashes are documented in
`public/assets/athlete-groom-source.md`; packed source is
`art/bodyforge-athlete-detail.blend`. The previous refined model is retained.

Previous refined derivative: `public/assets/bodyforge-athlete-realistic.glb`.
Authoring, eye/skin provenance and map semantics are documented in
`public/assets/athlete-realism-source.md`; editable source is
`art/bodyforge-athlete-realistic.blend`. The original assets below are retained.

Asset: `public/assets/male-base-mesh-base_male.glb` (4,498,248 bytes).

Original: [Male base mesh — Rigged A-pose](https://www.innerscene.com/tools/library/3d-parts/male-base-mesh-3d-person-rigged-a-pose-380e6d89), Innerscene, adapted from MakeHuman assets. Published as **CC0 1.0 (public domain)** on the source page, checked 2026-10-20.

- Source path: `https://www.innerscene.com/api/library/male-base-mesh-3d-person-rigged-a-pose-380e6d89/download`
- Download SHA-256: `D15A07E2B4CF1D08A3B91CB212A9A06A91438077F05A3F2A62F45351E8A71EB8`
- GLB 2.0, rigged with 163 bones, two skinned meshes, approximately 109k triangles, source height ~1.79 metres.
- In BODYFORGE, meshes are recoloured and combined with generated gym shorts, footwear and hair. Player's BODYFORGE muscle progression changes the skeleton scales; camera tracking remains independent.
- Runtime fallback: the previous procedural 3D figure remains available when the GLB cannot load or rendering fails.
- This local asset must not be confused with the user's own likeness. No phone camera images are stored in the model.

Source CC0 information: https://creativecommons.org/publicdomain/zero/1.0/

## Derived athlete — 2026-10-26

Current primary asset: `public/assets/bodyforge-athlete.glb`, derived locally
from the pinned source above with Blender 5.2.0 LTS. The original remains the
legacy runtime fallback and is unchanged.

- Reproducible authoring: `scripts/author-athlete.py`; it checks the source SHA
  before creating an independent output file. Run in an isolated Blender
  `--background --factory-startup` process.
- Real skinned shirt, shorts, shoes, chest emblem and eyebrows share the
  original 163-bone rig. Source UVs and skin weights are preserved.
- Final GLB: 5,011,480 bytes; SHA-256
  `e08a53c9833b43b80924d64123681fceeeea5bf3347e4339db07d03e1e722f97`.
- 122,531 triangles, 12 skinned meshes. This is a geometry budget, not a
  claim of measured performance on a physical phone.
- Runtime also supplies separate anatomical materials, a corrected stance,
  selectable batched hair geometry, and a local skin albedo. The visible app
  appearance therefore comprises the GLB, texture and Three.js styling together.
- `public/assets/athlete-skin.jpg` is a 1024 x 1024, 130,759-byte CC0 MakeHuman
  texture derivative; exact source, license and hashes are recorded in
  `public/assets/athlete-skin-source.md`. No camera image or user likeness is used.
- A detailed reference illustration remains a quality target. The current
  character does not claim equivalent facial sculpting, strand grooming or
  photorealistic skin scattering.
