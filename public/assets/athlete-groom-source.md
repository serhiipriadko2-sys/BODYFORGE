# BODYFORGE detailed hair — 2026-10-27

Primary geometry: `bodyforge-athlete-detail.glb`. Packed editable source:
`art/bodyforge-athlete-detail.blend`; authoring: `scripts/groom-athlete.py`.
The previous `bodyforge-athlete-realistic.glb` remains a runtime fallback.
The compact `bodyforge-athlete-efficient.glb` is the current runtime primary;
it retains the detailed geometry with bounded attribute quantization.

The five byte-exact CC0 authoring inputs are included in
`art/sources/athlete-groom/`, with a public license/source/hash manifest and
rebuild instructions in its `README.md`. `python -B scripts/groom-athlete.py
--verify-inputs` checks all inputs without Blender or output writes. No private
`.iskra/reports` input directory is required.

The body, face, original triangle-corner UVs, bind weights and clothes are
retained from that local derivative. `BODYFORGE_groom=v2` identifies this
revision independently of its inherited `BODYFORGE_realism=v1` map contract.

## Hair provenance

Author: `makehuman_system`. License: **CC0 1.0 Universal**.

- Official listing: https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html
- Archive: https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
- Crop: `hair/short04/short04.obj` and `short04_diffuse.png`.
- Swept: `hair/short02/short02.obj`, `short02_diffuse.png`, `short02_normal.png`.
- Both accompanying `.mhmat` files explicitly state the September 2020 CC0
  release. The listing independently marks both assets CC0.
- Retrieved via verified HTTPS byte ranges, with ZIP member size and CRC32
  checks. No account, paid service, uploaded image or camera recording was used.

Pinned source SHA-256 values:

| Member | SHA-256 |
| --- | --- |
| short04.obj | `676964a133ee35ffcea1195382bf75542da7a298931e4001bc7b0d7b707225de` |
| short02.obj | `48f979114adfa712165a69cc55c45a70831af1fb3cba8e2a89120f0c87407b64` |
| short04_diffuse.png | `0bef7fc0e403db5a40fabb2111ebfa6f7e8158e204c6e56b8da98e9ef527846e` |
| short02_diffuse.png | `47fe33831a3929567c733356dd66243116e05df2ace1f884ddca0080b728229f` |
| short02_normal.png | `2cfac7619f8eec77dd90df979d912415058f4f0fc16940cba40a8eb1ae6d74b5` |

## Adaptation and runtime

Hair geometry is scaled and fitted to the existing skull; embedded roots are
pushed outside its surface. All hair vertices are bound to the original head
bone. Short buzz geometry is independently fitted to that skull. Face topology
and identity are unchanged; this is not a scan or likeness reconstruction.

`athlete-hair.png` is a 1024 x 512 color/alpha atlas: crop on the left, swept
on the right. Source luminance is normalized to retain fibre shading while
allowing the existing hair dyes, including silver. Source alpha is retained
through resizing. Use **sRGB, flipY=false**.

`athlete-hair-normal.png` is a 512 x 256 tangent-space atlas, combining bounded
luminance relief and the short02 normal map. Normals are normalized after
resizing. Use **NoColorSpace, flipY=false**. This is artistic texture detail.

Three.js uses depth-writing alpha test at 0.38, with double-sided cards and
alpha-to-coverage in its antialiased context. Transparent blending is disabled.
Buzz uses a separate opaque material, never the card atlas. A failed texture
request leaves an opaque geometry fallback. All maps are scene-owned and
disposed with the hidden and visible hair meshes.

The GLB deliberately exports separate minimal garment materials; exporting no
materials makes GLTFLoader share one default material and contaminates colors.
The packed Blender scene retains its full editable offline materials. An
offline Cycles render is not an application screenshot or a mobile benchmark.

This revision improves hair detail; complete photorealism and performance on a
physical Android phone remain unverified.
