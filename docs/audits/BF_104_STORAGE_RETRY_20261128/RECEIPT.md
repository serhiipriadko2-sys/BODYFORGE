# BF-104 recovery retry and resilience: local qualification

Date: 2026-11-28. HEAD: 11d51edf407bed2ad7e1fd0a04332654fe46afcb (dirty worktree).
Status: TESTED_LOCAL for recorded snapshot; not a release or physical device certification.

RED: storage access restored after denied startup, explicit retry incorrectly produced conflict with no known epoch. Fix: only when no trusted epoch, no hydration, no volatile completion, explicit retry invokes existing reload/reconcile flow; ordinary known-lineage and pending-result paths unchanged. New E2E asserts no wallet/backup creation for empty startup and exact primary/backup/epoch preservation for existing startup.

QA harness: resolve exact optimized MediaPipe module from dev app, reject non-loopback, shared owned-browser identity/cleanup, unique screenshots, updated preflight and stalled-frame copy checks. Initial harness patch lacked explicit loopback Chrome flag; rejected before navigation, verified owned browser subsequently closed. No owner save/webcam used. Earlier failed runs retained. One initial run also observed unrelated concurrent source changes; latest runs have identical before/after manifests.

GREEN: 360/360 tests in 21 files; TypeScript exit 0, Vite build exit 0, bundle gate PASS, production finish-save 29/29; resilience 68/68 in isolated dev Chrome; ownership 19/19 and expected non-loopback rejection; owned browser cleanup PASS, remaining 0. Build and resilience snapshots each stable; only QA script differs between them.

Entry: index-BYo-OK-S.js | 392037 bytes | SHA-256 0f7db2ba86fa20cb91c1abb4f38181b5462a861ccda738aee2bfae5dd9202293. 21.1% below baseline, 3D chunk warning remains. Camera fixtures synthetic; real device and full-project unit sweep after this specific patch not performed. No deploy, push, commit or APK.

## Verified evidence

- src/hooks/useProfileStorage.ts | 20538 bytes | SHA-256 df6c412dbebe0047d49b0f5fe5ecffd7940b0ed4ffc1e346eccc465eb0391c8d
- qa/resilience-e2e.mjs | 26489 bytes | SHA-256 cf93737015a813fda3c4e1c947d9335edce9de8297055316fce855e1b7945390
- .bodyforge-qa/bf104-postfix-20261128/source-before.json | 63630 bytes | SHA-256 097166806af5dbe7a5515248d7b3ccc806393e53904f6354d212de1ee7bfcca2
- .bodyforge-qa/bf104-postfix-20261128/source-after.json | 63630 bytes | SHA-256 097166806af5dbe7a5515248d7b3ccc806393e53904f6354d212de1ee7bfcca2
- .bodyforge-qa/bf104-postfix-20261128/economy.log | 3127 bytes | SHA-256 9745e6679227fcf4a2c75f6090d056f40face56a0f672f09c5e17476fc4555bd
- .bodyforge-qa/bf104-postfix-20261128/tsc.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- .bodyforge-qa/bf104-postfix-20261128/build.log | 4117 bytes | SHA-256 dc87a8655a448af1ca7c2296dfcfa69081e029b2b772f0ab540ac2059d18f581
- .bodyforge-qa/bf104-postfix-20261128/bundle.log | 281 bytes | SHA-256 915d2fe7ab13b6a1dada538ae60d2c94531fdda8e0a7c1095b1972d6b1f7d37f
- .bodyforge-qa/bf104-postfix-20261128/finish-save.log | 2128 bytes | SHA-256 be8a4d395f573ffe4b50e852b0d3a4b2eecfdcb9067adc82f2c6eba0454000ad
- .bodyforge-qa/bf104-postfix-20261128/run.mjs | 4058 bytes | SHA-256 46456c451ca46944ee2081b155a1636a897a9ad270900c8ba1ea8ac55cd72ecf
- .bodyforge-qa/bf104-resilience-copy-20261128/source-before.json | 63630 bytes | SHA-256 0d09e840e8d99d9481942044c3784bc01b1d19dee1b015f4af048dd7fcaf533d
- .bodyforge-qa/bf104-resilience-copy-20261128/source-after.json | 63630 bytes | SHA-256 0d09e840e8d99d9481942044c3784bc01b1d19dee1b015f4af048dd7fcaf533d
- .bodyforge-qa/bf104-resilience-copy-20261128/ownership.log | 2135 bytes | SHA-256 bea6a6efbb785e2d59caabc0bf43d4622e4d07059ffb5b8a5739e1023bfe0af7
- .bodyforge-qa/bf104-resilience-copy-20261128/wrong-origin.log | 625 bytes | SHA-256 bb86f068cfd499d7f6a2c3f01339a3936217b146cbd59f5a8f6bfb9a314947bd
- .bodyforge-qa/bf104-resilience-copy-20261128/resilience.log | 4230 bytes | SHA-256 15ae15179a155538112e94282a78741bc6dbef352e12ca35015d0064aa012021
- .bodyforge-qa/bf104-resilience-copy-20261128/run.mjs | 3745 bytes | SHA-256 81aa923dc154d458825e47e7c9f069cad517f75831950432eb5c1c7b721b9c81
- .bodyforge-qa/bf104-resilience-copy-20261128/screens/bf-audit-recovery.png | 50590 bytes | SHA-256 e5ef79b4b285e5019973cb76b7ce5a0fe7ff73388e8bb1e5972d80658fa8d473
- .bodyforge-qa/bf104-resilience-copy-20261128/screens/bf-audit-frozen-camera.png | 89980 bytes | SHA-256 9ee7add4225801c0403ece2de2d10a556cf1b90ba1392cbc5e91644037432b31
- .bodyforge-qa/bf104-resilience-copy-20261128/screens/bf-audit-3d-fallback.png | 202116 bytes | SHA-256 369d801bbf3a4c264f0f75d93e73ba6193a825f26618df8bb37e5da6e6b048ca
