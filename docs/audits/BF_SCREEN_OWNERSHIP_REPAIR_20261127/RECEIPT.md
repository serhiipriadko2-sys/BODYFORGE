# Forge and Camera screen ownership repair -- engineering receipt

Status: TESTED_LOCAL for application screen repair and new independent regression scenarios on pinned build. Release runner wiring source/syntax/unit checked; full updated release runner NOT RUN. Overall roadmap not complete.
Observed: 2026-11-27T19:14:03.296510+03:00
HEAD at freeze: 226429ae1080d000336a7430926d64e4bb54a89b
Snapshot: .bodyforge-qa\bf701-vite-patch-candidate\screen-ownership-repair-20261127

Root cause: prior world.css deliberately scoped true-screen visibility to <=740px; desktop rendered the long dashboard and other tabs concurrently. App gated StepsBoard and ProgressPulseBoard on fighter creation, including Camera. Repairs: common screen ownership selectors at all widths, scroll to selected screen top, compact desktop Camera width, dashboard hides editor and challenge, non-created home hides redundant hero card; Camera progress/steps mount independently of created fighter. Existing XP, progress, shortcuts, missions, camera/storage/reward logic retained. Pending-result notice retained on Camera/hero/tower/online. No change to saved profile schema, rewards, avatar assets, native sensor implementation, APK or Firebase.
RED: 2 new source guards failed against previous code; after repair 10 targeted tests PASS. New browser regression tested 320/390/740/741/1080/1280 CSS px on actual dev server and exact production build: 64/64 each. Both screens isolated; original XP, full-size hero stage, progress, four quick actions and missions ordered; Camera controls, steps and activity ordered; no overflow; hero/tower/mission shortcuts, selected activity range retained; exact synthetic saved primary/backup/steps/appearance bytes unchanged during navigation; no uncaught page exceptions. First dev test timed out because it asserted mobile innerWidth on about:blank before meta viewport loaded. Second failed optional wide screenshot capture after functional layout checks; both failures preserved. Final functional runs omitted optional captures, without relaxing layout, navigation or storage assertions. Documentation: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport and https://chromedevtools.github.io/devtools-protocol/tot/Emulation/.
Visual QA: three initial 390px images captured and reviewed; XP/progress/deck and steps/statistics visible, first hero screenshot taken before GLB settled. Additional screen-content production scenario 15/15 with browser entry digest verified, synthetic stored 320 XP -> level 2 / 70 XP, four upgrades -> 20%, real GLB athlete canvas loaded, screenshot shows full character, saved workout 20 reps/one active day shown, explicit manual steps 4321 persisted after reload. Web automatic step fields show unavailable, not fabricated measurements. Player/backup/appearance bytes unchanged. No real user profile/camera/physical device involved.
Fresh frozen snapshot: 394 inputs and 79 outputs, 35,918,223 output bytes, entry 383745 bytes. TypeScript, artifact-boundary build, bundle limit, PWA manifest/icons, privacy 62/62 PASS; full Vitest 1217 passed, 2 explicitly skipped, 118 files. Initial extra legacy steps-day script exited 21 due missing screenshot directory in isolated build; before error it passed web steps compact layout 320/360/390/428. It also contains source-module fixtures unsuitable for production preview; do not treat as passed. Relevant persistence and rendering reverified with purpose-built screen-content test on unchanged build. Workout HUD 41/41 PASS, including incomplete workout stopping without saved player changes. Both owned preview processes closed and no matching disposable screen/steps test profiles remain.
Added both functional screen gates to qa:release (mandatory pass and owned cleanup markers, no optional screenshot directory). Syntax, 26 auxiliary tests, scope diff and structural readback PASS. Both gate commands executed independently against same pinned production build. Whole updated release runner not rerun; no CI claim. Current root drift relative to frozen snapshot: ["qa/avatar-quality-e2e.mjs", "qa/release-gates.mjs"]; new files: ["qa/screen-content-e2e.mjs"].
Root dependency manifests unchanged. Installed root versions: {"vite": "8.3.4", "rolldown": "1.2.14"}; user server 5173 listening: True. Security patch only in isolated build, root adoption pending user-coordinated stop. No deployment, no APK/AAB, no Firebase, no git stage/commit/push, no actual player storage access.

