# BODYFORGE / Chrome USB and ADB intermittent detection
Date: 2026-11-10
HEAD at observation: e9762a215ec830be70922d138dfe13aa65c09cec
Disposition: PARTIAL - intermittent host ADB visibility; Chrome USB connectivity independently reported by user.

## Reproducible observations
- Host first series: five consecutive two-second-interval checks showed one Android with ADB status=device; Windows ADB Interface status OK; BODYFORGE preview port 52871 HTTP 200.
- Later ADB check showed 0 devices, and three additional two-second-interval checks also showed zero devices.
- Windows PnP still showed one ADB Interface in all three later checks.
- No forced disconnect/reconnect, ADB server restart, Chrome setting change, phone settings change or application source edits were performed during these samples.
- User reported USB/Chrome connection had recovered, but in this iteration real-page content was not reverified independently.

## Evidence interpretation
This demonstrates that host ADB device visibility fluctuates while the host USB interface remains enumerated.
Old official GoogleChrome DevTools documentation states direct Chrome USB access may interrupt a separate ADB connection.
This is a credible hypothesis, NOT an established cause here.
Chrome Port Forwarding and ADB listings should not be treated as equivalent signals.
The host app preview and full device on-phone functionality are different claims.

## Next safe discriminating action
While using Chrome Direct USB DevTools, keep the game open at http://localhost:52871 on Android and inspect chrome://inspect/#devices on desktop.
Check whether the device/port forward status indicator is active. Do not repeatedly restart ADB while Chrome owns USB.
If choosing ADB-only workflow later, disable Discover USB devices and reconnect USB first (with user authorization), avoiding parallel Chrome USB takeover.
No personal browser tabs, photos, messages, camera streams, device identifiers, GPS or health data were read.
No user phone data was changed. Rollback: delete this new receipt only.

## Sources
https://developer.chrome.com/docs/devtools/remote-debugging/local-server
https://github.com/GoogleChrome/devtools-docs/blob/master/docs/remote-debugging.html