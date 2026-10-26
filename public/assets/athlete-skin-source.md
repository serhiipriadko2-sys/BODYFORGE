# Athlete skin albedo

`athlete-skin.jpg` is an optimized derivative of a MakeHuman Community skin.

- Author: `makehuman_system` (official asset-pack attribution).
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
- Official source and license table: https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html
- Exact upstream archive: https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
- Archive member: `skins/young_caucasian_male/young_lightskinned_male_diffuse.png`.
- Original image: 2048 x 2048 PNG, 3,693,828 bytes.
- Original SHA-256: `862a26e335e958b70534cb5f0d7c47ef30ab148a56c42b3e9da969cf76f12963`.
- Retrieved: 2026-10-26, using HTTPS byte ranges; ZIP member CRC32 verified.

The adjacent upstream `young_caucasian_male.mhmat` states:

> This asset was explicitly released as CC0 in september 2020.

The original material credits Data Collection AB, Joel Palmius, and Jonas
Hauquier as copyright holders at release. It references this exact diffuse
image. The official asset-pack table independently marks this skin as CC0.

## Local transformation

Prepared with Blender 5.2.0 LTS by `scripts/prepare-athlete-texture.py`:
2048 x 2048 to 1024 x 1024, RGB JPEG quality 90. The complete UV layout is
retained: no crop, new facial features, recoloring or generated detail.
The Standard view transform preserves the sRGB albedo without AgX/Filmic tone
mapping. The original PNG remains unchanged.

- Output bytes: 130,759.
- Output SHA-256: `33077073e7c16cb850310d0697392099711463f5704a442506c89bb893cbfd70`.
- File read-back: 1024 x 1024, PASS.
- Use as an sRGB color map with `flipY = false` on the MakeHuman glTF body.
- Do not apply this body texture to separate eye, tooth or hair geometry.

CC0 permits redistribution and adaptation. Attribution is retained here for
provenance. This file describes the texture source; it does not claim that the
real-time character matches a reference illustration or a physical human.
