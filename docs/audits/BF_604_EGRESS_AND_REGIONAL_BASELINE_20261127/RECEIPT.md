# BF-604 — connection policy and accepted regional progression regression

Date: 2026-11-27
Verdict: TESTED_LOCAL for scoped connection protection and accepted progression regression. Integrated release snapshot PASS. Offline-cache experiment PASS; product offline integration remains PARTIAL.
HEAD: 11d51edf407bed2ad7e1fd0a04332654fe46afcb (dirty workspace preserved).

## Owner decision and change boundary
Owner confirmed new group/subgroup progression, independent subgroup upgrades and associated interface. The product decision was recorded in docs/BODYFORGE_REGIONAL_PROGRESSION_DECISION_20261127.md, 3672 bytes, SHA-256 afd67059920ef36bbac7996058e5f7e36ec0d789400a61e43089ab450e3f4f0b, read-back PASS.
ForgeWorld.tsx, MuscleZonePanel.tsx and muscleZones.ts were preserved byte-for-byte during patch; no restoration of obsolete layout. Current configuration: four groups, 15 zones, 12 points/zone, 180 total, 25 coins/point. Existing readiness gates and legacy migration retained.
Updated heroLayout.test.ts to protect owner-approved muscle-panel-before-cosmetics structure, separate subgroup controls, unique shirt control, and disabled purchase safeguards. Existing economy test covers all 180 purchases.
Added narrow connect-src policy in index.html: self, exact pinned MediaPipe CDN WASM directory, exact versioned GCS model URL. No SDK byte modification or new dependency. This is connection protection, not comprehensive CSP, privacy certification or removal of network asset delivery.
Added pose-egress-unit and pose-egress-browser mandatory gates, using exact index and entry hashes. Browser test uses reachable synthetic loopback control, verifies same-origin fetch, enforced Fetch/XHR/Beacon denials, zero browser canary hits, zero real camera calls and unchanged synthetic localStorage.

## Patch inventory
Before/after bytes and hashes in .bodyforge-qa/bf604-egress-20261127/patch-manifest.json: 1526 bytes, SHA-256 b58fbd38942710400b841e3514fdeba0cc641654cbe478d39a2bc18ad30f6af8.
- index.html: 1274 bytes, ee117a4222cf463fb749f8b2915c0b323770a690551da50a646f4088d3cb5ff6
- qa/release-gates.mjs: 12597 bytes, ae3e17170f617746f268a9a3ac44d2bf51831c17d154955fcf97faf0de052606
- src/lib/heroLayout.test.ts: 3440 bytes, 805205dffde3182053a5bbd8929bfba090e6bacfdf57c1090b3849e9243292da
- qa/pose-egress-policy.mjs: 1651 bytes, 7a47cd204a8155daa4a3d48789dd4e97c205794bc1cebcaa56fa487c219bdde0
- qa/pose-egress-policy.test.mjs: 1931 bytes, 8f8061df412bd47ee5cc5f649bcb8e83ff4bb2693ccbf0be1ea9d3cf51001b0e
- qa/pose-egress-e2e.mjs: 7874 bytes, f56785fa531cf2d97cc1cf01e546f3666ce2793f94ed1e946a2364ad5b6b096e
Exact preimages of modified files are under .bodyforge-qa/bf604-egress-20261127/before. Restore only if current target matches recorded postimage; remove only newly created matching files; never revert other work or accepted design.

