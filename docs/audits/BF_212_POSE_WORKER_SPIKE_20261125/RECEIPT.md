# BF-212 - Pose Worker feasibility spike

Status: PARTIAL. Desktop API feasibility measured; production adoption and field comparison not accepted.
Both forward and reverse runs used the same pinned actual MediaPipe Tasks Vision 1.1.1 model/runtime and 320x240 deterministic non-person fixture. Per variant: 4 warm-up, 24 measured frames. No camera or human recording. All 192 measured outputs contained no poses; equality only on negative fixture.
CPU/GPU labels are requested MediaPipe delegates, not proof of physical GPU acceleration. Headless Chrome API timings are not production camera FPS, real-user UI latency or mobile battery/thermal results.

| Mode | Round trip p95 ms forward / reverse | Main-thread timer lag p95 ms forward / reverse |
|---|---:|---:|
| main CPU | 45.5 / 37.3 | 44 / 30.5 |
| worker CPU | 37 / 44.9 | 1.1 / 1 |
| main GPU | 11.6 / 14.5 | 10.8 / 10.1 |
| worker GPU | 42.6 / 17 | 1 / 1 |

Reverse first worker GPU frame took 7548.1 ms round trip; forward main GPU max timer lag 7248.3 ms. Order/warm-up affects measurements. Worker bounded in-flight drop, cancellation (reverse), resource cleanup and disposable browser cleanup verified.
Decision: retain current main-thread production path; no runtime adoption or global speedup claim. Real positive/negative motion parity, mobile Chrome/WebView device tiers, sustained latency, memory, thermals and UI responsiveness remain required.
QA only: no production imports, profile writes, APK, deploy or dependency installation. Existing BF-211 pinned build acceptance is not invalidated by these QA additions, but does not certify later concurrent source edits.

## Evidence
- qa/pose-worker-spike.mjs: 15310 bytes; SHA-256 5f7a19cd1f5ca72b750e163dc8c4aaa88e7e8b3a02c9b5bcb867f4ffcb92e89c
- docs/audits/BF_212_POSE_WORKER_SPIKE_20261125/spike-v1.mjs: 14210 bytes; SHA-256 da053d894545ea436c589d591ef70c22caf69ab41076c1b666624749e4f9e843
- docs/audits/BF_212_POSE_WORKER_SPIKE_20261125/spike.log: 4689 bytes; SHA-256 6224d50ef6710be508b7e7a76f4d3f70633eb0090c5fc16af2cb98294934b9a8
- docs/audits/BF_212_POSE_WORKER_SPIKE_20261125/spike-reverse.log: 5441 bytes; SHA-256 30402c96f693c36ee08a7d66219fc0bfa2d5822802a08442b549c7036c992522
- docs/audits/BF_212_POSE_WORKER_SPIKE_20261125/exit.json: 178 bytes; SHA-256 f4e499b201e671b997341cfb3e59516b2b0c5407bfa5a18da6f2b02ad2e453dc
- docs/audits/BF_212_POSE_WORKER_SPIKE_20261125/reverse-exit.json: 178 bytes; SHA-256 ace351e1fccc9b0de2a0da0589bb55e8d37983aa0475aca5c74606e9cd895200
- docs/audits/BF_212_POSE_WORKER_SPIKE_20261125/comparison.json: 17933 bytes; SHA-256 0d6e4f058e54050ca8dc543498866c0137dd898b4133345dcecf9d3d1735b461
