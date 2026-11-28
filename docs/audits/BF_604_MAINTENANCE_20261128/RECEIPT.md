# BF-604 maintenance receipt (2026-11-28)

Overall status: PARTIAL; local qualification NOT PASS; public and device gates remain open.

## Scope and implementation
- Exact notices for six pinned npm dependencies and the BlazePose model. 30038 bytes; strict plain-text loading, explicit user action; pinned public and offline inventories.
- Explicit retired-cache maintenance: reconstruct old manifest from content; no deletion of unrecognized or current caches; one controlled root client; exclusive lock; rechecks; result read-back. This is same-origin trust, not a signature/authenticity proof. No auto clearing of site/player data.
- Native .txt/.md MIME mapping to text/plain with UTF-8. Seven source-contract checks and seven executions of the exact extracted Java MIME method passed.
- 30/30 license checks, 33/33 license/profile checks, 63/63 focused tests, 67/67 worker browser checks, TypeScript and diff check passed in scoped runs.

## Release chronology
- R1: failed; 25/26 executed gates. Failed at synthetic-screen-ownership. Diagnostic replay passed 94 checks on the same bytes. Root cause not established; original failure retained.
- R2: failed; 26/27 executed gates. Only two native files changed from R1. Frozen source: 475 files, SHA-256 33cd1b6870bb88c212320f0b912acd009e8c806158f8c1d68c86aab92cb6b25d. Cleanup failure: native-scope-uninspectable. No proof of underlying OS cause.
- Independent source and distribution read-back completed for R2. 80 files / 36035983 bytes.
- Exact same web bytes: screen-content diagnostic 35/35, corrected backup-help 39/39. Original backup-help diagnostic failed on CDP; boolean DOM predicate and cache fixture assertions corrected in QA only. Chrome scope: bounded read-only retries, no relaxed ownership checks; 24/24 unit checks and 11/11 two-browser recovery checks. No formal release pass. Tower/mobile remain not-run in these formal releases.

## R2 checks
- resource-unit: PASS (exit 0)
- artifact-unit: PASS (exit 0)
- offline-worker-build-unit: PASS (exit 0)
- third-party-notices-unit: PASS (exit 0)
- third-party-notices: PASS (exit 0)
- owned-browser-unit: PASS (exit 0)
- native-policy-unit: PASS (exit 0)
- native-policy: PASS (exit 0)
- offline-runtime-unit: PASS (exit 0)
- offline-model-unit: PASS (exit 0)
- pose-egress-unit: PASS (exit 0)
- offline-runtime-pins: PASS (exit 0)
- field-metrics-unit: PASS (exit 0)
- offline-worker-shell-browser: PASS (exit 0)
- owned-browser-recovery: PASS (exit 0)
- unit: PASS (exit 0)
- types: PASS (exit 0)
- artifact: PASS (exit 0)
- offline-worker-artifact: PASS (exit 0)
- bundle: PASS (exit 0)
- pwa-install: PASS (exit 0)
- private-path-fixtures: PASS (exit 0)
- preview: PASS (exit 0)
- privacy: PASS (exit 0)
- pose-egress-browser: PASS (exit 0)
- synthetic-screen-ownership: PASS (exit 0)
- synthetic-screen-content: FAIL (exit 17)

## Scoped upstream and native results
- Upstream: SCOPED DIAGNOSTIC PASS; formal release failed; 111 checks; 86 entries, 82430977 bytes; synthetic camera only, no real device..
- Android packaging: not-run.
- Physical device: NOT_RUN. No ADB device was attached during preflight; no install, permission grant or personal health/camera test.
- Public/offline redistribution: PARTIAL. See LICENSE_BOUNDARY.md; no blanket license approval, public registration, deployment or production signing.

## Working tree read-back
- Scoped paths: 28/28 exact matches.
- Intentional scoped changes after R2: qa/backup-help-e2e.mjs, qa/owned-chrome-windows.mjs, qa/owned-chrome.test.mjs.
- Other source changes versus frozen R2: android/pack_web_apk.py, android/tests/test_pack_web_apk.py, qa/local-avatar-foundation-review.ts, src/components/Avatar3D.tsx, src/lib/avatarZoneFoundation.ts, src/lib/muscleZones.ts, src/lib/regionalFoundationHair.test.ts, src/lib/regionalFoundationHair.ts, src/lib/zoneAssetPins.ts. These changes were not overwritten or qualified by this release.
- No commit, push, deployment or production release.
- First patch preflight rejected an incorrect expected hash; a too-long command was refused before execution. Both were corrected with smaller verified actions. Native MIME issue was fixed separately before R2. One diagnostic harness used an incorrect receipt field and stopped before starting Chrome; corrected to the pinned preview entry hash. Original failing receipts retained.

## Evidence (exact bytes)
| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `.bodyforge-qa/bf604-maintenance-20261128/scope-retry-patch.json` | 443 | `e7e3c3cc278ee227d33021e05dcd52b1673d4bb1236d5474152947eab3cb3872` |
| `.bodyforge-qa/bf604-maintenance-20261128/scope-retry-unit.log` | 5206 | `dad30e74d731cf06c20270a96a1bbb59a81f09681a73d03ecf4356fe11ed2497` |
| `.bodyforge-qa/bf604-maintenance-20261128/scope-retry-e2e.log` | 3056 | `2b462da0bc3e0cc426b3d8b2c5e2d3c765a50b76719ce41d8ccef8356c47f79e` |
| `.bodyforge-qa/bf604-maintenance-20261128/backup-help-boolean-patch.json` | 220 | `7f4f1a00ee8d84e1a9836d996bd593fff92a1c1f896288f0337f34a74eab8896` |
| `.bodyforge-qa/bf604-maintenance-20261128/diagnostic-remainder.json` | 556 | `8b2fa7576f9ea9021a0368022494bc5d96dc7e518ea4defafd8e0a65ce6ac5c4` |
| `.bodyforge-qa/bf604-maintenance-20261128/diagnostic-screen-content.log` | 2537 | `742aa3faf2237ffe66e648ea79c7b41d6747c0438fa3ff87dee880c458c659dd` |
| `.bodyforge-qa/bf604-maintenance-20261128/diagnostic-backup-help.log` | 823 | `fcd33836614eed0cb1816a4c92fe0571d5981313f67eaac7b7d8fe86a4a2ddab` |
| `.bodyforge-qa/bf604-maintenance-20261128/diagnostic-backup-help-boolean.json` | 367 | `a94e24c9a4b14a2d86b1f1f42a9d2194a9c1d38a560c2ccbf0d63171caa97e93` |
| `.bodyforge-qa/bf604-maintenance-20261128/diagnostic-backup-help-boolean-r2.log` | 2388 | `3a59b413ab93cfc46bf784acc45b2d972e58d64341917636632166f2db30000f` |
| `.bodyforge-qa/bf604-maintenance-20261128/run-maintenance-diagnostic-r2.mjs` | 38531 | `fac71c6003e94be0aab4d9ec2457b87b7babd051adee4728511902e4d49858f3` |
| `.bodyforge-qa/bf604-maintenance-20261128/source.json` | 73774 | `3ca1ef9aab33357d8b5c9d64d26c25fd44069072a74be5cfbfa72340129bcfd6` |
| `.bodyforge-qa/bf604-maintenance-20261128/source-r2.json` | 73774 | `d03a2210421ea82ab450edd033a601a682ae1607d8ca208b7ef8eaa3c4481876` |
| `.bodyforge-qa/bf604-maintenance-20261128/scoped-final.json` | 4952 | `fd888dc748cadfc65bb27c3a67cc2521e2814bcd88a261013dcb75db982d0b2c` |
| `.bodyforge-qa/bf604-maintenance-20261128/license-patch.json` | 3388 | `5278a132e12708d9f1a87c09a831c43d61d5d28cdda42323a5ac8392178959c7` |
| `.bodyforge-qa/bf604-maintenance-20261128/maintenance-core-patch.json` | 440 | `7f93d766886afccc18b819ae574dc9ceb3a38cd884729cf81ce3758aee900546` |
| `.bodyforge-qa/bf604-maintenance-20261128/maintenance-client-patch.json` | 670 | `57ae3d9b5157a4cb08c044bbb2a91485dabf83a9be2ddae24441d09240ad6a6e` |
| `.bodyforge-qa/bf604-maintenance-20261128/maintenance-ui-patch.json` | 238 | `9c4315539119c3f339a979faa75cbb90f4c67f3557955d8d69fb7ca53ff4ab12` |
| `.bodyforge-qa/bf604-maintenance-20261128/maintenance-browser-patch.json` | 446 | `9c9aa8b6c95eb53e81ef576dee4b867a327b5c9932c36eb6062105b344b307a6` |
| `.bodyforge-qa/bf604-maintenance-20261128/receipt-check-patch.json` | 446 | `e852c8273b29e65e896cf15b3ff51fc4019c6993001744e3b4b50a7f1ca2dbbf` |
| `.bodyforge-qa/bf604-maintenance-20261128/native-mime-patch.json` | 488 | `ba9ccc94f02574ba9a275820560aec138cf86a68e9741df348f166ab01234563` |
| `.bodyforge-qa/bf604-maintenance-20261128/license-unit.log` | 2568 | `56403e9952d96a828d1bf21072c3e8b1dd0225910263a2f5e09394a81af589d9` |
| `.bodyforge-qa/bf604-maintenance-20261128/license-app-unit.log` | 915 | `2bc115ecfe78355ae627b860e148d23e3d6b869941ec13604c2ea1f3fe02bde4` |
| `.bodyforge-qa/bf604-maintenance-20261128/maintenance-unit-r2.log` | 1022 | `93b68838dfc914117a42c950b98fa0d5ba75cd41aef25487afdade3324747612` |
| `.bodyforge-qa/bf604-maintenance-20261128/types-r1.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `.bodyforge-qa/bf604-maintenance-20261128/shell-r1.log` | 3047 | `00eb9488e4fa4ba58f3f532a5eca5d64eb08966ca74059d740a0cc01ddedea2d` |
| `.bodyforge-qa/bf604-maintenance-20261128/native-mime-unit.log` | 1340 | `118de4dd05fd913918b127477038ae9a91abc0f0acb25aa146cddd54708bf149` |
| `.bodyforge-qa/bf604-maintenance-20261128/native-mime-harness.log` | 62 | `7d1711fe28dfba33a98544c01b20738990d0a6b9c11bac6086b4253e85533744` |
| `.bodyforge-qa/bf604-maintenance-20261128/release.json` | 22469 | `e0368e573354a02485b84eef89723104c43c7efce0185883983ec9007449ab8b` |
| `.bodyforge-qa/bf604-maintenance-20261128/release.stderr.log` | 1712 | `0652bd68590f8390f279e7964f77e6b5df1aa027bc2ccec5592d1865de4e4fbc` |
| `.bodyforge-qa/bf604-maintenance-20261128/screen-ownership-diagnostic.log` | 4364 | `899413b68e29239170b503c007d2d68e66ac7e4cb6bbbf3e36c9aae600c999c5` |
| `.bodyforge-qa/bf604-maintenance-20261128/release-r2.json` | 47444 | `8e4393432b2d4fd99f56dcc4326da9a65d16990703e2470cbec66f3c676df0d0` |
| `.bodyforge-qa/bf604-maintenance-20261128/release-r2.stderr.log` | 4592 | `7d5927fbff4344c2bfabab238213887b4d848bb09b08b0e02bebad87e43f7f4b` |
| `.bodyforge-qa/bf604-maintenance-20261128/run-maintenance-upstream-r2.mjs` | 37894 | `52ae3d3c9c1723ac9f45d0e9694006de1d3807472afafaecb79475f9aa0fb22d` |
| `.bodyforge-qa/bf604-maintenance-20261128/verify-apk-web.py` | 2505 | `446cc563c1cb832fca0eba0e8a3a5dc0e8854802cf9f62b0c9911b628d84c58c` |
| `.bodyforge-qa/bf604-maintenance-20261128/upstream-diagnostic-r2.log` | 7528 | `05818956d52a0bf641bc32988b4e12dc7421116fb97b58c552475a1b87a02e67` |
| `docs/audits/BF_604_MAINTENANCE_20261128/FIELD_TEST_RU.md` | 5223 | `758e906e0780fbc035c1f75f693913339e459953f0c3e52d56b5e1b0aff0011b` |
| `docs/audits/BF_604_MAINTENANCE_20261128/LICENSE_BOUNDARY.md` | 4667 | `892eba35ea7982ec63f3b502049adc656b1a5ffa69067832c202c43ef5870f41` |
| `public/third-party-notices.txt` | 30038 | `3a42112b3594638805388847f07dd8d9243322a5bfe97ac6a53dd2b6077196f6` |

## Next gates
1. Complete component-level WASM and artwork rights evidence.
2. Connect a physical Android test device, authorize installation/testing separately, run FIELD_TEST_RU.md.
3. Requalify the actual current source after concurrent avatar edits settle.

Delta: local notices, bounded cache maintenance, native text resource delivery. Verification boundary: exact frozen snapshot and scoped file hashes.
