# BF-603 — pinned local pose model / browser inference
Date: 2026-11-27
Scope: local engineering evidence, not release, real-camera accuracy, application offline integration, or redistribution approval.

## Implementation and evidence
- Created qa/offline-pose-model.mjs (6453 bytes, SHA-256 42bc9851e681d4b561e25cc3cd85d7e15e62e058cdbaf93ebc5c2d4411cb23a1), qa/offline-pose-model.test.mjs (3217 bytes, 7e6105fc8990e1f6d98e649ee9a9488c8c0d3f436bdc2059f48bbe6dfa678a3e), qa/offline-pose-model-e2e.mjs (14504 bytes, 2b88896ec1172aa58eed230415beef46df71840ef191f73f3aa92ad0b0c0e1d6).
- Added mandatory offline-model-unit gate to qa/release-gates.mjs, preserving previous recovery gate and keeping acquisition/inference operator-only. Result: 12318 bytes, 658998fb9da96b86828f838f1af3fba002fef01ab522ffe9716b9ca8280e0ece. Exact pre-change backup .bodyforge-qa/bf603-model-probe-20261127/release-gates.mjs.before (12140 bytes, 22ff534e8382d2e97d9e401fa44379ad081a20ad9a52d65579db3bc0e18832aa). Roll back only after re-verifying current hash and checking for subsequent edits; do not overwrite unrelated changes.
- Sources: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker ; https://huggingface.co/litert-community/MediaPipe-PoseLandmarker-Lite ; model card reports Apache-2.0 and exact 5777746-byte SHA-256 59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a. Card generation 1682624738331272 returned HTTP 404; official versioned GCS object HEAD returned 1682624736756847. Verified generation-pinned source https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task?generation=1682624736756847 ; acquired and independently verified exact hash and size. Model remains ignored, local QA only. No public asset, package, application import, or distribution.
- .bodyforge-qa/bf603-model-probe-20261127/model-manifest.json: 560 bytes, a1babf90da6901ae6511442e3473da91f87c3eddbdd5bb00b9c1464f8594b3a2. SDK: installed pinned 1.1.1, seven runtime assets, 40825735 bytes.
- Focused runtime/model unit tests: 15/15 PASS (7 new). Acquisition and independent local verification PASS. Browser E2E PASS: CPU VIDEO, 3/3 synthetic-avatar detections, 0/3 blank-frame detections, 33 finite landmarks per positive pose (image and world). Initialization 371 ms; sample inference times 149.4,19.9,20.3,64.1,26.5,26.1 ms, not a performance benchmark. Strict local CSP/CDP restrictions, outbound and forbidden-local canaries denied, no unexpected external requests or attempts, no real camera attempts, zero storage keys, owned browser cleanup verified. inference-r1.log: 1046 bytes, e9a2ec3daffa5c28b7485803c2a6611a1f28b12295448ec6ff9ba12f1ce4def7. Synthetic screenshot fixture, not real-person validation.

## Fresh release qualification
- HEAD 11d51edf407bed2ad7e1fd0a04332654fe46afcb. Local snapshot 429 inputs, source hash 99c7da78e8228125336c12fe2e19c403343065bd9827580370b57ba7f82bec11. Full gate stopped at unit: 10 of 11 reached gates passed, including offline-model-unit. Reproduced heroLayout.test.ts failure (1 failed, 1 passed): existing assertion at line 20 requires shirt toggle before muscle block; observed indices 3059 versus 2067 in parallel UI work. No changes to that test or component. Working tree continued changing during qualification; no full current-tree PASS claimed.
- Release receipt .bodyforge-qa/bf603-model-probe-20261127/release.json: 3747 bytes, a4529cb74a454b3b7ecf319d57e5bb2d1fbf1f96a11d59688a1195b14884c4c4. Repro log: 1879 bytes, 3150d723fcb24bef50e40e106cd3bc74018553e405285a49a8f773fb0ddb3a46.
- Independent diagnostic snapshot TypeScript and build both exit 0. 76 distribution files, 35920587 bytes; diagnostic-build.json: 22441 bytes, 6f96b5925aa559c8d258f291e7926ef099532b92451cf60a9e83943a9f4e712c. Diagnostic build is not a release qualification. git diff --check exit 0 (line-ending warnings); existing local dev origin returned HTTP 200.
- No commit, push, deployment, APK, product-origin worker, or real player data access.

## Decision and next gate
BF-603 local model/inference experiment PASS. Overall release PARTIAL, blocked by independently reproduced hero-layout regression and source drift. Production application still uses network URLs. BF-604 requires its own prototype result, approved integration and release qualification, license/notice review before distribution, and real-device validation. Clean release receipt deliberately does not imply local model/inference verification.

Delta: pinned model verifier, regression tests and browser evidence.
Trace: exact file hashes above and retained local logs.
Confidence: observed local test outcomes only.
Revisit on any model/runtime/source hash change, product integration, or distribution decision.
