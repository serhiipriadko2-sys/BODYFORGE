# Documentation request: third-party component inventory for Tasks Vision 1.1.1 WASM

Draft only; not submitted.

We verified the official @mediapipe/tasks-vision@1.1.1 npm tarball against its registry integrity and compared the six files below against the v1.1.1 public source tag. The archive SHA-256 is fbbea455a8b50c31c39092027b3548336de198bfcdbaf75cc08245e773011b8f. The six installed files match the archive exactly. No separate LICENSE/NOTICE/COPYING file was found in the 14 regular archive members.

| File | Bytes | npm SHA-256 | v1.1.1 wasm_files.bzl SHA-256 |
| --- | ---: | --- | --- |
| wasm/vision_wasm_internal.js | 334128 | 6522286aa32dd93eff17c3da002b0649516f87abfec7a80b5bfe5c9625caa5f8 | 41cf300b4d13a2219b9b773039bd890e6d1ba95613ecdee7c0973b80719b689a |
| wasm/vision_wasm_module_internal.js | 334166 | 539a4386fd12d0723d6e900ec80467d168ba7290dda2f79e77a2181b8e906115 | f15e5c3f7d2b4fcc03eb74b3261a515524952d657d5996e03184edb86894b64f |
| wasm/vision_wasm_nosimd_internal.js | 333931 | 942654dbdcebce08ea039af23d18e58bebf23c8607d74023d2df7071c8a7b638 | 17e4d51c91432b96216c3445dcec14997c3c5433bf8c2f423a184eebc3625e35 |
| wasm/vision_wasm_internal.wasm | 13519922 | 0e101a010e262ef8e78f22e3c95b60a9705fd06962753c9acd6356d9fb56b7bd | 77323865c969efe8ff587e30a4c741b97ddbddc6fcd3650bc1d05af7e145265f |
| wasm/vision_wasm_module_internal.wasm | 13519940 | 3b57e4b55ac6346bf940212e3e11250b308a6a474077385e2f527b119cf74525 | 0497c3c2eccacd55c3b8ed1850a9b2caf794635c4f2f1b15a4114555f727f541 |
| wasm/vision_wasm_nosimd_internal.wasm | 12627509 | c9b1b69bb87baf9e529254d8559dcbcf4c5a9c0eda84f56a12f17d675335ec9c | 4f53178b9d69f8412e3be92c63db2861bce33ebc9d53418efa16232a32df68ba |

The public source manifest (Git blob c667f010a274511a343fbf70033cdc46e426d71d) contains different hashes for all six artifacts. This observation does not imply compromise or a license violation. It means we cannot establish that the source-tag dependency list describes these exact distributed bytes.

Could you provide:
1. A complete third-party component/version inventory (including statically linked libraries and toolchain/runtime code) for these exact npm binaries.
2. Applicable license texts, copyright notices and any source or attribution obligations.
3. The corresponding source/build manifest or a supported release with exact binary-to-source and notice mapping.

We are aware of #6403 and #6424, which concern different versions. The general Apache-2.0 package metadata does not answer the component-level mapping question.

Sources: https://registry.npmjs.org/@mediapipe%2ftasks-vision/1.1.1 ; https://github.com/google-ai-edge/mediapipe/blob/v1.1.1/third_party/wasm_files.bzl ; https://github.com/google-ai-edge/mediapipe/issues/6403 ; https://github.com/google-ai-edge/mediapipe/issues/6424 .
