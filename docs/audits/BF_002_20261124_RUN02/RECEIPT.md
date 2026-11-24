# BODYFORGE BF-002 — RUN02
Status: historical frozen build core checks PASS; current combined baseline PARTIAL / BLOCKED by concurrent source drift. BF-101 production patch not started.
Workspace E:\github\BODYFORGE; observed HEAD 6b2319ac517883857aad2140e50e09c229d63245. Initial scoped source count 267. No game source changed by this turn. Previous trainer failure no longer reproduces on tested snapshot (2/2).
Unit 611/611 (59 files), build exit 0 to isolated temp dist (59 files), bundle exit 0: entry 394272 bytes, 20.6% reduction, MediaPipe separate 154276 bytes. Large lazy chunk warning remains. Initial source hashes stable through build. Preview HTTP 200, served index and entry bytes verified against frozen output, entry index-vEHoMBly.js SHA256 31df69354782786ed195c8d73b4e15f00e3b9c2a2fb5ba62abe64c5925069b03. Forge E2E 67 PASS, including mission claim/navigation and viewport checks, no uncaught exceptions. Screenshot files captured, visual inspection not performed.
First preview check stopped on PowerShell hash-helper error; corrected with literal paths, no source rebuild. During Forge E2E new scripts/author-avatar-seams.py and src/lib/avatarGarmentSeams.json appeared. Frozen build and QA script hashes verified before further test.
Multitab attempt against production preview exit 16 / 0 assertions: harness imports /src/lib/progression.ts directly; wrong surface selected, not a game defect. Corrected to repository's qa/stable-dev-server.mjs (5182, HMR disabled), module HTTP 200. Multitab exit 0, 31 assertions on disposable synthetic profiles: lock exclusion, stale write rejection, cancellation, daily login once, spending and reload, recovery/quarantine, unsupported browser no writes. During dev QA Avatar3D.tsx, avatarPhysique.ts and new avatarGarmentFolds.ts changed concurrently. Test-domain source unchanged between dev snapshots, full workspace not frozen. Do not claim coherent current release or real-user save validation.
Owned preview and stable dev servers stopped; no existing server stopped. No APK, Firebase, commit, dependency or user save changes performed. All parallel files preserved. Next: once concurrent avatar edits stabilize, exact baseline for current source; BF-101 focused regression for impossible timed plank completion, preserving legacy saves and economic rules. See source-before.txt, source-after-build.txt, multitab-dev-source-before.txt, multitab-dev-source-after.txt, multitab-dev-drift.txt, exit-codes.txt.

## Evidence fingerprints
head.txt | 42 | 8c4388a89692a712a27945ea2c5c4bed0b71467813b87efa1ec5fe8c37a67542
source-before.txt | 28183 | f89505467147c4ab574fd13f325224adc896a69e5add1776748ef3c82f475899
source-after-target.txt | 28183 | f89505467147c4ab574fd13f325224adc896a69e5add1776748ef3c82f475899
source-after-unit.txt | 28183 | f89505467147c4ab574fd13f325224adc896a69e5add1776748ef3c82f475899
source-after-build.txt | 28183 | f89505467147c4ab574fd13f325224adc896a69e5add1776748ef3c82f475899
trainers.log | 766 | 965768ae207ccebf3078cda2d2faa1639b26f5cbf35ba5b2aa7d15f1270851ae
unit.log | 8580 | 71dcf4189a1314159d88d592fe69502ffd4d2516104b3b244dd3768ceaa30342
build.log | 3803 | 6f71b15bf0697bfb1b0062f8dfbe6609277e63f2a255a1b7d780de00e05cbe5e
bundle.log | 281 | b83fdcae4499928f8132b8294f6a0f397235fc8be951330884499f6f2a0550c2
dist-manifest.txt | 6239 | af7608a37b467e33b8028f16e9d428851c79e20df2da4f1e2109fc581388c8bc
preview.txt | 185 | 6da4422f2df071d9574e5f4c4118a45def69975cc48137aa3b7b0de6e6a0d4e4
forge.log | 6524 | 3b2318289968afb34387ff62907900efda84aee15cfc23bb6069140955da2ce4
multitab.log | 490 | f7bbf42e247258fee0b850b3fb64458c998f13899f56380f2edc473c410c3e1c
multitab-dev.log | 4135 | 334b37b4a7412c1a02666880c54c4a03958a0a40c01eb74d5eba16459d511b76
multitab-dev-source-before.txt | 28503 | a842ff674a9f27b37eeab1e6e35d8014a7dab302dc5a746027679a5657901e18
multitab-dev-source-after.txt | 28608 | 249957625d02c5409c6917ae98c6dc0e56327e04dc529eb68972988e4e7b0dce
multitab-dev-drift.txt | 530 | 6e40f7fb76ff82200a4698bc40a1127900cd105f05c92cae44d42afd6d211966
exit-codes.txt | 84 | 39d542bfe92bc1440c300a32967fe0497236696ff8ed22506fe23cfcd51b4a4f
Existing dev server HTTP 200
