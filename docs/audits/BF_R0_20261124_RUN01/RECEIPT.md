# BODYFORGE R0 / BF-001 + BF-002 engineering receipt
Observed: 2026-11-24T20:45:37.5405979+03:00
Workspace: E:\github\BODYFORGE
Baseline HEAD: 4ddbfa7e74d876ed866ae5cdb1da9a807fa33095
Current HEAD: 6b2319ac517883857aad2140e50e09c229d63245

## Status
BF-001: PASS (read-only workspace preflight, 255 source inputs fingerprinted, 72 preexisting modified/untracked product files; scope/owner map in source-before.json).
BF-002: frozen snapshot PASS (unit/build/bundle/preview/privacy/mobile). Current working tree: PARTIAL / rebaseline required: concurrent source drift.
No game source, save data, APK, Firebase, Git commit, stage, push or configuration change by this turn. New audit evidence only. No reset or clean.

## Executed gates
git diff --check: preflight exit 0; final exit 
0
git diff --cached --check: final exit 
0
python .iskra/scripts/verify_canon.py: SOT30_VERIFY_PASS, 30 files, 4054425 bytes, exit 0.
npm test -- --maxWorkers=1 --no-file-parallelism: 609/609, 58 files, exit 
0
npm run build -- --outDir C:\Users\gabra\AppData\Local\Temp\bodyforge-r0-20261124-run01\dist: exit 0; 59 hashed files; large lazy Avatar3D chunk (664.68 kB) warning; not a gate failure.
Unchanged qa/bundle-on-demand.mjs executed with cwd owning isolated dist: exit 
0
; entry 394235 bytes (20.6% reduction), MediaPipe 154276 bytes separate.
Owned production preview http://127.0.0.1:5177: HTTP 200; index and entry hash matched; entry /assets/index-BCq0olae.js SHA-256 f22f45dde0d1668d4d14b844d10335e4824f3f3b4f067e232fb4dc7da6830db0.
npm run qa:privacy (isolated preview): 12 blocked private paths, exit 
0
npm run qa:mobile (isolated Chrome synthetic profile): 87 PASS lines, exit 0; 0 browser exception/error log lines; 10 screenshots captured; not human motion or physical Android QA.
Isolated preview stopped: True. Existing dev/preview 5173/5176 HTTP 200/200; no processes belonging to owner stopped.

## Drift boundary
The initial snapshot hashes matched after unit/build. Subsequently Avatar3D and new trainers assets appeared. Existing dist/index.html changed during the baseline even though this run built into a new temp outDir; external writer identity unverified. The isolated build manifest and QA script hashes were reverified after browser QA. Do not transfer PASS to new source.
Changed pre-existing paths: 8; new source paths: 4. See source-drift.json.
All pre-existing and new parallel files preserved; exact author unknown. No rollback of someone else's changes.

## Non-claims and next dependency
Field camera accuracy, Android app/sensors, real user storage, live Firebase and commercial release readiness are not verified. No APK made.
Next: refresh exact workspace snapshot and BF-002 gates after the parallel avatar batch stabilizes; then BF-101 reward/finish contract and BF-102 journal. BF-003 ownership fingerprinting is available; no own product files to snapshot yet.
Logs/build manifest are scoped to the frozen source manifest, not a release.
