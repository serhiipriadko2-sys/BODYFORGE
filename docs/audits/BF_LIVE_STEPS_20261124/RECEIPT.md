# BODYFORGE — live steps / engineering receipt (2026-11-24)

Status: IMPLEMENTED / TESTED_LOCAL / PACKAGED. Native execution, actual sensor response/latency, physical device UI and Health Connect aggregate read: FIELD BLOCKED (no authorized Android phone). No production deploy, install, permission grant, commit or push.
Workspace E:\github\BODYFORGE. Current local dist with prior and concurrent avatar changes; not a clean release commit.
Decision: native bar above web Camera after fighter creation; today's Health Connect total automatically requested on entry and every 60s while visible, separate TYPE_STEP_DETECTOR session events, no arithmetic merging. Device/source can lag; sensor latency <2s is a documentation expectation, not measured. Session resets after leaving screen or pause. Permissions independently granted by user in native settings. Only new permission ACTIVITY_RECOGNITION. No raw records, history/background/write access, health data in WebView, persistence, server transfer or rewards. Native values protected by FLAG_SECURE. Busy camera/save disables settings. Browser/manual fallback and r2 link preserved. Source code changes: LiveStepPolicy/LiveStepsPanel, MainActivity, HealthStepsActivity, manifest, build-field, Android README, pure native test, TS native marker/helper/tests. Previous App/Avatar3D and save logic not edited. Initial multiline match failed closed before write due mixed newlines; normalized owned files, applied exact replacements. No production dependency added.
QA:
- npm test -- --maxWorkers=1 --no-file-parallelism: 596/596, 54 files, exit 0.
- npm run build: exit 0; existing large chunk warning. qa:bundle: exit 0, entry 394179 bytes, 20.7% reduction, MediaPipe 154276 bytes separate, index-DlZo9n-3.js.
- npm run qa:steps-day: 40/40, exit 0; manual fallback, exact storage preservation.
- npm run qa:mobile: 86/86, exit 0; headless desktop Chrome mobile emulation only, camera lifecycle and no reward for stop. Not Android UI/sensor proof.
- Native policy 23/23 + live policy 22/22, actual Java compile, D8/aapt2/zipalign/apksigner: exit 0. Screen-probe contract 12/12, synthetic DOM execution of exact native JS expression; not actual WebView lifecycle.
- APK signature v2/v3 verified, 53 web assets, 57 payload members checked, 60 total ZIP entries, CRC/hash/path checks. Manifest confirms package ru.bodyforge.healthqa versionCode 3, versionName 0.3.0-health-test.3, target SDK 34; permissions INTERNET/CAMERA/READ_STEPS/ACTIVITY_RECOGNITION only. Native Health Connect support Android 14+ with service, actual detector availability varies. Test/debug signature; not Play ready. APK retains same test identity/signature as r2; no installation performed. Full production license/physical device QA not claimed.
- git diff --check exit 0. Local dev/preview HTTP 200, VS Code goto command issued. Owner screen not independently observed. Firebase unchanged.
- Field procedure: FIELD_TEST_RU.md. Permission grant, revoke, real steps/latency, Android layout, day change and lifecycle still need a phone.
- Rollback: hash-check backups in this audit; revert only iteration-owned files, preserve previous work and r2 APK.

APK: E:\github\BODYFORGE\.bodyforge-qa\health-native-20261124-r3\BODYFORGE-HealthConnect-test.apk
Bytes: 19837865
SHA256: ecc754fbf236beb689e0195dca04b42731ee7f2880d351113ac93192be06d864
Payload manifest SHA256: 2d515d119733020047b5d4e8fd1e54a759f0da8f87764ff4e4526a1a9a7297be

