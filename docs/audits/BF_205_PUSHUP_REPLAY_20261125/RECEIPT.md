# BF-205 pushup observation / local engineering receipt

Status: IMPLEMENTED / TESTED_LOCAL on pinned build. BF-205 remains PARTIAL for human field validation; experimental recognition status retained.
Observed 2026-11-25T19:26:45.785612+03:00; workspace E:\github\BODYFORGE; HEAD at freeze 664ab80c89b244bab1014ec5c652d11c6a490470.

Scope: BF-205 from BODYFORGE_MASTER_ROADMAP_20261124 section 4.2 and execution prompt. Preserve existing elbow/horizontal torso geometry thresholds, all rewards, persistence and exercise identifiers. Require the complete observed side (shoulder, elbow, wrist, hip, ankle), existing 3.5% framing margin, in-range supplied confidence scores and wrist below shoulder in upright image coordinates. The latter is an engineering projection rule, not proof of floor contact or safe technique; it can reject valid poses. Keep landscape recommendation, permit other aspect ratios when geometry is observable. Share the existing frame-edge predicate with guidance; clarify camera placement and recalibration.
FSM: lock the observed side from calibration through each complete repetition; invalidate an unfinished repetition on missing/ambiguous pose, reuse the existing 400ms continuity limit for pushup, require consecutive engaged observations, preserve completed reps. Lunge behavior retained. No model or owner-save change.
RED: 14 failed, 13 passed of 27 new deterministic regression cases. GREEN: 27/27 new and 156/156 focused tests across eight files. Covers missing/cropped joints, impossible confidence, raised wrist, vertical/bent body, head/hip only motion, side substitution, disconnected holds, return interruptions, duplicate timestamps, long gaps, mirror/aspect/scale variations and twenty valid repetitions.

Integration: 315 source/QA/build inputs; 73 output files; exact bytes reverified. TypeScript, Vite, lazy bundle gate PASS. Entry index-f2L6m6dk.js SHA256 bee19f023e6b596d26fb645ac09ce48bbbbdb7a8879a1d501fdad9d1ce05dc7b; 392604 bytes, 21% below historical 496761-byte baseline; camera chunk 154276 bytes. Existing avatar chunk size warning remains.
Full Vitest: 924/924 in 94 files. Owned Chrome fake webcam with finite synthetic landmarks: pushup 25/25 and lunge regression 25/25, both exit 0. Negative patterns zero credit, partial cancellation preserves exact test profile and no pending result, twenty complete repetitions persist one workout and one reward identity (+120 XP/+35 coins); camera/model release and reload preserve paid profile. Browser observation timing and cleanup confirmed; preview port closed. These are software integration tests, not real-camera human movement validation.

Final static checks: git diff=0, staged diff=0, canon=0, QA syntax=0.
Live drift from frozen inputs: changed=['qa/import-preview-e2e.mjs', 'qa/mobile-e2e.mjs', 'src/components/ProgressBackupPanel.tsx', 'src/components/progressBackup.css', 'src/lib/backupArchive.ts']; new=[]. Five owned final hashes match. Parallel edits not certified by this snapshot.
First guarded patch attempt aborted before writing because of PowerShell text encoding; corrected using ASCII Unicode escapes. No user changes overwritten.
No APK, Firebase publication, dependency installation, commit/push, actual user camera or progress access. VS Code open command requested; visible editor tab not independently inspected.
Next: BF-206 jumping-jack coordination and observation replay; field evidence remains a separate gate, requiring real devices and human reference observations.
Rollback: restore only hash-matching owned source files from exact .before copies and remove only matching new QA/test files, preserving all concurrent changes.
Reference: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker .

Owned files | bytes | SHA256
src/lib/exerciseCounter.ts | 16975 | f1ec8009f7ab417a578656857f249cb334c804ad3e9e76cdba08bd98911653a5
src/lib/exerciseFraming.ts | 8335 | 80242bb283a24005b90451be6bfe54ddfa1e345139f6c336dbe856c30e9fc701
src/lib/trainingCatalog.ts | 8100 | 76db461541f48a532e3b96c9eb1fabf761fbf9e12b05e4d21db6d5c9c1979d68
src/lib/pushupReplay.test.ts | 7898 | 18df0e258e300fbf69159eef6745eb2acbe55ce57e9daa1169a7211969e56dae
qa/pushup-replay-e2e.mjs | 13694 | 7e19d5c30fdeabad0b11a132be69ec51ec60775919d1d99cbe7d8f5133cfb907

Evidence | bytes | SHA256
baseline.json | 1002 | 65c9e5a2b50fa434fb3de967e029f3bc53b234664d07068ff2977d279f8c475e
build-manifest.json | 10787 | d172d1014ef20dfb43b6cc0e6790be955d4f969a3d957d78b7dc14575b0ba9ff
build.log | 2495 | ed739cad1c04a1ac81ed377027d296fd6306031e795f8669721ced6d933e113a
bundle.log | 279 | 8ef1e47b6d26a69318a590ea4fd6e0267c14b4b6aaa8355e9fb9b92dc7748278
exerciseCounter.ts.before | 16049 | 9c68edf823fe44ad6bc4e917147e3e76f316b99026ae91319c29526af6dadf69
exerciseFraming.ts.before | 8188 | 5eaf98ab69507a047c720c16963d78ab3a6b9c97fb509e8fc26d8101f2ef0b2f
full-unit.log | 11911 | 9ae8499d06b3e7963d609effa31975408c6dc56e32bb6e218209d2960beb43df
gates.json | 1425 | f915a3fa5744e315b93eb20b4d631f80c9006c4b3af1873fc57b09d0e649dd40
green-exit.txt | 3 | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354
green.log | 1604 | b43c92709daa1efeed0f16996bd4aba88e3558f0645401a14994a27e181c01aa
lunge.log | 1627 | 6772032811b0bec873a67ff7fae06b1a45ef2be6caa859e28d3b6de26213f9f5
preview.log | 40 | 7262981f222ad5e0bd9d842156561f9ab1ec0869fe219b1df997ddebbe624b8d
pushup.log | 1685 | a240da08da648797677dc8d1f69db24062a988ad090b086be4189e0ebdf08795
red-exit.txt | 3 | f1b2f662800122bed0ff255693df89c4487fbdcf453d3524a42d4ec20c3d9c04
red.log | 23444 | 99ff8b7ead1152a71fc7215c510b6ba4cf0e44e041a2c29fb93a99ee0eb9db2f
source.json | 45960 | 20008fdae7ccbd21da4c8fb0954c43b1484f12f438b7b59a008af3306ba7f547
trainingCatalog.ts.before | 8027 | 769d309bbd6a50b2ce4a0da304bc6ff5da85c283a65d34ba86f2b076e8deded6
tsc.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
