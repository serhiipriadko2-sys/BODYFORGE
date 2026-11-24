# BODYFORGE measured material credits

## Skin microrelief (CC BY 3.0)

Source: **Infinite, 3D Head Scan**, by **Lee Perry-Smith / Infinite-Realities**.
Based on a work at https://www.triplegangers.com/.
License: Creative Commons Attribution 3.0 Unported,
https://creativecommons.org/licenses/by/3.0/.
Source distribution: https://github.com/mrdoob/three.js/tree/r180/examples/models/gltf/LeePerrySmith
Source license: https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/LeePerrySmith/LeePerrySmith_License.txt
Retrieved 2026-11-24; source license text SHA-256:
7cf4da43a6ae6d32f7f7d063fe129a19468af6f4fe7c53b937f83959709fcb50.

Source image: Infinite-Level_02_Disp_NoSmoothUV-4096.jpg (752389 bytes).
SHA-256: 937dea3ab1adea4624c9743ea0653fcb022235e6dcdebfb6e739b93f9d2a5cef.
Adaptation: scripts/bake-scan-pores.py crops a cheek patch, removes the
low-frequency head shape, overlaps its edges and normalizes microrelief.
No source facial mesh, color, identity or rig is used.
Output: athlete-scan-pores.png (256x256, 61364 bytes).
SHA-256: 56628fec1902669f0cabb7b2dcda7f5bc7837d042db81f068805aa2a3cae0685.
The adapted texture remains available under CC BY 3.0. No endorsement is implied.

## Textile surface (CC0)

Source: **Bi Stretch**, photographed by **colormass**, processed by **Rico Cilliers**, Poly Haven.
https://polyhaven.com/a/bi_stretch
License: CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/.
Source catalog: https://api.polyhaven.com/files/bi_stretch.
Retrieved 2026-11-24; verified sizes and MD5 from official catalog.

- bi_stretch_nor_gl_1k.jpg, 640580 bytes, SHA-256 b282a065f0fc027e375c2cfe35a6344b18d9e7154f3f7b3604ab9c7fdf6e6b1a.
- bi_stretch_rough_1k.jpg, 696831 bytes, SHA-256 06ade3abeb3c08c6dd96c396757ca18d2e0cd1e5d6819ae4a585dc265ae9f3ee.

Adaptation: scripts/prepare-athlete-fabric.py resamples to 512x512,
renormalizes normals, bounds roughness around a midrange matte value.
- athlete-fabric-normal.jpg, 20917 bytes, SHA-256 6c3ec0b37b85344f26c4aa927583fbe4612a33ddb9adac4419568d190ab8103e.
- athlete-fabric-roughness.jpg, 31510 bytes, SHA-256 0c146a3d40e551c84135d90cc8974d3fbb68bf5561ee8c6cf7b391968da90d40.

All three derived images are bundled locally. No online texture fetch is
required by the app. Existing CC0 body, hair and eye credits remain intact.
