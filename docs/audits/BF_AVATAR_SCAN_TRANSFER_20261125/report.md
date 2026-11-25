# BODYFORGE - anatomical scan transfer review

Date: 2026-11-25. Status: local experimental development preview verified; PARTIAL toward AAA. Production avatar not replaced.

## Source and licensing
- Infinite, 3D Head Scan, Lee Perry-Smith / Infinite-Realities, based on www.triplegangers.com, CC BY 3.0 Unported. Source https://github.com/mrdoob/three.js/tree/r180/examples/models/gltf/LeePerrySmith . The mesh, colour image and licence were fetched from the pinned r180 distribution and matched Git blob identifiers. See public/assets/athlete-scan-transfer-source.md for attribution and modifications.
- Source mesh: 9279 vertices, 17684 triangles. Donor has closed eyes and different proportions. Donor colour image packed in the Blender review only; not transferred to app skin. Other candidate sources were not downloaded or incorporated; no purchased assets.
- Research: https://studio.blender.org/training/realistic-human-research/retopology/ ; https://studio.blender.org/training/realistic-human-research/reprojection-sculpt-layers/

## Registration and results
- Manually selected 28 corresponding anatomical landmarks on two orthographic geometry inspection frames. Thin plate spline warp, depth affine fit, smoothed bounded residual on a 128x128 field; retains protected lip seam, eye region, hair and neck. Landmark interpolation error 0.00428 px is NOT independent registration accuracy. Minimum sampled 2D warp Jacobian 0.14364; 8332 valid depth grid samples; raw fitted depth residual RMS 6.13117 mm. First stronger candidate rejected: triangle orientation ratio 0.53865 below 0.55. Reduced residual strength from 0.50 to 0.35 rather than lowering the quality gate.
- Final Blender candidate: 4062 moved vertices above 0.05 mm, max 2.1 mm, 61001 protected vertices, 6691 affected nondegenerate triangles, minimum orientation ratio 0.68077. Runtime: 4069 vertices above threshold, max 2.100006 mm. Small import/packing differences expected. No global collision proof.
- Runtime review opt-in: http://127.0.0.1:5173/?avatarScanReview=1 . Standard address omits experiment. No persisted preference. Original topology, UVs, bones, weights and saved game schema unchanged. Optional dev module loaded asynchronously only in opt-in mode, with stale-load disposal and base fallback on missing module.
- First production build exposed the statically imported experimental field. Corrected to dev-only dynamic import; production build passes and a scan of all built JavaScript excludes the review ID, URL flag and donor hash. Avatar3D production chunk 834.47 kB (235.98 kB gzip); existing chunk-size warning remains.
- Vitest: 3 files, 8/8 targeted tests, including pinned donor field and face profiles, protected vertices, rig and growth transitions, brows and lashes. Browser on/off: 18 assertions each, exit 0; maximum growth, actual selected compact rig and experimental marker, actual brow geometry draws, portrait/turned views, silver selection, exact isolated save unchanged, zero uncaught errors. Blender review reopened with Basis, Face V3 refined and relative experimental key. No full suite or physical Android performance test.
- Matched portraits inspected. Front crop: 2700 pixels above summed RGB difference 15; turned: 2502; mean per-channel absolute differences 0.55157 and 0.59344 respectively. Changed pixels measure difference, not realism. Visual effect subtle; does not justify replacing the default model. No independent photorealism validation or AAA equivalence. Next step: better neutral open-eye scan with compatible landmarks and a jointly validated colour/material transfer.
- Local changes only, no owner save edits, commit, push or deployment. Other local work preserved.

