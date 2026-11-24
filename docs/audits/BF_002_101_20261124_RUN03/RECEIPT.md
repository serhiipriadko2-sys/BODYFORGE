# BODYFORGE / BF-002 baseline + BF-101 timed hold guard
Status: BF-002 PASS at recorded snapshot; BF-101 timed-hold subtask IMPLEMENTED / TESTED_LOCAL. No physical device, deploy, APK or Git commit.
Workspace: E:\github\BODYFORGE
HEAD: 6b2319ac517883857aad2140e50e09c229d63245
Baseline: 272 scoped fingerprints stable before/after; unit 614/614 (60 files), production build/bundle/preview PASS, Forge E2E 67 PASS.
Problem: new plank rewards and journal parsing accepted impossible duration below 30000ms while holdSeconds=30. Camera FSM already accumulates valid timed holds; field accuracy not claimed.
RED: first test-insertion attempt failed to parse because of escaped line endings; restored original test hash. Second RED: 8 expected failures, 5 passes, exit 1. GREEN: 150 targeted tests across 6 files, exit 0. Added 10 tests: short input, invalid journal, no storage mutation, pending raw preservation, exact 30s boundary/dedup, legacy history.
Patch: validWorkoutHold in progression.ts reused by workoutJournal.ts; new guards apply to new rewards/journal, not parseProfile historical display. XP=120, coins=35 unchanged. Invalid old pending entry stays raw for explicit recovery rather than awarded. No migration or retroactive deletion. Existing profile not opened. No dependencies.
Post: 624/624 unit tests, 60 files, exit 0; isolated production build exit 0; qa:bundle exit 0 entry 394305 bytes, reduction 20.6%, separate camera chunk 154276 bytes; pre-existing >500kB lazy chunk warning. Production preview 5185 verified exact index and entry bytes. Forge E2E 
67
 PASS, no uncaught exceptions. qa:finish-save on stable dev 5186 (HMR disabled) exit 0, 28 assertions, including quota failure, retry pays once, conflict, export and reload. Synthetic browser camera only, no field accuracy claim.
All scoped source fingerprints stable through post-run. Only three owned files changed compared to verified baseline; parallel avatar changes preserved. Owned preview/stable dev stopped; owner dev not stopped. VS Code goto requested; actual window pixels not independently observed.
Receipt assembly first attempt stopped on Git CRLF warning treated by PowerShell as error; retry used cmd and checked native exit code without changing sources.
No new APK, Firebase, commits or save profile access. Owner dev HTTP 
200
. Rollback: compare owned hashes below, restore only matching respective .before backups; never overwrite new concurrent edits.
Next: BF-101 remaining contract coverage review of ghost/stop and other rewards, then BF-102 durable journal fault injection. No claim whole roadmap completed.
References: https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/High_precision_timing ; https://vite.dev/guide/cli .

## Owned fingerprints (path | bytes | SHA256)
src/lib/progression.ts | 17795 | 78f03be452af8fb557b382dbaf5a528bb4e8c5ee7161168d64238819f91284d6
src/lib/workoutJournal.ts | 12447 | 8964a4fa0d5ac3985342ce6ed54136ae211c119c3344fe33aba6969579c758d7
src/lib/exerciseRewards.test.ts | 6495 | ed035f4030be88b02071bb0a3dc9cd074202f5055f25da8385478c5b01f6f1f7

## Evidence fingerprints
head.txt | 42 | 8c4388a89692a712a27945ea2c5c4bed0b71467813b87efa1ec5fe8c37a67542
status-before.txt | 1710 | 614e9876cf5483ebdd797e4857ce89612a2ea22d92d61d3c7e57a5bd73bf8898
baseline-source-before.txt | 28718 | 227160df6402cbba5b5d2b43bd8d3b43e7a8dbf85ef7d517606dfcd5b1d3595b
baseline-source-final.txt | 28718 | 227160df6402cbba5b5d2b43bd8d3b43e7a8dbf85ef7d517606dfcd5b1d3595b
baseline-unit.log | 11036 | fa694ff1932adc5ba145a72a0805e3953c2c96631bf9d828ee2f1edab7fad8e3
baseline-build.log | 3891 | ec36bbc73ce8ca2b8eb13ceaa2e8c74b03df53a5688921e21c1e80bafc6fdcea
baseline-bundle.log | 281 | d1262ea3c8464152e6c7274f6b48f8ab948eb56e7dd8aecd9790d23719d3fac7
baseline-preview.txt | 185 | 31f5046cb249b06931f38b6b896b6e4ffffc92acf4edca554d0604fdd0ab7e78
baseline-dist.txt | 6239 | e30f790424035e848726fdc4230024b8cc09f4e3b8cc40e18c03089464dfc59b
baseline-forge.log | 6629 | 4e83d60f4ece89a8398365ba4171be73863d86da44222bce2bb37fed4f31761f
plank-red.log | 3548 | 154c21fe4f998b33e5ab0d6e95e8be51e37d94e813f45bca4f3605f5b0018ce8
plank-red-retry.log | 10822 | 0c9dcbfc85586953bdc9ba294d286511cce3cc9180c62d9c60dfdcf8959d2983
plank-green.log | 1522 | 8d98d869cf2b51e5cd259c347211d27da12278e3515cd17adf9017fd37208d89
patch-owned.txt | 308 | 75a852a642c00486105e12734a1506e9ca1e4b68588a4ec117e6e96fb3a5930e
patch-source-before.txt | 28718 | 0ba6c0197968ba664496b83b2d5b5ab5edad7d78a5e1e795772bf58c1f52b1f2
post-source-final.txt | 28718 | 0ba6c0197968ba664496b83b2d5b5ab5edad7d78a5e1e795772bf58c1f52b1f2
post-unit.log | 8415 | 2003bf3db6ca3ed38ced66859b1f9a8ec89f80c6d4dea7c9e411bf114df9f205
post-build.log | 3803 | 35db5c1c7f533ba9c66e9e20440808e03dfb2d06c81b83737937f79049597fd6
post-bundle.log | 281 | 5d9f63f24835d5966401479ca21082208eb55daeb692a129c115e9fa7ef7aa72
post-preview.txt | 185 | 4d34d805cff37c6a01438f7b35e7dde97f7b96984ea9db039045493422f261a3
post-dist.txt | 6239 | f3dc0a58bb1ca46c4a8f1771208014310fd928b27a3d0a874fc36a96774d9d19
post-forge.log | 6597 | 02576ad55e5eeeb33894558be90bfa1ec6a5edb62bb09c8ccbc9ce0cecb1c348
post-finish.log | 2173 | 43e02ba3377eef9f9d16d29db6220760c891d5979e2b79772616dfc6aa5dac5d
exit-codes.txt | 176 | 52a2d1de0d3bc9801b665df8c99d5bb46c4bd0f235f218ce09cb9c2f33cb6c98
progression.ts.before | 17478 | 120a016ff379840470b4949dbb49feae7f3e055e1a040774aa1fd23e718b8422
workoutJournal.ts.before | 12405 | fa420f47d69690aedc76c9ae521f17d98c1cc789c3949a1bd191ef85709fbaaa
exerciseRewards.test.ts.before | 3663 | 257f19b7c46fb394647589f86f27f6ddeeffd88d6380f6a26148f36ce1a85017
