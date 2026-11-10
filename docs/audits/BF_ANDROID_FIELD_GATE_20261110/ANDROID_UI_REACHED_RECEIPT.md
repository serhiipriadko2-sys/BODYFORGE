# BODYFORGE physical Android - page reached (field-gate receipt)
Date: 2026-11-10
Git HEAD at check: d8e3859f1319601786067d2af066e3419bc87357
Scope: read-only physical Android capability check and receipt.
Status: PARTIAL / SITE_OPENED_USER_REPORTED, APP_INTERACTION_UNVERIFIED.

## Evidence
User reports opening http://localhost:52871/ in Chrome on connected Android over USB port forwarding.
Host adb devices -l: exactly one device in status=device (serial intentionally excluded).
Android release via ADB: 16.
Physical display size via ADB: 1240x2772 pixels.
Display density via ADB: 560 dpi.
Host preview http://127.0.0.1:52871/ returned HTTP 200.
These device capabilities were queried without accessing photos, accounts, microphone, camera, saved data or location.

## Not yet verified
No screenshot of actual page content, GLB/WebGL success, navigation, 320-428 CSS px layout, camera permission, MediaPipe detection, saved progress, FPS, accuracy, performance or real-device E2E.
No CDP browser-tab inspection, ADB port forwarding/reverse, APK install, device configuration, Firebase deployment or live production action.
Shared working directory includes concurrent uncommitted changes. Build hashes not tied to immutable commit.
Next test: a user-shared screenshot of the game's home/forge screen to confirm UI and GLB; then explicit controlled camera test.

## Lifecycle
Only this new audit file created. No other app or user-data changes.
Rollback: delete this receipt.