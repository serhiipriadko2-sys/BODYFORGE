# BF-201 camera lifecycle / early disconnect

Status: IMPLEMENTED / RED REPRODUCED / STATIC CHECKS PASS / GREEN BLOCKED by Windows commit limit. Do not accept BF-201 or active web build.
Observed: 2026-11-24T22:13:57.524899+03:00; workspace E:\github\BODYFORGE; intake HEAD 7caa598c873c92887ac2ae3071b13f433225312e.

Dependencies: R0 RUN06 and BF-102 journal CTA receipt confirmed earlier local build; BF-104 finish-save 28 and resilience 63 checks. BF-105 concurrent session created its own compatibility module and passed its first 19 tests. Our proposed write refused before touching that batch. BF-201 depends on BF-002 and BF-101, not BF-105. No replacement of another session's work.

RED on verified prior production entry index-CLryBuXu.js: permission rejection and late permission after cancel passed; at held video.play, stop plus synthetic ended produced loading=true, live=false, ended track still attached after 4 seconds. Source App.tsx byte-identical to then-live prepatch. Exit 16; owned browser cleanup PASS and preview port closed. This models disconnect/revoke using real Chrome fake track and an injected event, not physical hardware.

Product patch: register owned ended listener immediately on acquisition; reject absent/dead video track before attach and dead track after play; verify stream ownership before continuing; recheck request ID before pose module import. Existing cleanup removes early handler; later full cleanup retains removal. No changes to detector, thresholds, permissions, payout, profile key or persistence.

New qa/camera-lifecycle-e2e.mjs requires explicit loopback preview SHA, verifies entry in browser, uses owned disposable Chrome, seeded synthetic wallet, fake camera and synthetic failure events. Tests permission denial, late permission, disconnect while playback pending, late playback, already ended acquisition and background during startup. RED stopped before latter cases; their GREEN result is NOT_RUN.

Frozen integration inputs: 247 files; matched at freeze, all hashes verified on receipt. TypeScript process exited 134 (Zone Allocation failed / out of memory), no TypeScript code diagnostics. Vite/bundle/full unit/browser GREEN not run because tsc gate failed. Windows reported free virtual/commit headroom 725 MiB and subsequently 118 MiB. No forced process termination or OS settings changes. Do not infer test or build success from earlier BF-102/105 receipts.

Final check observed: git diff --check=0, cached diff --check=0, node --check new QA=0, SoT30 canon verify=0. VS Code window title App.tsx - BODYFORGE confirmed; unsaved buffers and screen pixels not inspected. Existing application servers, real user profile, camera, APK, Firebase and Git stage/commit/push not touched.

Next: when Windows has sufficient commit headroom, re-run typecheck on exact frozen snapshot, Vite/bundle, new browser GREEN and tower regression, full unit, then existing camera-runtime and mobile gates with owned browser isolation. Reconcile concurrent edits before claiming current worktree acceptance. No background runner scheduled.

Rollback: compare current hash of App.tsx with below, restore only its exact before copy; remove only matching new QA file; do not reset/clean unrelated files.
Reference: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/ended_event ; https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop .

## Owned files (path | bytes | SHA-256)
src/App.tsx | 83489 | 8294cb3f9ff41da92ac85655b469536240b8b2737fdb0d798e571bc60c34f9c9
qa/camera-lifecycle-e2e.mjs | 9956 | 1be957777bf4b822b92d5a7ef664861fbbe1fd5b50ccc059e584b11ac38e9ac4

## Evidence (path relative to receipt | bytes | SHA-256)
App.tsx.before | 82942 | 27407a9eb3e88b4beea59c1c5600b1534f13f869e1930b0c7fd5988cf7b871ab
frozen-source.json | 35852 | c10d9686b6d440278e2e36bd7a8c806f7188a1caa92fb34a3809c14b845b7d21
gates.json | 321 | 29a4aba4710e9e6cf9daffb777df6485d0202f030fd7ba8523875f7020c6835c
red-gates.json | 291 | 8c675c03cddbfe341240be8dedb560b8c92cfa067f8be6d63071d1c2ef78cb89
red-preview.log | 40 | ccb41280c5199eded7780de1df49ab02e0482cb6ea534652739a28ffe176f05d
red.log | 1356 | 5fc0759ab800e5edc8a5b46673480d141350b57989ad11c28a63d153cca9b6b0
tsc.log | 867 | 1ac532a7bd9829a28728eccf69acd794d70a4ef57ac534cc9c610f15ba076d52
