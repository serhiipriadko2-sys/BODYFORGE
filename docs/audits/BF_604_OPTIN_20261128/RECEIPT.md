# BF-604 - Explicit offline preparation and verified readiness (pilot)
Date: 2026-11-28
Workspace: E:/github/BODYFORGE; HEAD: 11d51edf407bed2ad7e1fd0a04332654fe46afcb
Status: scoped opt-in/readiness implementation PASS; full release PARTIAL (repeated screen cleanup exit 17, original result retained).

## Scope and decision
Added offlineClient.ts, OfflineReadinessPanel.tsx and lazy SettingsFaq integration. User gesture is required before registration, repair or confirmed disable. Opening Settings and checking status are read-only. Pilot enabled only in secure production loopback at exact root/index.html, without query or fragment; development, public web and Android WebView cannot enable it. Status validates the worker reply, exact registration/script ownership, active/controller relationship and fresh observation; no readiness claimed before page control. Readiness expires after one minute; network/visibility/controller change invalidates it when idle. Uses origin Web Locks for explicit control actions. Capacity estimate must show 144 MiB available (128 MiB version budget plus 16 MiB headroom); no probe writes or persistent storage request. Unknown or low quota blocks preparation. No forced claim, reload or update activation. Confirmed unregistration retains caches and player storage. No economy, avatar, player schema, CSP, worker core or dependencies changed.

## Verification
- Targeted Vitest: 46/46 PASS (22 client, 17 cache, 7 worker); focused tsc PASS; node --check QA PASS; git diff --check exit 0 (existing line-ending warnings).
- Mandatory backup-help browser test extended to 30 checks: no registration on mount/open/check, low quota blocks explicit preparation, profile bytes preserved. PASS in scoped replay.
- Full release original: 23/24 executed checks PASS; unit, types, artifact, bundle, PWA, privacy and pose egress PASS; stopped at synthetic-screen-ownership exit 17. Failed full receipt not overwritten. Repeated cleanup issue from prior run; root cause not established. Residual exact-profile processes and debug port listeners observed as zero; residual directory not deleted.
- Separate exact-artifact browser replay: screen ownership 94, screen content 35, backup help 30, tower 26, mobile PASS; all five cleanup gates and final artifact/source readback PASS. Not a replacement full release receipt.
- Real upstream pilot UI E2E: 94/94 checks PASS, exit 0, 57.51s, unmodified generated worker, no local pose transport routes. Preparation used actual UI; one explicit registration, no forced claim, readiness only after reopen; direct UI repair after single pinned resource removal; offline readiness and ocular rendering, camera inference and manual stop; full cache eviction, explicit repair and second offline inference; disable/cancel/confirm and eventual unregistration. All compared synthetic save bytes preserved except earlier expected legacy identity migration; no unintended XP. Zero unauthorized HTTP responses; two failed browser worker-update requests while offline (not app assets). SDK telemetry blocked by CSP. Owned Chrome cleanup PASS, remaining 0.
- Visually inspected three settings screenshots (320/390 px unprepared, needs-reopen, ready); no visible clipping, minimum touch-target/width checks PASS. Recovery page screenshots generated and hashes retained; same recovery implementation unchanged.
- Full build: 78 files, 35986857 bytes; source input count 463; source SHA-256 a97a0014fe944b08408df2f6ddad1bf4a8cdd48263dbb236c89f9829d2b8147e.
- Generated worker 40485 bytes, SHA-256 af358d9d6bfa78abe5beda44bed55fa225c37aeec55f331bb32043d4a75642ce; 84 cached entries, 82393714 bytes; manifest bffd722933c05770c25fe548dff239869d58c12f382c6b1a4377db8dd4e96cb8.
- Index SHA-256 5cb0d46dc3428ee5049a54e4d04ce482fcfb10ed7db815d8d8e45d3f333aa366; entry SHA-256 ec979c2728d782023b2c627a65c43d9db4150c2101a45de6181cf48e12c14de1.
- Final frozen artifact/source readback PASS. Current worktree count 463, SHA-256 a97a0014fe944b08408df2f6ddad1bf4a8cdd48263dbb236c89f9829d2b8147e; current input comparison MATCH.

## Scoped source inventory (path | bytes | SHA-256)
src/lib/offlineClient.ts | 9298 | 06e5381eee570325e22b4675ea2c67745f4feaa3279a31f3c5e157b4bd148568
src/lib/offlineClient.test.ts | 10711 | ab3527a4d415ba1c4791e91ec7a7115c7f8ca04f6268583b091c810178e65335
src/components/OfflineReadinessPanel.tsx | 8924 | 0a92aaea72f4b0f8835f45f87a6c8c46fba4fba1067550019b2bc680446c13e1
src/components/SettingsFaq.tsx | 6814 | 92f27171f9b63d09aef6a12008678eb2fc19b4c876af9535c81b94dd5c56a208
qa/backup-help-e2e.mjs | 11857 | 2adab588cc6a25ba91c6d3fbfdcb6b8b142cd3eebb41763e880a0b25b68c13b2
src/lib/offlineWorker.ts | 13446 | 680c21bbbd3f38fdab78f22e3559b48998ce5a75013cbd17c354f83826a1948b
src/lib/offlineCache.ts | 15036 | 0402e4b6a7e1e1a91d1eb898082d940fad87eefb37c369218fa69e65d5d0a521
index.html | 1274 | ee117a4222cf463fb749f8b2915c0b323770a690551da50a646f4088d3cb5ff6

