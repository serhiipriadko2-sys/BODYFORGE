# BF-702 resource preflight and owned-browser release gates

Status: TESTED_LOCAL on the exact frozen candidate. Integrated release runner 16/16 checks PASS on final attempt. Full roadmap, hosted CI, field and production release remain incomplete.
Observed: 2026-11-27T17:56:19.200791+03:00
HEAD at freeze: 226429ae1080d000336a7430926d64e4bb54a89b
Snapshot: .bodyforge-qa\bf701-vite-patch-candidate\release-diagnostics-20261127

Implemented seven QA-only source/test files. Windows memory preflight before source manifest, build, preview and every child gate; thresholds 2048 MiB physical / 4096 MiB virtual based on prior local QA experience, not a reservation or guarantee. Invalid/unavailable readings fail closed. Added resource, artifact, owned Chrome, field metrics unit checks, real disposable browser recovery test, PWA manifest/icons and private-path fixtures. Tower now uses shared exact-profile ownership helper; require cleanup markers on both tower and mobile.
Typed browser recovery diagnostics: bounded lines, separate stdout/stderr framing, approved stages and reason codes only, immutable first failure, explicit cleanup-unverified blocker. Raw child messages and local profile/endpoint details excluded from release receipt. Existing mobile replay rule preserved; no replay occurred in final run. Parent child timeout still uses existing child.kill behavior; full descendant cleanup for arbitrary killed children not proven. Node documentation: https://nodejs.org/api/child_process.html . Memory source: https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-operatingsystem .

First attempt: dependency tree hashing failed with Python MemoryError before installation or release execution. One preparation retry via offline npm ci from existing reviewed cache, ignore scripts, no new downloads; 99 packages restored. First integrated run then failed owned-browser-recovery exit 16. Original detailed error was not retained, so root cause remains UNKNOWN. Eight exact disposable profile Chrome processes and one matching loopback listener observed; verified CDP identity and closed only that profile gracefully. Exact profile process enumeration found zero remaining, port closed, profile removed; scoped cleanup receipt preserved. No user Chrome process targeted.
After diagnostic patch: 63/63 standalone QA tests (17 owned Chrome + 21 artifact + 16 field metrics + 5 memory + 4 diagnostics); separate real two-browser recovery 11/11, no profiles left. Final fresh snapshot 381 source files, exact dependency lock, offline npm ci 99 packages, installed Vite 8.3.7 and Rolldown 1.2.19 read back. Entire release command exit 0 with 16 required checks, 16 passing memory samples, source and artifact exact read-back, no mobile replay. Main Vitest exit 0; exact test count not retained by runner. 79 output files, 35917577 bytes. No claim of field recognition, real mobile device, offline runtime, hosted CI, license clearance, or deployed release.
Scoped git diff and canon checks PASS. Current owned files match tested bytes. Root package manifests unchanged; root installed versions {"vite": "8.3.4", "rolldown": "1.2.14"}; root loopback 5173 listening: True. Root dependency adoption NOT PERFORMED. Concurrent edits preserved: ["qa/avatar-quality-e2e.mjs", "src/components/Avatar3D.tsx", "src/lib/avatarSkinLighting.ts"]; new files: ["src/lib/avatarBuzzReview.test.ts", "src/lib/avatarBuzzReview.ts"]. No actual player profile or camera, APK/AAB, Firebase, git stage/commit/push, dependency install in root, or deployment.

Remaining: coordinate root server stop and current-source adoption of security fix; hosted exact-commit CI; field devices/participants and release permission gates. Avoid another heavy run until a new necessary engineering change or authorized integration.

## Owned files
- qa/release-gates.mjs | 10448 bytes | SHA-256 011b7d17a60e37ac18191e91b242fbf86d99e3e85f071e31275f59f575a651f3
- qa/tower20-e2e.mjs | 34741 bytes | SHA-256 cc94ff56dc6e8de658fb2375617d5c5b4443e1e8f056501978032561e0de98e2
- qa/release-resource-gate.mjs | 2808 bytes | SHA-256 7b13f63a38fbb9867aa931ff892368e930a1bc9424c2aaadcda6a19aef6ac7bb
- qa/release-resource-gate.test.mjs | 2330 bytes | SHA-256 7db364a2745b741885a93400e7513bd04ac8552a2e0ef95afa6c6dc62b11dbb8
- qa/owned-chrome-cleanup-e2e.mjs | 4307 bytes | SHA-256 b7afbfad8c2e7aacac64daaf4a255516752a7e025800e41852f160c2dc12e766
- qa/release-gate-diagnostics.mjs | 2347 bytes | SHA-256 a1932793bda66ab372bc29bb2dd979610dc2ef629214c5c77146e79cb9f2d74b
- qa/release-gate-diagnostics.test.mjs | 2335 bytes | SHA-256 08550ad129dfd933b630572c68e689a470ad378c3c9c67f0de05eb36f50b413b

