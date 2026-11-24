# BODYFORGE / Health Connect field candidate — receipt (2026-11-24)

Status: IMPLEMENTED / TESTED_LOCAL / PACKAGED. Real Health Connect read, native execution and physical-phone permission lifecycle: NOT VERIFIED / FIELD BLOCKED (no authorized Android device). No live deployment, Git commit/push, automatic installation or OS grant.
Workspace: E:\github\BODYFORGE. HEAD 4ddbfa7e74d876ed866ae5cdb1da9a807fa33095 with concurrent uncommitted avatar and earlier UI edits preserved. APK packages the verified current local dist, not a clean production commit.
Decision/permission review: ADR.md. Native Android 14+ platform HealthConnectManager aggregate StepsRecord.STEPS_COUNT_TOTAL, local midnight to current instant, no data-origin filter, null distinct from 0. System READ_STEPS only, explicit user permission; no history/background/write permissions. Native result not exported, persisted, logged or transferred to web/servers/game reward. Non-exported native activity, protected rationale alias, exact local origin/main-frame/user-gesture/GET/no redirect; no addJavascriptInterface. API availability hint is not authorization. Clock/permission watcher only while foreground; no background reads. Separate app ID ru.bodyforge.healthqa preserves prior app and browser storage. Actual browser keeps honest manual fallback; active camera/pending save disables native action. No new dependencies or external assets downloaded.
QA:
- npm test -- --maxWorkers=1 --no-file-parallelism: 589/589, 53 files, exit 0. Native action origin and React rendering, busy guard covered.
- npm run build: exit 0, pre-existing large Avatar3D chunk warning. npm run qa:bundle: PASS, 394179 entry bytes, 20.7% reduction, separate camera chunk 154276 bytes. Production preview entry index-C8XfZtm0.js, HTTP 200.
- npm run qa:steps-day: 40/40, exit 0, browser fallback and unchanged exact manual/game storage across date and tabs.
- npm run qa:mobile: 86/86, exit 0, headless Chrome/mobile emulation only, camera lifecycle, rewards, navigation, 3D pause. Not native phone QA.
- Android build-field.ps1 final r2: pure Java policy 23/23 (origin/gesture/redirect/timezone/DST/null/zero), SDK javac/D8/aapt2, zipalign check, apksigner verify v2/v3, exit 0. First compile probe rejected incorrect OutcomeReceiver package; corrected to android.os.OutcomeReceiver. r1 passed, r2 additionally clears stale visible values and guards invalid callbacks; no web source changed between r1/r2.
- Compiled manifest verified: package ru.bodyforge.healthqa, versionCode 2, versionName 0.3.0-health-test.2, min SDK 26, target 34, Android steps integration limited to API 34+. Only INTERNET/CAMERA/READ_STEPS. debuggable=false, allowBackup=false, cleartext=false; HealthStepsActivity exported=false, rationale exported=false, alias protected START_VIEW_PERMISSION_USAGE.
- APK payload round-trip: 52 web assets, 56 checked payload members, 59 total ZIP entries; exact hashes, CRC, no duplicate/case-collision/traversal or private path names, signature verified. APK locally signed with standard Android debug identity, not Play-ready. No source or private canon path shipped. Existing public assets from concurrent work included as local field candidate only; full release license audit not asserted.
- Final git diff --check exit 0. ADB authorized 0, unauthorized 0. Dev and production preview HTTP 200. Native field test blocked; FIELD_TEST_RU.md describes exact next gate.
- VS Code goto command issued; user's actual visible window not independently observed. No changes to Firebase or earlier field APK.
- Scope: new android module and nativeSteps.ts/tests; targeted App.tsx, StepsBoard.tsx, trainingExperience.css. Backups prepatch in this audit; compare hashes before rollback; never reset other work.

APK: E:\github\BODYFORGE\.bodyforge-qa\health-native-20261124-r2\BODYFORGE-HealthConnect-test.apk
Bytes: 19739470
SHA256: b79c417ba1f02da4952e9e47ea8baa6aa7a9712427e08d0cc4975932bc748b2b
Payload manifest SHA256: d3524ea0f480fdc8e82f9ee5024e81f79c263981d4a242ac8f8c10c14f4b831e

