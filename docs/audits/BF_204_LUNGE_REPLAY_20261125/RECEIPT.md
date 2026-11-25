# BF-204 lunge phase/visibility replay - engineering receipt

Status: IMPLEMENTED / TESTED_LOCAL on pinned build. Human field validation remains BLOCKED/NOT_RUN; BF-204 overall PARTIAL. Lunge remains experimental.
Observed 2026-11-25T19:16:14.478354+03:00; workspace E:\github\BODYFORGE; HEAD at freeze 664ab80c89b244bab1014ec5c652d11c6a490470.

Scope: preserve existing experimental one-leg-bend prototype and same-side complete repeats (catalog does not mandate alternation). Both legs must be observed; each provided visibility/presence score is bounded; simultaneous deep bending without unambiguous active side is rejected. This is a conservative observation policy, not an assessment of proper lunge biomechanics; ordinary lunges where both knees bend may be rejected. No new angle thresholds, reward amounts, storage schema, model or saved profile changed.
FSM: reject negative time, abandon lunge partial state on missing/ambiguous observations, reset active-hold time across disjoint bends, reject substitution of the active side in descent/bottom, apply the existing 400ms continuity limit. Completed repeats preserved. Shared generic counter's negative timestamp guard also hardened.
RED: 15 failed, 7 passed of 22 new deterministic cases. GREEN: all 22 new cases and 129/129 focused tests in seven files. Cases include both legs' six joints, invalid confidence, straight-legged step, ambiguous bend, partial return, side substitution, separated short bends, loss of visibility, complete same-side/alternating cycles, three aspect ratios and three scales, exactly twenty valid repetitions.

Integration snapshot: 311 web/QA/build input files; 73 output files. First snapshot attempt refused due to a concurrent avatar file change; replacement snapshot matched live at freeze. All frozen bytes checked before/after. TypeScript, Vite, on-demand bundle checks exit 0. Entry index-6uxEMi1m.js SHA256 f7b8b40693dfbf51369d7a56040ef7640f3adc145d9877fc8648e734fe11a415, 392106 bytes; separate camera chunk 154276 bytes. Existing large avatar chunk warning remains.
Full Vitest 888/888 in 92 files. Browser attempt 1: initial standing calibration observed 514.1ms frame gap; no credited repetition; exit 16. Only QA fixture changed: restart initial stand dwell after startup gap; retain strict 400ms gate after movement begins, real observation timestamps, no counter feedback or fake clock. Do not treat first run as PASS.
Browser attempt 2: exact same production build, 25/25 checks, exit 0. Negative patterns zero credit and unchanged synthetic profile; two valid lunges then cancel preserves exact wallet and no pending result; twenty valid lunges persist one workout and one reward identity, +120 XP/+35 coins, release camera/model and reload exact paid profile. Max observation intervals 264ms, 90.5ms, 96.8ms for the three phases. Both disposable browsers cleaned and preview ports closed.

Final static checks git diff=0, staged diff=0, canon=0, QA syntax=0.
Live drift from pinned inputs: changed=['qa/lunge-replay-e2e.mjs', 'src/lib/athlete-skin-scan-review.jpg', 'src/lib/avatarSkinAtlas.test.ts']; new=[]. All three owned final hashes match; later parallel edits are not certified by the tested snapshot.
No physical camera, participant data, actual owner profile access, APK generation, Firebase publication, dependency install, Git stage/commit/push. Existing changes preserved. VS Code open command invoked; parallel editor activity may change the visible tab.
Next: BF-205 pushup validation, followed by the remaining exercise-specific gates. Field studies require consent, actual device evidence, independent reference observers and frozen model/thresholds; no accuracy or medical claims from synthetic landmarks.
Rollback: restore the exact before copy of exerciseCounter.ts only if its current hash still matches; remove only matching newly introduced tests. Preserve concurrent changes.
Reference: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker .

Owned files | bytes | SHA256
src/lib/exerciseCounter.ts | 16049 | 9c68edf823fe44ad6bc4e917147e3e76f316b99026ae91319c29526af6dadf69
src/lib/lungeReplay.test.ts | 6436 | 4932f64e6326be58e34c19d85e2e2583e5c484cf742ae7a0952a0ba9869cd077
qa/lunge-replay-e2e.mjs | 13388 | 0d729960c2d20b43270fda8402bb9c5aeae9d3131f32f84f40ed70acdac7aca1

Evidence | bytes | SHA256
baseline.json | 999 | 1cc940e08029ed5faf99652e6a3ba1b98dec31c7d030a06d9a9d651460833f52
build-manifest.json | 10787 | e5ebe5f548d231bdd2c86ab8f21b6bf6551dcca99c10f0680c890cce9fb8e309
build.log | 2495 | 506e03a030541ba344237b119bceb22ce25c3421cf088691487776c149e8cdf8
bundle.log | 281 | 0902cec3468ded4ecf7fad8c606a3668e941be95210ff475002a4cfc58cbc7c8
exerciseCounter.ts.before | 15048 | e4709fe6c8f022ed54b2614e2b585648f7de50a685c2d99d2d2914b099d5de87
full-unit.log | 14126 | 7928f176f4bdb747c7445aaf7e46e642ff89d75697c42b3d9a5971d5ce3815a8
gates.json | 1051 | d8b6e325c0fb9ac4fbf080e59abc57ea0d88cae38460d73181505be591054675
green-exit.txt | 3 | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354
green.log | 1502 | d42eaeb88e604cb779160c40187489df6daaf145d7956f93c301b3f6cb858b35
lunge-replay-e2e.mjs.attempt1 | 13054 | ec9ccc91cce3f4783e6dc0606c42af72f175a54c80df7f9c315844aadc54786c
lunge-retry.log | 1613 | 08e409120cd5b07ace8a3904a9aaa20265fa499706954d8beddba5504e56ae7e
lunge.log | 1164 | 06d0f54d058a69acc58413e5f0feee8f37af8a7dda3b261e206ce348eb87f434
preview.log | 40 | 1477f195c0f9da38ac49322443b66420047df2925808706d9e7dfb90021d7f0e
red-exit.txt | 3 | f1b2f662800122bed0ff255693df89c4487fbdcf453d3524a42d4ec20c3d9c04
red.log | 21360 | 07970f4f7893966036086b10f0003602d6648069edaea2d42f5295812f8758f5
retry-gates.json | 632 | 086a4b03f3dc323491a234a9bc60468ee06082bc6ae9fbef96ace0bb7aaa1643
retry-preview.log | 40 | a1d71fdb9d6904f00ecde4f8479e496284a4f5ad57b506e0a6e5289dfdb034dd
source.json | 45385 | f5e1951a515b40bc9e33b1c8dddd373346da9b9c9297490b2d5b23a6e4f5a0ca
tsc.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
