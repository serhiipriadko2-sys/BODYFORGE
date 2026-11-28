# BF-604 - Bounded cache lifecycle and cleanup diagnostics
Date: 2026-11-28
Workspace: E:/github/BODYFORGE; HEAD: 11d51edf407bed2ad7e1fd0a04332654fe46afcb
Scope: local source changes and disposable synthetic/browser verification. Not commit, deployment, APK, public pilot activation, actual player or field device proof.

## Implementation
Two-version admission cap for new managed cache creation (128 MiB payload per version), storage estimate plus 16 MiB reserve, cross-version Web Lock for worker preparation including installation and explicit repair. Quota estimate is advisory, not guaranteed total physical disk occupancy. No forced activation, claim or reload. Prune only recognized retired caches at normal activation after verifying new cache readiness; old ownership uses canonical name, commit marker and structural key validation, not a new digest pass of old payloads. Unknown/incomplete/foreign caches are preserved; they may consume capacity. Legacy/external writers can exceed the admission cap. No player storage writes introduced.
Browser cleanup failure now records bounded typed stage/code without raw stderr, argv or profile paths. Ownership and fail-closed rules retained; expected negative unit-test diagnostics do not fail the integration gate. No blanket termination or arbitrary old-profile cleanup.

## Observations
Targeted Vitest 51/51; combined build/diagnostics node:test 49/49; focused TypeScript exit 0; synthetic worker browser 59/59 then 62/62, latter two controlled tabs and cleanup remaining=0; git diff --check exit 0. Initial snapshot copy rejected due concurrent avatar/skin changes, second independently verified snapshot accepted. First upstream runner adaptation refused unmatched source pattern before write; corrected pattern and syntax check passed.
Full release: tested-local; stage read-back; executed gates 29/29 passed.
Snapshot inputs 464; SHA-256 062c34c65c02c1cc966d6a6e65e5dc94a9be4211d8c22bac8b96b97eedb73d50.
Current inputs 465; SHA-256 ad02bc61d2b7235060a486f7d13dc1ca6b60cbecc1c5354121eb39d925472cbf; drift: src/lib/regionalFoundationSkin.test.ts, src/lib/regionalFoundationSkin.ts. All nine scoped source bytes match. Full release qualification applies only to frozen snapshot.
Distribution: 78 files, 35993341 bytes, manifest SHA-256 b633d8d8551dc0675c2d73685a7313ecacff2c0d13277c7f9b571771bee46c09; exact readback PASS.
Worker: {"schema":1,"kind":"training","version":"39ba603998ac6a901512bbe21d3012b79da792ae597b989d9434da8b3252a10d","entries":84,"cacheBytes":82393719,"workerBytes":46964,"workerSha256":"28f1a29a999e1bb83a27dd5c0c9728d1f5551b3eec0fe8435d4def741a2f8ec5","registration":"not-run","inference":"not-run"}
Preview: {"http":200,"indexSha256":"55c39eb6d991103afcc522799e77ab654994fcd49c8e92ea2453476accd7fce8","entrySha256":"ff857f7ab4b74a3573f07d58709e3a86e0ddfe1fab9eb21807b520e5dcc69307"}
Prior repeated screen-cleanup failures remain recorded in BF_604_OPTIN_20261128. Current screen ownership: {"exit":0,"pass":true}. Passing replay does not establish past root cause.

