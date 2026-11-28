# BF-604 — offline cache core and generated worker
Date: 2026-11-27
Workspace: E:/github/BODYFORGE
HEAD: 11d51edf407bed2ad7e1fd0a04332654fe46afcb (unchanged)
Status: PARTIAL — core/build/release gates PASS; additional training CSP gate FAIL.

## Scope and outcomes
Implemented a typed, digest-verified, versioned offline cache engine, a Service Worker adapter, deterministic build-time worker generation from the verified application output and seven pinned pose runtime assets, and mandatory unit, artifact, and browser shell gates. No automatic registration, forced reload, skipWaiting or clients.claim. No changes to player data, avatar design, group/zone semantics, dependencies, CSP, or production hosting in this phase. Existing dirty changes preserved. Build and browser verification used a disposable exact local snapshot, not an actual player profile.

## Verified source inventory
Path | Bytes | SHA-256
--- | ---: | ---
src/lib/offlineCache.ts | 15036 | 0402e4b6a7e1e1a91d1eb898082d940fad87eefb37c369218fa69e65d5d0a521
src/lib/offlineCache.test.ts | 13111 | 35b9084919cd47712af9f89ddc5d2530e3d84afb84c2be633e819f03ecd77b53
src/lib/offlineWorker.ts | 2954 | 27a3298f60b9e9aa122793dfa252204c614a7eecafc70ed3f5153978d0dbf39c
qa/offline-worker-build.mjs | 6727 | a573798be925f625c8b10e13c4cf93ef577bd74a2b3a5546171569ddc2358057
qa/offline-worker-build.d.mts | 82 | 58b07f377a76455a183bbd08fe7fb7169c69d6a12ecc8cf4871838b556272bed
qa/offline-worker-build.test.mjs | 5046 | 78498f11c1823e0c6edae0af9afbd51519fcbc6bfba48868acdb13c7c59d4562
qa/offline-worker-shell-e2e.mjs | 12628 | 1e67bc16a3a1c80d7887144e5bd1c23c60c6091a4b5d161342b33921364e5655
qa/release-artifact-boundary.mjs | 11457 | e6f7c0071cb1d50bcaef9b71dbc5ff6b88cac92f7cbfe190b427ad95dbd27f64
qa/release-artifact-boundary.test.mjs | 9871 | 340209bdd98c2bbc896aded8acc656fbe586d7e1c0aae8161226d254d269f9f6
qa/release-gates.mjs | 13171 | 13151b7b8fbed4e587314d59c669747cb72df2a667204f4406de706559cfe33e
vite.config.ts | 3724 | a3cba6404c9e9ab255fcfff557e97dc154d94167bddd49fdfba26a948e6d6dc8
docs/BODYFORGE_OFFLINE_CACHE_CONTRACT_20261127.md | 2811 | 0c6ab25042ab22a960f2494c541da14c14e4635c02d2591dd1f73f37a8615bb0

## Evidence
Evidence root: .bodyforge-qa/bf604-cache-core-20261127/
- Core unit tests: 17/17; combined generator/boundary tests: 26/26; typecheck PASS.
- Browser shell: 28/28, exit 0. Real CacheStorage, interrupted install and repair coverage through core tests, versioned updates and corruption/eviction through browser tests; synthetic progress preserved; owned browser cleanup PASS.
- Full mandatory release: 29/29, exit 0, tested-local, stage read-back, 373.01 seconds. Preview HTTP 200. Exact 450-input source snapshot; no source drift after run. Dist 77 files / 35961971 bytes.
- Source digest: b5b50cc4b385752c91267ed68d7e914ab45e84885bf54c2c04eab091cbe69851.
- Entry digest: eff0edd7e5c72103bf692f04fb9952357fdd2f9fae8444fbdae82597d3d34a4e.
- Generated worker: 29555 bytes, faaee3b93d34e06050c708f918aa9cf4cf9abda77c4dd061845cbe4f034fa207.
- Training manifest: 83 entries, 82379758 bytes, version e8ac2e1a098589b6e271ff39127a75dc70672ad3af0496ab802d0a31f8660366.
- git diff --check exit 0; existing LF/CRLF conversion warnings, not whitespace failures.

