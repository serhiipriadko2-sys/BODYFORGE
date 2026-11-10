# BODYFORGE Android field APK / release receipt
Date: 2026-11-10
Mode: package (local test artifact, NOT production)
Source Git HEAD: 733e18b5a9c33298b6c4ba9f8389423fb52f9412
Source snapshot: 155 files src/public, verified unchanged across npm tests and build.
Web assets: 50 files, 30721582 uncompressed bytes.

## Deliverable
APK: BODYFORGE-0.3.0-733e18b-android-test.apk
Downloaded Windows copy: C:\Users\gabra\Downloads\BODYFORGE-0.3.0-733e18b-android-test.apk
Android USB download: http://localhost:52871/BODYFORGE-0.3.0-733e18b-android-test.apk
Local preview copy: C:\github\BODYFORGE\dist\BODYFORGE-0.3.0-733e18b-android-test.apk
APK bytes: 18461339
APK SHA256: 8459A1A8914D8F9EB5D848122342F811B48708692601F5E74C34F38139773F4E
Archive member count after signing: 57
Asset entries checked individually by full SHA256: 50 / 50
Dex code present: classes.dex (9,880 bytes)
Application ID: ru.bodyforge.fieldqa
Version name: 0.3.0-test.733e18b
Min SDK: 26. Target SDK: 34 (field QA only).
Debug signing: verified v2/v3 by Android SDK apksigner, cert SHA256 f656efdd810c9ddc88173dfa5b23c424d6a973f88f36ee06b063fd41c13505a8.
ZIP alignment: PASS. Native APK manifest and launcher icon verified.
HTTP delivery: GET localhost:52871 round-trip matches APK SHA256 and bytes.

## Gate outcomes
npm test -- --maxWorkers=1 --no-file-parallelism: 577/577 PASS, exit 0.
npm run build: PASS, exit 0.
npm run qa:bundle: PASS, exit 0 (entry reduction 20.7 percent).
npm run qa:mobile on local preview: BODYFORGE_MOBILE_E2E_PASS, exit 0 (Windows headless Chrome, NOT native APK).
Android SDK aapt2 resources + manual asset packaging + javac + d8: PASS.
Android debug APK signing apksigner verify: PASS.
Full final APK archive read-back: 50/50 web asset SHA256 checks PASS, dex present, no backslash/traversal member paths, 57 archive entries.
Cross-copy and HTTP round-trip SHA256: PASS.

## Privacy, compatibility and limitations
No Firebase deploy, Play upload, git push, ADB install or device settings change.
Existing browser saves will NOT migrate automatically into WebView app storage. Do not delete browser data.
Camera requires Android runtime permission and online MediaPipe WASM/model requests from cdn.jsdelivr.net and storage.googleapis.com. Native WebView camera, GPU/WebGL, file downloads and field accuracy are NOT YET VERIFIED on a real phone.
APK is a debug/field-test build, NOT a Play-ready release. It uses a distinct Android package ID, ru.bodyforge.fieldqa.
It serves bundled HTML/JS/CSS/GLB through intercepted HTTPS appassets.androidplatform.net; no external native dependencies added.
No Health Connect, server accounts or raw camera upload implemented.
Original web source files are untouched. Source staging in ignored .bodyforge-qa; only these audit files under docs/audits were added.
Rollback: remove only named APK copies and this audit folder/staging. No reset/clean/rebase.

## Manifest receipt
Manifest: docs/audits/BF_ANDROID_APK_20261110/manifest.json
Manifest bytes: 13789
Manifest SHA256: 69A2FAD1CC53E2693956453762ECCE65E797A3AA8BFAB91B1DFC490FA450E382