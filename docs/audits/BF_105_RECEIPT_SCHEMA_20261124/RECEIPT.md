# BF-105 - unified receipt compatibility engineering receipt

Status: IMPLEMENTED / TESTED_LOCAL for the adapter and receipt round-trip on exact frozen inputs. Full migration activation not accepted; no import or new economy.
HEAD at verification: 7caa598c873c92887ac2ae3071b13f433225312e; observed: 2026-11-24T22:28:14.150136+03:00.

Consolidated our preview around the separate parallel workoutReceipt.ts contract. No overwrite of parallel progression, avatar, camera or receipt writer work. Old/future/malformed optional receipts stay opaque. Recognized grants are local evidence, not authorization or a reconstructed lifetime ledger. No owner save accessed.
Initial pre-consolidation snapshot: 687/687 Vitest; TypeScript/build/bundle/privacy passed. Forge timed out in Runtime.evaluate and left a locked owned Chrome profile (EPERM). Verified exact temp profile/UUID/PID, cleaned only that process group; forge-cleanup-readback.json proves zero remaining owned processes/listeners and profile removed. No full Forge PASS for that attempt.
Consolidated targeted: 54/54 in four files; 22 compatibility tests including 72 deterministic histories and mixed old/new/opaque records. Initial browser run saved mixed profile and hydrated app but failed read-only measurement at reload while instrumentation spanned async import. Corrected QA only: resolve imports before instrumenting synchronous preview. Original failure retained.
Frozen product: 249 files; six overlays on previous verified source; unrelated parallel avatar/camera work not incorporated. 694/694 in 69 Vitest files; TypeScript, Vite build, bundle exit 0; 62 build files. Existing >500 kB warning remains. Entry 397014 bytes (20.1% smaller than historical baseline), lazy pose chunk 154276 bytes.
Exact production entry assets/index-BWQFEm80.js SHA-256 950f8964426aa7b5808977eea3b2a0b382daebd5553d4b3d42b3edff3b2d1f74; HTTP index and entry read-back 200. Privacy 12 checks passed; all frozen source/build bytes rehashed.
Corrected harness on the same frozen product: 33/33 PASS, exit 0. Actual Web Locks/saveProfile/localStorage backup/read-back and app reload. Fixture retained 705 XP, 300 coins, 3 workouts, 40 reps, 30s plank, tower floor 1, 20 ghost splits, 2 owned outfits, four muscle levels, three credited session IDs. Old record has no inferred grants; new records preserve exact 120/35, 120/35 and 65/30 recorded deltas. Preview called no Storage/IDB APIs, raw and backup unchanged, unsafe JSON rejected, no uncaught browser exceptions. Cleanup PASS; test servers stopped.
Live tree differs from tested product in 5 known paths and 8 new paths (see consolidated-readback.json); no whole current-tree PASS. Final diff=0, cached diff=0, canon=0, QA syntax=0. Earlier parallel whitespace observation was not edited.

Owned final paths (path | bytes | SHA-256):
- src/lib/receiptCompatibility.ts | 12062 | 5312e5013f21eebea0ac5544858fc822aa4bb4ace650d7bf9c13249d4a04c471
- src/lib/receiptCompatibility.test.ts | 10770 | 1585e9aff81ed6ecb4f4ce349c4cf8a743124cbcbbe7ae4167a0da31b271f85f
- qa/receipt-preview-e2e.mjs | 12016 | 8ce311347cf7cbaf25b334df460f093e7ca32557dbcb5ef34a9107fbcc7d77cc

Rollback: restore receiptCompatibility.ts.pre-consolidation and receiptCompatibility.test.ts.pre-consolidation only after matching final owned hashes; remove only new receipt-preview-e2e.mjs if unchanged. For full module rollback remove only our new files after matching hashes. Do not revert parallel writer or other work.
No dependency changes, owner save writes, Git stage/commit/push, APK creation or Firebase publication. No real-device/power-loss verification, no full-history reconstruction, no activation. Adapter not yet wired into app UI.
Next: BF-106 preview-only backup inspection and staged import plan; actual replace remains separate and explicit.
Reference: https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability (strict durability is a hint, not an absolute power-loss guarantee).