## Evidence inventory (relative to .bodyforge-qa/bf604-optin-20261128; path | bytes | SHA-256)
patch-manifest.json | 717 | d22f7538700db272f4f93dd95cb4b06c192f4efd98c73c8d5a6340883edf70a3
patch-r2-manifest.json | 444 | 73956e10ef69b8bdb9f5e63f451e0ce34d5e0e55acab5b6616799d5a97faa80a
source-before.txt | 47309 | 8c7dbb6dd5b11b8b31af6fcaa51e62434c8c1b2ea516a0af936ab1300fa3e459
source-after.txt | 47309 | 8c7dbb6dd5b11b8b31af6fcaa51e62434c8c1b2ea516a0af936ab1300fa3e459
snapshot-before.txt | 47309 | 8c7dbb6dd5b11b8b31af6fcaa51e62434c8c1b2ea516a0af936ab1300fa3e459
unit-r1.log | 917 | 0efa236ac4f8bfc48e981896be1956670dbdac0963f4849f241cc7620fc8f828
types-r1.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
release.json | 21606 | 54069a86ff3c4dec0be28ac41891f706a3bb676a6aea0e5aed4534c646e3bd64
release.stderr.log | 1544 | 14c2d4a8c5428e51a24e229fee0d7420524310956de42f5a753d61067f263f38
scoped-artifact.json | 21843 | 8c2379ebf91be94b137ad5734812e7125a87147cc02ddf0f9b5d3332fb8c97c6
scoped-replay.log | 2904 | ada25690bc7a35fbdde7575db9d4c0224fbae044f8c0a70d627f84d4fa85d7a9
replay-receipt.json | 1212 | 256a3ce6e69c3f80cf3ac6e02e5cfcfc76d7a5ae511241cef12aef43e75f4a7c
release-snapshot/scoped-replay.mjs | 6318 | a7589d4fe1737c418e8ed55500471828deb751f0a6816dc0bb141ec67bac61be
run-optin-upstream.mjs | 34178 | 9c0fc9f7c38500f2516581162663c48265092574b0bb5ea8d6015daff6d9e45c
run-optin-upstream-scoped.mjs | 34997 | 0c4d56ed77b32ceb264ddab1385ebd07fceb2313a7b528c854eb2d7f00ecb095
optin-upstream-r1.log | 6732 | 240eca4527a2021a4aaf68bf4b412f81edd1dcf447e92c9c0dab5d2128aeaa3b
replay-screen-ownership/output.log | 4346 | 0709415b9e269e46ac2b580bdaee07a82ec30cbd111dbef091608a1d187e6537
replay-screen-content/output.log | 2518 | dd92b9082913ccd438de8b00329b3a5c25948268a9dbd8e29df2992e6ab3b5ed
replay-backup-help/output.log | 1962 | 709c7a014e532ffd2752c690f90ec0051097a399def3ff079a5c7c3004cfc062
replay-tower/output.log | 1953 | 5d722750103c34f4a8c968a07844e94fb060a6da4343d484f8d4a683fa54b7fe
replay-mobile/output.log | 10417 | cf80e9b282bc3609d6c5f55cd6646c5d50a58bafc8d22489279e822b030182ff
optin-unprepared-320.png | 80821 | a99ab1cdc2dcb9e9f16dc73e7605f00f660cefee7df584e51ed1c52a30388e31
optin-needs-reopen-390.png | 91719 | df5c31af1a610fde97ca689347dc3ba34f4ff563098ffae88fa11eb25a39849b
optin-ready-390.png | 94721 | b13c61ea738f19aa56454ddb7c30951b2a47d8b03270259407432571426f5b83
upstream-recovery-offline-320.png | 27390 | c26f5dfa838f4146486ebba5c2228eadc13a86752e5fa30e241a4ec3c1576226
upstream-recovery-ready-390.png | 29738 | 57e89bf6af9feed10bf120d177495300fa2334761bc169ed8ef6a5fecfdd83f1

## Deviations, risks and next gate
Initial patch-generator anchor was ambiguous and failed before writes. First applied SettingsFaq fallback text was damaged by PowerShell encoding; corrected with explicit Unicode encoding, readback and verified build. First scoped upstream runner syntax check failed due duplicate local binding; corrected before browser invocation. Original failed cleanup receipt retained; no retries hidden or acceptance weakened.
Rollback: only these five scoped files; restore SettingsFaq.tsx and backup-help-e2e.mjs from exact preimages in before/ and before-r2/ after checking current postimage hashes; new source files can be removed only after confirming no later owner edits. Preserve existing dirty worktree. Do not reset or clean.
Remaining: diagnose reproducible-in-release cleanup failure using typed cleanup-stage evidence, worker-level quota and bounded version retention (including browser automatic update path), explicit obsolete-cache cleanup safety, license/notice and physical handset verification. Storage estimate is advisory, cache eviction can remove origin data, and pilot is not proof of real-device performance, public readiness or commercial completion. No actual player profile, production registration, APK, commit, push or deployment.

Delta: actual explicit pilot readiness UI and guarded lifecycle actions.
Trace: exact source and build, preserved failed release, independent replay, actual upstream 94-check scenario.
Omega: locally verified scope only; full release remains partial.
Lambda: worker retention/quota/update gate, browser cleanup reliability, real device and approved public activation.

Sources: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/ready ; https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration ; https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate ; https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
