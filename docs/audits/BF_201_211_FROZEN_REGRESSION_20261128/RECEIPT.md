# BF-201--211 - frozen camera/replay integration, 2026-11-28

Status: TESTED_LOCAL_PINNED_BUILD. Current worktree, physical device, real-human pose accuracy, release and field study are separate gates.
HEAD at intake: 11d51edf407bed2ad7e1fd0a04332654fe46afcb. Exact source: 469 files, 38998819 bytes, SHA-256 of serialized source manifest c336bd7c33b1df431c0202b76cf3f102460e1d59e64977cb7134076c0c06f07a.
Physical installed dependency copy: 8705 files, 189063100 bytes; SHA-256 verified. Package versions matched frozen lock. No install or dependency update.
Distribution: 80 files, 36038818 bytes; exact artifact boundary and final readback. Entry assets/index-Dm90Tzfi.js SHA-256 e504f28c892775cc2cf5d5b20806b88a3089508c78cbfa4d58ba9b3d4d7e50e4; entry 392037 bytes. Offline worker 52348 bytes, 86 cache entries. Registration and actual offline inference not run by this batch.

First attempt: four gates passed; build stopped at notice input boundary because a dependency junction was used. This is a QA setup error; no production security weakening. Failed build retained. Exact source was reused with real copied dependencies. Two diagnostic shell commands also had quoting/stderr handling errors; corrected without modifying application code.

## Current pinned gates

- focused | PASS | 689/689 in 34 files
- field-metrics | PASS | 16/16
- owned-browser-unit | PASS | 19/19
- types | PASS | tsc -b --force exit 0
- bundle | PASS | BODYFORGE_BUNDLE_ON_DEMAND_PASS {"entryBytes":392037,"entryGzipBytes":120453,"cameraChunkBytes":154276,"dailyPlanRemoved":true,"baselineEntryBytes":496761,"entryBytesSaved":104724,"entryReductionPercent":21.1,"entryName":"index-Dm90Tzfi.js","poseName":"vision_bundle-CYoQ_uhx.js"}
- privacy | PASS | BODYFORGE_PRIVATE_DEV_PATHS_PASS=12
- camera-lifecycle | PASS | BODYFORGE_CAMERA_LIFECYCLE_PASS {"checks":41} | owned cleanup verified
- camera-frame-gate | PASS | BODYFORGE_CAMERA_FRAME_GATE_PASS {"checks":15} | owned cleanup verified
- workout-hud | PASS | BODYFORGE_WORKOUT_HUD_E2E_PASS {"checks":41} | owned cleanup verified
- lunge-replay | PASS | BODYFORGE_LUNGE_REPLAY_E2E_PASS {"checks":25} | owned cleanup verified
- pushup-replay | PASS | BODYFORGE_PUSHUP_REPLAY_E2E_PASS {"checks":25} | owned cleanup verified
- jack-replay | PASS | BODYFORGE_JACK_REPLAY_E2E_PASS {"checks":25} | owned cleanup verified
- knees-replay | PASS | BODYFORGE_KNEES_REPLAY_E2E_PASS {"checks":25} | owned cleanup verified
- crunch-replay | PASS | BODYFORGE_CRUNCH_REPLAY_E2E_PASS {"checks":30} | owned cleanup verified
- leg-raise-replay | PASS | BODYFORGE_LEG_RAISE_REPLAY_E2E_PASS {"checks":30} | owned cleanup verified
- plank-replay | PASS | BODYFORGE_PLANK_REPLAY_E2E_PASS {"checks":53,"measured":30368.7,"recordedDurationMs":30007.600000000002} | owned cleanup verified
- tower20 | PASS | BODYFORGE_TOWER_20REPS_E2E_PASS assertions=77 | owned cleanup verified
- forge-history | PASS | BODYFORGE_FORGE_XP_FAQ_E2E_PASS | owned cleanup verified

Screenshots: 11 PNG signatures, sizes and hashes verified; independent visual review not claimed.

## Catalog QA repair

Candidate remains unpromoted; no claim of live QA change.
Preview: 52 UI assertions reached PASS marker, but process exit 17 due to native-termination cleanup failure. Dev gate not run. Original catalog preimage was read back unchanged. Exact disposable profile directory remained and its debug port had no listener at the follow-up observation. No manual process termination or profile removal attempted.
preview FAIL exit 17

## Scope and next

