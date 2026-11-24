# ADR / BODYFORGE native Health Connect field candidate

Status: ACCEPTED for local isolated candidate, not production or permission granted.
Context: browser cannot access Android Health Connect. Existing field APK has no Health Connect.
Decision: system android.health.connect APIs (API 34+) without new dependencies, no cloud.
Only READ_STEPS requested on an explicit native action. Use aggregate STEPS_COUNT_TOTAL over
local midnight to current instant, no origin filter (platform dedup). Distinguish null from zero.
Rationale: non-exported activity with protected VIEW_PERMISSION_USAGE alias.
Reject background/history/write permissions, raw records, IDs, storage, logging, web JS health bridge.
Native Activity stays private, FLAG_SECURE, foreground only. Clear value on pause; late callback invalidated;
bounded timeout and date/timezone checks. System settings link enables revoke.
WebView capability marker is presentation only. Exact HTTPS packaged origin and route,
main frame, user gesture, GET, no redirect. Native result stays in native UI, not sent to WebView.
Disable native action during active camera or save. No modification to workout reward or save schema.
Alternatives: AndroidX/Capacitor for Android 9–13 (requires new dependency and review);
JS bridge (unnecessary exposure); browser sensors (not equivalent to system/clock steps).
Cost: Android 14+ only; count shown in native screen rather than web DOM; separate test APK identity.
Rollback: remove only new android module/nativeSteps files and restore scoped pre-patch App/StepsBoard/CSS
from this audit after hash comparison. Old browser and field APK data untouched.
QA: unit route/time/count policy; React render; actual web fallback; SDK compile, APK manifest,
signature, asset hashes. Field gate: permission grant/deny/revoke, real total compared with Health Connect,
zero/no data, timezone, camera, accessibility, privacy. No physical device was authorized at intake.
References: https://developer.android.com/health-and-fitness/health-connect/aggregate-data
https://developer.android.com/health-and-fitness/health-connect/get-started
https://developer.android.com/reference/android/health/connect/HealthConnectManager
https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges
