# BF-208 crunch torso/visibility replay - local engineering receipt

Status: IMPLEMENTED / TESTED_LOCAL on pinned build. BF-208 overall PARTIAL: human/device holdout and real-world sensitivity/recall NOT_RUN; camera-experimental retained.
Observed 2026-11-25T19:51:35.935385+03:00; workspace E:\github\BODYFORGE; HEAD at freeze 664ab80c89b244bab1014ec5c652d11c6a490470.

Scope: BF-208/CV-CR from master roadmap and execution prompt. Preserve existing hip-angle (132/103) and knee-angle (45..145) thresholds, payout, persistence, exercise ID and camera model. Require the four visible same-side joints, bounded supplied confidence, shared 3.5% crop margin and projected knee above hip and ankle. Add independent shoulder-to-hip projection condition: ready is horizontal; engaged requires shoulder above hip and nonhorizontal projection using existing leg-raise 1.15 ratio. This is a conservative engineering reuse, not a field-calibrated crunch threshold. It may reject ordinary shallow crunches (roughly under a 41-degree projected torso inclination); it cannot establish real floor contact, actual spinal movement, camera rotation in every case or safe technique. No medical/field accuracy claim.
FSM: use the existing strict 400ms observation continuity, invalidate incomplete motion after lost/cropped pose, preserve completed repetitions, require consecutive engaged dwell and lock one side from calibration through return. Existing camera resize invalidation is exercised, not newly implemented. Coaching explains visibility and recalibration.
RED: 18 failed / 13 passed among 31 new deterministic cases. GREEN: 31/31 new and 256/256 focused checks across 11 files. Cases include stationary head-only/legs-only movement, rotated pose, cropped/missing joints, impossible confidence, partial/side-substituted movement, calibration/return loss, timing, reorientation and 20 valid cycles across scales/aspects/mirrors/tempo. Initial patch script had a Python syntax error before any source write; corrected. Original RED test bytes preserved. In the reorientation fixture, post-recalibration observations were corrected to use the new visible side from the first frame, with unchanged count assertions.

Integration: 324 input files and 73 build outputs; frozen SHA-256 manifests reverified. TypeScript forced build, Vite, lazy bundle checks exit 0. Entry index-yAr6ND2_.js SHA256 0c683fef518b446ca1769c07b11222d6c9c810311f8686d9f6ddca655dc52ec4, 393684 bytes, 20.7% below historical baseline; pose chunk 154276 bytes. Existing Avatar3D chunk-size warning remains.
Full Vitest: 1034/1034, 99 files. Owned Chrome/fake camera/finite synthetic landmarks: crunch 30/30, high-knees regression 25/25, both exit 0. Crunch negative patterns zero; dispatched resize during raised phase discards partial repetition without closing capture; two completed reps followed by cancel leave exact synthetic profile/no pending result; 20 reps create one durable workout and one ordinary reward (+120 XP/+35 coins), release camera/model and survive reload. Initial standing fixture may restart after startup frame gap; subsequent motion remains limited to 400ms. Twenty-crunch max frame interval 90.6ms. Both owned browsers cleaned and preview port closed.

Static gates: git diff=0, staged diff=0, canon=0, QA syntax=0.
Current live drift from tested snapshot: changed=[]; new=[]. Four owned files match.
No APK, Firebase publication, dependency installation, commit/push, actual user profile/camera access. VS Code open requested; actual screen pixels not independently inspected.
Next: BF-209 leg-raise geometry/visibility continuity and negative replay. Real participant/device validation remains separate.
Rollback: restore only matching owned source files from exact .before copies; remove only matching new tests. Preserve concurrent edits.
Reference: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Web .

Owned files | bytes | SHA256
src/lib/exerciseCounter.ts | 19062 | 47e1d273fc55658c9a57477206b626dee3374d741540d34e5c40110a5fc16f48
src/lib/trainingCatalog.ts | 8504 | ea61e9a7f26c9fab1cd7985da957dac16c842b7641b462a0b80e8d223b4dcbdb
src/lib/crunchReplay.test.ts | 7722 | 075026595163bdc25cadc110d7107b362d5f3ec4cfe9a28b2fafb7d30f2deacd
qa/crunch-replay-e2e.mjs | 14089 | 784a5a35b0651d2a6a71b3b1dedc238fe0de976e4d38ac70be6db1f1b9838bcb

Evidence | bytes | SHA256
baseline.json | 854 | f4c3ac10ad970e875f2d82235ec8219c2b38db9df1be85d86d87da67d06f7921
build-manifest.json | 10787 | d8a950fbc3994cc91bba3782dfab6dcde9f156b418777aed6dac8822b5c427ec
build.log | 2495 | c20639cb153cf059b68a52854342f89abfa4952aed734638bc7a47074dabb523
bundle.log | 281 | 42b7f95ddd0946b8e3c834d3a0c420479cacc6ca4ebbc8d7016192d7f407332f
crunch.log | 2156 | a254eb043841dc6c8c3efde9fc60c79065ef2e6f7b6edb36eb0cdb71eeaf4fc4
crunchReplay.test.ts.red | 7668 | ffc6781057ba3b1c3f086c996d6ea660bc3e0e9038127930c167476edfe7f369
exerciseCounter.ts.before | 17869 | 26e2c8f748f04046538fedd6edb21bc32fb73a52a628c251e1daaa84b9281beb
full-unit.log | 13502 | c0b3e1a9130d0026b43c30c51101670be0550b65428bcb6105ef58c8237c131d
gates.json | 1137 | d74a971d1f752559f0f605cb6d9cf97fc18c795b4f33820266558490623922c6
green-exit.txt | 3 | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354
green.log | 1912 | 09534e1de85282bf727ceff6f8270fb066fc80c95879eccd0a17e49d0745a033
knees.log | 1691 | da9e2ba0999e7ec1a87b12781bfcbc02a405895589665fb288fa078eee0244f0
preview.log | 40 | ef894338dc0b75ce8db14c84c5622ad2f67401ee2bc2cd9ed293752edab38efb
red-exit.txt | 3 | f1b2f662800122bed0ff255693df89c4487fbdcf453d3524a42d4ec20c3d9c04
red.log | 28416 | 029321a62b1205575374f4a0f16005eb18a577683f5f197bef166cc564169a5a
source.json | 47270 | cba221d9bf330994559a1b9b6aefc7b43ca3da0e8dc71be081c2bc33d8a1d4cc
trainingCatalog.ts.before | 8328 | 9a824bbfdb538427c16629c6b577cbf2628664093f7f761790f42a8a273f3449
tsc.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
