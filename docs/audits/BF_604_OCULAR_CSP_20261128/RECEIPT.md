# BF-604 — ocular texture CSP repair and offline regression
Date: 2026-11-28
Workspace: E:/github/BODYFORGE
HEAD: 11d51edf407bed2ad7e1fd0a04332654fe46afcb (unchanged)
Status: scoped ocular repair PASS; full release PARTIAL (unit timeout, concurrent source drift).

## Context and implementation
Previous BF_604_CACHE_CORE_20261127/RECEIPT.md documented reproducible connect-src blob blocks in Three.js ImageBitmapLoader. Public GLB inventory identifies bodyforge-ocular-detail.glb as the only public GLB with embedded images: two PNGs, 384x192 each, 39751 and 7841 bytes, clamp-to-edge and linear/mipmap sampler. Root CSP unchanged. New avatarOcularLoader.ts uses GLTFLoader.register to decode the embedded PNG bytes directly via createImageBitmap, keeping native glTF material assignment, sampler, color space and geometry. Restricted to the exact ocular document format. Unsupported bitmap API uses the image-element path with object URL revocation; this path was unit-mocked, not field-tested in an older browser. Both decoded sources must belong to returned mesh materials. Failure waits for pending image tasks and releases owned resources. Existing rig and fallback eye atlas retained. Avatar3D integration changes only the ocular donor call and imports. No changes to geometry, public asset bytes, regional economy, player data, dependencies, CSP or production hosting.

## Exact source evidence
Path | Bytes | SHA-256
--- | ---: | ---
src/lib/avatarOcularLoader.ts | 6664 | 4722d00fea0e3f05b17eed4b7808d3f97790a9fa09bd150ad4a17ea8ffc70093
src/lib/avatarOcularLoader.test.ts | 7765 | 1317c9a67e8e00e5931e0e273bf21a74e80505cb8215939202ba55b4fca930e4
src/components/Avatar3D.tsx (immediate postimage) | 78010 | 1576bf6a7c905276092301efbad0bf41e94f861b34fd8a88bb3e1e9aaec1bcba
src/components/Avatar3D.tsx (current, V8 preserved) | 78108 | 3f87d9cf09adfc867dd980d7b9141c48f5e2590c927fc7c180154ba05b7a1ea8
qa/pose-egress-e2e.mjs | 12438 | 396c603f95128710411562e2681f5158f514205e7e910903a3bdfb7f26d89811
src/lib/avatarOcular.ts (unchanged) | 3919 | f0ace092ce35ea741c1015152acef6fc25564a2b67e0800715a892319230c793
index.html (unchanged) | 1274 | ee117a4222cf463fb749f8b2915c0b323770a690551da50a646f4088d3cb5ff6
public/assets/bodyforge-ocular-detail.glb (unchanged) | 96248 | bb558f02e88846add66bf4007b9038844eae9cec7f532aef8005bb453a7bbb39

## Verification
- 15/15 focused Vitest tests (10 new, 5 existing), exit 0. Includes actual pinned GLB, mocked bitmap decoding, no fetch/object URL on modern path, exact eye material properties, malformed inputs, ownership and fallback.
- App tsc exit 0; exact snapshot tsc -b exit 0. git diff --check exit 0 (existing line-ending warnings).
- Production artifact gate and browser egress/ocular check exit 0. Real linked WebGL program draws with both clearcoat maps; fitted PBR path does not request the fallback atlas. Deliberate donor blocking restores original eye atlas. Synthetic save identical. Zero unexpected CSP violations; reachable canary receives no browser requests. Fetch and XHR denied; beacon API returned accepted but no network hit, matching observed CSP enforcement. No real camera access. Both 390x844 screenshots inspected: full-body rendering visible; not a close-up photorealism or pixel-parity assessment.
- Independent second production build reproduced all 77 files byte-for-byte, total 35964455 bytes. Frozen source input count 453, digest dbf67cb10b058cfcd6bfa7b0dfae1a0144097ffde925ca49a16acef7313f2679. Index SHA-256 f72f4a3797e392d5f9b03b061fc83dcfa7b6d3dc9917eec9722c5903631ee3de; entry SHA-256 d3fbc2e7a675a1307bdceb1ddf3184caf8667fe9e1b65c95630088cb370a6905, 391780 bytes. Generated worker 29555 bytes, SHA-256 1e4b88856e41f26a8bb47c561e6da3acdfe26fa8877be5909318d5f6f7f0cebd. Training manifest 83 entries, 82382242 bytes, version ea208d1dde61cd355ed43e1a52aa86db859cc8e19f28748fd34940f67581a0ed.
- Full mandatory release command node qa/release-gates.mjs: exit 1, 13/14 executed gates pass; unit gate timeout at configured 180 seconds, subsequent gates not run. Total 203.94s. Not a full release PASS. Concurrent processes observed; timeout cause not established. No timeout relaxation. Snapshot originally matches live input inventory, subsequently new regionalFoundationEyes.test.ts added concurrently. V8 review changes retained. Scope evidence is the frozen snapshot, not newest complete working tree.
- Separate scoped artifact receipt generated after full gate timeout, does not replace failed release. Extended generated-worker training scenario on exact reproduced build: 27/27 assertions, exit 0. Seven upstream asset transport URLs remapped to pinned local fixtures; generated core/manifest unchanged. Fixture worker SHA-256 cab60d38d0632024f12b3d46f01e3157eea1187039dc89f7273659e13c30576c. Actual offline Forge, ocular GLB from CacheStorage and linked PBR eye draw, zero CSP violations before camera. Synthetic camera inference active offline, exact model and WASM served by worker. Manual stop no XP and no save mutation; only expected legacy profile identity migration, all other fields and backup preserved. Zero requests to offline server, zero unauthorized external HTTP responses. The only observed enforced CSP event is expected SDK telemetry denial. No unexplained CSP violations. Owned Chrome cleanup PASS, remaining 0. External download and CORS not verified; no real user/device evidence.

