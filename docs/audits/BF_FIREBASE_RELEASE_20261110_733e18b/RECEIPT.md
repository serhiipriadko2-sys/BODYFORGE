voice=ISKRA; phase=BUILD → VERIFY; intent=BODYFORGE / Firebase Hosting release 733e18b

# BODYFORGE Firebase Hosting — release gate receipt (2026-11-10)

**Final status: PREVIEW DEPLOYED + VERIFIED; LIVE DEPLOY BLOCKED (FAIL).**
The owner requested updating the current Firebase live application. This release stopped before altering the live channel because the required `qa:finish-save` test failed twice on the pinned source. Do not interpret preview success as live deployment or as real-phone field verification.

## A / Intake and exact scope
- Local working folder: `C:\github\BODYFORGE`.
- Fixed release commit: `733e18b5a9c33298b6c4ba9f8389423fb52f9412` (main, 2026-11-10). **Tracked source delta = 0**, before and after the build; one unrelated pre-existing untracked audit receipt was preserved.
- Confirmed Firebase project via CLI: `artful-striker-476211-h4`.
- Confirmed Hosting site (NOT the project's default site): `bodyforge-mobile-20261022`.
- Main live URL: https://bodyforge-mobile-20261022.web.app/
- Previous live build (read directly over HTTPS, including `build-info.json`): `0be3f52d68a3f299357636ad3e262c7ebdbbde90`, built 2026-10-27.
- Only intended external changes: store a **verified rollback clone** of current live and deploy the candidate to a distinct, expiring **preview channel** for this exact site. No database/auth/rules/functions/other Hosting sites changed, no Git push, no live deploy.

## B / SIFT / source of truth
- `package.json`: BODYFORGE 0.3.0 / Vite / React / TypeScript.
- `git rev-parse HEAD`, `git diff --name-only HEAD`, `git diff --check`: fixed HEAD and no tracked local source edits during the build.
- `py .iskra/scripts/verify_canon.py`: `SOT30_VERIFY_PASS` (30 files / 4054425 bytes). This is a corpus-integrity check, not an invoked memory service.
- `firebase.cmd hosting:sites:list --project ... --json`: target site and unrelated default site independently confirmed.
- Live HTTP readback, Firebase CLI channel lists, `build-info.json`, hashes, and test exit codes are the actual QA evidence. Prior chat receipts do not override current failures.
- Official Firebase documentation: https://firebase.google.com/docs/hosting/test-preview-deploy ; https://firebase.google.com/docs/hosting/multisites ; https://firebase.google.com/docs/hosting/manage-hosting-resources .

## C / Decision and rollback
**Decision:** Do not publish the new release to live while the full `qa:finish-save` gate is red. Do not raise its timeout, reduce pose-frame checks, change economy, change storage key, or silently replace the fixture. Older 0be3f52 live remains active.

**Rollback protection created before preview/live:**
- Exact clone command result: `firebase hosting:clone bodyforge-mobile-20261022:live bodyforge-mobile-20261022:before-733e18b-20261110`, exit 0.
- Backup channel: https://bodyforge-mobile-20261022--before-733e18b-20261110-cq5mruww.web.app/
- Backup `build-info.json` reread: `0be3f52d68a3f299357636ad3e262c7ebdbbde90`, identical to existing live, PASS.
- If a later live publication needs rollback while the channel exists, the scoped Firebase `hosting:clone` mechanism can restore that same immutable content version to the live channel; this was NOT performed.

## D / Immutable candidate and preview deployment
- Source was built directly from the tracked-clean fixed commit in the owner's existing work folder. No alternative source clone substituted for the open VS Code project.
- The repository did not contain `firebase.json` or `.firebaserc`. Only an **audit-scoped** `firebase.json` was created here, with `hosting.site` pinned to `bodyforge-mobile-20261022` and `hosting.public = site`. It deploys neither project source nor `.iskra`, Git, local user files or logs. Public stage is `site/`; SPA rewrite leads to `index.html`. Index and `build-info.json` use `Cache-Control: no-store`.
- Generated stage from `dist/`, with `build-info.json` (release commit, UTC build time, exact index JS / GLB SHA256). No raw video, secrets, account records, personal browser profile or health information included.
- Staged artifact: **51 files, 30,722,265 bytes**.
- Stage `index.html` SHA256 `1f8b32d5379d9520ef8fb1b1932077dca44f54b9727fdcd8bf1c64ff8e0e1e72`.
- Entry JS SHA256 `daabaedc8905fee384af0c5481f11c62c4598d99277e9e686ac3e023ce19b8f9`.
- GLB SHA256 `df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e`.
- `release_manifest.py build site --output release-manifest.json` and `verify site --manifest ...`: PASS, repeated again after preview.
- `release-manifest.json`: **9,278 bytes**, SHA256 `e0b55c4fb3187627370faafece7b03b4c22c20daecef392fef5f06c454e10d60`. Strict checks: no missing/extra/empty, unsafe paths, symlinks, duplicate/case collisions, generated noise or known secret markers.
- Preview command: `firebase hosting:channel:deploy bf-733e18b-20261110 --project artful-striker-476211-h4 --config docs/audits/BF_FIREBASE_RELEASE_20261110_733e18b/firebase.json --expires 7d --no-authorized-domains`. CLI **exit 0**.
- Candidate preview: https://bodyforge-mobile-20261022--bf-733e18b-20261110-0wjverxz.web.app/ ; expires `2026-11-17T18:31:23Z`.
- HTTPS `/`, entry JS, `manifest.webmanifest`, SPA rewrite all HTTP 200. Preview downloaded `index.html` and entry JS rehashed to the staged values above. Preview `build-info.json` commit `733e18b5a9c33298b6c4ba9f8389423fb52f9412`. Existing live and rollback remain `0be3f52...`. No false claim of live update.

## E / QA — green gates and decisive FAIL
| Gate | Result | Release status |
| --- | --- | --- |
| `npm test -- --maxWorkers=1 --no-file-parallelism` | **577/577 PASS**, 50 test files | PASS |
| `npm run build` | TypeScript + Vite, exit 0 | PASS |
| `npm run qa:bundle` | Exit 0; entry **393787 bytes**, **20.7%** smaller than baseline 496761; lazy MediaPipe chunk **154276 bytes** | PASS |
| Release staging manifest build/verify | **51 files** / 30,722,265 bytes | PASS |
| Firebase preview deploy and HTTPS asset hashes | Exit 0, build-info/HTML/JS/manifest/SPA verified | PASS |
| `npm run qa:mobile` with `BODYFORGE_QA_ORIGIN=HTTPS preview` | **86/86 PASS**, exit 0 at 390/360 px; synthetic camera, 3D, navigation, backup, rewards, GPU pause, lens controls | PASS (headless Chrome) |
| `npm run qa:camera-runtime` with HTTPS preview | **26/26 PASS**, exit 0, on-demand pose and stream cancellation | PASS (headless Chrome) |
| `npm run qa:pwa` against HTTPS preview | Exit 1 before assertions because test explicitly accepts **only loopback HTTP origins**; no source edits | NOT APPLICABLE to HTTPS (initial invocation FAIL recorded) |
| `npm run qa:pwa` on existing local production preview `http://127.0.0.1:5293` | Exit 0; manifest/icons/source-build match, **offlineMode:false**, serviceWorker:false | PASS (supported origin) |
| HTTPS manifest additional integrity | Downloaded preview manifest equals source manifest SHA256; 4 icon definitions | PASS |
| `npm run qa:privacy` on owned stable dev server | **12** private endpoints HTTP 403 and app HTTP 200, exit 0 | PASS |
| `npm run qa:finish-save` first local stable run | Exit **14**, 9 PASS before timeout; in 60 s `poseCalls=301`/320, screen=challenge, no completion state | **FAIL** |
| Same command, isolated rerun without changed thresholds or code | Exit **14**, 9 PASS; `poseCalls=306`/320 after 60 s, no stored workout or XP | **FAIL; LIVE BLOCKED** |
| `qa:journal`, `qa:multitab`, `qa:resilience`, `qa:tower20` for this release | Not run because mandatory `finish-save` failed and the release loop stops on FAIL | NOT RUN |
| Physical Android/iOS manual camera counting/pose accuracy/FPS/energy and real-device HTTPS workflow | Not verified this release (earlier same-day Android note only reports the page opened, not tested interactions) | NOT VERIFIED |

**Failure interpretation:** The synthetic 20-repetition fixture ran only 301/306 pose calls before the wall-clock deadline. It never reached result persistence. No double reward or actual data loss is demonstrated; equally no valid full success can be claimed. A slower/contended Windows/Chrome environment is a plausible `[HYP]`, not a verified root cause. Other Chrome profiles predated this release; they were NOT terminated or altered.

## F / Receipts and read-back
All work recorded in `C:\github\BODYFORGE\docs\audits\BF_FIREBASE_RELEASE_20261110_733e18b\`.
- Release site: `site/` and `release-manifest.json` (manifest SHA256 above).
- Public preview provenance: `preview-http-smoke.json`, `preview-deploy.log`, `preview-index.downloaded.html`, `preview-entry.downloaded.js`.
- Previous live and scoped rollback: `live-build-before.json`, `live-http-before.json`, `rollback-snapshot.json`, `rollback-verified.json`.
- Full test logs: `unit.log`, `build.log`, `bundle.log`, `mobile-preview.log`, `camera-preview.log`, `pwa-preview.log`, `pwa-local.log`, `privacy-local.log`, `finish-save-local.log`, `finish-save-retry.log`. Synthetic screenshot images: `screenshots/` (4 files).
- QA logs with a Windows profile path were redacted. No real user progress or video was captured.
- `EVIDENCE_SHA256.txt`: **39 non-stage evidence files**, hashes and bytes checked, 0 mismatch. 3,852 bytes; SHA256 `7b122588617f45d7217de63d4a3461eb8c4c9a54f1755a3b07e2a604f37bdd96`. It excludes itself and the final receipt.
- Verified source HEAD remains `733e18b5a9c33298b6c4ba9f8389423fb52f9412`, 0 tracked modifications; own stable QA server stopped, owned `bf-finish-save-*` processes/profiles = 0. Existing owner preview on 5293 was not stopped.

## G / Precise lifecycle status
- **CREATED / PACKAGED:** verified stage + manifest.
- **PREVIEW DEPLOYED:** yes, correct Firebase Hosting site, verified HTTPS.
- **LIVE DEPLOYED:** **NO**. Live remains `0be3f52d68a3f299357636ad3e262c7ebdbbde90`.
- **LIVE VERIFIED (new release):** **NO**.
- **Git commit / push by this investigator:** none.
- **P0 release gate:** **FAIL / BLOCKED** by full finish-save synthetic E2E, with same failure on one isolated rerun.
- No unsupported claims of real mobile camera accuracy, Health Connect, cloud sync, offline SW, frame rates or player counts.

## H / Next reversible ≤15-minute step
Reproduce the 60-second `qa:finish-save` sequence with a scoped FPS/pose-call timestamp trace and CPU contention observation on an isolated Chrome profile; distinguish blocked/missed inference frames from game-state failure. Preserve the test's 320-call requirement and economy. Do not live deploy until the full test passes and remaining release gates are checked, including physical/mobile field evidence.

## ∆DΩΛ
∆ — verified current committed release and provided publicly accessible Firebase Preview; preserved exact previous live snapshot; **no live update** because the mandatory finish/save test failed twice.
D — Git/SoT and current Hosting readback → rollback clone+verification → unit/build/bundle → deterministic 51-file manifest → Firebase preview → 86 mobile HTTPS + 26 camera HTTPS → 12 private paths + PWA local → repeated finish-save FAIL → halted live promotion → 39-item audit.
Ω — high for the exact deployed preview bytes and reproducible FAIL; unknown for root cause of slow synthetic pose and physical Android behavior.
Λ — reconsider live promotion only when `qa:finish-save` passes without relaxed assertions and remaining release checks/rollback are green.
