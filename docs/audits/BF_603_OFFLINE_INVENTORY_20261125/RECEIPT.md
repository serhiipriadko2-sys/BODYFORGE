# BF-603 Offline dependency inventory

Status: INVENTORY PASS / OFFLINE SPIKE REMAINS PARTIAL. No package download, model fetch, service worker registration, real camera, or product source change.
App source observed pinned CDN WASM 1.1.1 and Google pose_landmarker_lite float16 version 1 URLs. Installed JS/WASM files rehashed against BF-212 actual runtime receipt; model hash/size observed in earlier run, model bytes not independently available now.
Public inventory: 49 files, 34186319 bytes; case-fold collisions, symlinks and obvious reserved/private names excluded by scan. This is not a complete content/license or supply-chain audit. Current live tree can change.
Potential full portability model + all WASM variants: 46447342 bytes, not including app, model redistribution notices, or JS bundle. Not all variants are fetched on each device.
Google documentation supports same-origin model/WASM paths and original file names. Exact downloaded model redistribution license still unverified; no asset copied or downloaded for distribution.
Privacy: upstream MediaPipe web README distinguishes on-device input processing from SDK performance/utilization metrics sent to Google. Exact runtime telemetry not proven present or absent in this app. Require synthetic browser network trace and external-egress-denied warm offline run before claiming no telemetry or full offline support.
Official sources: https://developers.google.com/edge/mediapipe/solutions/setup_web ; https://developers.google.com/edge/api/mediapipe/js/tasks-vision.filesetresolver ; https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/README.md
Remaining: explicit license approval, verified model bytes, isolated local asset routing, network deny trace, cache atomicity/update/rollback, actual WebView and mobile device verification. Current dependency upgrade gate remains open.

## Evidence
- docs/audits/BF_603_OFFLINE_INVENTORY_20261125/inventory.json | 12712 bytes | SHA-256 1d47e51ef65f548854d08528de23961852e0036872455b938b88b80aef8f39e6
- docs/audits/BF_212_POSE_WORKER_SPIKE_20261125/comparison.json | 17933 bytes | SHA-256 0d6e4f058e54050ca8dc543498866c0137dd898b4133345dcecf9d3d1735b461
