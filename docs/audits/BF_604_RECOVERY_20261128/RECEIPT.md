# BF-604 — Offline recovery, real upstream verification
Date: 2026-11-28
Scope: BODYFORGE local worktree, E:/github/BODYFORGE.
HEAD: 11d51edf407bed2ad7e1fd0a04332654fe46afcb

## Decision and implementation
A navigation to the exact game root or index.html must not start a partially cached application or mix incompatible release bytes. The worker verifies the pinned cache before returning the shell. When verification fails, a self-contained recovery document is returned with hashed inline style/script CSP and connect-src 'none'. The page does not touch player storage. Repair is explicit, limited to a same-origin root window with exactly one message port, reuses the existing coalesced cache preparation, and waits for complete verification. Reconnection alone does not initiate recovery downloads. Reopening requires a separate action. Exit is confirmed explicitly, verifies the worker registration scope/script, unregisters without clearing saves or caches, and instructs the player to close controlled tabs.
Tradeoff: complete root-navigation verification adds hashing and storage-read cost. Performance on physical devices remains unmeasured. Recovery does not promise survival if the browser itself erases all origin data. Old cache retention/limits are not resolved in this step. No automatic production registration or new dependency.

## Changed source (read back, bytes / SHA-256)
- src/lib/offlineWorker.ts: 13446 / 680c21bbbd3f38fdab78f22e3559b48998ce5a75013cbd17c354f83826a1948b
- src/lib/offlineWorker.test.ts: 9918 / 9a601b9c9d10f0aa99802a1d32e6121067d5dfd0658203f070b0088f95c98536
- qa/offline-worker-shell-e2e.mjs: 17637 / 5e6b9580552cfec3def047895355103f6c01aad6c3e59891351bea64702516df

Unchanged by this patch:
- src/lib/offlineCache.ts: 15036 / 0402e4b6a7e1e1a91d1eb898082d940fad87eefb37c369218fa69e65d5d0a521
- index.html: 1274 / ee117a4222cf463fb749f8b2915c0b323770a690551da50a646f4088d3cb5ff6
- qa/release-gates.mjs: 13196 / 367204d254fca06b640c1d80872f12111b5ad161654272b64b57c5212ae6402c (existing parallel change to unit timeout, not modified here).
Preimages and manifest are under .bodyforge-qa/bf604-recovery-20261128/. Roll back only the three scoped files, after checking their postimage hashes; preserve parallel work. No rollback performed.

## Verification
- Focused unit tests: 24/24 PASS (17 existing core + 7 worker).
- App type check: PASS; generator/boundary tests: 26/26 PASS.
- Real Chrome shell/recovery E2E: 51/51 PASS, exit 0, owned-browser cleanup PASS.
- Seven pinned upstream URLs: HTTP HEAD 200, exact URL, no redirects, ACAO *. Streaming Node HTTPS GET: 7/7 expected hashes, 46447342 bytes, exit 0; no persisted model binaries in the worktree.
- Exact release snapshot: 455 source files, source SHA-256 3e77c55e0fc54120e3f13d19323b470b0109ed4909741a9d2439547a49ed545f. Build: 77 files, 35975243 bytes. Worker: 40343 bytes / 751351d3d3af1f9b90dec212720102fcf8a4c8e26ed905f1c93d71facd8b27b9. Index SHA f72f4a3797e392d5f9b03b061fc83dcfa7b6d3dc9917eec9722c5903631ee3de; entry SHA d3fbc2e7a675a1307bdceb1ddf3184caf8667fe9e1b65c95630088cb370a6905.
- Original full release: 23/24 reached gates passed, unit/types/build passed, stopped at synthetic-screen-ownership exit 17 (cleanup unverified; original functional result not independently established). Failed receipt preserved. Residual directory inspected read-only; zero matching Chrome processes and zero debug listeners at observation. Residual directory not deleted without original ownership proof.
- Separate scoped replay: reverified snapshot/dist hashes and worker identity. All five screen ownership/content, backup help, tower, mobile gates and final readback PASS. Screen ownership 94 checks, content 35, backup help 24, tower 26; each owned Chrome cleanup PASS. This does not overwrite or convert original failed release into a full PASS.
- Actual upstream recovery E2E, original unmodified generated worker, no local pose routes: 52/52 PASS, exit 0, cleanup PASS, 60.20s. Initial real pinned upstream install and explicit repair after entire cache eviction; 83 entries / 82382242 bytes, manifest version ea208d1dde61cd355ed43e1a52aa86db859cc8e19f28748fd34940f67581a0ed. Both offline inference sessions used cached model/WASM and synthetic camera. Detailed ocular material rendered; no unexplained CSP violations; SDK logging denied by enforced connect-src. Zero offline server requests and unauthorized responses. Reconnection did not download until explicit repair. Repair and reopening preserved all saved bytes; manual cancellations awarded no XP. Legacy profile identity migration observed and other fields/backup preserved. No actual product-origin registration or physical camera/device tested.
- Screenshot inspection: offline 320 px and ready 390 px layouts readable, no visible clipping; 320 px touch-target check passed.
- git diff --check exit 0 (existing line-ending warnings). Final scoped hashes match. HEAD unchanged.

