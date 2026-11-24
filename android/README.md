# BODYFORGE Android Health Connect field candidate

This isolated native wrapper is based on the existing local field QA WebView source.
Application ID: ru.bodyforge.healthqa (separate from the earlier fieldqa APK and web storage).
Only Android 14+ with a working system Health Connect service offers the native action.
Older Android/browser retains the manual disclosure. No new runtime dependencies.
The native Activity reads today's aggregate only with READ_STEPS permission; no raw records, background,
history, write access, server transfer, JS bridge or health persistence. The native number is cleared
when leaving the foreground. The OS permission is user controlled. The settings action permits revoke.
The user-agent is only a web UI presentation hint. A native action requires the bundled origin, exact
route, main frame, user gesture, GET and no redirect. Untrusted pages cannot receive a count.
Existing camera permission flow and packaged local assets are preserved. WebView debugging disabled.

Build: from BODYFORGE root, run powershell -ExecutionPolicy Bypass -File android/build-field.ps1
with the installed Android Studio JDK/SDK; outputs only in .bodyforge-qa. Debug signature for sideload
test only, no store release or Firebase deploy. Do not install over another package or erase browser data.
Before production: physical Android permission deny/grant/revoke, correct aggregate versus Health Connect,
no data/zero, midnight/timezone, camera and WebView integration, accessibility, privacy and Play review.

## Live steps (test.3)
On Camera after fighter creation, native bar shows Health Connect's daily total (foreground 60-second reads) and an independent foreground step-detector session count. No addition or cross-source dedup guess. ACTIVITY_RECOGNITION is requested only from explicit native settings; no background counting or health values in JS/storage. Update from r2 using the same test app id/signature. Physical sensor and native layout still require device QA.
