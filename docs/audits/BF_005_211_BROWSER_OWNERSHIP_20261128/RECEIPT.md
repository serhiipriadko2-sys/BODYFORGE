# BF-005 / BF-211 - browser ownership and exercise catalog, 2026-11-28

Status: IMPLEMENTED / TESTED_LOCAL for the three exact QA-file postimages. Full single-run regression failed; partitioned test coverage verified. No release or field acceptance.
Intake HEAD: 11d51edf407bed2ad7e1fd0a04332654fe46afcb. Existing dirty work preserved. No product source edits, owner profile, real webcam, APK, commit, push or deployment.

## Changes

- qa/owned-chrome-windows.mjs | 9976 bytes | before 4ef038558840aebf78e0299deed8615acca8c7f785112bf468c328f54a3aa646 | after 5eabaf30e549b1d28c6cca7ff2a39b14828ca0fdc913cf0cb132cb7e62d881e0
- qa/owned-chrome.test.mjs | 14785 bytes | before ed6b2378f759e60bb3d782e2c1a655c12bf876e47cce56a0d5000b44f0e67874 | after f6988035e7e76b3bfb87fdce61d61f5a4e651f1ce00f2f01b9ba49a538f567ea
- qa/eight-exercise-catalog-e2e.mjs | 10032 bytes | before 42e446000c94742f4e7738da3da93dc675b8980e0c0d125d8f9246e0f8b0f503 | after 5dbf4ccfa57dc4174bee7918864463dd91ba6cc631aad3482a8568f9c73ed0fc

Native termination decision: after an unsuccessful TerminateProcess call, allow the same verified OS handle a bounded 500ms wait. No repeated termination call, no PID-only fallback, no weakened identity checks. Synthetic RED reproduced; GREEN 19/19 Node tests with 15 native-decision cases; actual two-owned-browser recovery 11 checks. The historical native-termination failure is compatible with this race but its exact OS cause was not established.
Catalog: remove fixed debug port and unsafe cleanup; verify loopback origin and production entry digest, bind browser/page identity, close owned page then browser, disable camera acquisition in the fixture, require unchanged synthetic storage, verify all eight modes and three viewport widths. Navigation diagnostics reproduced net::ERR_NAME_NOT_RESOLVED when the resolver rule omitted literal loopback; explicitly excluding 127.0.0.1 corrected it without removing the restriction. Two negative preflight checks, 52 production checks, 51 development checks, 52 actual-live-QA-file checks. Each disposable browser cleanup verified.

## Verification and retained failures

- First full Vitest invocation: 127 files passed, one eye texture test timed out at its existing 5000ms limit, 15 worker initializations failed with EINVAL / ERR_WORKER_INIT_FAILED, 3 skips. Exit 1. No asserted resource root cause.
- Retry only the 16 affected files on unchanged frozen input: 61/61 pass, exit 0. No timeout or source adjustment. Exact disjoint passed-file inventory across the two runs: 143 files, 1381 distinct passed tests, 3 skipped. Skips are conditional local-asset or optional review cases. A clean single full-suite run is still required by release acceptance.
- TypeScript forced build, exact public-artifact boundary, lazy bundle and offline worker artifact verification passed. Build 80 files, 36039018 bytes; entry assets/index-B1zVWbDa.js SHA-256 e2062f1c5cfeb160961028fd79668375b2643d3a6c39ede9e4db15e981e27c4b. Entry 392037 bytes, 21.1% below historical baseline. Offline worker 52348 bytes, 86 entries, registration/inference not run.
- Read-back: 469 frozen source/QA inputs; 8705 physically copied dependency files; 80 output files all matched manifest. No dependency installation. Canon 30/30 PASS.
- An initial orchestration script had a syntax error before any target write. Catalog V2 initial fixture timeout and cleanup PASS retained; V2 diagnostic and V3 outcomes retained. Old failed-browser disposable profile from the prior turn was not manually removed. All newly tested owned browsers verified closed.

Live source/QA drift versus tested snapshot (catalog V3 postimage substituted): qa/local-avatar-foundation-review.ts, qa/multitab-e2e.mjs, src/components/Avatar3D.tsx, src/components/StorageRecovery.tsx, src/lib/avatarZoneFoundation.ts, src/lib/muscleZones.ts, src/lib/zoneAssetPins.ts. Concurrent work retained; do not extend pinned build results to altered live source.

References: https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-terminateprocess ; https://learn.microsoft.com/en-us/windows/win32/api/synchapi/nf-synchapi-waitforsingleobject ; https://chromedevtools.github.io/devtools-protocol/tot/Page/ ; https://www.electronjs.org/docs/latest/api/command-line-switches/

