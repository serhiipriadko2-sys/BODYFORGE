# BF-207 alternating high-knee observation / local engineering receipt

Status: IMPLEMENTED / TESTED_LOCAL on pinned build. BF-207 overall PARTIAL: real human/device holdout and real-world recall NOT_RUN; experimental recognition status retained.
Observed 2026-11-25T19:45:27.423849+03:00; workspace E:\github\BODYFORGE; HEAD at freeze 664ab80c89b244bab1014ec5c652d11c6a490470.

Scope: BF-207/CV-HK in master roadmap and execution prompt. Preserve existing knee height and supporting-leg thresholds, payout constants, persistence, exercise identity, and camera model. Require all six hip/knee/ankle landmarks, bounded confidence, shared 3.5% frame-edge margin, projected ankle below knee, and a lowered supporting-side observation. The upright image ordering rule does not establish physical foot contact, medical safety, or recognition in all camera views. An aerial running phase may invalidate an unfinished cycle.
FSM: extend existing strict observation continuity policy (400ms maximum gap, invalidation after missing/ambiguous observations, consecutive engaged dwell). Existing alternating-side rule retained across recalibration; full return with both knees lowered required; preserve completed repetitions. Coaching clarifies alternate and return-to-stance behavior.
RED: 17 failed / 16 passed among 33 new deterministic cases. GREEN: 33/33 new, 225/225 focused checks across 10 files. Includes low lifts, jitter, same-side pulses, switching during a partial cycle, missing/cropped joints, impossible confidence, ambiguous support, return loss, temporal gaps, reset/recalibration, scale/aspect/mirror and tempo variations. The designed positive cases pass; these synthetic cases do not establish field recall.

Integration: 319 input files, 73 output files, exact bytes reverified. Initial TypeScript process exited 134 with V8 allocation failure, no source diagnostics; retry on identical frozen snapshot with --force passed, Vite and on-demand bundle gates passed. Entry index-jd61XR9V.js SHA256 c763c2c3d368f1ea7ad439a94ce2185499a035d2698e2e19c79aabdc2e25c4c7, 393203 bytes, 20.8% below historical baseline; pose chunk 154276 bytes. Existing large avatar chunk warning remains.
Full Vitest 993/993 in 96 files. Owned Chrome fake webcam and finite synthetic landmark scenarios: high-knees 25/25 and jumping-jack regression 25/25. Negative patterns zero, left-left-right credits exactly two, partial cancellation preserves exact profile/no pending result, 20 alternating repetitions create one durable workout and one ordinary reward (+120 XP/+35 coins); camera/model released and profile retained after reload. Browser fixture may restart the initial standing calibration after a cold-start gap; after movement starts <=400ms is retained. Twenty-knee completion maxGap 333.3ms. Both browser cleanup markers and closed preview port verified.

Static gates: git diff=0, staged diff=0, canon=0, QA syntax=0.
Live drift from frozen snapshot: changed=['src/lib/avatarMuscleAnatomy.test.ts', 'src/lib/avatarMuscleAnatomy.ts']; new=['src/lib/avatarHipAnatomy.test.ts']. All four owned file hashes match. Later parallel edits are not certified by this snapshot.
No APK, Firebase publication, dependency installation, commit/push, actual user camera or progress access. VS Code open requested; visible editor not independently inspected.
Next: BF-208 crunch validation. Real human/device holdout remains required before field accuracy claims.
Rollback: restore only matching owned sources from exact .before copies; remove only matching newly introduced QA/test files. Preserve concurrent work.
Reference: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker .

Owned files | bytes | SHA256
src/lib/exerciseCounter.ts | 17869 | 26e2c8f748f04046538fedd6edb21bc32fb73a52a628c251e1daaa84b9281beb
src/lib/trainingCatalog.ts | 8328 | 9a824bbfdb538427c16629c6b577cbf2628664093f7f761790f42a8a273f3449
src/lib/kneesReplay.test.ts | 6755 | 40664a41311ccd532801ce52da692a8536225081e8e12d292a26b147ae5ee35c
qa/knees-replay-e2e.mjs | 13677 | ed4da9bb7709374d82d536a271f3ff21131cee56f26b603b381725598421bf6d

Evidence | bytes | SHA256
baseline.json | 853 | 0591d1b9ec54575b52bcac1c6f5c4fe339fa32f1309811e9a1435c60a4fa10ea
build-manifest.json | 10787 | f520e123e5cf015a3ec2279c7f1867195bec4face4c76676121211ae4a796225
build-retry.log | 2495 | 104c54b78865515804b97cc7b544434e99ea7e37977ebfda62aaaca17a7b21c6
bundle-retry.log | 281 | 69c9290984f6e91666c2202443a110db45675c101cbdadee740c514c8f845771
exerciseCounter.ts.before | 17361 | 4124c7f6da6ffb8761380868dc39ea79ed585ff0b127d02cb9677863c4bcc03d
full-unit-retry.log | 12698 | 6336a677728c3dc2db10152392a611ef8a322af7f8f9d287cd3b965a39b34795
gates.json | 664 | 608f7f20f75500ca902e98cdba44296219a33705081945c94d00fb1b30113b85
green-exit.txt | 3 | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354
green.log | 1844 | 9ffad6ec9bb1caa3c8449458c92ff63faa7f6335195e917233748823438221b5
jack-retry.log | 1702 | ceb0ffcee767f8a8bb315df57d61857bce4fe2f181ce31e866f5490b865de7cd
knees-retry.log | 1705 | 3e8b7537ca2692b108db21fade2657bce06c2affe88e877fc80d1113fa487820
preview-retry.log | 40 | 40d9e915baa135b64191e02d364ff452482894e41c24e35303894ff05e1a8eca
red-exit.txt | 3 | f1b2f662800122bed0ff255693df89c4487fbdcf453d3524a42d4ec20c3d9c04
red.log | 20690 | cfd7bf30753061406bf4d04208204ae40ab4663da7448ddef9378cb9be5199c6
retry-gates.json | 1203 | e071767a2161eb8b3bab89cbed994197c4cc23d56f4cc12cf33d1456fb3e2f87
source.json | 46528 | 37d8478b778ef9f1617a176b1c3b529e8b75fed00b0ede3783d967b0d5b116cb
trainingCatalog.ts.before | 8192 | ee0210fe889559261b5ea4b5308bee19421a9b231e488e250898c4d78ecda5ec
tsc-retry.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
tsc.log | 2107 | 318c39af22d4bd2aed38f5dd0522975415359f32cb5d84ac3d6f602a8ec7761c
