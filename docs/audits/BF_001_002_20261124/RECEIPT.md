# BODYFORGE / R0 — BF-001 and BF-002

Status: BF-001 PASS. BF-002 BLOCKED (baseline unit FAIL in an active parallel avatar change; no coherent current release baseline). No product patch in this turn.
Workspace E:\github\BODYFORGE. HEAD 4ddbfa7e74d876ed866ae5cdb1da9a807fa33095. Existing changes protected. One BODYFORGE VS Code window observed; unsaved editor buffers and actual pixels not independently observed.
Roadmap/prompt hashes match uploaded files. SoT30 verifier exit 0 / 30 files. Git diff --check exit 0. Initial 264 scoped source/asset/QA fingerprints.
Attempt #1: npm test -- --maxWorkers=1 --no-file-parallelism exit 0, 609/609 in 58 files. npm run build exit 0 (existing large-chunk warning). npm run qa:bundle exit 0, entry 394235 bytes, reduction 20.6%, separate MediaPipe 154276 bytes, index-BCq0olae.js. The run stopped with exit 1 on source drift: bodyforge-trainers.glb and scripts/author-avatar-trainers.py changed concurrently. Browser tests not started. No claim of an immutable tested build.
Attempt #2 (one explicit bounded retry): 265 scoped fingerprints. Same full unit command exit 1; 610 passed, 1 failed of 611, 58 passed/1 failed test files. src/lib/avatarTrainers.test.ts:28:51: installAvatarTrainers(shoes, donor) expected true, got false. Current implementation and asset still being edited by another process; avatarTrainers.ts modified after failing run. Exact subcondition responsible not established. No test threshold changed, no third full run.
Build/bundle/browser QA NOT_RUN on retry due red unit gate. Dev 5173 HTTP 200, preview 5176 HTTP 200; observed preview later changed to index-jSnKZb1j.js, not the first attempt's entry. HTTP only, no DOM or exact current build verified. Physical device and Firebase NOT_RUN.
Ownership: pre-existing/concurrent avatar/art (Avatar3D, AvatarLab, avatarTrainers, generator, GLB and related tests), Android/native steps, UX navigation/CSS, and QA changes remain protected. No product source was written, no profiles accessed, no reset/clean/stage, no APK, no deploy, no commit/push, no dependency changes. First and second run logs retained. No rollback required for source; audits are new files only.
Next gate: once the trainer batch is stable, read current hashes and run targeted npm test -- src/lib/avatarTrainers.test.ts --maxWorkers=1 --no-file-parallelism; then a fresh BF-002 unit/build/bundle and exact production preview with Forge DOM and storage/multitab checks in isolated browser. Resume BF-101 only after stable baseline PASS. Do not assume later code is still failing or passing until reproduced.
BF-101 candidate for later investigation (not a confirmed runtime bug): journal parse and addCompletedWorkout accept a plank receipt with holdSeconds=30 and a positive duration under 30000ms; verify via isolated regression and compare to real FSM timing before any edit. Existing legitimate profile history must not be silently changed.
Source policy: local Vite preview is a build check, not production serving (https://vite.dev/guide/static-deploy.html). Git status distinguishes changed/tracked and untracked paths (https://git-scm.com/docs/git-status).

## Evidence fingerprints (relative path | bytes | SHA-256)
BF-001.md | 1172 | 464c14df8d6004fa6cc18f96cda36319d5f9ff5b057c67ac3771a457410a7859
head.txt | 42 | 1c8569d9cd1b9589315e92545d33c86a5657b50965cafc2876f14c6d9ade3775
status-before.txt | 2881 | 4b4a7eaf50f5b2185d69019b4a6a2a77256c314974fd9302beb318cc44f3d9d8
source-before.txt | 27909 | 828eb8f63e54577817e47cb40343d13c29c7deca7d8f7a79a43bebea98f8005e
source-after-build.txt | 27909 | 3a27228e04818109558d65e11eaf7b8b828f65c193de390ab7f4a52928b2d68a
unit.log | 8264 | f6b39578e8b151d312bea6fe5efcd65a777ab5dc9f96c2df362efc142d938a1e
build.log | 2220 | 61c6f85f166373dbcfd9d7098d72b462a1db0dd2f036da77d6c05d281eb296f6
bundle.log | 366 | bcd0d470870d326cce5de90a138d8d114395487f9bc2ba7b37335d152f28aaf3
retry-1\head.txt | 42 | 1c8569d9cd1b9589315e92545d33c86a5657b50965cafc2876f14c6d9ade3775
retry-1\source-before.txt | 28010 | 9f1577e584106c894e16e03c0255a5f19977c030d8dee53abc7e9be8f32931a4
retry-1\status-before.txt | 2911 | 1cc76acdde65c5c733c6781dbb424f6c13a806895a3a37b97e3d710190b5ac8f
retry-1\unit.log | 9144 | 878b0f98ab3fdf40f4e3ea959a425d5410252705326226acc0ed06757825f9c7
## Current observed conflict fingerprints (not tested revision)
src/lib/avatarTrainers.ts | 7079 | 83828f24271cf772029d06c72903bec5174bdad7f7ed3561edcbd9984a0b38c9
src/lib/avatarTrainers.test.ts | 4230 | fb3512ec28a4140f413e9d656e977e421c0198a94d68e1bea29c59db2311f045
src/components/Avatar3D.tsx | 50336 | ea4345ee85ff47d287094f71a6caee3c9e695a9361172b92c2c1c23cc8a85a02
public/assets/bodyforge-trainers.glb | 122828 | 6bb23fd585b4c21c81c81c17c3d50e5f902f36936c1c88513f54cd2bd968f957
scripts/author-avatar-trainers.py | 7734 | faef0e26ff7ba6637f4776cd7e3b31e6c1ffaad1fd086356c2486e6e29f5e693