Evidence file | Bytes | SHA-256
--- | ---: | ---
source-before.txt | 45918 | 44728bdc0dfb6c855f7ea0711229e313d891d12d2bd9283c7bb6f9f9ed375755
release.json | 22567 | 7ab163bb36190e468c0ca4521ca80794af2e34e28139793287d9e9c5a5603196
release.stderr.log | 1859 | ba684ffcc8b30d3bc3465b8ad0161c6742a5411533bfceb38b2097ee8b53e98f
unit-r1.log | 440 | 7eaa3323ac85b816562d6963c3280d55df83b5e1990b29b86f89601fc27e6454
worker-shell-r1.log | 1331 | 022fb94627f84e8c44f790cf5714a9b7498d8e4cc7a7994bb6f7080c02bd290d
integration-manifest.json | 1522 | 141a6fd16f59f732374d8c03b09b1f75036e7e3ae29f4382d3eb1a81c2a19548
run-training.mjs | 21868 | 465aa38739c514eaf3c8ad8219e5583b1b83d07123db343c9c229355daef0c20
training-r1.log | 2281 | 7568772f7a4f9d3689eac85cee4f0d56e2767c2d911e345da241e03b804d9c0a
run-training-diagnostic.mjs | 21928 | 46bae02806c331249086f4506188bf43c5bae1e85dfd5dbb557faccef52be6fb
training-diagnostic.log | 2544 | a9649d418d842ef625b4a1b9d3ec260a0fbf877b2947a5fe018826a1522baaf7

## Additional full-app training check — FAIL, not waived
Both original and diagnostic runs exit 16 after 22 passing assertions. The exact generated manifest and core are used. Only seven upstream pose resource transport URLs are remapped to previously verified local fixture bytes in the disposable worker; expected hashes and version checks remain enforced. Original worker hash above; fixture worker hash 1267837fb2726bc3b51e0ef47bc89e4a465f421af425f32cf10a3557214b1c77. This does not certify fresh upstream download or CORS compatibility.
Confirmed actual application offline reload, synthetic progression hydration, model and WASM served by worker cache, synthetic camera inference active, manual stop no XP and no change in player bytes, legacy identity migration preserves every other field and backup. Zero offline server requests and unauthorized external HTTP responses. SDK telemetry blocked by enforced CSP. Owned browser cleanup PASS on both runs, remaining=0.
Blocking assertion: no unexplained policy violations. Two enforced connect-src blob blocks reproduce. Diagnostic source Avatar3D-HoVAt5be.js line 5 column 42674. Source inspection matches Three.js ImageBitmapLoader fetch of object URLs for GLTF embedded images (GLTFLoader.js 2633-2665, 3365-3398). Potential texture-rendering impact remains unverified. No policy relaxation, no exception to passing gate, no avatar change applied. The formal 29-gate receipt predates and does not include this additional full-app check.

## Deviations and rollback
Initial oversized PowerShell invocation rejected with ENAMETOOLONG before writes; split into scoped staged operations. Initial adaptation script rejected duplicate anchor before write; corrected specificity. Preimages in integration-before/ and release-gates.before-shell.mjs; integration-manifest.json includes intermediate release-gates digest, final digest above. Rollback must use exact owned patches/readback, never broad reset of dirty workspace. No commit, push, deployment, APK or production worker registration.

## Next dependency gate
Resolve embedded image loading under unchanged restrictive CSP, validate texture appearance and rerun full-app offline test plus complete mandatory suite. Then integrate explicit preparation/readiness and recovery UX, cache quota/retention, test real upstream asset acquisition/notice conditions and field/device evidence before deployment readiness. Model and WASM fixture bytes not added to public or dist. No project-wide AAA/commercial-complete claim.

Delta: durable cache and worker integration, three mandatory gates.
Trace: exact source hashes, release and additional failing logs above.
Confidence: direct local verification of stated conditions; no field or live claim.
Revisit: fix reproducible CSP/texture conflict; require zero unexplained violations before promotion.