## Verification
Focused 12/12 Node tests PASS (7 model + 5 CSP policy). Hero/zone focused Vitest: 2 files, 7/7 PASS, including all 180 sequential independent purchases. git diff --check exit 0.
Full isolated release: node qa/release-gates.mjs, installed JDK scoped to process, physically copied dependencies; exit 0, tested-local, stage read-back, 26/26 gates PASS, duration 337.75 s. No mobile replay.
Snapshot inputs: 439, source SHA-256 e72bce3e522bd0b0d1b9d51b9ac2f49d63230b82ba68babecf98bdd6d14b92de. Distribution 76 files / 35932397 bytes, index 1615 bytes SHA-256 1b65bbc69ead4df5a833e0dcdcf175f267f31ff3fae0ca2cc8335ef0db202e77, entry index-B9Io_h4U.js 391780 bytes SHA-256 bd41413e224a2fd78ab22ebb8f0d4f3f982a661da9ee10981c048c4f48478a1d.
Raw release.json 21193 bytes, SHA-256 eb824a8d6dea769e24625afe22027107944f5cba53fd5386c42a2c7f44dca21b. release.stderr.log 1671 bytes, c073a9b04ea173a7a6dc341f0ec507c01ace0c0d725e92cb748a00b833e71ad1. hero-zones-tests.log 538 bytes, 25e7a22df5d410e52fffdd709840fd1e1ebae880f0932bb203df575709bdf5b0. All in .bodyforge-qa/bf604-egress-20261127.
Source and copied snapshot before inventories equal: each 44788 bytes, 3198fe97fbf7393fc5e83a75094363a0c1d6753cf8916b4336786e7654bc6c45. Source after inventory differs (44894 bytes, 308f8a2f8f96525c4ecc52e407a0c12213c7482e1017b3e1e16779f357d8e8d9). Six avatar/review source changes and one new source file from concurrent work; muscleZones.ts difference examined: only addition of local review version 6. No restoration or overwrite of concurrent changes. PASS bounded to isolated snapshot, not current working tree. Existing dev server HTTP 200, CSP present.

## BF-604 experimental offline run r5
Exact release-qualified snapshot above, pinned model/runtime bytes, isolated test worker, disposable browser. 83 cache entries / 82379739 bytes, manifest digest c38f7e8508f10590588a86e99a8b4d18793f9db13676ab33b93442096f78187a. Exit 0, 30/30 assertions, 30.77 s. 
Corrupted update refused; previous cache retained; valid update waited; activated new version preserved synthetic saves and backup; offline app/entry served by worker; actual model and WASM served by cache; fake-camera inference active offline; no reward or byte mutation on stop. Legacy profile UUID migration only, every other field and backup unchanged.
Zero loopback server requests during offline phase; zero unauthorized external HTTP responses. Actual enforced CSP event: connect-src, blocked https://odml.pa.googleapis.com/v1/log, disposition enforce. No unexplained CSP violations; no claim that SDK never attempts telemetry. Browser cleanup PASS, remaining 0.
Runner .bodyforge-qa/bf604-cache-spike-20261127/run-egress-policy.mjs: 20390 bytes, a8531eff1af9717a792d8e5fdef47db031b8273567b4cdc5889883b801408eae.
Log run-r5.log: 2402 bytes, 275c0b1671df1d20f36bec3ce69f7036f7f5eb34e892f40ea2c222dafd14986e.
Worker sw-template.js: 3193 bytes, 6047b97afad33e92bb7ab3729b49abf60286eea1c5544d5514234f0468d9114d.
Prior failed attempts retained. Initial patch-generator syntax error occurred before any target writes; corrected by separately staging files.

## Sources and remaining limits
https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src
https://github.com/google-ai-edge/mediapipe/issues/6306 (maintainer states blocking outgoing requests remains compatible with SDK use; not a version-specific privacy certificate).
Next: integrate local verified resource delivery, production worker/version manifest, readiness UX, quota/corruption/recovery tests, license/notice review before distribution, and real-device validation. Retest latest avatar/UI source after parallel work. No experimental model promotion, no production-origin service worker installation, no APK packaging, no commit/push/deploy, no real player save or camera access.

Delta: accepted progression baseline protected; enforced connection policy and two mandatory gates.
Trace: exact patch inventory, full snapshot receipt and successful offline test.
Confidence: observed local evidence only.
Revisit: input drift, model/runtime policy change, product worker integration, real-device or distribution qualification.
