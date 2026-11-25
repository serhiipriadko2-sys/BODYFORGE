# BF-701 current-tree integration verification

Status: BLOCKED on frozen candidate; root adoption NOT PERFORMED.
Head: 664ab80c89b244bab1014ec5c652d11c6a490470
Snapshot: .bodyforge-qa\bf701-vite-patch-candidate\latest-root-check
Latest root source copied exactly before testing; candidate dependency manifests only. Existing verified isolated dependency installation reused; no installation, replacement of root modules, or server stop. Prior HUD/catalog refactor intentionally not copied; latest root implementation tested as is.
Inputs: 349; outputs: 74; entry: 394662 bytes.
Commands: {"module-resolution": 0, "tsc": 0, "build": 0, "bundle": 0, "pwa": 0, "privacy": 0, "full-unit": 0, "field-metrics-unit": 0, "appearance-lazy": 0, "camera-frame": 0, "workout-hud": 0, "pushup": 16}
Root drift during run: ["qa/durable-journal-e2e.mjs", "src/lib/durableJournal.ts"]; new: []
Root package files unchanged: True; existing loopback port 5173 listening: True
Candidate results are synthetic and not real device or release acceptance. No root application, actual profile, APK, Firebase, git stage, commit or push writes.
Execution prompt prohibits stopping existing user dev server. Root adoption requires user-coordinated shutdown and no competing writes/builds; compare hashes again before replacing approved dependency files. Do not treat candidate as root fix.
Official advisory: https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7

## Evidence
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/appearance-lazy.log | 866 bytes | SHA-256 55bac27003dc1b3343495c29d6233c352263036d9ff6b60f96a4b047b60dee8a
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/build-manifest.json | 10946 bytes | SHA-256 a0f5424d524f3706b022aa8705a299d63fc9a890951aa4169f58671f802e58be
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/build.log | 2577 bytes | SHA-256 6e32c6d1371540d784f43e73f7b0c84187dd0c6fb6e0722bc53dad42876a8c5a
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/bundle.log | 281 bytes | SHA-256 42602a4681a08851655b932391e34b1db0d6450caf437a4a06b1943ef818ffe6
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/camera-frame.log | 902 bytes | SHA-256 0af75116b9eadf07b27aaddbe69f1218bdf8172d0a91eebebc68d2f9fa3b42d8
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/field-metrics-unit.log | 1509 bytes | SHA-256 6f119cb78c04bb6e746131cb0e47c58cba2b44a10bc5f2e7b5e752e3d7f79ff0
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/full-unit.log | 18956 bytes | SHA-256 e512af2c442c8b04bd5be680d873b01ff0fce46ea254409c449f4f193b4a0e55
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/gates.json | 2588 bytes | SHA-256 714ca76e2f84969b147fedc64f0dc79a1059fc411491395d9693646f5093aaec
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/module-resolution.log | 215 bytes | SHA-256 9eff8fcb0c1433ace8727c37d4a496f9c6bbf2d6ad0d8da494b3c95a060db53c
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/preview.log | 40 bytes | SHA-256 7bc718fb352286594eb26eeff2b99a09f3e6292b6f256277e30f2b65cea26c44
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/privacy.log | 2320 bytes | SHA-256 45e28bf907fb64702ed5ea36022aa4520767814975fd62f8c70ab5dc708a3bca
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/pushup.log | 1283 bytes | SHA-256 023396b66488edbf81a338bcc00e299904fe4c27f7a0f5c126a0b01fe26b2988
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/pwa.log | 149 bytes | SHA-256 7c12f115d664008d3f67bcf1926b75d5d312a74991fa8691458923ee3374099c
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/source.json | 50923 bytes | SHA-256 8e41a74e104c6733b5d626f83ebaacf03e99de6e6a3dfb539469cc79ee04026f
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/tsc.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- docs/audits/BF_701_LATEST_INTEGRATION_20261125/workout-hud.log | 2454 bytes | SHA-256 646bbf3a79ed53d3c7833cc03e0af5788a9603c18768b073a1be07e2402d193d
