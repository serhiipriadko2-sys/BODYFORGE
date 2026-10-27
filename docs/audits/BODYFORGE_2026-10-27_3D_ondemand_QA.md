# BODYFORGE — event-driven 3D performance & compatibility QA
Date: 2026-10-27

**Lifecycle at inspection:** TESTED-LOCALLY. Neither a new commit/push nor Firebase deployment was executed during this task.

Repository: `C:\github\BODYFORGE`; observed branch `main`; observed HEAD `dcd2471ec7eabcf0f564c6ec077745b15edda769`.
The working tree contains concurrent, unrelated changes. This is **not** a frozen, deployable repository snapshot.

## Why this change was needed

The imported 3D athlete, camera and lights are static between explicit user actions. The previous `Avatar3D.tsx` RAF loop called `redraw()` about once every 42 ms, even if the character did not move. This consumed unnecessary WebGL work. The change does **not** reduce the GLB download size or guarantee a specific battery improvement.

## Actual changes

1. Removed the idle `ActiveFrameLoop` in `Avatar3D.tsx`. The model renders when its view becomes visible, when canvas size or profile data changes, when GLB/textures finish loading, and on pointer/keyboard rotation. Hidden/paused canvases do not render.
2. Made the canvas' `data-render-loop` state explicit: `on-demand` for visible interactive static 3D, `paused` for hidden/camera-paused 3D, and `stopped` for disposed contexts. Runtime diagnostics never infer a continuous FPS when the renderer is event-driven.
3. Updated the user-facing device diagnostics to display **3D · По событиям** or **Отключена**, explaining why FPS may be blank. No new image uploads, webcam streams or personal telemetry were added.
4. Strengthened the headless WebGL lifecycle test: count **actual GPU draw calls** and require **zero new calls during a 350 ms settled idle window** under normal motion settings; still prove redraw on body changes, arrow keys and returning to foreground; and no background GPU draws.
5. Updated mobile E2E to require the new visible/hidden render states and the new in-app diagnostic policy, while retaining full camera/3D/reward flow.
6. Kept the dashboard chart fixture compatible with a concurrent `PulseDay.holdSeconds` schema extension by setting `holdSeconds:0` only in synthetic test data. The concurrent feature's logic itself was not changed.

## Verification results (isolated browser/localhost)

| Gate | Actual result |
|---|---|
| `npm test -- --reporter=dot` | PASS **478/478 tests, 41 files** |
| `npm run build` | PASS (TypeScript and production Vite) |
| `npm run qa:bundle` | PASS; initial JS **397058 bytes** vs registered **496761-byte** baseline (**20.1% smaller**); 3D code remains lazy |
| `npm run qa:avatar` | PASS **22 assertions**; observed settled idle GPU draws **0**, background draws **0**, runtime errors **0** |
| `npm run qa:avatar-observers` | PASS **21 assertions** |
| `npm run qa:avatar-quality` | PASS **47 assertions**, screenshots of full, portrait, hairstyles, growth and fallback |
| `npm run qa:resilience` | PASS **63 assertions**, including missing 3D module and camera failures |
| `npm run qa:mobile` | PASS; onboarding, 3D/editor, local backups, camera, MediaPipe, lenses, stop/no false XP, diagnostics, viewport 360 px |
| `npm run qa:pwa` (loopback) | PASS; manifest and install icons served, offline mode still not supported |
| `npm run qa:privacy` | PASS; **12** blocked development/private paths |
| `git diff --check` scoped paths | PASS |

**Observed:** In a disposable Chrome/WebGL session, the settled figure performed zero GPU draw calls over the measured 350 ms window. A fixed draw count is not equivalent to measured energy usage. On a real Android/iPhone, measure GPU time, memory, thermal behavior and frame responsiveness before asserting energy savings.

## Scoped file integrity read-back

At source inventory time: **5 regular source/test files, 88117 bytes in total**. Hashes refer to complete file contents, including any pre-existing changes in shared QA scripts; do not attribute every line to this work.

| Relative path | Bytes | SHA-256 |
|---|---:|---|
| `src/components/Avatar3D.tsx` | 40242 | `248af1a0cef3732768b8484811753492e81b6910742cdf896b345e15b595c1aa` |
| `src/components/RuntimeDiagnosticsPanel.tsx` | 5678 | `c62b7ee4f27c4547ef39029615b07fa75eff005191293a0d69645c9bf0d1fc3d` |
| `qa/avatar-lifecycle-e2e.mjs` | 10858 | `2b54f7b7ac6cc4404a20180df80b94438ffc109435999223e3e881f5c13dc499` |
| `qa/mobile-e2e.mjs` | 28418 | `733741098ac69ec69a12b3097272595ab2d74b6a345606330662a181c3fb0059` |
| `src/lib/dashboardDisplay.test.ts` | 2921 | `bea78bfdf5dc166488326b186430d47f395adba3cb3c8388ac97c93fd43f0d94` |

## Known limitations and next actions

- No new Firebase Hosting deploy, commit, GitHub push, APK or physical-phone test during this pass.
- Full 3D module is still approximately **651 KB minified JavaScript** and the preferred detailed GLB is about **6 MB**. Event-driven rendering improves idle GPU work but does not solve network/data size. Future optimization: model/texture compression **with** appearance, skinning and fallback regression QA.
- The camera runtime still fetches pinned MediaPipe WASM/model assets from external URLs. Local bundling is a separate release-size, licensing and cache decision.
- PWA has no service worker or offline mode. Backup JSON is not automatically importable to a new device.
- Working tree has edits by other processes (exercise catalog, game, backup and chart features). Must freeze a known SHA and rerun all release gates before publication.

**Decision:** LOCAL QA PASS for the event-driven 3D scope; RELEASE NOT READY / VERIFIED-LIVE NOT RUN.