## Full release gate results
resource-unit | {"exit":0,"pass":true}
artifact-unit | {"exit":0,"pass":true}
offline-worker-build-unit | {"exit":0,"pass":true}
owned-browser-unit | {"exit":0,"pass":true}
native-policy-unit | {"exit":0,"pass":true}
native-policy | {"exit":0,"pass":true}
offline-runtime-unit | {"exit":0,"pass":true}
offline-model-unit | {"exit":0,"pass":true}
pose-egress-unit | {"exit":0,"pass":true}
offline-runtime-pins | {"exit":0,"pass":true}
field-metrics-unit | {"exit":0,"pass":true}
offline-worker-shell-browser | {"exit":0,"pass":true}
owned-browser-recovery | {"exit":0,"pass":true,"diagnostics":{"stage":"verify-final","cleanupUnverified":false}}
unit | {"exit":0,"pass":true}
types | {"exit":0,"pass":true}
artifact | {"exit":0,"pass":true}
offline-worker-artifact | {"exit":0,"pass":true}
bundle | {"exit":0,"pass":true}
pwa-install | {"exit":0,"pass":true}
private-path-fixtures | {"exit":0,"pass":true}
preview | {"exit":0,"pass":true}
privacy | {"exit":0,"pass":true}
pose-egress-browser | {"exit":0,"pass":true}
synthetic-screen-ownership | {"exit":0,"pass":true}
synthetic-screen-content | {"exit":0,"pass":true}
synthetic-backup-help | {"exit":0,"pass":true}
synthetic-tower | {"exit":0,"pass":true}
synthetic-mobile | {"exit":0,"pass":true}
read-back | {"exit":0,"pass":true}

## Upstream verification on this snapshot
QA_OWNED_CLEANUP PASS attempts=1 mode=graceful-windows-verified exactProfileBefore=0 terminated=0 remaining=0
BF604_OPTIN_UPSTREAM_PASS {"checks":94,"bytes":82393719,"entries":84,"offlineServerRequests":2,"offlineChecks":[{"stage":"offline-avatar","method":"GET","path":"/bodyforge-offline.js","destination":"serviceworker","serviceWorker":"script","verifiedUpdate":true},{"stage":"optin-disable","method":"GET","path":"/bodyforge-offline.js","destination":"serviceworker","serviceWorker":"script","verifiedUpdate":true}],"unauthorizedResponses":0,"cleanup":true,"originalWorkerSha":"28f1a29a999e1bb83a27dd5c0c9728d1f5551b3eec0fe8435d4def741a2f8ec5","workerVersion":"39ba603998ac6a901512bbe21d3012b79da792ae597b989d9434da8b3252a10d","scope":"actual pilot UI, unmodified generated worker, real pinned upstream acquisition and recovery, disposable loopback app and synthetic camera; no public registration or real device"}
RUN_EXIT=0

## License evidence (not redistribution approval)
Six runtime packages inventoried; upstream MediaPipe v1.1.1 LICENSE, Apache-2.0 license text, official BlazePose model card retained. Root NOTICE URL returned 404; this does not establish absence of transitive notices. No license bundle added to distribution. Validate native/WASM transitive obligations, asset attribution and distribution notices before public release.

## Scoped source inventory (path | bytes | SHA-256)
qa/owned-chrome.mjs | 14637 | 94528a540e7d3738201d6a04de3f541b750d999f9758829ea5dde0910a5de56e
qa/owned-chrome-windows.mjs | 8514 | ca32ec24e79ace5655e54a4431daf6a85ae4a1c8a84a49a9474f2d6026b38945
qa/release-gates.mjs | 13504 | 22dc0e36327cd41f6e1eb874b502042cc7571ec35ab42925817b25a14bf7ba84
qa/release-gate-diagnostics.mjs | 3601 | a641ef08f26e4b6918e6e12c14ba807a1e90cd82c9c03b902a15d3e9ee28d9f9
qa/release-gate-diagnostics.test.mjs | 3972 | 84825831bd42c1125fdb8c832cbcd0e0810d49f6b5b8c1a09834e963a44e52b1
src/lib/offlineCache.ts | 18756 | 158dd6134bdceaaf17ff8447a9a76ff3ad890c1c5d96f8c709ac001344c73127
src/lib/offlineWorker.ts | 15813 | 9eebe6f3e132542c1c6b47f3a05873d2cd6d6436fbc59bb5efb51384cca46e25
src/lib/offlineWorker.test.ts | 14578 | abc7814bbd3b78dbefb1b0502dc70cb8a40f2ebd530a6a626de252d9e1e0df1b
qa/offline-worker-shell-e2e.mjs | 20980 | 72314641f049c4f18dd6ff08eba1f0b1d2f5db12e3576916140faf99e663dc8d

