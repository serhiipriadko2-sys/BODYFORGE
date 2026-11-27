# BF-701 exact public and distribution boundary -- local engineering receipt

Status: TESTED_LOCAL for standalone QA boundary on exact snapshot; BF-701 / root dependency adoption remains PARTIAL. Initial browser infrastructure failure preserved; one unchanged replay passed after scoped cleanup.
Observed: 2026-11-27T15:24:27.146730+03:00
HEAD at freeze: 5ef0bb170cfa411e5c9bf8be95739c6e85104d1e
Snapshot: .bodyforge-qa\bf701-vite-patch-candidate\artifact-boundary-20261127

Implemented three new QA-only files: explicit 49-file public byte baseline from prior verified BF-603 inventory; metadata-first exact name/set/size and SHA-256 verification; safe paths, case, symlink/junction/hardlink rejection; exact generated JS/CSS/index bytes derived from actual Vite build outputs, not blessed by scanning arbitrary dist; fresh outDir only. Refuses local env filenames and VITE_ env keys, never reads env files. Unexpected entry names hashed in errors. Source public and output reverified. No new dependency, asset, application import or default build/CI wiring.
Policy is an integrity baseline, not license approval, content-level secret scan, protection against all filesystem races, or proof of a release. Newly approved assets must update the allowlist through an explicit reviewed change, not automatic acceptance.
Use on current project: node qa/release-artifact-boundary.mjs --public; node --test qa/release-artifact-boundary.test.mjs. Use --build only in a clean disposable source snapshot or clean CI checkout with no dist. Does not publish. Existing npm run build is not yet automatically gated.
RED: dangling output link passed original existsSync guard and reached Vite; synthetic fixture failed as expected, no target created. Fixed with lstat presence; 21/21 standalone tests pass, including link/alias/extra/altered-output and prebuild rejection cases. Raw machine path removed from red log, original digest recorded.

Verified 365 input files and 79 output files, 49 copied public and 30 actual generated outputs, 35,917,187 output bytes. Entry 383875 bytes, 22.7% smaller than historical baseline 496761 bytes. This reflects parallel product work as well as current toolchain, not a bundle improvement attributable to this guard. Vite 8.3.7 / Rolldown 1.2.19 isolated dependencies reused. TypeScript, artifact-boundary build, prior bundle/PWA/privacy gates PASS; 62/62 private-path checks, zero canary disclosures; 1187/1187 Vitest tests (111 files); appearance lazy 13/13. Initial workout HUD CDP timeout exit 16 and cleanup EPERM: owned browser exact profile and identity verified, graceful close failed, only matching disposable Chrome processes stopped; port, process and profile absence checked. One same-entry unchanged replay 41/41, cleanup PASS. First failure and remediation recorded, not overwritten with a PASS. General harness reliability remains a follow-up.
Original production preview and replay preview stopped. Canon verifier and scoped diff PASS; new files also checked for final newline/trailing whitespace. No real user profile/camera, APK/AAB, Firebase, git stage/commit/push, root dependency or application writes. Root server 5173 listening: True. Root Vite and Rolldown remain {"vite": "8.3.4", "rolldown": "1.2.14"}. Do not expose vulnerable dev server over LAN. Root adoption requires coordinated user stop and latest verification.
Current root drift relative to snapshot: []; new files: [].
References: https://vite.dev/guide/assets.html ; https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7

Rollback: remove only the three introduced QA files if their current bytes match these hashes. Do not remove or alter user product files or concurrent edits.

## Owned files
- qa/release-artifact-boundary.mjs | 11330 bytes | SHA-256 085b61ea06077e1c9b95306595e48e929a1d98d8ac1eeccc3479ae30d31a33af
- qa/release-artifact-boundary.test.mjs | 8990 bytes | SHA-256 323163396626eaa171f6ef81d1bbb2fc38fe576ff2b607f61e6d5e13615968bf
- qa/public-artifact-allowlist.json | 8298 bytes | SHA-256 fdfdd10e9670377d90e3bd45371be0c2b4b4c4a3878d60d97b296059468655d6