Live source/QA drift versus tested snapshot: qa/forge-home-xp-faq-e2e.mjs, qa/local-avatar-foundation-review.ts, qa/steps-day-e2e.mjs, src/components/Avatar3D.tsx, src/components/ProgressPulseBoard.tsx, src/lib/avatarZoneFoundation.ts, src/lib/muscleZones.ts, src/lib/zoneAssetPins.ts. Concurrent work preserved. Catalog edit, if present, is separately tested; it does not change application bundle.
BF-201/202/211: software evidence only. BF-203--210: synthetic landmark replays and reward persistence; no field accuracy or exercise safety certification.
BF-212: prior desktop worker feasibility does not justify replacing the current main-thread detector. BF-213: field metrics unit gate passed; no participant/device data, independent observer labels or approved holdout collected. No precision/recall values asserted.
No owner camera, real profile, health data, migration, APK, commit, push or deployment.

## Evidence

- .bodyforge-qa/bf201-211-frozen-20261128/focused.log | 4505 bytes | 359c0cb27a0d623b338d7b3042c7074e66d79869ef5df6b6b8e70151f4977bd8
- .bodyforge-qa/bf201-211-frozen-20261128/field-metrics.log | 1506 bytes | e6e6ce7a6c7cd381f52d95ca183277fa2bd0a461201ab393fb2a3792442cb349
- .bodyforge-qa/bf201-211-frozen-20261128/owned-browser-unit.log | 2137 bytes | 8636592db2d27a664c1d776cad8ecbc1bf9335ae4036b05b8b0475a6f2488b3c
- .bodyforge-qa/bf201-211-frozen-20261128/types.log | 0 bytes | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- .bodyforge-qa/bf201-211-frozen-20261128/run.mjs | 10577 bytes | 1cd383d0af4fae6892091d3c8aac6300b756f4e63ed10b84b635978158bd1262
- .bodyforge-qa/bf201-211-frozen-20261128/intake.json | 695 bytes | 86f064ea08be3f04cdd2d14a1b3bdf6bf8a6355c985a9f9b2b6141fa1c0fc764
- .bodyforge-qa/bf201-211-frozen-20261128/source-before.json | 72694 bytes | 5a512f4839045e1a04c2d0a66813ce6fee614b69c0de622393132d63c3d0c7f0
- .bodyforge-qa/bf201-211-frozen-20261128/frozen-after.json | 72694 bytes | 5a512f4839045e1a04c2d0a66813ce6fee614b69c0de622393132d63c3d0c7f0
- .bodyforge-qa/bf201-211-frozen-20261128/copy-live-drift.json | 2 bytes | 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945
- .bodyforge-qa/bf201-211-frozen-20261128/live-drift.json | 28 bytes | 3ffc2647c26dc5fe2a05f5017889f910d94895aea02619cccceb6a94165e720c
- .bodyforge-qa/bf201-211-frozen-20261128/gates.json | 1614 bytes | e36a6fdd822f1330f389b87c6be3cea588eadf1ed9246bb6b28d670a2c498c20
- .bodyforge-qa/bf201-211-frozen-20261128/toolchain.json | 838 bytes | 4bdeb9eb5b3ccec69996a2f768b338c4ebffc042a54845b5e1ca79446d7ca6df
- .bodyforge-qa/bf201-211-physical-20261128/focused.log | 4508 bytes | 38444b4f2029b9b4aebce6718622421ac983b5588a3300abc95cc1685e446f4e
- .bodyforge-qa/bf201-211-physical-20261128/field-metrics.log | 1507 bytes | 4b6ab62bcb17b193ae920f5190c822aa04477a69c316f98fe52ed1d9ccafefaa
- .bodyforge-qa/bf201-211-physical-20261128/owned-browser-unit.log | 2138 bytes | 2405e7cdc0fb362f0fc2d90dea01d5442def553a367094a679ee9b7c4ca57731
- .bodyforge-qa/bf201-211-physical-20261128/types.log | 0 bytes | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- .bodyforge-qa/bf201-211-physical-20261128/bundle.log | 281 bytes | d9e1cc25984df036c68985c23fd2b5c4b258cd6c45fcce55cb7a47f7cbc26f15
- .bodyforge-qa/bf201-211-physical-20261128/privacy.log | 760 bytes | b445a97e97fa48d2cffde1531d245c7212dd9ce64a15b7021b7e07f34dcfc53b
- .bodyforge-qa/bf201-211-physical-20261128/camera-lifecycle.log | 2408 bytes | b4e450feafd114af4a167f5d2020485db3adad291538f1f7023e2655cff8f11b
- .bodyforge-qa/bf201-211-physical-20261128/camera-frame-gate.log | 979 bytes | 2fa73fbe178475ca2f788382947655e2b5f198647a93ac486b270607eda6383b
- .bodyforge-qa/bf201-211-physical-20261128/workout-hud.log | 2521 bytes | 3c216e4777b761dae0144f136ff47472ebe39770d47980c592cc19911f17b767
- .bodyforge-qa/bf201-211-physical-20261128/lunge-replay.log | 1692 bytes | 315122d9cbee9f6033f0e81cbcfbe536534e8e0e5c5226ff8a4ba2536558f265
- .bodyforge-qa/bf201-211-physical-20261128/pushup-replay.log | 1748 bytes | 6c4b2efd6217a93872786df42f023bb5692bb7765e5136dabf24d137c698ded6
- .bodyforge-qa/bf201-211-physical-20261128/jack-replay.log | 1753 bytes | c7c24cc54f7af5ab896c946cba35d21c9e7fa938c9168c29433175154e1b6276
- .bodyforge-qa/bf201-211-physical-20261128/knees-replay.log | 1769 bytes | 6c443e9e38073ae8642ff7fbca6e40b20953027edb2a13f50e946683110ffbf4
- .bodyforge-qa/bf201-211-physical-20261128/crunch-replay.log | 2235 bytes | 7fe058885f9fef6e8a07b7279fa52d5702176f6817c4e963844a6d9e2bf44ab8
- .bodyforge-qa/bf201-211-physical-20261128/leg-raise-replay.log | 2284 bytes | c24fccf4452ee8999189083e28d7575d85608e37894d613e01bd89fcdfea8989
- .bodyforge-qa/bf201-211-physical-20261128/plank-replay.log | 4659 bytes | 7dea06b900806374b0ddd0bdbdde6ce5616bd8b506e24444a0d40f5a779f7eac
- .bodyforge-qa/bf201-211-physical-20261128/tower20.log | 5109 bytes | 495696858a1ca0fd117e46a6c9c9bd97df14b81f66ef78ba01a6ad8969ad4897
- .bodyforge-qa/bf201-211-physical-20261128/forge-history.log | 8902 bytes | 0218adc2fed2d3d231a4699ca39b735a5ce168820a435ce431efc8d265b1bee1
- .bodyforge-qa/bf201-211-physical-20261128/run.mjs | 13182 bytes | 1860634d2eab74dd07d685840fe9167d1a34b240b82d6008a65012b011e10e22
- .bodyforge-qa/bf201-211-physical-20261128/intake.json | 695 bytes | d3a396cd78ad877adaf44151c93a5df30d74939103107b2ff9488b5bcc488880
- .bodyforge-qa/bf201-211-physical-20261128/source-before.json | 72694 bytes | 5a512f4839045e1a04c2d0a66813ce6fee614b69c0de622393132d63c3d0c7f0
- .bodyforge-qa/bf201-211-physical-20261128/frozen-after.json | 72694 bytes | 5a512f4839045e1a04c2d0a66813ce6fee614b69c0de622393132d63c3d0c7f0
- .bodyforge-qa/bf201-211-physical-20261128/copy-live-drift.json | 71 bytes | 36600dc2de18df0a544d2e2bf4c08c1e7f63683b7077605bf40cf16a7aee3a1f
- .bodyforge-qa/bf201-211-physical-20261128/live-drift.json | 275 bytes | ad66f7054dae39fe2cb937f6d21c2794002377387207a36892427690b713ce09
- .bodyforge-qa/bf201-211-physical-20261128/gates.json | 9469 bytes | 8dddfd2ef7f32a0a5b538f9cbc8b12f484dde5cfa65c9afc2a7e51212c647e79
- .bodyforge-qa/bf201-211-physical-20261128/toolchain.json | 838 bytes | 4bdeb9eb5b3ccec69996a2f768b338c4ebffc042a54845b5e1ca79446d7ca6df
- .bodyforge-qa/bf201-211-physical-20261128/dependencies.json | 1571260 bytes | 0fdc382c30cb50bb6ab93096a4ad7c9fbbccc2d007e2e898a17fac69db58604e
- .bodyforge-qa/bf201-211-physical-20261128/build-before.json | 12490 bytes | 427e386a7b5aeb022fe50966a08eed7bde2492cd3eba9333c8cb4b8ef0964b34
- .bodyforge-qa/bf201-211-physical-20261128/build-after.json | 12490 bytes | 427e386a7b5aeb022fe50966a08eed7bde2492cd3eba9333c8cb4b8ef0964b34
- .bodyforge-qa/bf201-211-physical-20261128/worker-artifact.json | 328 bytes | db2b5ce276faac5f881031dff39674b2bbeb2968f72aaa3e57f19189d51cbf2c
- .bodyforge-qa/bf201-211-physical-20261128/history-screens/camera-390.png | 83515 bytes | 560a71330fe7b2ffbb378f051c5178027db63bb2470b6b2229cbda2a7733bfee
- .bodyforge-qa/bf201-211-physical-20261128/history-screens/camera-activity-30days-360.png | 107951 bytes | f8dcb58337e05589afcfa0597ad91836190c185af464e6e4d0746aeeae495f40
- .bodyforge-qa/bf201-211-physical-20261128/history-screens/forge-avatar-only-390.png | 205341 bytes | ee8e66eafaa7cff4f2caf9bd26c63b161f0dfc1e6c4986e741947939902323d2
- .bodyforge-qa/bf201-211-physical-20261128/history-screens/forge-missions-390.png | 98622 bytes | 0c7067bcc939135e1cf7fbfdcf91419459a0d09ad1eb3ba4ee48951263c87894
- .bodyforge-qa/bf201-211-physical-20261128/history-screens/home-320-fighter-xp.png | 178581 bytes | 6f9646b80527f0aa01617f737b04f54188213ec61397aa93ba36309d94a39a9a
- .bodyforge-qa/bf201-211-physical-20261128/history-screens/home-360-fighter-xp.png | 197369 bytes | 3f68cff447d19dbe8f73863d6ff5567cc3f49101ea6c0f604bc85d7004977896
- .bodyforge-qa/bf201-211-physical-20261128/history-screens/pulse-full-history-390.png | 152652 bytes | 79972afa6b835ebaf141186d0acf8639dc446ca8a5faeaff01cd56ac202558e6
- .bodyforge-qa/bf201-211-physical-20261128/history-screens/pulse-incomplete-history-390.png | 148020 bytes | 240e5360ba4e2984a69d54c17d49ed8040c34d4dfa7b033946aa1fa962e37ef0
- .bodyforge-qa/bf201-211-physical-20261128/history-screens/pulse-retained-restore-390.png | 150379 bytes | 735cca2833debde4e3374aaf1e4e67d5a0c7dce77bab573676ba7561ef7708a2
- .bodyforge-qa/bf201-211-physical-20261128/history-screens/settings-390-camera-preparation-visible.png | 114358 bytes | a33c07c3d444c7a4a3d52b126df7b990d023857b848cbb6bddb2d0ca325e312c
- .bodyforge-qa/bf201-211-physical-20261128/history-screens/settings-390-faq-overview.png | 82908 bytes | fb1611ab6ffece24e4a85786325517c0e68cb5ba7dae2452567b53f86f6bdfbf
- .bodyforge-qa/bf211-catalog-owned-20261128/catalog.before | 4163 bytes | 42e446000c94742f4e7738da3da93dc675b8980e0c0d125d8f9246e0f8b0f503
- .bodyforge-qa/bf211-catalog-owned-20261128/eight-exercise-catalog-e2e.mjs | 8925 bytes | ab29f7babc68b77ba664bfa1453b0e956442e718c50e2fd75d5e08e060607f37
- .bodyforge-qa/bf211-catalog-owned-20261128/run-candidate.mjs | 7193 bytes | cb1019e3b3bdee1d64e0d40c879ebcf7a5fe375014d6221239dfe76947b2e26c
- .bodyforge-qa/bf211-catalog-owned-20261128/reject-nonloopback-verified.log | 73 bytes | 757b0eb04e6e05d4d228536e6683267d5ce74196c0c28fb705c55dd37f5834ed
- .bodyforge-qa/bf211-catalog-owned-20261128/reject-invalid-sha-verified.log | 115 bytes | b203cbe4f0c4d55ef9c82db31e1f733abbcf9227a039f7715e2a540e78338e7a
- .bodyforge-qa/bf211-catalog-owned-20261128/preview.log | 2164 bytes | 67579c2efdfdcc932df1efc30a52e08d8d3892b82a3e490d68197ae45690f919
- .bodyforge-qa/bf211-catalog-owned-20261128/gates.json | 281 bytes | ea8bdc5185c1d2452593e6123f09e44a9f0b6ffc589ba11eb941805736426213