## Fingerprints (path | bytes | SHA-256)
src\App.tsx | 82447 | a186380fd1fdc74660755304868f4afddd4b5f200abe3bcf40234ca9ecf0ff6e
src\components\StepsBoard.tsx | 9367 | 191793605a6f0a33b7b940c3dff9e3ceccbc1ebcb5578f1af5858667fce85410
src\trainingExperience.css | 14105 | 510ef0681b8de20309f1ce3dffc14029889285744c4f3e46dc3a399c97f1b4ee
src\lib\nativeSteps.ts | 540 | b4c0b30567d3f39d3216caa9a6673f25ed653796f4e018442b066c31c9bf22c3
src\lib\nativeSteps.test.ts | 1041 | f480b8f98b16d0cf7e8fbcff780bb52a1186b579761e9916c10f3ea70d6a2823
src\lib\nativeStepsView.test.ts | 1319 | 0482dd7563b865fb919dc391ba44f2d614247943101a0a5267741c7b87fff56b
android\build-field.ps1 | 4426 | 6ba531733ec66011ef1c17dba39d986bddf83775772d2d596b840df923005763
android\pack_web_apk.py | 4816 | 66a56c5396d39e278f925d3373519993217bc00e8c7cce4b12d1962ef07a0d79
android\README.md | 1529 | 7e2e76737e19fdc11cc697915b67df85d13d5989649f3e279e4d658e05be27b3
android\src\AndroidManifest.xml | 1881 | 7c18003a503d1ca3feda53ffd6b9a52b5b67d6bef06ede28e675dbff4f3bb13d
android\src\java\ru\bodyforge\healthqa\HealthStepsActivity.java | 12295 | 1afd57c5574fa718243b8174b68c3173c35bfb2c22a64c8861a093b570f4095a
android\src\java\ru\bodyforge\healthqa\MainActivity.java | 9340 | 313640b872a7e01eb2853bcecfaa6f38eb147a1eda030aa6ff930182344cec45
android\src\java\ru\bodyforge\healthqa\PermissionsRationaleActivity.java | 767 | 35d97c5d4b9c4790ace7670b2163b4f38e5b47cfd1436652dfaec2fac8fe88bb
android\src\java\ru\bodyforge\healthqa\StepsPolicy.java | 2153 | 483f2557b71904f71e7570ead264af69aa75894d5c0aefaa0487336ed113ef78
android\src\res\drawable-nodpi\ic_bodyforge.png | 3362 | c91eb5e74c5ec9371edb896e230932d799b81749a1ac638601d85adfffc43332
android\tests\StepsPolicyTest.java | 3493 | 65ce3b5edcfd4465c4ad4d2b6a8b2e21fe062b9490be9e1a5e4605dd77dd6b92
docs\audits\BF_HEALTH_CONNECT_20261124\ADR.md | 2293 | 309e4e85cba0d165de451d13c4629ff30e1ed459e3f53f46c4996814223195de
docs\audits\BF_HEALTH_CONNECT_20261124\FIELD_TEST_RU.md | 2287 | 1a10ae134b87ceb639169a3875b9691379b20eac5648159d91501675c71cec01
docs\audits\BF_HEALTH_CONNECT_20261124\payload-manifest.json | 8738 | d3524ea0f480fdc8e82f9ee5024e81f79c263981d4a242ac8f8c10c14f4b831e
docs\audits\BF_HEALTH_CONNECT_20261124\unit.log | 7252 | f10cb216cef6c1d4f70e35fe40ac706ec645bdd24d11ca0b60c926a8e851fe19
docs\audits\BF_HEALTH_CONNECT_20261124\build.log | 2220 | 1237ec216f2695740c440a6106cfd42cb878aa9b92d0bed8b07b57a8091ac2ac
docs\audits\BF_HEALTH_CONNECT_20261124\bundle.log | 366 | 6c0c12baf197bbbd090b2844dcbbf61142be9d355a4b17639ba77de958304716
docs\audits\BF_HEALTH_CONNECT_20261124\steps-day.log | 4279 | cdc1cfe5a2967ff2ad2c08b90c8a3487b10272742e574ca68f2cdd40e5868a47
docs\audits\BF_HEALTH_CONNECT_20261124\mobile.log | 7774 | 7935aa2f2233d76a60e571bb0119ff547f2ca96668e5cb38b46f93ea19d4ab9d
docs\audits\BF_HEALTH_CONNECT_20261124\native-build-final.log | 6698 | 514720f2191cd89353b206556deb4b3e6e4b5aa8b4125237671c97be72e41d97
