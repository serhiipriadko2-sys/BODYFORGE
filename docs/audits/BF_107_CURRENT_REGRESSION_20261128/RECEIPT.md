# BF-107 - regression and pinned browser QA - 2026-11-28

Status: PARTIAL / current-worktree acceptance BLOCKED by concurrent changes. Individual gates executed successfully. Pinned production-build scenarios observed PASS. No release, live migration, physical-device or real-human motion claim.

HEAD at all three starts and final read-back: 11d51edf407bed2ad7e1fd0a04332654fe46afcb. Build inventory: 80 files, 36038769 bytes; exact final read-back matches pinned manifest. Entry SHA-256: 0f7db2ba86fa20cb91c1abb4f38181b5462a861ccda738aee2bfae5dd9202293. Entry 392037 bytes, baseline 496761 bytes, reduction 21.1%; Vite large-chunk warning remains.

Current worktree differs from production-build input snapshot at final read-back: qa/local-avatar-foundation-review.ts, qa/steps-day-e2e.mjs, src/components/Avatar3D.tsx, src/components/ProgressPulseBoard.tsx, src/lib/avatarZoneFoundation.ts, src/lib/muscleZones.ts, src/lib/zoneAssetPins.ts. Changes belong to concurrent work; not reverted. Each outer batch stopped after its drift fence. The first unit run changed only unrelated steps-day QA. The final pinned UI batch changed local-avatar-foundation-review.ts; mobile emitted PASS and cleanup, but the batch is not a clean acceptance receipt. Product source was not edited in this verification. No owner profile, real webcam, deployment, APK, commit or push.

### Batch 1 - .bodyforge-qa/bf107-regression-20261128

Outer process exit 1: input-drift fence. Individual gate results:

- unit-all: 143 test files, 1383 passed, 1 skipped ; 68023 bytes ; SHA-256 51a6ecfe251499f86d249c7d305679585671fa38182b9071a0531c7150a5bc33

Observed changed inputs: qa/steps-day-e2e.mjs.

### Batch 2 - .bodyforge-qa/bf107-browser-20261128

Outer process exit 1: input-drift fence. Individual gate results:

- tsc: exit 0 ; 0 bytes ; SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- build: exit 0 ; 4117 bytes ; SHA-256 1802ea774c8f824109446c27d8082326fe754c84f3cbe7c8658a4ae18cc961b1
- bundle: BODYFORGE_BUNDLE_ON_DEMAND_PASS {"entryBytes":392037,"entryGzipBytes":120455,"cameraChunkBytes":154276,"dailyPlanRemoved":true,"baselineEntryBytes":496761,"entryBytesSaved":104724,"entryReductionPercent":21.1,"entryName":"index-BYo-OK-S.js","poseName":"vision_bundle-C6qZZA9w.js"} ; 281 bytes ; SHA-256 915d2fe7ab13b6a1dada538ae60d2c94531fdda8e0a7c1095b1972d6b1f7d37f
- native-journal: BODYFORGE_DURABLE_JOURNAL_PASS {"assertions":127,"actualIndexedDB":true,"strictReadwrite":true} ; owned browser cleanup remaining=0 ; 10828 bytes ; SHA-256 e61b268f7f385ff912fd70a87113644328e3f18cbaf1c628987eb14743913ac0
- privacy: BODYFORGE_PRIVATE_DEV_PATHS_PASS=12 ; 760 bytes ; SHA-256 b445a97e97fa48d2cffde1531d245c7212dd9ce64a15b7021b7e07f34dcfc53b
- tower-v2: BODYFORGE_TOWER_20REPS_E2E_PASS assertions=77 ; owned browser cleanup remaining=0 ; 5097 bytes ; SHA-256 1e4b07c138c2913d113bfef0cfcf8f0996b103b1b75d93ac04268621541c4bc0

Observed changed inputs: qa/steps-day-e2e.mjs, src/components/ProgressPulseBoard.tsx.

