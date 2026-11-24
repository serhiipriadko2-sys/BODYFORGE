# ADR: foreground live steps in BODYFORGE

Status: accepted local test candidate only. No physical device or permission grant observed.
Request: show real steps on Camera without opening a separate screen to refresh.
Health Connect on-device totals can be batched up to about once per minute, and other
sources can lag further. Do not claim per-step real-time daily aggregate.
Decision: native compact bar above WebView, only on Camera after fighter creation.
Two independent readings: today's Health Connect aggregate, refreshed immediately on
entry/permission and every 60 seconds while visible, plus foreground session events
from TYPE_STEP_DETECTOR. Do not add, estimate or reconcile the two numbers. Session
zero means newly registered sensor session, not today's total. Expected sensor latency
per Android docs <2 s, not measured here. No sensor -> unavailable.
ACTIVITY_RECOGNITION is an additional runtime permission. Manifest declaration is not a grant.
Only explicit user tap in native settings requests it; user can refuse/revoke.
READ_STEPS remains independent. No background or history access, write access, storage,
raw recordings, network upload, logs, game rewards or health data sent to WebView.
WebView returns only a strict enum ready/busy/off, via fixed evaluateJavascript on
packaged origin, with bounded polling/timeout, fail-closed navigation and lifecycle.
No addJavascriptInterface. New token only if panel constructed. Older web/APK path retained.
Native bar clears and unregisters detector on hidden tab/onPause/destroy; callbacks
from older epochs ignored, permission/time checked; pending aggregate times out.
FLAG_SECURE while native values are visible; settings disabled during camera/save.
No additional runtime dependencies. APK v3 same test application id as r2, not production.
Alternative: Health Connect only (delayed); add live sensor steps to aggregate
(rejected double-counting); send totals through web JS (rejected privacy).
QA: pure Java sensor/filter/refresh contracts, TypeScript marker/legacy tests, web
fallback E2E, SDK build/sign/payload verification. Runtime Android UI and actual
sensor/Health Connect read require field device. No physical device connected.
Rollback: compare exact hashes, restore only this iteration from .before backups;
retain r2 APK and existing game profile. No Firebase changes.
References:
https://developer.android.com/health-and-fitness/health-connect/features/steps
https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion
https://developer.android.com/health-and-fitness/health-connect/aggregate-data