Rollback: restore only App.tsx/world.css/screenNavigation.test.ts from exact .before copies and release-gates.mjs from release-gates.mjs.before-screen if current owned hashes match; remove only matching introduced screen-ownership-e2e and screen-content-e2e. Preserve concurrent edits.

## Owned files
- src/App.tsx | 78450 bytes | SHA-256 f402404c4e4dafd5f36e4ccf49f12a5823b1566c364c05952015fbd741cd08ba
- src/world.css | 33284 bytes | SHA-256 aa6d165070a02bca544f5d7ddc3690efbe752bb2566b993c41bb900df7ab3d8d
- src/lib/screenNavigation.test.ts | 4729 bytes | SHA-256 8b617fa42e6103a906a952a56edac24eec84dcccd5cd44de4eee2eb466f9d967
- qa/screen-ownership-e2e.mjs | 11008 bytes | SHA-256 90ba82ecb4b5152cbef2a47c3a5226abfb83180e497bdb252c9eea5e8bd56c42
- qa/screen-content-e2e.mjs | 11041 bytes | SHA-256 342f075dbc6187f89f19e6a0a78dce697d417b061a88b5d675ac2c252c915972
- qa/release-gates.mjs | 11082 bytes | SHA-256 1539492089b1c9ffb030dab61a7e6b7f98f0d4da6d6d0082eed4d92c29a7bb99

