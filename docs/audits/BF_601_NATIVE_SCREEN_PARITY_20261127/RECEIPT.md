# BF-601 native screen parity - local receipt

Status: TESTED_LOCAL_SOURCE_ONLY (specific native defect); web integration TESTED_LOCAL on exact frozen snapshot. BF-601 overall remains partial. This is not a mobile field acceptance or release.
HEAD: 226429ae1080d000336a7430926d64e4bb54a89b
Finished: 2026-11-27T20:08:27.157935+03:00

## Change
Removed the fighter-created precondition from the existing trusted-origin Camera SCREEN_PROBE. Retained document visibility, screen identity, marker readiness, busy-state and permission rules. Updated Android README and added actual Java-string probe tests. No App.tsx, StepsBoard.tsx, AndroidManifest.xml, permission or sensor-policy changes.

## Evidence
RED: 2 failed / 4 passed before fix; final probe 6/6 PASS. Targeted web 16/16 PASS. Java policies 23+22 PASS. Six Android production Java sources compiled against installed SDK 36.1 android.jar; 25 class files including policy test classes. Java 8 source/target obsolescence and deprecated API warnings remain; no compile errors. No APK/AAB packaging.
Web frozen source: .bodyforge-qa\bf701-vite-patch-candidate\r6-source-parity-20261127 (414 files); distribution 76 files, 35917410 bytes; entry 386855 bytes. Exact HTTP bytes confirmed. Types, build, bundle, PWA manifest/icons, privacy fixtures (62/62), full Vitest (1226 passed, 3 skipped; 121 files), native probe and runtime unit, 94 screen checks and 15 saved-content checks passed. All listed command exit codes zero. PWA offline mode and service worker remain absent. Synthetic saved player/backup/appearance bytes verified unchanged. No real user save read or written. Preview stopped; zero QA browser profiles remaining; existing root dev server retained.

## Scope and limitations
First freeze attempt detected concurrent source drift: qa/avatar-quality-e2e.mjs and src/components/Avatar3D.tsx. Preserved those edits; verified exact already-frozen snapshot separately. Result does not certify newer concurrent avatar changes. Root package manifests unchanged; isolated Vite/Rolldown candidate only. No installed Android app modified, physical phone check, APK, Firebase deploy or remote repository write. Full release runner not executed. BF-602 needs authorized phone evidence. BF-603 local runtime evidence is separate; model provenance/license and authorized acquisition remain open.

## Owned source hashes
- android/src/java/ru/bodyforge/healthqa/MainActivity.java: 64a571d9bddd82347ee758744189be182864bfe96a5e1869519c07a987d94c95
- android/README.md: 898dae9359b8c79083592a8e96a7531ce6e7c9a1dcacb2f90e75d621ea34d7a5
- android/tests/nativeScreenProbe.test.mjs: 4ef1abe58b0bb956aa1953ddc7c40131e15b55f1a530ffae103ac2fa3db20cad

## Evidence files
- native-gates.json: 7491 bytes, SHA-256 23d3f65496208766b55a31de782f0b3da7dcb7b390dfaa1503e58427c8b403ac
- web-integration-gates.json: 18561 bytes, SHA-256 78999ea035bc395b6616aa6a3ccc3a5f9d95faa8ad4139c5e83a4ab222e4cec2
- web-source-manifest.json: 60854 bytes, SHA-256 67c3f8b5f2e7cb7820bbab0abc6d5366123865dc17cd225b9c81efa1ed7a4baf
- red.log: 2239 bytes, SHA-256 1410bf83a2277909afbc86764b0f627f0976bf1d10326a44c39b121d80c7bb6a
- probe-final.log: 586 bytes, SHA-256 fd1f9bc04646fdc02c0238419b4830ced4815a47e2d3079ad2b28927d1137f69
- web-unit.log: 917 bytes, SHA-256 23620dcb37b830275f835e9e620c22659d1e29da0adae49d806d7b62fb6511f1
- java-steps.log: 719 bytes, SHA-256 60aeb0c0803ce7802df0ce907072364c26163b541eac92d20a64c887575eea94
- java-live-steps.log: 751 bytes, SHA-256 0d0923af55ded436c667f63d97d0cfdec1cb84db8a1d8ac38aed21b37ea1c093
- android-source-compile.log: 384 bytes, SHA-256 df057aa11e8d91f0346d22c43bd7845285e673eb41b04a7ec748b0f7d95ce33b
- build.log: 22441 bytes, SHA-256 bcb87a023cf2b6b64ecaaf182206088149320975c5f907eb97473b36aae6f414
- bundle.log: 281 bytes, SHA-256 3fae9b5bddb1cb4338cdc21546b9528c3a8d13b5c9ea17105544b3786842bd10
- pwa.log: 149 bytes, SHA-256 7c12f115d664008d3f67bcf1926b75d5d312a74991fa8691458923ee3374099c
- privacy-fixtures.log: 2320 bytes, SHA-256 45e28bf907fb64702ed5ea36022aa4520767814975fd62f8c70ab5dc708a3bca
- full-unit.log: 50657 bytes, SHA-256 25d173b2bd07adacc1d8c10498d20cc4640a848fc2ffa0cdcacb5ff7f05393ab
- native-probe-frozen.log: 585 bytes, SHA-256 cd1347363a975480d52a078dc241393900de532fba7d7f1ca889aaf5033180a2
- runtime-unit-frozen.log: 706 bytes, SHA-256 c912d3d75c5dcb4989eeb2c58f90ac08fe5dd2b641a7a43414d0a8cce5cef950
- production-screen.log: 4346 bytes, SHA-256 815f1378c3f11ce5390349137ad04afc758147f007859065cb87d79180b2f432
- production-content.log: 1054 bytes, SHA-256 459a9eebec1fe8d72c86a9e22d94096e0263a84cca3f71aaf91bc907f3359629
- final-diff.log: 259 bytes, SHA-256 be73c8132f337c4e3513d321297f16aa704b737a7ccabd3c776b4fe1e9fd071b
- canon.log: 191 bytes, SHA-256 bd4804de303f67e95fa25e0fa54c637d0ae574c4ff18b54cfa79d64738587506

Related BF-603 receipt: docs/audits/BF_603_LOCAL_RUNTIME_20261127/RECEIPT.md.
