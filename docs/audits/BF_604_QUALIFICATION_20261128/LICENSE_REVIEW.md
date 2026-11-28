# BF-604: component licensing and asset evidence

Status: PARTIAL / public redistribution clearance not established.

## Exact distributed MediaPipe package

- Official npm 1.1.1 archive verified against registry integrity and lockfile; all six pinned runtime files matched installed bytes.
- Public v1.1.1 source manifest: 0/6 hash matches. This is a missing provenance mapping, not evidence of compromise or a legal violation.
- Official 1.1.1 archive has 14 regular members and no separate LICENSE/NOTICE/COPYING entry. Latest registry version checked: 1.2.3, 12 regular members, no such entry. No dependency upgrade was installed.
- The package metadata and available root license do not enumerate the exact statically linked components. Binary string clues are not a complete SBOM.
- A request for component versions, applicable notices and corresponding build mapping is prepared in MEDIA_PIPE_UPSTREAM_REQUEST_DRAFT.md. Not submitted.

## Graphics

- All 38 public artwork/font/icon files are inventoried: 21 documented exact hashes, 10 documented recipe/lineage records, and 7 initially open icon records supplemented by the local vector/raster recipe audit.
- Inspected 11 GLB containers according to the standard image/buffer fields; two embedded images, no standard external image/buffer references. Both eye textures reproduced byte-for-byte from the pinned local procedural texture functions. No complete mesh reproduction was attempted.
- The icon generator was not rerun; its recipe and SVG structure are recorded. Trademark/ownership rights are not independently established.
- Retain the public attribution and font license files; documented CC0 and CC BY source references are evidence, not a blanket clearance for all derived graphics.

## Evidence index

| Path | Bytes | SHA-256 |
|---|---:|---|
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/artwork-provenance.json | 27462 | b753761670365146bc2ee06752cfe094245aa685e216f51cd28645791cd229f2 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/compare_latest.py | 1596 | 299c6748b9fcbe4751b77159aed8fdc66431e065eca307b02c7a2bda2620a9d6 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/compare_wasm.py | 3638 | 7c51c91b2756f6099b5f17c6a4bf5e956c9289d205cd4ab6730136d1bee14e0b |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/fetch-receipt.json | 1737 | 3344d8f0ddef65d1605a93cdbf545f7a6c3b7235e9554a38bd9cb0d0959ac535 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/glb-embedded-inventory.json | 5881 | 3f91226a3cb76ba9cfe44458b8f1d6f4f6a72f81de88df55eca65931b6b6cb1d |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/icon-lineage.json | 1730 | 899ac1dd258d2afb1e8e86279e0c5e2ec72c71cf31f94c1ed517f049812efac5 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/issue-6403-comments.json | 5823 | fcbdcf4982c49ea3d39be64204cd86ad23e6f75bfe57aa7fbcf5f479c134d665 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/issue-6403.json | 9246 | ed90fcbb7c561143eea58100d1f6292632b26898edfb3ad67b26980440b6c424 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/issue-6424-comments.json | 2 | 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/issue-6424.json | 6352 | 05cd04e0d43ea7156d44386300352ad32f9a505dda4762956ac57df1978b0d39 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/latest-archive.tgz | 8798983 | 469602650dab70256df387983ea44e85fa66020335bae85a54fa8fda062ca0a0 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/latest-fetch.json | 368 | 9459a03f4cdbd42bcd550477461fa51e6eb790064cdb9e5d075cd69590b82949 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/latest-inventory.json | 2454 | fdaca0964041607b92877351c7a9cdc05b8d5bc5a8ef3ca73d2dfb2cb7e16c9e |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/LICENSE.txt | 12331 | 8707eef0533987efc5b155d64761eeb6e20793f50b9bd1a68dad1cf4719d0ed8 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/mediapipe_tasks_web_vision_BUILD.txt | 4421 | b05edf4cffe04dfdadfd2dc309144abf3df7ed3c3136cf5222bca3ca5b17e984 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/npm-1.1.1.json | 2547 | 1d636b747134b5d32406ef39ff4c93460ab4598c3deea3488bb5f725ca4d5f2b |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/npm-1.2.3.json | 2394 | b5ff127f82e025461cb7699a9165ccfa4828e9354d553ee91da9601cc52a5822 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/npm-latest.json | 2394 | b5ff127f82e025461cb7699a9165ccfa4828e9354d553ee91da9601cc52a5822 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/ocular-texture-reproduction.json | 1065 | 434f275b79d6bf5427692a470ddb6ef0475aef3d44fafd96ddc3b7e826104e72 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/source-fetch.json | 1083 | 5c638e25a375e0aca03a367414c0694f6236fbffd49902574b8f0733e17659be |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/tag-tree.json | 1544519 | 664cab8e047e81a8d8440f23a2f196550d85d94078a5fbdc05fae27068fe9b29 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/tasks-vision-1.1.1.tgz | 12258918 | fbbea455a8b50c31c39092027b3548336de198bfcdbaf75cc08245e773011b8f |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/third_party_wasm_files.bzl.txt | 12872 | 67ff25630d1328832d0bc9f437b3c3c468b3c4a0edbc2fb42ac06da53cf186d3 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/wasm-comparison.json | 6820 | d225929b1ad09113503b5339bc5ca8bf6bec32a92c142fc53783ecacd0a49e1c |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/WORKSPACE.txt | 34795 | 80f416c8c0bc08003dbd93a23168b3e7dd214c8508a73d929a33f79e9f2dd501 |

## Primary sources

- https://registry.npmjs.org/@mediapipe%2ftasks-vision/1.1.1
- https://registry.npmjs.org/@mediapipe%2ftasks-vision/latest
- https://github.com/google-ai-edge/mediapipe/blob/v1.1.1/third_party/wasm_files.bzl
- https://github.com/google-ai-edge/mediapipe/issues/6403
- https://github.com/google-ai-edge/mediapipe/issues/6424
- https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- https://creativecommons.org/licenses/by/3.0/

## Decision boundary

Local engineering checks can proceed on pinned files. Public redistribution remains blocked by the missing exact binary-to-source and component-notice mapping and any remaining rights verification. No public issue, registration, deployment or external transfer was performed.
