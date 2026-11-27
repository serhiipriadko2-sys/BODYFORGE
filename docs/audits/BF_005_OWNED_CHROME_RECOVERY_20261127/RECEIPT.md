# BF-005 owned Chrome recovery -- local engineering receipt

Status: TESTED_LOCAL for Windows owned-browser recovery on pinned snapshot after one bounded unchanged replay. Full BF-005/702 integration and root security adoption remain PARTIAL. No product or release claim.
Observed: 2026-11-27T16:15:45.251364+03:00
HEAD at freeze: 5ef0bb170cfa411e5c9bf8be95739c6e85104d1e
Snapshot: .bodyforge-qa\bf701-vite-patch-candidate\owned-chrome-recovery-20261127

Implemented: exact launcher argument and disposable temp-profile binding; directory identity and canonical path checks; reject multiple profile flags, profile links/hardlinked identity, missing launcher identity, mismatched on-disk/cached/endpoint identity. Browser.close is attempted only for the verified loopback browser. Windows fallback uses fixed PowerShell/C# adapter, exact parsed profile argument and executable, verifies process creation time and image on pinned OS handle before termination; re-enumerates exact matches, verifies launcher exit and port closure, then removes only the verified disposable profile. No global process kill. Other OS fallback is fail-closed; not integration-tested. This is not a security sandbox against arbitrary trusted test code or all local filesystem/process races.
RED: four added boundary tests failed against prior cleanup; then a no-spawn identity case failed against first repair. Both failures retained as summaries with raw digests. Corrected and verified: 17/17 owned-browser unit tests, 54/54 standalone QA tests (17 cleanup + 21 artifact + 16 field metrics). Two separate real Windows headless Chrome instances used with disposable profiles; 11/11 assertions in final integration, first graceful-close transport simulated unavailable, 11 exact-profile processes initially found, 2 explicitly terminated and remaining 0, launcher and port closed, profile removed; second browser still answered and then closed gracefully. All test browsers synthetic, no actual user profile or camera.
First freeze aborted before writes because parallel task added qa:release to package.json. Rebased only isolated candidate manifest: current scripts preserved, reviewed dependency fields identical to prior accepted Vite 8.3.7 candidate. Root untouched. No new dependencies installed.
Fresh snapshot: 370 input files and 79 output files, 35917217 output bytes. Entry 383875 bytes, original bundle gate PASS. TypeScript, artifact-boundary build, PWA manifest/icons, privacy 62/62 with zero canary disclosures, scoped diff and canon checks PASS. Vite 8.3.7/Rolldown 1.2.19 isolated dependencies reused. Build does not certify offline or field behavior.
First complete app test run: native Node Zone Allocation failed / out of memory exit 134; first camera browser scenario timed out activating synthetic camera exit 16, exact-profile cleanup PASS. The timeout cause was not independently isolated. Host also reported 0x800705AF during diagnosis. No threshold or test change to obtain success. After host memory recovered, one bounded replay used identical input/output hashes and same Vitest/browser commands, with conservative operational prechecks of >=2048 MiB free physical and >=4096 MiB free virtual memory before heavy steps. 1191/1191 Vitest tests, 112 files; camera 15/15, appearance lazy 13/13, workout HUD 41/41, all exact-profile cleanup PASS. Both original failures preserved, no further replay. Both owned preview processes stopped.
Current root drift: ["qa/avatar-quality-e2e.mjs", "src/components/Avatar3D.tsx", "vite.config.ts"]; new files: ["qa/head-volume-endpoint-qc.mjs", "qa/local-avatar-head-review.ts", "src/lib/avatarHeadVolumeReview.test.ts", "src/lib/avatarHeadVolumeReview.ts"]. Verified only frozen snapshot and the four owned files. Root manifests unchanged relative to current freeze: True. Root versions {"vite": "8.3.4", "rolldown": "1.2.14"}; existing loopback 5173 listening: True. Root Vite security fix not adopted. Do not expose vulnerable server over LAN.
The new dedicated unit and recovery integration are not automatically wired into the concurrently edited qa:release runner. Remaining: integrate resource and cleanup gates with coordinated ownership; verify current tree again once parallel changes settle. User server never stopped. No APK/AAB, Firebase, actual player data, Git stage/commit/push or deployment.
References: https://learn.microsoft.com/windows/win32/cimwin32prov/win32-process ; https://chromedevtools.github.io/devtools-protocol/tot/Browser/ ; https://chromedevtools.github.io/devtools-protocol/

