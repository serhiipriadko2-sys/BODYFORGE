# BF Quick Deck restore - engineering receipt

Status: TESTED_LOCAL on the exact frozen production snapshot. Full release runner and deployed/mobile physical-device acceptance NOT RUN.
Observed: 2026-11-27T19:31:53.888547+03:00
HEAD at freeze: 226429ae1080d000336a7430926d64e4bb54a89b
Snapshot: .bodyforge-qa\bf701-vite-patch-candidate\quick-deck-restore-20261127

Changes: move the original ForgeQuickDeck into the core application bundle, mount exactly once on dashboard irrespective of fighter creation. Keep all four original actions, labels, card appearance, size and dashboard ordering. Before creation the training action selects squat and navigates to Camera without requesting a camera. After creation preserve the original squat quick start. No reward, profile schema, CSS or original tile-component change.
Tests: corrected red fixture (two failures, one pass) and targeted green (13/13). Added regression for four large accessible tiles at 320/390/740/741/1080/1280, actual hit-tested clicks on all four actions, before-creation navigation without camera request or profile writes, created squat selection with synthetic getUserMedia denial, no awards on denial, saved-byte preservation, correct screen ownership. TypeScript, artifact-boundary build, bundle limit, full Vitest 1223 passed / 2 skipped in 120 files, production-screen 94/94 and saved-content 15/15 PASS. Final diff and canon checks pass. Initial test fixture Unicode transmission error corrected; first dev browser stopped on collapsed exercise selector, fixed by opening catalog before asserting. Second dev browser stopped on CDP timeout. First production browser passed functional assertions but cleanup was unverified, exit 17. Exact synthetic profile identity and creation time matched; no owned processes remained, port closed, profile removed in separate verified recovery. One recheck of same frozen source and distribution passed both functional and cleanup gates; previous failures preserved. No visual screenshot requested in final test.
Build: 398 input files, 76 output files, 35917410 output bytes. Entry 386855 bytes. No separate ForgeQuickDeck chunk. MediaPipe remains lazy. Layout reference: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout .
Root dependency manifests unchanged. Verified patched dependencies used in isolated snapshot, not adopted in working tree. Live dev server listening: True. Concurrent source drift preserved and excluded from frozen acceptance: ["src/lib/avatarShoulderTransitionReview.test.ts", "src/lib/avatarShoulderTransitionReview.ts"]. No actual player profile or camera accessed, APK/AAB, Firebase, deployment, git stage/commit/push, or root dependency install. The actual user device display is not independently verified.

## Owned files
- src/App.tsx | 78504 bytes | SHA-256 62f007ab1cb691a9a97c410929100242d206522471592a5715d811ca93bc600d
- src/lib/forgeQuickDeck.test.ts | 1917 bytes | SHA-256 81297db6457410020381177edfca0b364ae2d3bf02a7297b6cfa1b5fc98e6e4f
- qa/screen-ownership-e2e.mjs | 15378 bytes | SHA-256 6077c87492eb813be41f2dfccbc08f832574d0c17d76443a32f003ac2154e9c9

## Evidence
- App.tsx.before | 78450 bytes | SHA-256 f402404c4e4dafd5f36e4ccf49f12a5823b1566c364c05952015fbd741cd08ba
- build.log | 22441 bytes | SHA-256 bcb87a023cf2b6b64ecaaf182206088149320975c5f907eb97473b36aae6f414
- bundle.log | 281 bytes | SHA-256 3fae9b5bddb1cb4338cdc21546b9528c3a8d13b5c9ea17105544b3786842bd10
- canon.log | 191 bytes | SHA-256 bd4804de303f67e95fa25e0fa54c637d0ae574c4ff18b54cfa79d64738587506
- dev-browser-v2.log | 3614 bytes | SHA-256 de003240f3b7fd4e7b441cec6a4a3f9425bca225bb768956c98b1cf1666a83bb
- dev-browser.log | 4129 bytes | SHA-256 c4acfa1ca8c020a0b914f2638eab6ffcf820fa5c393fb21c37da979ac145534e
- dev-gates-v2.json | 839 bytes | SHA-256 69a3a1de47cecf8ab42c7cdf42ede3a34fbf224563b277ee7f391bc5dc4cfb89
- dev-gates.json | 673 bytes | SHA-256 96d48c0bfcb78e20e746f54249a201a83b2c48345b627709c435293db2548c11
- diff.log | 104 bytes | SHA-256 f8a40dc4223a703739d694e6f155f36ed06938433c38a76fb8ad93bffa1ddde8
- final-diff.log | 104 bytes | SHA-256 f8a40dc4223a703739d694e6f155f36ed06938433c38a76fb8ad93bffa1ddde8
- full-unit.log | 45077 bytes | SHA-256 bbd6a8a00d56526e1de3282308560093870a533654eb9e774953a6533ff9a96b
- local-gates.json | 507 bytes | SHA-256 0ee61aa724bdea791b28a3a09441b15a8f9cab4f7c5bc9269fd220fceac34d30
- preview.log | 40 bytes | SHA-256 84f2470349bd069d9954da47dc5992a952f59da5ec1381f7b8221a2bca49e7a9
- production-cleanup-recovery.json | 336 bytes | SHA-256 233e8a64889b5c768a8a0b65107d938417cc3188d6767919a1e7725e22d17a78
- production-content.log | 1054 bytes | SHA-256 f72eae1deaf89fd70ba72dcb0ce33f3302e0f86b70e67149a5c76fe31a199a64
- production-gates.json | 16854 bytes | SHA-256 cbd37580f82505c7f4628e41bbb46908f1d65a6d3f4f8e1e9273158ff38899d8
- production-recheck.json | 1262 bytes | SHA-256 5070af75bff7edf0eeb29a509765ca9a61bf457ae5d9a31eaddcda01f40d8d5d
- production-screen-recheck.log | 4346 bytes | SHA-256 5b9d05feccf2b6914adb330eec6daa282103633f76501bfe7e7073f300670be7
- production-screen.log | 4143 bytes | SHA-256 032b08846d47c74391d46015c77227ec8fa034c53e61067a13bd6d44b6aa7971
- recheck-preview.log | 40 bytes | SHA-256 3a542194a59aa045464e9721e2151d9fb1579b9bbdb3bb7204e911ca16da3668
- red-corrected.log | 175390 bytes | SHA-256 c0ba7035dd3967f0f5ae0bb2d7c533ce47e4008a13a7da7f883b9f19aa5d4f33
- red.log | 184692 bytes | SHA-256 3b98c8e0f1beb72e1c51af428ee11e7fc6a2d9f6ebbffd27fc2b0a7240239a7e
- screen-ownership-e2e.first-repair.mjs | 15101 bytes | SHA-256 f95b661796a1e93f0a82efb9fd27c3d60e643fd199de0205b2ddc58ad52249a0
- screen-ownership-e2e.mjs.before | 11008 bytes | SHA-256 90ba82ecb4b5152cbef2a47c3a5226abfb83180e497bdb252c9eea5e8bd56c42
- source-manifest.json | 58286 bytes | SHA-256 ee717b5d831f4b1faa8233392e64b46072503bbfea9493b1060df0edb0ae30fa
- syntax.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- types.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- unit.log | 1022 bytes | SHA-256 aba2e7162e26346f09b5bb0fbcc1435cacd0611285e268dc9cfd6ccdad62f9ed
