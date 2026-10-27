# BODYFORGE · Comprehensive local QA and change receipt · 2026-10-27

**Lifecycle:** TESTED-LOCALLY. This report is not a Firebase release receipt, Android hardware acceptance, or a claim of independent production deployment.

**Workspace:** `C:\github\BODYFORGE`, branch `main`.
**Observed HEAD:** `dcd2471ec7eabcf0f564c6ec077745b15edda769` (`complex`; concurrent operation, **not committed by this QA work**).
The previous baseline for this task was `06d5702f5108af7774a5f4a0ea2808c533a256ba`. A concurrent operation committed a subset of the changes while tests were running. Therefore some files below are already tracked in HEAD, while other hardening/test changes remain uncommitted. `origin/main` pointed to the same SHA locally; live GitHub and Firebase deployment were not verified in this receipt.

## What changed

1. **Manual local backup:** a two-click JSON export section on the dashboard for created fighters. The first click reads data including IndexedDB, and the second click requests a local browser download. No automatic upload or import, no reward mutations.
2. **Lossless evidence:** export includes raw browser profile/backup, workout journals and quarantines, appearance, avatar look, manual steps, daily plan and original corrupted profile quarantine entries. Unknown/corrupt bytes remain untouched. Missing storage is flagged; a RAM-only profile is not labelled a complete backup.
3. **Stale data guard:** a prepared snapshot is invalidated when the app profile changes, training makes controls unsafe, or another tab signals changed BODYFORGE storage. Disabled controls prevent downloads during camera/loading or pending profile writes.
4. **Visible mobile help:** Android Chrome / iPhone Safari web-app installation guidance inside the backup panel, plus updated `docs/MOBILE_INSTALL.md`. Downloaded JSON does **not** automatically move progress to a new device.
5. **3D battery and resilience:** `ResizeObserver(onVisibility)` recalculates pause state when the WebGL canvas collapses; prior `redraw`-only behavior could leave RAF active after CSS hiding. The 3D error E2E test was corrected to scroll the on-demand avatar into view before triggering the intentionally blocked module.

## Verification run on the connected Windows PC

| Gate | Observation |
|---|---|
| `npm test -- --reporter=dot` | **PASS, 473/473 tests, 41 files** |
| `npm run build` | **PASS**, TypeScript + Vite |
| `npm run qa:bundle` | **PASS**, initial JS 396717 bytes; 20.1% smaller than 496761-byte baseline |
| `npm run qa:pwa` with local loopback | **PASS**, manifest, 4 raster icons and HTTP paths; offline not supported |
| `npm run qa:mobile` | **PASS**, disposable Chrome; creation/persistence/3D/camera/MediaPipe/WakeLock/two-click JSON/cross-tab invalidation/mobile viewport |
| `npm run qa:resilience` | **PASS**, 63 assertions; lost permission/model/3D fallback; corrected on-demand chunk test |
| `npm run qa:multitab` | **PASS**, 31 assertions; stale concurrent saves fail closed |
| `npm run qa:finish-save` | **PASS**, 28 assertions; quota failure, resume, exact-once bonus and export on conflict |
| `npm run qa:avatar` | **PASS**, 21 assertions; background WebGL draws = 0 |
| `npm run qa:tower20` | **PASS**, synthetic twenty repetitions, one session and one reward |
| `npm run qa:pulse-armory` | **PASS**, 54 checks, editor persistence, no uncaught browser JS |
| `npm run qa:privacy` | **PASS**, 12 private dev paths refused (HTTP 403) |
| `git diff --check` for tracked scope | **PASS**, code 0 |

## Scoped file inventory

At inventory time, **13 ordinary files**, combined **205068 bytes**. SHA-256 values are read from the Windows file system. For shared files like `src/App.tsx`, `src/components/Avatar3D.tsx`, and QA scripts, checksums cover the entire current file including other concurrent edits; they do not attribute every line to this work.

| Relative file | Bytes | SHA-256 |
|---|---:|---|
| `src/App.tsx` | 77115 | `0aef8b414ae4e93b2dccd0f2d9e91d6d1ca5a6f71984bdbfed59972e9de378b4` |
| `src/components/Avatar3D.tsx` | 40939 | `d8e06fb94ecf1500534c3eb349624f4ce373910e51e8dd6a977b6960f6432322` |
| `src/components/ProgressBackupPanel.tsx` | 6061 | `eeddc039e2dfc6a0dfb4bd2fc207ee068c3cd34c8c69b298b0cdff17ed89a60b` |
| `src/components/progressBackup.css` | 2376 | `9a57d7c5b5ef0e75de910481eee9c20183a1ec0401bc10b271d432c7ba1d56bb` |
| `src/lib/progressExport.ts` | 2483 | `a45520a55eedb0a9f6085e46e7ffb7ee18b972d0cfba585d1d453e53a19e9310` |
| `src/lib/progressExport.test.ts` | 7808 | `a51a4b2bdc9e53d3b6cd3fd5b5c7f98d4b69be842d0dacdc8efcd7aa010dcb11` |
| `src/lib/progressBackup.ts` | 2700 | `3a4c16bbc2b73f402ebbcc53370a755a61f07fbc07c831b136c86aa6bcd3c173` |
| `src/lib/progressBackup.test.ts` | 6601 | `92abe977fe5bcf8b10f397bb859a705fc9299593b963942a3f59e2f35baf70cc` |
| `src/lib/profileQuarantineExport.ts` | 1441 | `94c1a5450b415340aee13b076a34adc3febfdebc6d2a261786389f29db522cb1` |
| `src/lib/profileQuarantineExport.test.ts` | 2436 | `22475de18d901577e76f87d569692b341ba51b5613422279ea952638ec36dbb5` |
| `qa/mobile-e2e.mjs` | 27998 | `e3da35babed0e232ed6a9e98f0eb8489daafc89d6569b7d360705e1984d3c6a4` |
| `qa/resilience-e2e.mjs` | 22394 | `2dc5a3e27b8271b3738e67e4a9e608d26e32054e1c9e76dcd7d117c593fbbf55` |
| `docs/MOBILE_INSTALL.md` | 4716 | `e8ae225a70dd120d01af90f6f5205036d5d4a231b2eff5a2f247d0384de2a11e` |

## Explicit limits and next release gate

- This is an **engineering QA snapshot**, not a frozen full repository artifact. Changes can drift during parallel work; repeat hash/QC before any merge or deployment.
- A few related files remain uncommitted after the concurrent `dcd2471` commit (including local profile quarantine exporter and later E2E hardening); a commit/push/invocation is not implied by local files.
- **NO Firebase deploy** or live Hosting verification was performed during this task. No production rollback state was changed.
- **NO physical Android/iPhone tests** or measured physical camera accuracy. Browser QA uses synthetic streams. Experimental detectors need device acceptance.
- **NO automatic backup import**, no cloud sync, no offline service worker. JSON may contain private training progress and nickname: keep it protected.
- 3D lazy JS remains about **652KB uncompressed**; consider a dedicated optimization pass and WebGL memory measurement on physical phone.
- Before publishing: freeze exact tree/commit; re-check origin and Firebase site; rerun full QA and physical Android camera/install test; verify preview rollback and deployment read-back.

**Receipt classification:** LOCAL PASS, production release NOT VERIFIED.

