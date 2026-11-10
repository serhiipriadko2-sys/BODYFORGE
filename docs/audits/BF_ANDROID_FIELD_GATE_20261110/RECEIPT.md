# BODYFORGE Android field QA authorization gate
Date: 2026-11-10
HEAD at observation: d8e3859f1319601786067d2af066e3419bc87357
Working folder: C:\github\BODYFORGE
Scope: read-only device availability check and this audit receipt.
Status: BLOCKED - physical Android authorization not granted.

## Observations
The local ADB executable was found in the Android SDK platform-tools directory.
ADB server startup succeeded and adb devices -l returned one attached device with status unauthorized.
Device serial is intentionally omitted from this report. No phone files, apps, or personal identifiers were read.
No adb reverse, adb shell, logcat, permissions change, device setting change or install performed.
Existing local preview at http://127.0.0.1:52871/ responded HTTP 200 (localhost on Windows only).

## Prior local QA (not phone proof)
Earlier two full desktop-headless mobile E2E runs: PASS exit 0 (one instrumented copy and one qa:mobile).
Prior npm test 577/577 PASS, build PASS, bundle PASS (20.7 percent entry reduction) on a concurrently edited working tree.
These are historical local receipts, NOT reproduced by this device gate. No FPS, camera accuracy or field readings claimed.

## Gating next action
Owner confirms Android USB debugging trust prompt on the phone (only on an owned/trusted device).
Then repeat adb devices -l; require status device rather than unauthorized.
Only after authorization: check actual Chrome Android, HTTPS camera permission behavior, WebGL render, pause/resume, backup and reward persistence.
Do not use live Firebase, expose 127.0.0.1 preview to the network, or bypass security permissions without separate gate.
Remote USB debugging guidance: https://developer.chrome.com/docs/devtools/remote-debugging/
Chrome Page lifecycle events: https://chromedevtools.github.io/devtools-protocol/tot/Page/
Vite preview is local validation, not a production server: https://vite.dev/guide/cli

## Current source fingerprints (file | bytes | sha256)
AGENTS.md | 5621 | F4C9DA987F8B3A0BB05AC4CEBDD14C0DB5DC2F0E99235ACB78D38BC3B64AA7B0
CODEX_ISKRA.md | 6277 | A3CB516C3A86C10C9D4FCBD845DC0F06B26068500962F2C25480C3CEF8F948B7
README.md | 30242 | 28BCF86C591A15AC8887FC21D0D52BE2978382B2CDDAE034DC0B0C28D7FFB4EC
package.json | 2006 | D12B1C4980345A8B05FBC50023CD9548AEBC28BBC392B782C182047A9DD61963
qa/mobile-e2e.mjs | 39313 | BE9BEE1912C556DD7B12153D9EA91B3A90F6EF777C4DAB0EA2AFCF9ECB526B2B
src/components/Avatar3D.tsx | 41088 | 5097A85AEEC3D1E73C33AE1A6DD82D6B8EEB39E9C3B7D5E02329C022B545DB2E
src/App.tsx | 81284 | 98A06B57D9C1AD974E29388F892A34370BD503EBB6E59FDFB24EDE8AA5014686

## Boundaries
Shared working tree currently has uncommitted changes by other processes. No resets, commits, pushes, deployments, installs or phone writes.
This receipt may be removed without affecting app files. Git HEAD is not a frozen release artifact.