## Evidence inventory (relative to .bodyforge-qa/bf604-lifecycle-20261128; path | bytes | SHA-256)
diagnostics-manifest.json | 1108 | 19efc9110dc9f03dd1e3b88552d54a4bdb1909fbe708eccd64ace02b2de7698e
lifecycle-manifest.json | 1330 | 7765cc34f2e5a000e5f065f72de1aefcd59c7c67b877c24bce43790fc510c01a
source-r2.json | 72007 | 91062532a59b90f7561305c145386f97e3cd5a5fb5ad6bfce596bd3dfc556ab0
diagnostics-unit.log | 2449 | 082522b893c816630c46ea1a8e515c0b06bab9ff5741bdae71c204182be160db
lifecycle-unit.log | 918 | 80c4cd13eacbf21813da09325fd0259d197cedded1f4dc5c950016bc25904a6a
build-unit.log | 4555 | 15168d93229ffa230ff724c44662ac0f245086451cac7b50087e106477ef495d
types.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
shell-r1.log | 2617 | a11b1632a3abb6fa9787f9c2cfc5f373cd858bd6e153a38f33c08de795081c7a
shell-r2.log | 2798 | 2e4b91a35dc58a1fa94be80468b878c9f4d5669ec378b6a18c13e9c53950f37d
before-multitab-shell.mjs | 19296 | 7d4bc1f0c0a84eb7fa09e521ca4856236b015a165e748584f7ed7b2bbc9c494a
post-multitab-shell.mjs | 20980 | 72314641f049c4f18dd6ff08eba1f0b1d2f5db12e3576916140faf99e663dc8d
release-r2.json | 22727 | 6e9fcd0bd06a6772a617af4360ddfc170492e441c449b82d0d4f5703c8c0d403
release-r2.stderr.log | 1859 | ba684ffcc8b30d3bc3465b8ad0161c6742a5411533bfceb38b2097ee8b53e98f
run-lifecycle-upstream.mjs | 34191 | f626e386b971afacd65b47f47ad8627d8db19614da69b1c4748a0b11d0626c7c
license-evidence.log | 3098 | d41486271914ab0e204837deea6b818e20cae830cc70db65419d6dacbd1fee52
license-evidence/inventory.json | 2817 | 4a986781550559979c014983d84c615dc3ea0f76b097bd74389f560b1e811092
license-evidence/mediapipe-v1.1.1-LICENSE.txt | 12331 | 8707eef0533987efc5b155d64761eeb6e20793f50b9bd1a68dad1cf4719d0ed8
license-evidence/apache-2.0.txt | 11358 | cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30
license-evidence/blazepose-model-card.pdf | 1398977 | e982460cedece5ad9a46aa8f13523328e9ab95d7d5b2b8c99b33f13f6a79ca86
upstream-r2.log | 6769 | bff6f2c11931094e4026727114b4779bfef9eff1f5ddaf265ce0e86ed6507f40
optin-needs-reopen-390.png | 91719 | df5c31af1a610fde97ca689347dc3ba34f4ff563098ffae88fa11eb25a39849b
optin-ready-390.png | 94721 | b13c61ea738f19aa56454ddb7c30951b2a47d8b03270259407432571426f5b83
optin-unprepared-320.png | 80821 | a99ab1cdc2dcb9e9f16dc73e7605f00f660cefee7df584e51ed1c52a30388e31
upstream-recovery-offline-320.png | 27390 | c26f5dfa838f4146486ebba5c2228eadc13a86752e5fa30e241a4ec3c1576226
upstream-recovery-ready-390.png | 29738 | 57e89bf6af9feed10bf120d177495300fa2334761bc169ed8ef6a5fecfdd83f1

## Remaining gates
Pilot remains local-only; user-facing capacity/unknown-cache guidance and recovery of recognized orphan versions require safe explicit design; physical storage and native device behavior unverified. No claim of whole-product completion.
