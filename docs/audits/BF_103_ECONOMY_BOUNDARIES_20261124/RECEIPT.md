# BF-103 economy boundaries / engineering receipt

Status: scoped economy changes IMPLEMENTED / TARGETED PASS / BUILD PASS / MULTITAB+DEDUP PASS. Full frozen-tree gate PARTIAL due to one avatar timeout (isolated retry PASS) and tower QA observation-gap block. Whole R1 and live worktree not accepted.
Observed: 2026-11-24T21:50:51.860802+03:00; workspace E:\github\BODYFORGE; HEAD 7caa598c873c92887ac2ae3071b13f433225312e.

Intake: HEAD 7caa598c873c92887ac2ae3071b13f433225312e clean. BF-102 was selected first. Parallel session edited journal-e2e.mjs before our guarded write; the write was refused, no own journal patch. Its timing patch uses shared finite real-timestamp fixture, and the recorded first journal run reached completion then failed on the obsolete enabled-restart expectation. BF-103 depends on BF-101 per roadmap, not BF-102; separate scope selected to avoid overwriting simultaneous work.

Changes: game.ts rejects nonfinite/negative purchase balance and noninteger/out-of-range current muscle level; re-equipping an already equipped and owned outfit is an unchanged object. progression.ts rejects new non-encodable session IDs (same requirement as journal boundary), keeps legacy opaque IDs readable, and rejects generated fallback ID collision before reward. Existing price, reward, clock policy, storage key and historical data unchanged. New economyBoundaries.test.ts includes exact prices, no negative wallet, unknown item IDs, free re-equip, duplicate generated ID, historical Unicode, and daily claim round-trip after clock rollback.
RED: 9 failures/9 passes, exit 1. GREEN: 177/177 in 7 files, including 18/18 new cases. These include synthetic invalid direct-call inputs; no evidence of actual owner-wallet corruption or remote exploit.

Frozen snapshot 239 source/build inputs, copy hashes verified. Parallel drift during intake (live_at_freeze_match=false); tested files are the frozen bytes, not every contemporaneous live edit. Full Vitest 663/664, 64/65 files; sole avatarPhysique test timed out after 5000ms; exact isolated repeat 2/2 pass without changed timeout/assertions. TypeScript, Vite, bundle exit 0. 62 build files; entry 395694 bytes, 20.3% smaller than recorded baseline; pose lazy chunk 154276 bytes.
Preview index-CSjqLcF8.js SHA256 96d4bbcc722f9b807de897204136f6d7de0c6daa7901c44ab9b0d41aa8825e59; actual served bytes verified. Tower scenario confirmed floor-five payment, ghost splits, next-mode switch and two-rep cancellation preserving exact profile. Ordinary retry recorded 972.1ms observation gap, above 850ms fixture limit. Exit 14 infrastructure-blocked; no final completion/quest/reload PASS claimed on this build.
Stable dev real browser: multitab 31/31 PASS, login once, real purchase after confirmed save, reload exact wallet and muscle, stale write blocked, recovery and unsupported Web Locks protection. Dedup 34/34 PASS, 65 synthetic workout IDs with visible 60, 7800 XP/2275 coins, backup restore and native cross-tab conflict. No owner profile used. All owned Chrome cleanup PASS; both servers stopped.

Final readback: git diff=0, staged diff=0, canon=0; owner HTTP={'5173': 200, '5176': 200}; owned listeners=[]; own hashes match.
Current drift relative to frozen snapshot: changed=['qa/avatar-quality-e2e.mjs', 'qa/forge-home-xp-faq-e2e.mjs', 'qa/owned-chrome.mjs', 'qa/owned-chrome.test.mjs', 'qa/tower20-e2e.mjs', 'src/components/Avatar3D.tsx', 'src/lib/avatarFace.test.ts', 'src/lib/avatarFace.ts', 'src/lib/avatarFaceProfile.json'], new=['src/lib/avatarBrows.test.ts', 'src/lib/avatarBrows.ts']. Parallel source/QA changes remain intact. No current whole-tree PASS claim.
No APK, Firebase publish, Git stage/commit/push, dependency change, actual camera or real user profile access performed by this session. VS Code open requested; not screen-pixel verified.