Rollback: restore only qa/owned-chrome.mjs and qa/owned-chrome.test.mjs from exact .before copies when current hashes still match; remove only matching introduced Windows adapter and integration test. Do not overwrite concurrent edits.

## Owned files
- qa/owned-chrome.mjs | 14153 bytes | SHA-256 371767b91dcb52b21d25c1aa27ef10acff01786b420121862f2253ab0e0b853d
- qa/owned-chrome.test.mjs | 8454 bytes | SHA-256 2abdb71d0f2e6040368f9c4563dead9efed70b2d2139bc43046384235b8d14ad
- qa/owned-chrome-windows.mjs | 7302 bytes | SHA-256 ac9ba5f7a6bd86a4ae943981db99205926e57d10b72e50bdb1f7fee7cbdd9b94
- qa/owned-chrome-cleanup-e2e.mjs | 3880 bytes | SHA-256 2a3ab5a7d41f00f2101b34ba233aa8afa7610e10f2fccf376d86f34d97412dca

## Evidence
- appearance-lazy-replay.log | 943 bytes | SHA-256 7e541c1bc5c3927bceb9eeb6ad94e99d498349fe8487cd755f571d426c21b082
- baseline.json | 198 bytes | SHA-256 561473238177872eb2a689601739d9cbaf55f5f102b8e18a99adba8e92a0e392
- boundary-build.log | 22959 bytes | SHA-256 f18fb1a7d730bed5747518aea25436d7b2dcf5737f6371bd3c86f6b0c7847c95
- bounded-replay.json | 1682 bytes | SHA-256 fdc04ee3d0400ccaaa5532728e7c36642aea57e082db4cd53fff6bdb6a696bc3
- build-manifest.json | 11703 bytes | SHA-256 a20399c071bfa84e6889d3bac048cce18fd4e89db884e825732b03ec6878f8ae
- bundle.log | 281 bytes | SHA-256 0a38f1ff7b387598f8cd182983f909a362c4bb8eedb2a445f9292f67ef9a0321
- camera-frame-replay.log | 979 bytes | SHA-256 a61c0bf903a40b4ff89f7ae8291359b49d60cbf3a8121a4b73c732fa691eb7ee
- camera-frame.log | 805 bytes | SHA-256 110239975532e456c298f1962c0680512d2c313c66352c2aff13d7b9f3bdd46d
- candidate-gates.json | 594 bytes | SHA-256 d17eab33c58131b976efbed172b207b8a535a0eb1a68dea5ef960f1d39272e4c
- canon.log | 191 bytes | SHA-256 bd4804de303f67e95fa25e0fa54c637d0ae574c4ff18b54cfa79d64738587506
- cleanup-integration-final.log | 1222 bytes | SHA-256 cb72f8500c877854b5d3ff8307bc53f037b0ca06b9bf55c7ce165238ea4c16a6
- cleanup-integration.log | 1222 bytes | SHA-256 b3988f8c24890d27c1b05156768c349da6c61de4e7f231ffa54c694a1c19f114
- concurrent-package-review.json | 662 bytes | SHA-256 36fa9178dea7114db66e77ea7fc25895a41e91555b99179a4919e52fe3a05c0d
- full-unit-replay.log | 22483 bytes | SHA-256 3f96f0402818acc24f6b6d6b0ac1afb161a2357a05e5abf4210e1f4d62aca19d
- full-unit.log | 3227 bytes | SHA-256 8a46561da45259a5a33413be2b7c4b2bf56bc7b0e189fa3d7f556460f7fadea7
- gates.json | 2113 bytes | SHA-256 367989209c4ecb589c19f8e1d6c1e95fdd9f6c29bb80114b62ecb3865d1f5fab
- integration-syntax.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- local-gates-v2.json | 495 bytes | SHA-256 9270c19e37a92f298520157b186ee88e32fb807d9f45cc41578b5f136de93b0c
- local-gates.json | 430 bytes | SHA-256 91f447bd516a1bd4d94a4553dee75aa93b70c180a94d1b462bd063535adf4374
- module-resolution.log | 215 bytes | SHA-256 9eff8fcb0c1433ace8727c37d4a496f9c6bbf2d6ad0d8da494b3c95a060db53c
- owned-chrome.first-green.mjs | 13814 bytes | SHA-256 fe73965a17ac6f645034270aca4d996945549718dc36d62598dd629760dfd4ad
- owned-chrome.first-green.test.mjs | 6080 bytes | SHA-256 a5199c9bfcce913df7bf7e93a9e4c91d21558a518fe48cff776e4b95a44f85ac
- owned-chrome.mjs.before | 7562 bytes | SHA-256 3ae37d318fa7be58bf8795d6b86ea1b9bd98291379fb049e06d0bbb015515c3b
- owned-chrome.test.mjs.before | 3191 bytes | SHA-256 2e7f3a24d787c00e2c6486b02dc49c5811371c51c8fb0aa7bf76b32c9cbe91dd
- preview.log | 40 bytes | SHA-256 2ebb79b4e9d07b839a7656b6b86f315fa79b81b2f848586ea9fef1ea3325bd18
- privacy.log | 2320 bytes | SHA-256 45e28bf907fb64702ed5ea36022aa4520767814975fd62f8c70ab5dc708a3bca
- pwa.log | 149 bytes | SHA-256 7c12f115d664008d3f67bcf1926b75d5d312a74991fa8691458923ee3374099c
- red-summary.json | 256 bytes | SHA-256 0e29f12696f5e908eca40ad1938c44f4a5845567e9ae9ee430c9d31d963e7650
- red.log | 79 bytes | SHA-256 a518dbabbb80eeb6e099a737bf63aaf6be85611faca2a8b6ae618bd9d5cfcad0
- replay-preview.log | 40 bytes | SHA-256 70014c9f56b1a3975142caee3df1e7a693b479bd53f4311e028fd4f045929123
- scoped-diff.log | 229 bytes | SHA-256 7c33952ed5143f5831518bb584f3763539055059ffeacc5223feab6696fffdd2
- snapshot-qa-unit.log | 4625 bytes | SHA-256 daaf9093d091ea14c99b3e1d3c8fd52d158a61ee38e5540aea310bd3c078da1d
- source.json | 54059 bytes | SHA-256 7ba1fdcb86e659008a7f925967de9aa04950293cec041cb5cfa4d7bd0ac234d6
- syntax-final.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- syntax-v2.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- syntax.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- test-syntax.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- tsc.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- unit-final.log | 1209 bytes | SHA-256 ac497b56852d315490ad96e6af38a849310dee094555015ab674a3d67be13c5f
- unit-v2.log | 1626 bytes | SHA-256 5c00941a8f1f7605edd787aafe78cee387afbd7f8b56aa21e3262c1ded2951ad
- unit.log | 1209 bytes | SHA-256 26207570d1c81f579f238ecaabe048ac6da7941bfacc1e31e986347cdeb9fdd7
- unlaunched-identity-red.json | 216 bytes | SHA-256 945b65af5a13ab3f8ff933d75519b623765b0ab0c71c4bbbf914f942e2bed96b
- windows-syntax-final.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- windows-syntax.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- workout-hud-replay.log | 2531 bytes | SHA-256 0578ca6ca2e03c90392911239470bb5baf4d4e2e0197d6248948dc148a2ee4a8
