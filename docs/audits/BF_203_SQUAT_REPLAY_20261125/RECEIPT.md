# BF-203 squat negative replay / local verification

Status: IMPLEMENTED / TESTED_LOCAL on pinned integration snapshot. Human field pilot BLOCKED (no participants, paired independent observers or real-device ground truth); BF-203 overall PARTIAL. No clinical or field accuracy claim.
Observed 2026-11-25T19:04:34.349414+03:00; workspace E:\github\BODYFORGE; tested HEAD 664ab80c89b244bab1014ec5c652d11c6a490470.
Dependencies: BF-202 frame gate and previous integration fixes are included. The previous nine history/import failures are absent in the full test run of this snapshot. This does not certify any subsequent parallel edits.

Frozen baseline: exact pre-change squatCounter.ts bytes retained and baseline.json records camera/model references and source hashes. The model version URL is recorded but actual model bytes and field data were not acquired.
RED: eight failing and one passing new deterministic replay cases. GREEN: nine new tests and 106/106 focused tests across six files. Cases cover stale/nonfinite timestamps, missing evidence during calibration/return hold, long partial-motion gaps, preserved completed repetitions, brief same-side loss, reset semantics, and individually invalid confidence.
Product change: reject non-increasing/nonfinite/negative timestamps before state mutation; clear the standing-hold timer on invalid/missing observation; abandon unfinished descent/bottom after >400ms without a valid observation, matching the existing other-exercise policy. The 900ms idle/general loss limit and existing angle, rep, and hold thresholds otherwise remain. This conservative 400ms software choice is not human calibration and may reject real reps on slower devices. Validate each supplied visibility score against its existing allowed range, preserving the previous optional-score compatibility default.

Integration: 301 source/build inputs, 72 build outputs; source and dist SHA-256 manifests reverified. TypeScript, Vite and lazy bundle gate exit 0. Pinned entry index-pAl9lXlT.js SHA-256 01447c55ed50eb8b5e0e99f334e16c1c47e6d819762941a78012f8ee78ba3fe4. Entry 391816 bytes, 21.1% below the historical 496761 byte baseline; large avatar chunk warning remains.
Full Vitest 853/853, 89 files. Real headless Chrome with fake webcam and synthetic pose input: camera frame gate 15/15 and Tower 41/41, including partial cancellation, two valid 20-rep completions, exact reward identities, final-floor transition, daily quest and reload. These test the app and game persistence path, not human pose accuracy. Preview port closed and owned Chrome cleanup confirmed.

Current source drift relative to tested snapshot: changed=[]; new=['public/assets/athlete-scan-transfer-source.md', 'src/lib/avatarScanTransfer.test.ts', 'src/lib/avatarScanTransfer.ts', 'src/lib/avatarScanTransferField.json']. Owned files match. No whole current-tree claim if parallel work differs.
Static verification: git diff --check=0, cached diff=0, canon=0.
No owner profile read/write, actual camera access, APK, Firebase deploy, dependency installation, Git commit or push. VS Code title for squatCounter.ts observed earlier; no screen-pixel verification.
Next: BF-204 synthetic lunge side/phase tests and implementation (depends on BF-202); field protocol BF-203/204 remains separate with informed participants, two independent observers and actual-device evidence.
Rollback: restore only exact squatCounter.ts.before if the current hash matches below; remove only the matching new replay test. Preserve all parallel work.
Reference: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker .

Owned files | bytes | SHA256
src/lib/squatCounter.ts | 11480 | d54e841e62f84fbdb55d8ee1620d813a26b438c3cc4b60a4dd04d8346e3e5ebd
src/lib/squatReplay.test.ts | 3818 | 2728661468a5ee4138228f2834dbde5689489e207964e81b85f918b298a9ddb3

Evidence | bytes | SHA256
baseline.json | 1368 | 39ba357d4c7474db146da3f1b8e4a864b76aea8a85d76712f21186783baa3476
build-manifest.json | 10632 | 1d26f22734c87a68608b718353665a221e33cf49fd4e1b30a17df022ee69083d
build.log | 2495 | 6a5dcd1ec9e10720ea121417728c8ea5d68c3eda1b0524161b01aa6a72fe1f48
bundle.log | 281 | e5e1480fab26f6d227893680a9a336eb502de93c642742a9daa02d4c0de696b1
frame-gate.log | 902 | 34315ac075a3f329b32b0fa56800cc3dc32400df3c47f2347a58f008154e1192
full-unit.log | 12381 | 7ac6a3585b8c0b4cc465efee858d6d379264a8855518a104b6300289d01de0df
gates.json | 941 | a55f42f51dd78cf1cf7b7b5635369d9ee9c6a576826d7ff1a2e0485d44b01d5e
green-exit.txt | 3 | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354
green.log | 1392 | fba0f854081396beedc2f025edccd8b26bb10f30bf3f786d2e98370aa68daf27
preview.log | 40 | efb6f44a4cfc83158d314c9631bdd8c998ff4695bdb770d0541d7b29faa7d425
red-exit.txt | 3 | f1b2f662800122bed0ff255693df89c4487fbdcf453d3524a42d4ec20c3d9c04
red.log | 13430 | c7d326663cba9520081c9c3b5c35807be3eaac3c94f6505f07567f586abd0578
screens/bf-qa-tower-victory.png | 144363 | e7815e860e4c870d6af62efdab0ac7d47dfe844c2f1c4a0e5df9544f12c0d64d
source.json | 43898 | ff92d6cfeef5640edd4662e4fd08d2b2435baba63bd35acc95386ac406ce5db1
squatCounter.ts.before | 10544 | 87742e64368550f26cdaf1986a423e3ecd046dd2dbdd6ddad5bcc2681c5c00f4
tower-final.log | 2843 | 2cb11dbc1db3d49dc0d726033374364a80a59ead3611005810cbbb02e1a74ac9
tsc.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