## Evidence inventory
All paths below relative to .bodyforge-qa/bf604-recovery-20261128/. Bytes / SHA-256:
patch-manifest.json | 609 | e36f0262fe42933d70fe106738a9a8c2aa7df20a237c25aeac13c11fd2979dfe
source-before.txt | 46443 | e7ab3d30f9c353f821887131e14335b2dd87b9503ebbf6c333c8f4ef42fec9c2
source-after.txt | 46781 | 38021d0ab720e7125efda3ef712f2cb2e74d3983cd6edd3b86437b7669124579
snapshot-before.txt | 46443 | e7ab3d30f9c353f821887131e14335b2dd87b9503ebbf6c333c8f4ef42fec9c2
unit-r1.log | 810 | 697617482b47fcf6f17c33d3cdd23c62a1f8694e0cb3364049377c6b2a3cafcc
types-r1.log | 0 (successful silent type check) | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
build-unit-r1.log | 2233 | 7f60293e8b1d0bd921b840cf1331ca41d3c468573ea376ad437daef25a5375f2
shell-r1.log | 2199 | d65321b5c1cd36eebb276dc1d27168a5b58e6482d648998abd1c7774f4dd9543
upstream-head.log | 4444 | 7be3bc6226deec2d98bbb294067387aed3fcc7553f41e532d44bceb49ef0cf5c
upstream-bytes.log | 2418 | 32d76a6a0cf12933e51b6166d65344ef2f03daa9df5442d4e3b445339246e2dd
release.json | 21397 | 83a6530df41f9803c644c666fba141359a6c66900efbe1180b19b8aa98596ffb
release.stderr.log | 1544 | 14c2d4a8c5428e51a24e229fee0d7420524310956de42f5a753d61067f263f38
scoped-artifact.json | 21634 | df7986dd23cf2df8f7dc2abdeced7347a9bffe6cd1481e0588f84a6d0262b826
scoped-replay.log | 2904 | 1ab757215feed7045ba99a5543dc77b8b70c9aed19960e0a4b339a203f301e57
replay-receipt.json | 1212 | be7badd3f40343e5c60d9a3ad5bb57efcafabeb60b3d53659a229ca360c99ba9
release-snapshot/scoped-replay.mjs | 6321 | 81a245fa31c67103f0bbe6abcc3490d29b73b1ef1d0457358e46c13026196ead
run-upstream-recovery-scoped.mjs | 29225 | 002830adaf59c2008a62a5c7fdc68e90be18e5732accff1fc594f4f0eac2a432
upstream-recovery-r1.log | 4204 | 729df27de2e5dc2f8d4bb79a9099dbc0144360917c1321fe8f7e683cfb5f569c
upstream-recovery-offline-320.png | 27390 | c26f5dfa838f4146486ebba5c2228eadc13a86752e5fa30e241a4ec3c1576226
upstream-recovery-ready-390.png | 29738 | 57e89bf6af9feed10bf120d177495300fa2334761bc169ed8ef6a5fecfdd83f1

## Boundaries and next
Parallel avatar/region work changed Avatar3D.tsx, avatarZoneFoundation.ts, muscleZones.ts and added regionalFoundationFaceRepair.test.ts, regionalFoundationFaceData.ts, regionalFoundationFaceRepair.ts during testing. Snapshot evidence does not establish full verification of the latest worktree. No user save, real device, commit, push, APK, or deployment touched. Recovery implementation locally PASS; overall BF-604 and release PARTIAL. Next: explicit opt-in/readiness UI; retention/quota/update lifecycle, license/notice checks and real handset verification; fresh complete release gate on stabilized current sources. 
Delta: recoverable pinned offline shell and complete upstream recovery proof.
D: local source patch, isolated snapshot/replay, two real-upstream acquisition phases.
Omega: locally verified scope only.
Lambda: any source/resource identity drift or physical-device failure requires requalification.
