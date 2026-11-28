# BF-604 qualification receipt

Overall: PARTIAL. Local formal release: PASS for frozen snapshot only.

## Formal runs

| Run | Passed / recorded gates | Status | Stopped at |
|---|---:|---|---|
| release.json | 25/26 | failed | synthetic-screen-ownership |
| release-r2.json | 7/8 | failed | native-policy |
| release-r2-jdk.json | 25/26 | failed | synthetic-screen-ownership |
| release-r3.json | 31/31 | tested-local | read-back |

## Read-back

- Source: 478 files; SHA-256 8688c32785ae037a0a95de6e69201c52bc6b3ce45e82b37f0254b043daa23141
- Distribution: 80 files; 36035988 bytes; manifest SHA-256 47b9923590c9e5671ae1e41ff16f56577d89bf40accb1c303045dc516173bad5; equal to first build: true
- Current working tree differs from snapshot in 6 stable input paths: src/components/Avatar3D.tsx, src/lib/avatarZoneFoundation.ts, src/lib/muscleZones.ts, src/lib/regionalFoundationDetail.test.ts, src/lib/regionalFoundationDetail.ts, src/lib/zoneAssetPins.ts
- Scoped patch files with exact read-back: 6/6

## Verified work

- Targeted infrastructure tests: 26/26, including 14 native synthetic scenarios. Java source-only: 46 daily and 22 live checks. APK packer: 3/3.
- Isolated screen ownership replay: 94 assertions. Sequential run failed cleanup; successful isolated assertions do not replace formal gates.
- Licensing: official package vs installed six files match, source tag 0/6; latest archive 1.2.3 does not provide separate notices. 38 artwork files, 11 GLB containers and 2 exactly reproduced textures. Full redistribution clearance not established.
- Native debug APK: exact-verified-debug-apk; 23059757 bytes; SHA-256 43476297375d8039cec9e76b97c0e5a95ef45e49c211a55ba3fd9c033014dd75
- Qualified upstream scenario: tested-local; 111 checks
- Field device: NOT RUN; ADB device list empty at preflight.

## Limitations and corrections

- Initial new-process release run omitted JAVA_HOME; corrected local environment and retained original failed report.
- Second test-harness edit contained an invalid quoted string; corrected and reran the targeted tests before the next full run.
- A report-generator draft had a quoting syntax error before execution; corrected without changing application files.
- System Python lacked NumPy; used the existing Blender Python and verified the two textures.
- No unknown process termination or removal of unverified profiles.
- No public issue submission, dependency installation/upgrade, push, deployment, real-device installation, or production signing.
- Current source drift outside the tested snapshot is not qualified.
- Complete binary-to-source and component license mapping remains unavailable.

## Evidence index