HEAD: 4ddbfa7e74d876ed866ae5cdb1da9a807fa33095
## Fingerprints (path | bytes | SHA256)
src\components\StepsBoard.tsx | 9496 | 74f5dacbfd18257c12f0342f505c8c1b16e786a584ca1771d9fe9fcd955acb38
src\lib\nativeSteps.ts | 796 | 5515c1a6ce308c16aae3d4b23479324b0aa3727bb7ff9ecf0acd6198ab68e966
src\lib\nativeStepsView.test.ts | 2221 | d60369fb11cdbe935dd089a2f595c173269836bc1daa26072584cd1a77ea5c56
android\build-field.ps1 | 4703 | 3f6e36e6e36de2f9a4503cc147dededb2fa7de25a1dab92cea1fc481103b6ffb
android\pack_web_apk.py | 4816 | 66a56c5396d39e278f925d3373519993217bc00e8c7cce4b12d1962ef07a0d79
android\README.md | 1999 | bc7cd34a43c00996ac7f697da950fdaeb0cf00666cf91ea78ed3a746f0053230
android\src\AndroidManifest.xml | 1959 | fd761a892591cf5b5bfe7d0162c4b01124c71a71dade8112dbccbc42c3c0dab5
android\src\java\ru\bodyforge\healthqa\HealthStepsActivity.java | 15750 | 91bb0b2c4c3b31687ba94537a2d7302e6b9efad42ae4ed75a7f02d6847dd4856
android\src\java\ru\bodyforge\healthqa\LiveStepPolicy.java | 1722 | 80a2c200ac55d0f2014b87a68093209a6d4896e4a24f28ed603e7c74da6f2fd5
android\src\java\ru\bodyforge\healthqa\LiveStepsPanel.java | 10862 | 76482b297cf567721f0a6722e02ea8971772c58f2e302bc8728f33d9ad40a79e
android\src\java\ru\bodyforge\healthqa\MainActivity.java | 14610 | 71ba426c1928601036c67621e452d08279408a763fe66d4d2e00c5fa8f69ae6c
android\src\java\ru\bodyforge\healthqa\PermissionsRationaleActivity.java | 767 | 35d97c5d4b9c4790ace7670b2163b4f38e5b47cfd1436652dfaec2fac8fe88bb
android\src\java\ru\bodyforge\healthqa\StepsPolicy.java | 2153 | 483f2557b71904f71e7570ead264af69aa75894d5c0aefaa0487336ed113ef78
android\src\res\drawable-nodpi\ic_bodyforge.png | 3362 | c91eb5e74c5ec9371edb896e230932d799b81749a1ac638601d85adfffc43332
android\tests\LiveStepPolicyTest.java | 2557 | 7eaac7751e12b15580247d5564c1ed879a2f6e3dd27bc592f89888b33ed0555e
android\tests\StepsPolicyTest.java | 3493 | 65ce3b5edcfd4465c4ad4d2b6a8b2e21fe062b9490be9e1a5e4605dd77dd6b92
docs\audits\BF_LIVE_STEPS_20261124\ADR.md | 2606 | d6c19a4c82b734e137ae1b7921517a6a48ea612d76454b1585fd22d874a2ebbb
docs\audits\BF_LIVE_STEPS_20261124\FIELD_TEST_RU.md | 3314 | 64f1b2d0fbafd9698ad89d0d1d7ecb4485453cfcb0f8f1480dac2e8fd60a17d6
docs\audits\BF_LIVE_STEPS_20261124\payload-manifest.json | 8901 | 2d515d119733020047b5d4e8fd1e54a759f0da8f87764ff4e4526a1a9a7297be
docs\audits\BF_LIVE_STEPS_20261124\screen-probe-contract.mjs | 1966 | 631f07f01581a7dd013011214e9500ca3371a8c5896740fbe68286a6c7351959
docs\audits\BF_LIVE_STEPS_20261124\screen-probe.log | 352 | 3a6d3f30de3671f65749023c7e7db87c9fd86f9525a44b4bd6a32407f3396fa7
docs\audits\BF_LIVE_STEPS_20261124\unit.log | 7838 | 8652e55edb35b5da9511f476bfa2b92868e3dfe2520a8b9c8c680d53f5b8b08a
docs\audits\BF_LIVE_STEPS_20261124\build.log | 2220 | 37fa093174f4b816c6c9ffa2c9c0dfb83d60bcfefdb08f8ccf0dd0b8505750f7
docs\audits\BF_LIVE_STEPS_20261124\bundle.log | 366 | 51282322d8ffd8b0cfc3b1cc5add6a28debe4eba2f0ec4c0f0888ec2394f0589
docs\audits\BF_LIVE_STEPS_20261124\steps-day.log | 4279 | cdc1cfe5a2967ff2ad2c08b90c8a3487b10272742e574ca68f2cdd40e5868a47
docs\audits\BF_LIVE_STEPS_20261124\mobile.log | 7733 | babd3adb902bcf4222fb3d66e020814283276cf3f15069fdafdbff62850dc0eb
docs\audits\BF_LIVE_STEPS_20261124\native-build.log | 8874 | 839bd4a6976997abb59ae983d6c22c818c5a9a4550b642d8fa87ca7c3c3def3f