### Batch 3 - .bodyforge-qa/bf107-pinned-ui-20261128

Outer process exit 1: input-drift fence. Individual gate results:

- forge-history: BODYFORGE_FORGE_XP_FAQ_E2E_PASS ; owned browser cleanup remaining=0 ; 8847 bytes ; SHA-256 f5caf32b68e97e16696abd2c461485c48c423aea0eafc1a109a6425bd753a4fc
- backup-help: BF_BACKUP_HELP_PASS {"checks":39,"widths":[320,390,428],"playerBytesUnchanged":true} ; owned browser cleanup remaining=0 ; 2370 bytes ; SHA-256 b99b5886619b3326687254914a5921f831e0d96ecfc82b8a274cf72b01556623
- mobile: BODYFORGE_MOBILE_E2E_PASS ; owned browser cleanup remaining=0 ; 10468 bytes ; SHA-256 30f1b8c46ad911add2f3cf522749509a5c5b6c2220e0be299ca199e3c05595a9

Observed changed inputs: qa/local-avatar-foundation-review.ts.

## Evidence checks

- .bodyforge-qa/bf107-pinned-ui-20261128/forge-screens/camera-390.png | 83515 bytes | 560a71330fe7b2ffbb378f051c5178027db63bb2470b6b2229cbda2a7733bfee
- .bodyforge-qa/bf107-pinned-ui-20261128/forge-screens/camera-activity-30days-360.png | 124986 bytes | 5be0a286d67e3d7b0ddbecdae171b1218e9e0c0d45edcd51a25c32f7e21bfa80
- .bodyforge-qa/bf107-pinned-ui-20261128/forge-screens/forge-avatar-only-390.png | 205341 bytes | ee8e66eafaa7cff4f2caf9bd26c63b161f0dfc1e6c4986e741947939902323d2
- .bodyforge-qa/bf107-pinned-ui-20261128/forge-screens/forge-missions-390.png | 98622 bytes | 0c7067bcc939135e1cf7fbfdcf91419459a0d09ad1eb3ba4ee48951263c87894
- .bodyforge-qa/bf107-pinned-ui-20261128/forge-screens/home-320-fighter-xp.png | 178581 bytes | 6f9646b80527f0aa01617f737b04f54188213ec61397aa93ba36309d94a39a9a
- .bodyforge-qa/bf107-pinned-ui-20261128/forge-screens/home-360-fighter-xp.png | 194620 bytes | b25dee47a0056d3305c1d51f40e9d3ec568816afe9fd716c4b2763ed5e980529
- .bodyforge-qa/bf107-pinned-ui-20261128/forge-screens/pulse-full-history-390.png | 152652 bytes | 79972afa6b835ebaf141186d0acf8639dc446ca8a5faeaff01cd56ac202558e6
- .bodyforge-qa/bf107-pinned-ui-20261128/forge-screens/pulse-incomplete-history-390.png | 145469 bytes | f864ccaff8d98eb8bcca06ed39f24dbef74124917e9cbad18a6b30e47dd1f4bf
- .bodyforge-qa/bf107-pinned-ui-20261128/forge-screens/pulse-retained-restore-390.png | 150379 bytes | 735cca2833debde4e3374aaf1e4e67d5a0c7dce77bab573676ba7561ef7708a2
- .bodyforge-qa/bf107-pinned-ui-20261128/forge-screens/settings-390-camera-preparation-visible.png | 120549 bytes | 78a5d0543ab133e55269251b16a5777c9e8234dee4361c8f87b165628759d344
- .bodyforge-qa/bf107-pinned-ui-20261128/forge-screens/settings-390-faq-overview.png | 82908 bytes | fb1611ab6ffece24e4a85786325517c0e68cb5ba7dae2452567b53f86f6bdfbf
- .bodyforge-qa/bf107-pinned-ui-20261128/backup-screens/inspector-390.png | 162787 bytes | 34d260fada6952e7799c2a0baa78cac9442ec9ecf476f33c8df5ae41f07f504b
- .bodyforge-qa/bf107-pinned-ui-20261128/mobile-screens/bf-qa-mobile-360-premium.png | 88450 bytes | 09f9614a74e1c63c3c4573cfc9bdd9a276fc5eaf7855dcca0e9d6eb49c7b3d6a
- .bodyforge-qa/bf107-pinned-ui-20261128/mobile-screens/bf-qa-mobile-backup-json-inspection.png | 131880 bytes | 531cd8b85f780116941c2fb1921074b29121af57aabc26ec87061437a31a9df6
- .bodyforge-qa/bf107-pinned-ui-20261128/mobile-screens/bf-qa-mobile-forge-upgraded.png | 202267 bytes | 948bff37a9cccb1fb1a2f263df5e2dcd2b5a9d580ac0cd18e4546e564a98da0e
- .bodyforge-qa/bf107-pinned-ui-20261128/mobile-screens/bf-qa-mobile-forge.png | 187334 bytes | 3aac37a40a83da9110421136c6bc58022d7681a44d22d6f1ddc9af5be2048d83
- .bodyforge-qa/bf107-pinned-ui-20261128/mobile-screens/bf-qa-mobile-home-360-premium.png | 199134 bytes | a4c83a194503265a6a88514c8df57b80ef3fe938f64c7b39a55a5ea5f89da4a0
- .bodyforge-qa/bf107-pinned-ui-20261128/mobile-screens/bf-qa-mobile-home-premium.png | 222800 bytes | d011cb91183dbd2b87ae527bff8a20c0ee92ad43f8768b3dfb7cf639d57ad4a5
- .bodyforge-qa/bf107-pinned-ui-20261128/mobile-screens/bf-qa-mobile-lenses.png | 92725 bytes | ebedf0a01cdd38bf7ea00a79615ed7a3209e124764e3180be7d7026ff3dbc77e
- .bodyforge-qa/bf107-pinned-ui-20261128/mobile-screens/bf-qa-mobile-performance-panel.png | 92511 bytes | bcf12768b31bcd54640733be6e6ce358f68059705cfefdad4ba5cc841756029c
- .bodyforge-qa/bf107-pinned-ui-20261128/mobile-screens/bf-qa-mobile-setup.png | 151495 bytes | d557acfbbb130cbf75818929903023c0fadf256a4390375c499ac3e97528fc38
- .bodyforge-qa/bf107-pinned-ui-20261128/mobile-screens/bf-qa-mobile-tower.png | 91838 bytes | 61bbbe71f0f0f35aca44e70b5183d548206c167579d7ca7afd4ff950435ada8e
- .bodyforge-qa/bf107-regression-20261128/unit-all.log | 68023 bytes | 51a6ecfe251499f86d249c7d305679585671fa38182b9071a0531c7150a5bc33
- .bodyforge-qa/bf107-regression-20261128/run.mjs | 7778 bytes | 90d6fb6fc63774ef0e77936ec3a303ffd8cc840fc5f2f02d6096f70c6fd4263f
- .bodyforge-qa/bf107-regression-20261128/gates.json | 218 bytes | 95397c6234b45662bed93c5ebca60f97d113836bdf6ead5f0868ad59dd618726
- .bodyforge-qa/bf107-regression-20261128/source-before.json | 63630 bytes | 0d09e840e8d99d9481942044c3784bc01b1d19dee1b015f4af048dd7fcaf533d
- .bodyforge-qa/bf107-regression-20261128/source-after.json | 63630 bytes | 2b5e215439d0b7b2ec2139094cff50bafa16bb0409bd3f3db4ed0c5f75f1a743
- .bodyforge-qa/bf107-browser-20261128/tsc.log | 0 bytes | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- .bodyforge-qa/bf107-browser-20261128/build.log | 4117 bytes | 1802ea774c8f824109446c27d8082326fe754c84f3cbe7c8658a4ae18cc961b1
- .bodyforge-qa/bf107-browser-20261128/bundle.log | 281 bytes | 915d2fe7ab13b6a1dada538ae60d2c94531fdda8e0a7c1095b1972d6b1f7d37f
- .bodyforge-qa/bf107-browser-20261128/native-journal.log | 10828 bytes | e61b268f7f385ff912fd70a87113644328e3f18cbaf1c628987eb14743913ac0
- .bodyforge-qa/bf107-browser-20261128/privacy.log | 760 bytes | b445a97e97fa48d2cffde1531d245c7212dd9ce64a15b7021b7e07f34dcfc53b
- .bodyforge-qa/bf107-browser-20261128/tower-v2.log | 5097 bytes | 1e4b07c138c2913d113bfef0cfcf8f0996b103b1b75d93ac04268621541c4bc0
- .bodyforge-qa/bf107-browser-20261128/run.mjs | 7919 bytes | 88451d596496f2c360c6073834cf8213284b30f885ac97e01dd931f8012419a8
- .bodyforge-qa/bf107-browser-20261128/gates.json | 1972 bytes | bc3ad68cd3f94a2da7ed15a70a962018d072eebca9b3f170b93f64e17b90cf77
- .bodyforge-qa/bf107-browser-20261128/source-before.json | 63630 bytes | 2b5e215439d0b7b2ec2139094cff50bafa16bb0409bd3f3db4ed0c5f75f1a743
- .bodyforge-qa/bf107-browser-20261128/source-after.json | 63630 bytes | 937fc719692f98946aae4297014f01be938b07d82861a0871c9b81b708fc27f0
- .bodyforge-qa/bf107-pinned-ui-20261128/forge-history.log | 8847 bytes | f5caf32b68e97e16696abd2c461485c48c423aea0eafc1a109a6425bd753a4fc
- .bodyforge-qa/bf107-pinned-ui-20261128/backup-help.log | 2370 bytes | b99b5886619b3326687254914a5921f831e0d96ecfc82b8a274cf72b01556623
- .bodyforge-qa/bf107-pinned-ui-20261128/mobile.log | 10468 bytes | 30f1b8c46ad911add2f3cf522749509a5c5b6c2220e0be299ca199e3c05595a9
- .bodyforge-qa/bf107-pinned-ui-20261128/run.mjs | 6416 bytes | 9d4ccbccb80e25a9f50d3cf431f40a094e8270015853c6b8259fa1b5f19b1fa0
- .bodyforge-qa/bf107-pinned-ui-20261128/gates.json | 1115 bytes | 57bd1b6226efae3fcb1a486733447ebde9803174dbdec2e6805e779c505ee1de
- .bodyforge-qa/bf107-pinned-ui-20261128/source-before.json | 13479 bytes | 53b53c0f441bb0637d9de276778635f80648c1cbcd9567d7881e28d756733f16
- .bodyforge-qa/bf107-pinned-ui-20261128/source-after.json | 13479 bytes | 2db4d85ed3fd92c52430fb17eafb5ad24a6881f1b1ee703cb3581cb8fffcc40a
- .bodyforge-qa/bf107-browser-20261128/build-before.json | 12490 bytes | d8d84439b6d2bec68d8b75411b25fbc823c7e0cd81f0cb39be4a1c30db73701b
- .bodyforge-qa/bf107-pinned-ui-20261128/build-before.json | 12490 bytes | d8d84439b6d2bec68d8b75411b25fbc823c7e0cd81f0cb39be4a1c30db73701b

## Open gate

After concurrent work is reconciled, freeze the current source and QA inputs together and repeat the integrated build/browser acceptance. Retain the single skipped unit test as an explicit limitation. Real-device camera, storage durability and opt-in owner migration are not certified by these tests.
