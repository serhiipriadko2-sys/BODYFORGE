# BF-603 local runtime verification - engineering receipt

Status: RUNTIME_ONLY_TESTED_LOCAL; BF-603 model/inference, distribution and BF-604 remain BLOCKED. No claim of offline workouts.
Observed: 2026-11-27T20:06:38.329759+03:00
HEAD: 226429ae1080d000336a7430926d64e4bb54a89b

Implementation: local QA-only pack with pinned MediaPipe SDK 1.1.1 JS and six WASM assets, full hash/size read-back. Fresh disposable Chrome and isolated loopback server. Eight standalone unit tests pass; installed pin verification pass. Initial expected sum omitted 156139 SDK bytes and was corrected to 40825735. Initial browser attempt blocked; instrumented diagnostic proved net::ERR_NAME_NOT_RESOLVED with no served assets. Fixed only host-resolver allowlist by excluding literal 127.0.0.1 from deny mapping, not by enabling arbitrary networking. Runtime probe now imports SDK inside guarded stage diagnostics and validates all seven response hashes in browser, standard and module FilesetResolver variants, and compilation of their two selected WASM binaries. CSP retains wasm-unsafe-eval rather than general unsafe-eval. Expected external fetch denied by page CSP; same-origin forbidden canary separately intercepted by CDP, zero requests reached local server. No unexpected external page requests observed. Does not prove OS-wide egress isolation or absence of MediaPipe inference telemetry.
Local pack: .bodyforge-qa/bf603-local-runtime-lMRNLE | 7 pinned files, 40825735 asset bytes. Runtime manifest SHA-256 9737b26728ae828df530881e9bc5bdab477fc7d60f4675fe16709ac7c4ca42c5. All bytes independently re-read. No .task file and no published public assets.
License evidence: official Pose Landmarker guide describes separate detector and landmarker inside one downloadable bundle, and links BlazePose GHUM model card. The card p.2 (2021-04-16) declares Apache License 2.0 for the landmarker family; not sufficient here to bind the exact float16/1 task bundle plus both constituent models and redistribution notices. Sources: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker ; https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf ; https://developers.google.com/edge/api/mediapipe/js/tasks-vision.filesetresolver ; https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy . Official MediaPipe SDK README also distinguishes local processing and API metrics; no real inference or telemetry conclusion from this runtime-only probe. Model download not authorized as a separate gated asset in execution prompt section 3; no download, product wiring, service worker, new package, APK or Firebase change.
Remaining BF-603: bind exact model license/provenance and notices, separate asset authorization, verified model bytes, local model initialization and synthetic inference under outbound deny, separate mobile validation. BF-604 depends on BF-603. Root production app not changed by BF-603.

Rollback: restore only qa/offline-pose-runtime-e2e.mjs from .before-diagnostic copy if current owned SHA matches; retain all audit history and QA packs.

## Owned files
- qa/offline-pose-pack.mjs | 6629 bytes | SHA-256 97e55fd2be790c2d25ad027d49f4f4bc3edec9f5a9f3c32358f18227fe0f7985
- qa/offline-pose-pack.test.mjs | 3306 bytes | SHA-256 fe3f86d2fab18590597596e6d71cecf7881894383c043e63d217059d9c2e667b
- qa/offline-pose-runtime-e2e.mjs | 10105 bytes | SHA-256 5b2c24ca0121165a28853bbeee1234460cca3f3f7ce4dcea838fa288ee97e371

## Evidence
- browser-diagnostic.log | 472 bytes | SHA-256 a00fa9d9f2656d3c347708ad606daeca844ab358cc6e8c7581506226448f45e6
- browser-gates.json | 454 bytes | SHA-256 667a8ca9c8b1bf85714731b528d20e6eb69c13713486563e94b33a251760efe9
- browser-loopback.log | 982 bytes | SHA-256 b74f0a43f0096982b304d3a26a181fdf23690d929c08eba3243c9df0f02d87e7
- browser-syntax.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- browser.log | 255 bytes | SHA-256 67bdf80bf47f211bfffbb5f52f21d73d2a9420af85ca6e1334c74f4868a53ad1
- diagnostic-gates.json | 514 bytes | SHA-256 f9f1aefaaea4d5b8070276c5dcf721aac7e7581ecd6c1d69515dc6590dece575
- diagnostic-syntax.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- initial-unit-failure.json | 200 bytes | SHA-256 c2c693b999a2b7abd19c0c2da413efbe13b4c70f602c0174a5e23a6add9d9850
- installed.log | 1593 bytes | SHA-256 05cdb2121673876d34dfea323824cdec0a506847caf9c42c4622f646381005b9
- local-gates.json | 287 bytes | SHA-256 b25db438852ac32e85d765d56e5ebe4b79dbe555e0f92b9cb6b8bc6f5660f8ad
- loopback-gates.json | 569 bytes | SHA-256 d5ee1b2b63d35414c97632fab01c4e17f29ca80070350320b66321c2827420b9
- loopback-syntax.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- offline-pose-runtime-e2e.before-diagnostic.mjs | 8580 bytes | SHA-256 47e8b162c51975f50876e83c738bad42089171255fad0008b5f501ef272bc495
- offline-pose-runtime-e2e.before-loopback.mjs | 9661 bytes | SHA-256 c27a957546d064a594ae7837b364c233cf384fb61b830828b6f199fdcee38bdf
- syntax.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- unit-corrected.log | 706 bytes | SHA-256 a2b0bb369bef24df6c949313f2908338282fda8920a93fcbe2f641fc4af7560a
- unit.log | 1501 bytes | SHA-256 708e5b224ecc53852b3fb08c9bb489e0afd293771e5110549a2ac9fcf6904f40
- verified-gates.json | 300 bytes | SHA-256 3c558c8f574b0eafcc4f55b9ff7d70592d216f6f2ef6e5f519caae6906a98a03
