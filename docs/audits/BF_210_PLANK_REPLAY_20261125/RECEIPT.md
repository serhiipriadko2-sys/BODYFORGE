# BF-210 plank observed duration and continuity - engineering receipt

Status: IMPLEMENTED / TESTED_LOCAL on pinned snapshot. Overall BF-210 PARTIAL: real participant/device holdout and field timing error NOT_RUN. Experimental recognition retained.
Observed 2026-11-25T20:22:27.945444+03:00; workspace E:\github\BODYFORGE; HEAD at freeze 664ab80c89b244bab1014ec5c652d11c6a490470.

Scope: BF-210/CV-PL. Preserve the 30-second target, existing pose geometry and timing constants (300ms calibration, 300ms short loss grace, 450ms maximum adjacent observation gap, 180ms credit cap), ordinary reward, model and save schema. Require visible shoulder, elbow, hip and ankle of the selected side, bounded supplied confidence and shared framing margin. Select a valid visible side at calibration; hold identity thereafter. Invalid pose resets; short unknown pauses without credit. A recovered frame must also meet the 300ms loss deadline, preventing stale-time resurrection. Calibration gaps over 450ms reset. No new numerical threshold or field-biomechanics claim.
RED: 12 failed / 22 passed among 34 new deterministic cases. GREEN: 34/34 new and 322/322 focused tests across 13 files. Missing/cropped joints, impossible confidence, side changes, known invalid posture, 300/301ms grace boundary, 450/451ms gap, 180ms cap, stale times, explicit recalibration, exact duration at 33/50/100/150/180ms observation cadence, mirrors/aspects/scales. The existing cap conservatively undercounts slower cadence above 180ms; this remains a field performance limitation, not claimed accuracy.

Integration: 334 inputs and 73 outputs, SHA-256 manifests reverified; forced TypeScript, Vite, lazy bundle checks PASS. Entry index-CMgBvjol.js SHA256 51930713156fe91ecffe59522816c533cdfc083a4e7db962c094485bb4b3da49; 394590 bytes, reported 20.6% below historical baseline. Camera chunk 154276 bytes. Existing Avatar3D chunk warning remains.
Full Vitest: 1110/1110 tests, 104/104 files, isolated threads, exit 0. Owned browser plank 53/53 and leg-raise regression 30/30. Synthetic invalid positions zero, partial pose loss/reset, no time transfer to replacement side, resize reset, cancellation and simulated pagehide without rewards, released camera/model. Real unaccelerated synthetic hold observed 30431.3ms including calibration; stored duration 30070.1ms; one workout with repetitions=0, holdSeconds=30, one +120 XP/+35 coins reward, exact reload. Final max valid frame interval 97.3ms. Both browsers cleaned; preview closed. No actual athlete/camera validation.

Static gates: git diff=0, staged diff=0, canon=0, QA syntax=0.
Live drift relative to snapshot: changed=[]; new=[]. All four owned files match at receipt.
No APK, Firebase deployment, dependency installation, Git stage/commit/push, actual user profile/camera access. VS Code open requested; visible pixels not independently checked.
Next: BF-211 calibration/feedback/save HUD. Remaining BF-212 comparative worker spike and BF-213 human/device field validation are not accepted by this receipt.
Rollback: restore only owned source bytes from exact .before copies while current hashes match, remove only matching introduced QA/test files.
References: https://developers.google.com/edge/api/mediapipe/js/tasks-vision.poselandmarker ; https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback .

Owned files | bytes | SHA256
src/lib/exerciseCounter.ts | 20782 | cab4f66ef8a7c26a889b1b993f5f8d7cb668cbca3c32c8306fd88a04b1132eea
src/lib/trainingCatalog.ts | 8923 | 4ae5815aad93e7df6ab2cfd4d34765de85f60765eae37c41854854a2e316e19e
src/lib/plankReplay.test.ts | 8243 | 0dce8c7d9978aa45dff5b1bea729821d262a349671876de9701dc5a81883b18d
qa/plank-replay-e2e.mjs | 15412 | 3dfd70e610a45ab7359f8ed8f143a261ad125f087e18fc71c324eb1c0c81b9a8

Evidence | bytes | SHA256
baseline.json | 858 | 0004fd99b09227e015654c54643fc762bd61e7dedaa914002e25f5df429e3374
build-manifest.json | 10787 | 5ffe5acfa55f188e4ecd55c7b04650989feafdb5f5c5640d9652c6773100d04e
build.log | 2495 | bc03285af9b7dd4d5e0b0a480b83bbfebbac2b7349d366abb84612f9f2bb66b4
bundle.log | 281 | 0d409c1df98335bd67fbd0f56734b3b7a95682051b88bb185cdf59cc5024fed6
exerciseCounter.ts.before | 19800 | 66ae266f8ec8fa45d58b44a071702609e441ea2b29fe1f088ac1bc8c78a4d21e
full-unit.log | 15267 | f7783d8473cdaa09bce1150e7d6ef4c0060734cb298045135985ce8625164094
gates.json | 1138 | 27ff82d17bbdb192f4baeaafe29dfc9b20b88e68f07f9a2879cb2f91f5117a3a
green-exit.txt | 3 | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354
green.log | 2116 | 97c5c73e7fea84c5c1d077923c1a1fab612960a5f7e8730cfc3679b4d0063db2
leg-raise.log | 2208 | 3e751ef41303ae6fab63eaee6808933fac98be2a2a5882f79e2cb526afa8800e
plank.log | 4690 | 62af57a9ceda82d89756de70cc4ae45dd4057dceb028264dcee95be6dc4c577f
preview.log | 40 | c36eb53c2c7a984b26e1ca4342a8f618a7138ab5cc91820da0c1d4cc79a5bb26
red-exit.txt | 3 | f1b2f662800122bed0ff255693df89c4487fbdcf453d3524a42d4ec20c3d9c04
red.log | 22518 | 76715f917a560d14d107430935ba6608bbdab8a9b80180d197d269dd3aef31d9
source.json | 48734 | 69ac07f2ad84c1f247bd155a7c43dd5bcabaa2341cb5dcbe516df9b9d88b2554
trainingCatalog.ts.before | 8755 | 6ee3267ce58dcc1d1a78ea1517f2655fe1a6367c1f6e551bf5827b03a95d95cc
tsc.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