## Evidence
- appearance-lazy.log | 866 bytes | SHA-256 49ece3c1bec537c4b5be7dff818ee3b771ae1245d8c75da5dbecb81ca0a97004
- boundary-build.log | 22959 bytes | SHA-256 8b8ef0b474e957156cca7600c5837445759c9975e2d613f67468ec368bc6d76e
- build-manifest.json | 11703 bytes | SHA-256 198fa6f311328ec80f7120ef97dd600e8203342f48d5d0bae9f40590780daf5a
- bundle.log | 281 bytes | SHA-256 add2212b6e0f9d1f93019e011bfc7529efd8c1262b8e4e00978e6d495204a353
- canon.log | 191 bytes | SHA-256 bd4804de303f67e95fa25e0fa54c637d0ae574c4ff18b54cfa79d64738587506
- dangling-output-red.log | 222 bytes | SHA-256 ce4c8922346cdf5abdbdc3516af476791722d6b4c0eb4ee758e3771d770024f7
- full-unit.log | 21640 bytes | SHA-256 c33484f253cbb8563842a9ce892a647f678016f7d1942a4e6a6707e70cd7debe
- gates.json | 2026 bytes | SHA-256 5b8793daa4bb3f9982388baa0c498ba2b16d462c22af3a0b8c15272755d8d5b5
- initial-gates.json | 455 bytes | SHA-256 9d50bfa27619945321e61dedf8a5c0009a232a0efd601ff48e9601ee6576417e
- local-gates.json | 497 bytes | SHA-256 d236a154221c50bc195b59b6ebe81046e5b49e8e28efc2c87ed8cdf366178c1b
- module-resolution.log | 215 bytes | SHA-256 9eff8fcb0c1433ace8727c37d4a496f9c6bbf2d6ad0d8da494b3c95a060db53c
- preview.log | 40 bytes | SHA-256 7add048534fd8fbc0c0b1be29f75000ccb70effe420cd80579b57907f0541771
- privacy.log | 2320 bytes | SHA-256 45e28bf907fb64702ed5ea36022aa4520767814975fd62f8c70ab5dc708a3bca
- public-final.log | 8719 bytes | SHA-256 dbaf7ae59f684803608e3d8d142e2348c2f046c941aa2dff015024623bf34098
- public.log | 8719 bytes | SHA-256 dbaf7ae59f684803608e3d8d142e2348c2f046c941aa2dff015024623bf34098
- pwa.log | 149 bytes | SHA-256 7c12f115d664008d3f67bcf1926b75d5d312a74991fa8691458923ee3374099c
- red-sanitized.json | 362 bytes | SHA-256 b2d73dd28fbeb5c6d5a8f1f683023c8c527e55bc18e48748fb6cfdbc0fa35630
- replay-preview.log | 40 bytes | SHA-256 e79ff446154ebd36c24fdee568b533f958db858136cea5b64bbe2ccf90b91b00
- replay-receipt.json | 742 bytes | SHA-256 09894ba157508dd83632b9ab0f43edfdaf01c5b7908c47f99a44706a7170d56a
- scoped-diff.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- snapshot-boundary-unit.log | 1730 bytes | SHA-256 7d61d8453c88847975eb87ff427a753ae5ecb5cc5a151736e548e91803f27892
- source.json | 53330 bytes | SHA-256 79a97a59d22354b3c8f61b36c5df421b62f432d207e74157ce6e2e42e7cd9dc3
- syntax-final.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- syntax-tests-final.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- syntax-tests.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- syntax.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- tsc.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- unit-final.log | 1721 bytes | SHA-256 ac33a7232e65f2b9e91fdc12af5e80d384a96c639fe73c186b6ba5d6463a1164
- unit.log | 1634 bytes | SHA-256 b94f56c1d91175a41f512632a84154874d3773ba822c67725dba1788b4ceb2bf
- workout-hud-bounded-replay.log | 2454 bytes | SHA-256 296a810d2eba014f938598d1e9fff53ebddc1bbe5bf739bed8ea2fcc776d8da8
- workout-hud-cleanup.json | 421 bytes | SHA-256 4d42cc220ccafceb21538acc0cec0b2300816886c8e3919e6098ecff06fdcb33
- workout-hud.log | 217 bytes | SHA-256 d1f533e03ca355948ac931583c1ba1b24f1dda733e0ae882d144366861c895b4