## Evidence files
Root .bodyforge-qa/bf604-ocular-20261128/
File | Bytes | SHA-256
--- | ---: | ---
patch-manifest.json | 552 | d5e6ed969c08b276721191af4bc13665322a6b813be9849ea78109228ccf897b
source-before.txt | 46231 | a7e9e1a9184bb1ff896d80e28476cccdb16ac03880ab742b0361bd25c689e7e3
snapshot-before.txt | 46231 | a7e9e1a9184bb1ff896d80e28476cccdb16ac03880ab742b0361bd25c689e7e3
source-after.txt | 46341 | 505681929b5eb2c7398809b7c595401027d35d96262f11613760074f4fbdc904
release.json | 4565 | 0da37c22b1d678a559c74f5d2e9e85845219896af5dc5c4cfbda3fb60e3f74f3
release.stderr.log | 1072 | 36027ed369c5eb67c572e180d7cc5f85ebf822056167d65af3fdb4fef9c5c318
unit-r1.log | 552 | afac0f24aff10c800515797b03d46640ef06345c4914a0728460af0c5f41cd56
focused-build-r1.log | 1414 | d943b1e663b7575c1a982ba20a57a9e5b464bf8ee4622de1364ced5d2a1fbd78
focused-artifact.json | 15458 | c442c6528ab82d19c0cde369b614c1e3612e58bc88682179426c7d4ec8e29a1e
focused-receipt.log | 579 | c189912b154b4dccffcc461ab7f5c80bb30a05c25870abe82be76d6e5212f52f
run-training-focused.mjs | 23995 | 93f59658e0465016e894744ea95aff59c20ec43f106545bb8b678d63fb35c6e8
training-focused-r1.log | 2824 | 386ca1394fcb88621d42959dd0511c64ffcadf6b2375e6c1532a6cf95d96dc55
release-snapshot/.bodyforge-qa/ocular-focused/bf604-ocular-fitted.png | 187373 | 8a4cc9994e7183b3a7e4726b1c46b1d332eeb04ae1ee82b0754cceb7ae8139ef
release-snapshot/.bodyforge-qa/ocular-focused/bf604-ocular-fallback.png | 187426 | e0d68fae3835c1d6de2374d9bd82c7035c1df736e5128132e46220a9c383786b

## Deviations, rollback and next gate
First snapshot preparation stopped at Avatar3D hash drift before copying. Read diff: concurrent V8 flag/idle metadata only; verified ocular integration survived. First attempt to move owned dist denied by Windows, original output intact and destination absent; safe in-place rename to dist-focused succeeded. No deletion. Exact preimages are in before/; Avatar3D postimage differs because V8 changes were retained, so rollback ONLY surgical import/call change after checking current source, not whole-file restore. New modules removable only at matching postimage hashes; QA preimage restore only on matching hash. No commit/push/deploy/APK or product-origin worker registration. User-approved 15-zone direction remains; new fighter production default not automatically promoted.
Next: rerun full suite on current stable snapshot with captured unit diagnostics; then implement recovery on cache eviction, explicit offline preparation/readiness and safe update UX, bounded retention, actual upstream acquisition/notice and physical-device qualification. Do not mix latest online files with a stale worker version or delete player saves. Existing worker's missing-cache navigation returns 503; recovery UX remains required before enabling registration.

Sources: https://threejs.org/docs/pages/GLTFLoader.html ; https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src ; https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
Delta: scoped CSP texture conflict fixed and regression made mandatory inside existing egress gate.
Trace: exact source hashes and scoped browser/offline evidence above; failed full release preserved.
Confidence: direct local verification of specified scope; no field or live claim.
Revisit: current-tree full release gate, explicit offline UX and real-device proof.