Rollback: for each of the three changed QA files, restore exact .before bytes only if its current SHA-256 still matches recorded after digest. Do not revert unrelated work.
Next: migrate remaining legacy fixed-port browser harnesses without touching parallel changes; repeat current-source acceptance, actual human/device tests BF-213 and release gates.

## Evidence

- .bodyforge-qa/bf005-termination-race-20261128/reject-nonloopback.log | 73 bytes | 757b0eb04e6e05d4d228536e6683267d5ce74196c0c28fb705c55dd37f5834ed
- .bodyforge-qa/bf005-termination-race-20261128/reject-invalid-sha.log | 115 bytes | b203cbe4f0c4d55ef9c82db31e1f733abbcf9227a039f7715e2a540e78338e7a
- .bodyforge-qa/bf005-termination-race-20261128/owned-unit.log | 2156 bytes | 5c334d246dd9153ec7dbdb77ef69291bda69551fbbd88dd3e36e3494c0618fe4
- .bodyforge-qa/bf005-termination-race-20261128/recovery-e2e.log | 1503 bytes | 05ecc0905f2838700cf07f7d117e69642aeed52aec82159dc04edaffab18f947
- .bodyforge-qa/bf005-termination-race-20261128/unit-all.log | 105497 bytes | e2b1cb429034b648310aceb1eca100fd84fcff487a2cad38b02ab36a708b41db
- .bodyforge-qa/bf005-termination-race-20261128/unit-recovery.log | 2564 bytes | 360fae96e4af641a6c3731a1f3e3a3007a79ada73f722fdb07d7cba8b5128213
- .bodyforge-qa/bf005-termination-race-20261128/types.log | 0 bytes | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- .bodyforge-qa/bf005-termination-race-20261128/bundle.log | 281 bytes | b035b737337f2df0375cdff98291b094058d4da6bdeaaca444179c53fd81ea11
- .bodyforge-qa/bf005-termination-race-20261128/catalog-preview.log | 275 bytes | 16d18b3fdda45f8543dd0426c9703ba56d3c6708a889d6e18a9bcf0d5387c5ae
- .bodyforge-qa/bf005-termination-race-20261128/catalog-v3-reject-origin.log | 73 bytes | 757b0eb04e6e05d4d228536e6683267d5ce74196c0c28fb705c55dd37f5834ed
- .bodyforge-qa/bf005-termination-race-20261128/catalog-v3-reject-sha.log | 115 bytes | b203cbe4f0c4d55ef9c82db31e1f733abbcf9227a039f7715e2a540e78338e7a
- .bodyforge-qa/bf005-termination-race-20261128/catalog-v2-diagnostic.log | 296 bytes | 08d83bc97ee398a9ac507e5037e55ca4a57042909bfb2713f9d66a7102ed75e8
- .bodyforge-qa/bf005-termination-race-20261128/catalog-v3-preview.log | 2147 bytes | 3274bd6cfdca5c188f50e0513ab1122686a40f65c06fcfc40884fff331998c86
- .bodyforge-qa/bf005-termination-race-20261128/catalog-v3-dev.log | 2105 bytes | 9b1cc0394d795b665599ea5098cbea4fcc66101563c3839c15984635958250e9
- .bodyforge-qa/bf005-termination-race-20261128/catalog-v3-live-readback.log | 2147 bytes | a47177f6bb949f28a43239f5e4d34ec0f9ff9d787c175f8c2300e8efb8f20272
- .bodyforge-qa/bf005-termination-race-20261128/red.log | 2852 bytes | 8f93b9eeb6f82d43e15ea8dcf445c83490f6a738e067c6dce27e5a94bade5fbe
- .bodyforge-qa/bf005-termination-race-20261128/green.log | 2155 bytes | 82e282e26c3cd80fc33d2b36caab1a07fa8b8b027f978af8b0c731c2150d09c1
- .bodyforge-qa/bf005-termination-race-20261128/run-red-green.mjs | 4086 bytes | 4fe571bea1e2375c1a0258ab3d54df125c4b77478987c87dcf3a8a9c9be81916
- .bodyforge-qa/bf005-termination-race-20261128/run-integration.mjs | 15564 bytes | 7356fff4125d451a994d488b1b85c575105f33fbb957a772ebb1cf76de0e5b2b
- .bodyforge-qa/bf005-termination-race-20261128/resume-integration.mjs | 12614 bytes | c07a5f1471cc95a3e2c67e79fc9033a3c36406f19a7756d602a06d414fd09e20
- .bodyforge-qa/bf005-termination-race-20261128/promote-native.mjs | 4362 bytes | 24e94c62cf7cb4556fc122b156c8e8989cf09ecf617c97980004fbee218db61d
- .bodyforge-qa/bf005-termination-race-20261128/run-catalog-v3.mjs | 10606 bytes | 4b77b2b3b9ce6a7b1c9e1eac8392e3c8f747b659668e1b12d188af4205f2202e
- .bodyforge-qa/bf005-termination-race-20261128/unit-gates.json | 330 bytes | 6edad51397f86af48d78b6f00c83a9fc708f8cc4affdee8e86ade8b6f3a5e8c8
- .bodyforge-qa/bf005-termination-race-20261128/integration-gates.json | 2953 bytes | 9304ae0f0ba0d0318a4759876b6ad0cb138d392826286232f28d7c96b2f03432
- .bodyforge-qa/bf005-termination-race-20261128/resume-gates.json | 2085 bytes | 6183de9453f39e294e1dc7004e603cc238e08c7894ff7dd810001b6d7f1d3f7f
- .bodyforge-qa/bf005-termination-race-20261128/catalog-v3-gates.json | 2122 bytes | 8994284eef0066145b8e687513266b1694f2185ab93dfe1361db834e3c8d0789
- .bodyforge-qa/bf005-termination-race-20261128/intake.json | 664 bytes | 623744ac30b9bff88f5f159ac18d906a2770444403dd8fbfd3b5ec99bfb2ac0a
- .bodyforge-qa/bf005-termination-race-20261128/preimages.json | 919 bytes | 889b4e9e25274eb0d8f014fd415ca7a9a5fc86a002ec29d19785a30ba3ecf7ec
- .bodyforge-qa/bf005-termination-race-20261128/changes.json | 705 bytes | f03fea9251cc4e9b09d57953d332818715c57756704051a9efc9c06bd0c55714
- .bodyforge-qa/bf005-termination-race-20261128/source-live-before.json | 72694 bytes | 673d4730420375561ba7f4f0d497da2bc0b14eabfe023e7f1fa4ce665df360bb
- .bodyforge-qa/bf005-termination-race-20261128/source-frozen-expected.json | 72694 bytes | 55bc8d0d23dac610035e0326185129060c31fa7ff818a09c48324e0264af8dd6
- .bodyforge-qa/bf005-termination-race-20261128/dependencies.json | 1571260 bytes | 0fdc382c30cb50bb6ab93096a4ad7c9fbbccc2d007e2e898a17fac69db58604e
- .bodyforge-qa/bf005-termination-race-20261128/retry-scope.json | 12312 bytes | a305060a5caaea036a52a79aed08a493400e1d7992755b2179da68702f96fe41
- .bodyforge-qa/bf005-termination-race-20261128/build-before.json | 12490 bytes | 6556ae41bef7c9b194890f42f00248fd838a843087c65f73d49dcb73b07d2c88
- .bodyforge-qa/bf005-termination-race-20261128/worker-artifact.json | 328 bytes | b84fae10704191c771e6ef0dd406a99d70d771a6945befa75fe58f4eacbb1449
- .bodyforge-qa/bf005-termination-race-20261128/native-promotion-receipt.json | 1008 bytes | 3a62ba0e0c863afbc2e7a88913c36fe75765f85383127a98bfe1c77cf3fab154
- .bodyforge-qa/bf005-termination-race-20261128/catalog-promotion-receipt.json | 2903 bytes | e0d5c18f985b96d0b214221d4442532e8e91e4328e8dd8ba3880976a066aa259
- .bodyforge-qa/bf005-termination-race-20261128/catalog-v2-navigation-diagnostic.mjs | 10013 bytes | e67aae2233ad48464e353760005ca69a634cacd896f62c9f8cfb2bb169d1e1b7
- .bodyforge-qa/bf005-termination-race-20261128/catalog-v3.mjs | 10032 bytes | 5dbf4ccfa57dc4174bee7918864463dd91ba6cc631aad3482a8568f9c73ed0fc
- .bodyforge-qa/bf005-termination-race-20261128/owned-chrome-windows.mjs.before | 9817 bytes | 4ef038558840aebf78e0299deed8615acca8c7f785112bf468c328f54a3aa646
- .bodyforge-qa/bf005-termination-race-20261128/owned-chrome.test.mjs.before | 14614 bytes | ed6b2378f759e60bb3d782e2c1a655c12bf876e47cce56a0d5000b44f0e67874
- .bodyforge-qa/bf005-termination-race-20261128/eight-exercise-catalog-e2e.mjs.before | 4163 bytes | 42e446000c94742f4e7738da3da93dc675b8980e0c0d125d8f9246e0f8b0f503