## Evidence
- before.json | 193 bytes | SHA-256 134d3de3c298eb3947a5928b7c3ac9e16f26724e75a017dcb0b3a447f94317c5
- canon.log | 191 bytes | SHA-256 bd4804de303f67e95fa25e0fa54c637d0ae574c4ff18b54cfa79d64738587506
- diagnostic-gates.json | 557 bytes | SHA-256 043494aadd1bad602df91e76d1e35b6f48ac48d608458b1481c680a171fbedc4
- diagnostic-recovery.json | 1208 bytes | SHA-256 7a27ef635efaa29f731f70f265a60397745187c3e10302469b22ef8f895b7eeb
- diagnostic-unit.log | 5398 bytes | SHA-256 9bf23901569e7efc54c8fe564c9d42e419c118253539002925383f62c2b813c5
- final-build-manifest.json | 11703 bytes | SHA-256 debdc2721d6314e5771314c36e3c8fe45d6c21f3f7e5028116d5f2a099ef87b3
- final-canon.log | 191 bytes | SHA-256 bd4804de303f67e95fa25e0fa54c637d0ae574c4ff18b54cfa79d64738587506
- final-offline-ci.log | 26 bytes | SHA-256 3ca57f0ddf5b2b8703cf53a23a91dc528fca379f40b41fc76bcf245f842a9391
- final-release-receipt.json | 18811 bytes | SHA-256 231588c0884e013b504258d53bef39bfc56de2024c15782c433f8c53969f6f25
- final-release-stages.log | 871 bytes | SHA-256 7828517bcefc08d015060ce16e17475a3602fd52a6414724968ebcfb2b4eca93
- final-run.json | 5072 bytes | SHA-256 8bc6ba2fb8f4a3073177061de66fce16dd38de7352101fa1a67d90c4ce299bdc
- final-scoped-diff.log | 348 bytes | SHA-256 46a26e2375da8a4424c7c96d8067379b2f338b4f64aa3307b5338b02561d17fe
- final-source.json | 55720 bytes | SHA-256 fed7588cda7903573fe2dc0bafbfafac4c64e94c55a08b2c094127e102da4bbc
- gates.json | 1096 bytes | SHA-256 facb7f39614fa15c46104ba09ac9138ec6451c0a2fe346fd71cf5834e1b1c4a5
- local-gates.json | 545 bytes | SHA-256 0ed5c9cc166afddba6cb43157af052efd942a96ae1157913b10e26d45b7f223b
- offline-memory.log | 106 bytes | SHA-256 2070b75aaccc336128f699a29ac502cb56d47e0ab1df78425de5990bdae39f39
- offline-npm-ci.log | 26 bytes | SHA-256 9695f442e0e95a4ebc45a2b4b9f497ded184f35fee270de5e4c9ef35299db5fa
- offline-release-receipt.json | 1693 bytes | SHA-256 8884041e15555f4d9d451776bb6bb02e5a59f290d36cac22172e292ecc24a422
- offline-release-stages.log | 374 bytes | SHA-256 a40336dab417ca201c7251db8937a8389df76d2aebd399f6a6c651587ececd47
- offline-retry.json | 2246 bytes | SHA-256 9c7f7172e038118ea9c45a807510387f9b6d80235fde06c943b2f9a3ac57aac5
- owned-chrome-cleanup-e2e.mjs.before-diagnostics | 3880 bytes | SHA-256 2a3ab5a7d41f00f2101b34ba233aa8afa7610e10f2fccf376d86f34d97412dca
- owned-cleanup-recovery.json | 336 bytes | SHA-256 97e6e12863bdd370fc36247e60bc2438b93af55fb44c9431dddbd4815ca57c43
- release-gates.mjs.before | 8709 bytes | SHA-256 04552065f1ccf08205cc6b23a758904af589ac95e9561e6886a013446c0ba31f
- release-gates.mjs.before-diagnostics | 9924 bytes | SHA-256 a89c283f026749731972b7bfd15992309fe2d1d3fc3623f6e0e39da2b6f2bc34
- scoped-diff.log | 224 bytes | SHA-256 5a2c7d920638a1fc5b18fc48e01c609911736738746cc01785a8309f1700b82c
- source.json | 54953 bytes | SHA-256 3c80371518bb3060ef968b8370a48d58a42ca5badad746770798e95fe4984892
- syntax-recovery-v2.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- syntax-resource.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- syntax-runner-v2.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- syntax-runner.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- syntax-tower.log | 0 bytes | SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- tower20-e2e.mjs.before | 37860 bytes | SHA-256 32192951ee90214a4db04ddf575eb39dbe69e067b7694a8f1ffece2f879bfa56
- unit.log | 5070 bytes | SHA-256 2de7fb4b4273b914a9b8c8b4030ef2ee51ef27a89f74e4a1a387f06edf624c1f
