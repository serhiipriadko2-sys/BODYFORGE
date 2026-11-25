# BODYFORGE scan transfer review (development only)

Source: **Infinite, 3D Head Scan**, by **Lee Perry-Smith / Infinite-Realities**.
Based on a work at https://www.triplegangers.com/.
License: [CC BY 3.0 Unported](https://creativecommons.org/licenses/by/3.0/).
Original distribution: https://github.com/mrdoob/three.js/tree/r180/examples/models/gltf/LeePerrySmith
License text: https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/LeePerrySmith/LeePerrySmith_License.txt

Verified source blobs:
- LeePerrySmith.glb: 404976 bytes; SHA-256 402b8a8ac9f03232e6d64b5962929703a069daf99d3c49ac8eb0e48bedc9c576
- Map-COL.jpg: 148269 bytes; SHA-256 e976d73b31407f8d0967412bf468019ed26a5d5a32cf5811aabff7e816458a65

Modification: manually annotated 2D anatomical landmark registration, depth affine fit,
bounded smoothed frontal depth residual with protected facial regions.
The derived numerical field in src/lib/avatarScanTransferField.json is CC BY 3.0.
Original head and colour texture are retained in the local Blender review. The photographic colour is also reprojected into a separate 2048-square development atlas (`src/lib/athlete-skin-scan-review.jpg`) by `scripts/bake-avatar-scan-color.py`. This derivative is CC BY 3.0; it blends donor colour and stubble in the lateral cheek regions after bounded tone matching into the existing CC0-derived atlas, protecting the eyes, lips, nose and chin. The broad first candidate was rejected after visual comparison because of misregistered pigment. It is not calibrated albedo. The production avatar remains unchanged. No endorsement implied.
The opt-in dev review is not a likeness match or a validated anatomical scan of the athlete.