## Evidence
- App.tsx.before | 78477 bytes | SHA-256 e050140c6d2630b461b67904021ec0d3b19cb9141b48c241e70c0d281001c95c
- before.json | 286 bytes | SHA-256 5ce9c185611f4a373bc6604249beebc80a3c119df9bc40c72afb6443ae771acd
- build.log | 22959 bytes | SHA-256 410d5e0cabb4866f6e6a343d80b08ce1f1917a9b2965a1bf17e87450d0a7c892
- bundle.log | 281 bytes | SHA-256 d3938e92b3fb0832b69e04f8f040521ebaab5a95fd044fe3377dc3de4182a7de
- canon.log | 191 bytes | SHA-256 bd4804de303f67e95fa25e0fa54c637d0ae574c4ff18b54cfa79d64738587506
- content-preview.log | 40 bytes | SHA-256 37ed9a6078a94689d66ed2a7c46a57c090f63fe099628ee79beae50d24afd142
- content-run.json | 1765 bytes | SHA-256 c56e6e23b87013cbe9684147abf02dd35c8cb1803e2fe274059a700889830dc4
- content-shots/forge-loaded-avatar-390.png | 234357 bytes | SHA-256 8ce53e2644455aab439e4122e512b11903b3b758a4907ccb500c210f5273f307
- content-syntax.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- dev-browser-v2.log | 2096 bytes | SHA-256 12db77cb6bd7917f414899a95adebdf88ab9dfa56bd6dac0a59ec000f78f00a6
- dev-browser.log | 267 bytes | SHA-256 680e835b82a43267f3a54d44f14e40d1f7df65f03a2c745d9e54a6aa1a03d383
- dev-functional.log | 3057 bytes | SHA-256 96083ea86a2e484b0a70db9b72291393be61670ece9688efd1ea7c109dea168d
- dev-shots-v2/camera-steps-390.png | 143497 bytes | SHA-256 4caa00b4031dadafe9b9077baedb86ceede84759d27704e14b00e41a6d2f20c3
- dev-shots-v2/forge-390.png | 223368 bytes | SHA-256 5a09b5d642e979ec97c39419fec6db5fde6df31ffe3a8211572e5b294ec939d5
- dev-shots-v2/forge-progress-390.png | 216136 bytes | SHA-256 231f451400a3e99cf5879d172039b5498ff1470eccd0ec9bb7531b8887e59ed1
- diff.log | 335 bytes | SHA-256 3fe61fbf228f694e28e2dad01be15b19aaf391870a9d8834c94b14687180c812
- final-build-manifest.json | 11703 bytes | SHA-256 d828e3f0a27486c3681da43166c3e0d69b32e9f8aa3df06dc31ebbaf8f3b0ff8
- final-run.json | 4206 bytes | SHA-256 c115095e64f87d1c78164c3ea9513964a7bb268a6c44f3fc182136d79d6473e8
- final-source.json | 57674 bytes | SHA-256 76944718dd6ae82595a4f63eeb0eb843957eebfd32f495bb7ad4024f4bc7fcb2
- full-unit.log | 29587 bytes | SHA-256 20c65a99d3ac262f979a3ed116faf2141e1150eb3aa476321fc5452a958cf524
- gates-v2.json | 579 bytes | SHA-256 7ff6fdb4c17ff757eee9b9b52035aaf8434d7f4029f7b19a70ee5938b9711a5c
- local-gates.json | 528 bytes | SHA-256 a0cd90e6d73747a31998dcb21cc2084f7a7a8b248d520f5e039af0f2d39cc2d0
- module-resolution.log | 215 bytes | SHA-256 9eff8fcb0c1433ace8727c37d4a496f9c6bbf2d6ad0d8da494b3c95a060db53c
- preview.log | 40 bytes | SHA-256 27d62059d7096b7597b25e1b56f8fcdfb3e5fed2fe6586fd7a6db6e5c09941d2
- privacy.log | 2320 bytes | SHA-256 45e28bf907fb64702ed5ea36022aa4520767814975fd62f8c70ab5dc708a3bca
- production-screen.log | 3072 bytes | SHA-256 5e98169dc253d56a56cad3ceb5e2315d366730246b1bd3eb4c1a0b3636fcf854
- pwa.log | 149 bytes | SHA-256 7c12f115d664008d3f67bcf1926b75d5d312a74991fa8691458923ee3374099c
- red.log | 96745 bytes | SHA-256 05bb10009cf4489373d5b6f53ebc03fda8228bda0fcfb762a2c19f2bafdfa64b
- release-gates.mjs.before-screen | 10448 bytes | SHA-256 011b7d17a60e37ac18191e91b242fbf86d99e3e85f071e31275f59f575a651f3
- release-wiring-diff.log | 448 bytes | SHA-256 eb34c08fa980c56d1db6cb2516a9524c8be0745283888b8962fe7e2fcdf3fee0
- release-wiring-syntax.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- release-wiring-unit.log | 2396 bytes | SHA-256 7bc98ab445472b7fe40e24b24b1165ecdbe41481d7c6bb80417bf9ff4b2656f7
- release-wiring.json | 839 bytes | SHA-256 c18a774229f63293fdf7d7d6c75b20fa5c077af7accfa5f7ff0517e530396215
- scoped-diff.log | 335 bytes | SHA-256 3fe61fbf228f694e28e2dad01be15b19aaf391870a9d8834c94b14687180c812
- screen-content.log | 1049 bytes | SHA-256 a02add013159ba653196807f30875bd893d0e42ab15130ec234461011ed8ec1d
- screen-ownership-e2e.first.mjs | 10400 bytes | SHA-256 fdffde4e96e0dd96cf3c54d987dce27cd1c5e4badf9bdbfec00284f8c725599e
- screenNavigation.test.ts.before | 3040 bytes | SHA-256 b16c9f789f3ba5cbacbe0a85d836a12ba9d9f3b2f53ff086b9d3f9b697ecc5e7
- steps-day.log | 2136 bytes | SHA-256 ab92bf34b6bded1b976444aa2c05c43f0823b23f887b3d4caf1327692398c639
- types.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- unit.log | 916 bytes | SHA-256 a0f74f5e349ed1a3e19a9f0440970ee7f6b3cb0b6467e2794e12aaa26237eeb2
- workout-hud.log | 2521 bytes | SHA-256 03e10ae35233ed8202af4afc13fd9fbac15420e172132296bfd04cf1d3bac5bb
- world.css.before | 32678 bytes | SHA-256 71fe24da727402f98f13f508ab531a003e9ddb0d371a931aaad580784bad16af