Next: finish BF-102 full camera-to-journal fault injection, then BF-104 saving/recovery UI. Re-run complete integration gates after parallel edits settle. Full BF-103 scope reviewed; no economy schema migration or server anti-cheat claim.
Rollback: exact game.ts.before and progression.ts.before bytes retained; restore only if owned hashes still match, remove only matching new test; never reset/clean unrelated work.
References: https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability ; https://chromedevtools.github.io/devtools-protocol/tot/Page/ .

## Owned paths (path | bytes | SHA-256)
src/lib/game.ts | 11358 | dfde50705323b8f75f1cf5a58dea93a12e128d7d095837e7f453b557ac6dc336
src/lib/progression.ts | 18168 | 2b422880060e17361df058804d7014eb7eb718fc7f58118ae17b125a8cf83edb
src/lib/economyBoundaries.test.ts | 4537 | 595a90df2ab594626b5fee04f0813845fab4947a6bc848d08d70ba16a2facdf2

## Evidence (relative path | bytes | SHA-256)
avatar-timeout-retry.log | 523 | 1ac2394be8f79e198ba28d9f387c5c7349f9ae0657a7290f4f3d6e41b34323e2
build.log | 2107 | d827c40220e48d47a1f4da519ecb56d6836569bd1c026c2f5d400255621ae436
bundle.log | 281 | 21f61e4a5a33563deda715975898682110af7bd03ac4ee09c1379b742c8481f0
dedup.log | 3067 | 594f123b6abdb0235e5c673f7be77ccac8f64623434e90fd2e2c62013b40f682
dev.log | 111 | 196039dda83dd4c3d7bf6cc07f32ddb079ee3589d0a0e223591ac8841a782869
frozen-build.json | 9103 | 026edc68c2a0ac2d262b4ff4633e2ab6bf80e4b1c480d6313a21cd23aeb57695
frozen-source.json | 34691 | e03cbf6d4c93ca0b19dc145df2fd866b5a39b68e9dfc55a23503883d5e9b82f0
full-unit.log | 9071 | 6c7f21af634954593775006e0373d3818b48666a0ce037eff6a02a9bab688ef3
game.ts.before | 11115 | 00dfc8bcc9ad58c9f8ebeb7eb45a6cf759d42c73065fe60433f90652b9ec8236
gates.json | 1349 | 5c35a364a32218348b6c77d090dc14e1c2d658a55fe80ba037655d92f2975649
green-exit.txt | 3 | 13bf7b3039c63bf5a50491fa3cfd8eb4e699d1ba1436315aef9cbe5711530354
green.log | 2736 | b07f40e632c5c91961d562a640d58a95eedb99e5d5adfeadafe3362e1cb8b33b
multitab.log | 4188 | d3b443e2b1de2352c99ed743b7f4108175d1294a181ae4eab2d3edf58cee2128
preview.log | 40 | de352908c63591df7b545df7bf520a3c81527ab20ca7c1e4dde9e43984a774fe
progression.ts.before | 17795 | 78f03be452af8fb557b382dbaf5a528bb4e8c5ee7161168d64238819f91284d6
red-exit.txt | 3 | f1b2f662800122bed0ff255693df89c4487fbdcf453d3524a42d4ec20c3d9c04
red.log | 26374 | ce571eb150ca4341a4ab2a7ce592c331511ec573dbf623d898aa53bed2aa10a7
screens/bf-qa-tower-victory.png | 146505 | e1910dd6933ef2462785269fa2e2d4e79ae8a6fb208c38d2915b1a5130d419af
tower-final.log | 2458 | aea37ed39116fe0e3300e75ce315d4ecb676e8c10f090c5b90c9bd7d60a94dc5
tsc.log | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