## Receipts (path; bytes; SHA-256)
- scripts/inspect-avatar-scan-donor.py: 2490; 51cfce8ad81af17d457c2f3341da8f5c44a348aa1df8ac1816110f6df0404ee9
- scripts/author-avatar-scan-transfer.py: 10480; cc7b5846154091005c6a4e7d04a77c06ac784528c2cfe54ddc680efa2b0453f6
- src/lib/avatarScanTransfer.ts: 3721; 8495acf9805b1d4f5e2354b8f3b679f672e4cf4fa4c8549147662b48acd46424
- src/lib/avatarScanTransfer.test.ts: 4367; edfff7f96da6abcab0317484d50edc0c7548254497a00c69a71073b0ee5f31f8
- src/lib/avatarScanTransferField.json: 54953; b9c06e31e43aaa794cd8f3752157a123cf228647f278ff10d5e2c1b56e8068a8
- src/components/Avatar3D.tsx: 61353; d270b70a117ab49bab861ca1b8c204c4606a931ac6b8dc52675efa50c4391955
- qa/avatar-quality-e2e.mjs: 104304; 1142b8e901c035825abe35ce2c25e7a38292bd12022d4f45744a19c86f8d2101
- public/assets/athlete-scan-transfer-source.md: 1227; 755b498565bc7355654eb70b108a7dc770aba3146886e96b2c63934631a13fb3
- public/assets/bodyforge-athlete-efficient.glb: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- .bodyforge-qa/scan-donor-20261125/LeePerrySmith.glb: 404976; 402b8a8ac9f03232e6d64b5962929703a069daf99d3c49ac8eb0e48bedc9c576
- .bodyforge-qa/scan-donor-20261125/Map-COL.jpg: 148269; e976d73b31407f8d0967412bf468019ed26a5d5a32cf5811aabff7e816458a65
- .bodyforge-qa/scan-donor-20261125/LeePerrySmith_License.txt: 364; 7cf4da43a6ae6d32f7f7d063fe129a19468af6f4fe7c53b937f83959709fcb50
- .bodyforge-qa/scan-donor-20261125/transfer-review.blend: 8328961; 761af47cc8b80774d5d294cabdd4610ba7951e49bf8bb91865b2205e7a008250
- .bodyforge-qa/scan-donor-20261125/transfer-comparison.png: 91029; 970c2173a84c71f71f547cbbb952ead8caa877a98b2eda8818da5822acd08c5b
- docs\audits\BF_AVATAR_SCAN_TRANSFER_20261125\comparison-front.png: 151746; b09716647ebe3489be3dad1dbee4bab6f9ff680de5efb43afef395c5c5cf4cca
- docs\audits\BF_AVATAR_SCAN_TRANSFER_20261125\comparison-turned.png: 136782; 523e62af3e3ba0b23f9bc6ff929d3e527a7662f9a0dd4b2b8c9647eb30c028db
- docs\audits\BF_AVATAR_SCAN_TRANSFER_20261125\off\brows-new-front.png: 562469; be6b7ad972876726aeae6e8d9e550b7918188fc98769de9211be0850908800ff
- docs\audits\BF_AVATAR_SCAN_TRANSFER_20261125\off\brows-new-silver.png: 584596; ef122ec307927e41eab144a0e6436b697653254df5e118925423536cf922c258
- docs\audits\BF_AVATAR_SCAN_TRANSFER_20261125\off\brows-new-turned.png: 576592; 4fc48178ec9f0b737357ec198df29651a52dd1db5bdda0db89f5e10624b9c80d
- docs\audits\BF_AVATAR_SCAN_TRANSFER_20261125\on\brows-new-front.png: 562561; 8f7aea90e6cf2b8716e7dae95009dbd83bf96705521b7ae6e328cfc5e4ba8f7d
- docs\audits\BF_AVATAR_SCAN_TRANSFER_20261125\on\brows-new-silver.png: 584644; eb518f88469be4217b47bbb9e98e0402b65c5dce813930062091f5113533d988
- docs\audits\BF_AVATAR_SCAN_TRANSFER_20261125\on\brows-new-turned.png: 576639; ac1e76d41b4c11baf1e0b0654c92e68ad80f7302b3bc3da31a1ecd0118cdf675
