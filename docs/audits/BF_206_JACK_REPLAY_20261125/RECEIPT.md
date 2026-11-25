# BF-206 jumping-jack coordinated observation / local engineering receipt

Status: IMPLEMENTED / TESTED_LOCAL on pinned build. BF-206 overall PARTIAL: real human/device holdout remains NOT_RUN; experimental recognition status retained.
Observed 2026-11-25T19:39:44.470865+03:00; workspace E:\github\BODYFORGE; HEAD at freeze 664ab80c89b244bab1014ec5c652d11c6a490470.

Scope: BF-206/CV-JJ in roadmap and execution prompt. Preserve existing torso/shoulder scale, ankle separation and arm-travel thresholds, reward constants, profile schema, exercise identity and camera model. Require eight visible landmarks, bounded confidence, shared 3.5% frame-edge margin and both ankles below respective hips in an upright image. This geometric ordering rule is not calibrated biomechanics, does not establish flight or floor contact, and may reject real movement in an unsuitable view. A coordinated step-jack may also be counted. Existing experimental status remains.
FSM: apply existing strict-motion policy to jumping-jack, including 400ms observation-gap limit across phases, invalidation after missing/ambiguous/cropped observations, consecutive engaged dwell, full closed return and preservation of prior completed reps. Existing arms-only/legs-only rejection retained. Coaching explains the full cycle and fresh calibration.
RED: 15 failed / 21 passed among 36 new deterministic cases. GREEN: 36/36 new, 192/192 focused checks across nine files. Cases cover missing/cropped required joints, confidence bounds, inverted ankle position, arms-only, legs-only, one-arm and alternating partial poses, interrupted opening/return, invalid times, long gaps, scale/aspect/mirror, stationary and exactly twenty complete cycles.

Integration: 317 input files, 73 output files, exact source/build SHA-256 reverified. TypeScript/Vite/on-demand bundle gates exit 0. Entry index-Btl1L9Ys.js SHA256 f3f763e6b346536bcaf622bfee764b790b542650b16e0058999fa793809a0c3a, 392838 bytes, 20.9% smaller than historical baseline; pose chunk 154276 bytes. Existing avatar large-chunk warning remains.
Full Vitest 960/960 in 95 files. Owned Chrome fake webcam and finite synthetic landmarks: jumping-jack 25/25 and pushup regression 25/25. Each: negative patterns zero, two valid reps then cancel preserves exact profile/no pending result, twenty reps produce one durable workout/one reward (+120 XP/+35 coins), camera/model released and paid profile reloaded. Startup calibration may restart after a gap: negative fixture maxGap 569.5ms (jack), 534.8ms (pushup), allowed only in initial standing phase; subsequent motion observations require <=400ms. Twenty-jack completion maxGap 96ms. Both owned browsers cleaned; server port closed.

Final static gates diff=0, staged diff=0, canon=0, QA syntax=0.
Live drift from pinned snapshot: changed=['qa/durable-journal-e2e.mjs', 'src/lib/durableJournal.ts']; new=[]. All four owned final hashes match. Later parallel changes are not certified by this snapshot.
No APK, Firebase deployment, dependency installation, commit/push, actual user profile/camera access. VS Code open requested; visible tab not independently inspected.
Next: BF-207 high-knees alternating movement and observation replay. Separate real human holdout required for field recognition claims.
Rollback: restore only hash-matching owned source files from exact .before copies; remove only matching new QA/test files. Preserve concurrent work.
Reference: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker .

Owned files | bytes | SHA256
src/lib/exerciseCounter.ts | 17361 | 4124c7f6da6ffb8761380868dc39ea79ed585ff0b127d02cb9677863c4bcc03d
src/lib/trainingCatalog.ts | 8192 | ee0210fe889559261b5ea4b5308bee19421a9b231e488e250898c4d78ecda5ec
src/lib/jackReplay.test.ts | 7614 | e02df1875922560591c02670efd9d148936d6c97e0ff819bc2a6f8579500b91f
qa/jack-replay-e2e.mjs | 13648 | 6f7b35efe922adeaf3b3ec206c432caec251db994290fb2db7f02feefffcedbc

Evidence | bytes | SHA256
baseline.json | 855 | 9bbba3ba0bbf5a0268bdfd95c71d466f9c82ee9541cea7ea8572b7984564bbfb
build-manifest.json | 10787 | 4a582103251a8164904ddf32d5400aa572c8299798a61ec225f827468dee6355
build.log | 2495 | 2319b26c473ce412092f74e53417e41c3a60b4f61ae93347142a56c7b43c6b27
bundle.log | 281 | c42120db54d378de04b5872095bc96b15dc377a8c3ab53b117080fd226300eb7
exerciseCounter.ts.before | 16975 | f1ec8009f7ab417a578656857f249cb334c804ad3e9e76cdba08bd98911653a5
full-unit.log | 13519 | 0fc6716c7c907ba8a4bcf5843f2a734bcfb597119d988c79c000d94b5644d7c6
gates.json | 1204 | c4a0d28b92518dcd537fdef65f53a232e075ce9ba767643f8c7ab282a874697d
green-exit.txt | 3 | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354
green.log | 1706 | e81a3628f2bb3f711652fc43baf7d19d27fc52fdec1f019cff4725d77ae89ce4
jack.log | 1662 | 53a73e9b201d19d07b3f3de36063943a6d3ccc4f5ecd3fd2a55bf3a1444def30
preview.log | 40 | 840f961fdb6007f7730ead4b5e65a2e9df6b1f7f3503b22e615a066c70453be2
pushup.log | 1659 | 4235a6e1ce33db764e4e42af3f711daa694e5a629b3487a4ee0b5f54b941f5e2
red-exit.txt | 3 | f1b2f662800122bed0ff255693df89c4487fbdcf453d3524a42d4ec20c3d9c04
red.log | 23436 | bb3f6e53a7674706a75bb41e34f5d5020519524a708f246ad39a53c8ca20fd7f
source.json | 46243 | 3045b6647dda6c64569270fcab10186391e1ab64edf1e093f250bb818af8cec2
trainingCatalog.ts.before | 8100 | 76db461541f48a532e3b96c9eb1fabf761fbf9e12b05e4d21db6d5c9c1979d68
tsc.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