| Path | Bytes | SHA-256 |
|---|---:|---|
| .bodyforge-qa/bf604-qualification-20261128/capture.json | 615 | 0a160610ff85bc037a6b430e59b52bed4f31123a70a6e94e58b99b9951805445 |
| .bodyforge-qa/bf604-qualification-20261128/source.json | 74255 | f26e8b04b134487f920cf3a736b84e01c12168c74954309d53125bf3fe0f8adc |
| .bodyforge-qa/bf604-qualification-20261128/source-r2.json | 74255 | 3ed6b54c81e9dbd6af4bee4d1f1463c7eba7c87457b25c7b38f9e8d7bd80bc7d |
| .bodyforge-qa/bf604-qualification-20261128/source-r3.json | 74255 | 51f0e8362110d265f95f93e371acf6a43792cf81afba21abf1bec04650450c7c |
| .bodyforge-qa/bf604-qualification-20261128/release.stderr.log | 1712 | 0652bd68590f8390f279e7964f77e6b5df1aa027bc2ccec5592d1865de4e4fbc |
| .bodyforge-qa/bf604-qualification-20261128/release-r2.stderr.log | 615 | 88a819010083cc6c9d971fb5ce3d1d88980071d1008ffd01abe39285b06e5669 |
| .bodyforge-qa/bf604-qualification-20261128/release-r2-jdk.stderr.log | 1809 | 9e6ca90d3ea1e17d3a0b2f06a836ee7ae3441536c23892bc1677b8f1a4d2a6dd |
| .bodyforge-qa/bf604-qualification-20261128/release-r3.stderr.log | 2027 | 8b40293fd22552b4e7d34d88b85791bc3e42a49e050f36dca65687630e4bf512 |
| .bodyforge-qa/bf604-qualification-20261128/screen-ownership-diagnostic.log | 4365 | 19021b903eeab6f32eb1acf304a0ec22cfe01cdd7bd6a525447f64d8a63c85b0 |
| .bodyforge-qa/bf604-qualification-20261128/browser-chain.json | 558 | 0384cc949d261ca1ad0460674a6547cef0a28e127d9258466a2768291e88c9aa |
| .bodyforge-qa/bf604-qualification-20261128/chain-pose-egress.log | 828 | 1c9951892923adf93ef0c9fb1f95389357db08a95170c781c6f2fa677fc58fa9 |
| .bodyforge-qa/bf604-qualification-20261128/chain-screen-ownership.log | 4226 | 6204087ca397264cee6030af7236acd4eb108af982fb2c50c6d08d677a0a1238 |
| .bodyforge-qa/bf604-qualification-20261128/native-handle-patch/receipt.json | 1407 | 8193fdd31707d877532d5b80102ea2c1a764d376c2a99a2d6d265766df59b143 |
| .bodyforge-qa/bf604-qualification-20261128/native-handle-patch/unit.log | 5598 | 5bab578cc618b54752ad83dc7cc77e4e4012ac46d7e51910d53d47f6426573fd |
| .bodyforge-qa/bf604-qualification-20261128/native-exit-grace-patch/receipt.json | 467 | 3e721383041fd363d00c23dec6a4a49887dadf1423c8bf09941a9b21382aeabb |
| .bodyforge-qa/bf604-qualification-20261128/native-exit-grace-patch/unit.log | 5479 | 867ef33e00866c23ae20b16d55a0495e253a2110a5014ff1c6f4e09c814fd457 |
| .bodyforge-qa/bf604-qualification-20261128/native-exit-grace-patch/harness-quoting-fix.json | 218 | c33c73b02545671226c66371b1a3804fe5f23a4e24715073a7b239cd357a933d |
| .bodyforge-qa/bf604-qualification-20261128/native-exit-grace-patch/unit-corrected.log | 2753 | f1323a37c7d3256ca25d3969db6d92352a8df033404097ad05684eacaf50153c |
| .bodyforge-qa/bf604-qualification-20261128/qa-only-dist-comparison.json | 301 | 7fc2365d3c91d243a8b953c6fe0fc71ec36defa6895cee2069714ad9ac92d4cc |
| .bodyforge-qa/bf604-qualification-20261128/packer-unit.log | 842 | 3b840ececc978862405b1ecaa419d780a5de2920fe137402950cc81bcdb22b2f |
| docs/audits/BF_604_QUALIFICATION_20261128/LICENSE_REVIEW.md | 6541 | d8fbca60a8fa9dc5684d036578e3c728a46e6b95f4af939d88fdf9bf92ba15fd |
| docs/audits/BF_604_QUALIFICATION_20261128/MEDIA_PIPE_UPSTREAM_REQUEST_DRAFT.md | 2806 | fb243466dea603bb2a7b41d793c1c72b340cf3ac9e07a433b0c298ca1472b479 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/wasm-comparison.json | 6820 | d225929b1ad09113503b5339bc5ca8bf6bec32a92c142fc53783ecacd0a49e1c |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/latest-inventory.json | 2454 | fdaca0964041607b92877351c7a9cdc05b8d5bc5a8ef3ca73d2dfb2cb7e16c9e |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/artwork-provenance.json | 27462 | b753761670365146bc2ee06752cfe094245aa685e216f51cd28645791cd229f2 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/icon-lineage.json | 1730 | 899ac1dd258d2afb1e8e86279e0c5e2ec72c71cf31f94c1ed517f049812efac5 |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/glb-embedded-inventory.json | 5881 | 3f91226a3cb76ba9cfe44458b8f1d6f4f6a72f81de88df55eca65931b6b6cb1d |
| .bodyforge-qa/bf604-qualification-20261128/license-evidence/ocular-texture-reproduction.json | 1065 | 434f275b79d6bf5427692a470ddb6ef0475aef3d44fafd96ddc3b7e826104e72 |
| .bodyforge-qa/bf604-qualification-20261128/apk-readback-r3.json | 646 | 9373f62ce17f871f66afdd13243c137ad365db1b360d3c8b3228ecc6e560e9f4 |
| .bodyforge-qa/bf604-qualification-20261128/apk-r3.log | 5097 | 8c57726f79a719cb26494a1a233ed7da2fdf62c5514bc7269905f2fd838be237 |
| .bodyforge-qa/bf604-qualification-20261128/upstream-r3.log | 7514 | 6a15a6a64f1c5805de39655fd9d6f06e47c5917d9f2d8da1ad7c18a1e3da9a6d |
| .bodyforge-qa/bf604-qualification-20261128/upstream-r3.exit | 1 | 5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9 |
