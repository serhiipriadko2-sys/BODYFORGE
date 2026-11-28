# BF-604 — isolated offline-cache lifecycle spike
Date: 2026-11-27
Verdict: PARTIAL / product integration not authorized or verified. Do not mark the roadmap item complete.

## Verified baseline and artifacts
Used prior release-qualified snapshot .bodyforge-qa/bf703-recovery-gate-20261127/snapshot-real/dist, not the changing working tree. Source SHA-256 8a582692a6a7c384e8c8ad90158ea0d87c5a936398b10e0e3ed7c69af9d42fa1, application entry SHA-256 8f0e96eda920b04b653ed93e6b13f07318914d1546fbe731dd9062e8af10147d. Cache manifest 83 assets, 82367021 bytes, digest ca09fae5d4ae935c4ba714a1fec1a849d5c94b8d6aa118fdd2f42f008b7144ae. Used pinned runtime and model; no real user data, camera, or product-origin worker.

Files under ignored .bodyforge-qa/bf604-cache-spike-20261127 (bytes / SHA-256):
- sw-template.js | 3193 | 6047b97afad33e92bb7ab3729b49abf60286eea1c5544d5514234f0468d9114d
- run.mjs | 16226 | c2de30c3c0d6315e9a21fafb140929179849518196ccb216605a8af7dbc6ccd7
- run-identity.mjs | 17533 | 2aa620b7af9e44a54b8d54ed432540152fd1e31f3078406006404e479c8da17e
- run-network.mjs | 17914 | f2cd597671f2006c06aef9c5c7be6cfa97355c38850cf137650783d2575d8eb5
- run-r1.log | 470 | 114d259bb30eeb2baf1d047a478826c49d0cb022aad6f5fdc899ca0a2eefec7c
- run-r2.log | 1754 | fd4d12bafaf82c1c16bb7f2fff51b1203e7b709156e74b8fce7df18b630fc4c0
- run-r3.log | 1959 | c3cdb1a75ecd026cdd7f7162e2c0dd8b0713d63aac613b11c63431d331ab391e
- run-r4.log | 2542 | 5f0fa1a2d95d0bcec91a616b0165703d1a4a8c7eacdfc36b75ab8e2aac55932d

## Observed results
- Separate versioned cache, byte verification, commit marker, reject corrupt staging and keep previous cache; no forced skipWaiting or clients.claim.
- r1: owned-browser prefix validation failed before navigation. Exact launch/endpoint ownership rechecked and only the disposable browser closed; zero remaining matching processes/listeners verified. Its invalid-prefix temp directory was retained; no unsafe recursive deletion. Corrected prefix before r2.
- r2: 23 checks passed; strict all-byte assertion after first training failed. No overall PASS.
- r3: 26 checks passed. Legacy first-session identity migration identified: only primary storage key changed; new UUID, all other profile fields and all backup fields deep-equal. Stop itself did not alter bytes or award XP. Failed on unexpected external origin. No server requests in offline phase in r3.
- r4: 25 checks passed, including repeated confirmation of identity migration, corrupt update rejection, safe update activation and exact save bytes across update, offline reload, cached model and WASM, actual detector with fake camera offline, no reward or byte mutation on stop. Observed two unexpected requests to https://odml.pa.googleapis.com/v1/log (preflight and script Fetch), both failed net::ERR_NAME_NOT_RESOLVED. Network capture records route and failure, not payload. One loopback request occurred during offline phase; source not resolved. Strict offline-server assertion failed, exit 16. Browser cleanup PASS, remaining 0.
- No proof of transmitted video or personal data, no claim of telemetry-free SDK, no true-device exercise accuracy validation.

## Blocking decisions and acceptance
1. For product use, require explicit local asset delivery and deny unauthorized egress in the production security policy. Do not patch vendor bytes or simply suppress telemetry test failures. Relevant upstream discussion: https://github.com/google-ai-edge/mediapipe/issues/6306 (Web SDK metrics and redistribution). Confirm applicable license/notice/terms and evaluate supported opt-out or alternative runtime before a distribution decision.
2. Identify the local offline request and distinguish browser update checks from application dependency; retain negative update and fail-closed cache checks.
3. Freeze integration scope, coordinate concurrent avatar/UI edits, and address heroLayout unit failure documented in BF_603_MODEL_INFERENCE_20261127/RECEIPT.md. Re-run all gates on exact integrated snapshot, test update/rollback, quota failures, storage retention, and supported real devices.

Delta: isolated cache implementation and four runs, not installed on app origin.
Trace: exact artifacts and hashes; failed evidence retained.
Confidence: observed experimental behaviors, not release readiness.
Revisit: external egress policy and offline request classification, followed by product integration.
