# BF-102 / BF-005 - browser isolation and seeded crash boundaries
HEAD: 6b2319ac517883857aad2140e50e09c229d63245; observed: 2026-11-24T21:24:27.5536974+03:00.
Status: QA helper and seeded-crash path IMPLEMENTED / TESTED_LOCAL. Full BF-102 camera-to-journal suite PARTIAL, not accepted.
Four owned QA files only. No game source or profile writes, APK, Firebase, Git stage/commit/push, dependency changes.
New shared Chrome isolation validates disposable DevToolsActivePort browser UUID and exact page endpoint before creating or closing targets. Wrong dev/preview environment exits 14 before browser launch. Bounded Windows cleanup. Eight node:test ownership cases PASS. All four node --check and git diff checks recorded.
Initial current source freeze aborted when Avatar3D.tsx changed during copying. Second attempt failed on PowerShell nested JSON array before copy. Python freeze then verified previous 227-file product snapshot with four current QA files (229 files). No concurrent avatar edits overwritten.
Frozen full product unit 637/637 in 62 files, tsc -b, Vite build, bundle exit 0. 59 build files, index and entry bytes matched HTTP preview 5196. Same build manifest as prior BF-102 identity snapshot. Wrong-origin journal and multitab exit 14. Stable dev 5197: multitab 31/31, exit 0, owned cleanup PASS.
Full journal: exit 16 after 32 PASS assertions; timeout 20th rep queues its journal write in queuedCompletion; zero actual renderer crashes in that run. Synthetic profile remained unpaid (0 XP, 0 coins, no workouts or local pending entries). Cause unproven, not classified as a product defect or success. Owned profile and dev stopped.
Added independent --seeded-crash-only scenario and camera-boundary diagnostic; full test assertions and timeout unchanged. First seeded launch blocked by occupied port 5198 before starting server; used a free port 5200 with exact PID ownership. Final snapshot source bytes verified, same product bytes and updated QA script only.
Seeded test: 18/18 PASS, two actual Chrome renderer crashes, exit 0. Strict IndexedDB staged exact fixture, first crash before wallet award, second after verified primary before journal removal. Both recovered one workout, 185 XP/65 coins, one floor and settled durable receipt, exact profile bytes after reload. Cleanup PASS attempts=2; server stopped. This validates persistence with seeded completions, not camera accuracy or end-to-end finish from a real person.
Final current source drift vs tested snapshot: 11 changed, 7 new. Owned file hashes match; current full tree not inferred green. diff=0 staged=0 canon=0; existing dev/preview HTTP=200/200; test port listeners=0.
Next: diagnose synthetic camera progression with QA_CAMERA_BOUNDARY_DIAGNOSTIC, rerun full qa:journal; preserve 20-rep and reward thresholds. BF-102 full acceptance still pending. No physical device, power-loss or production live verification.
Rollback: restore exact before copies of existing scripts only if their final hashes match; remove two new helper files only if hashes match; never reset/clean other changes.
Commands: node --test qa/owned-chrome.test.mjs; vitest run --maxWorkers=1 --no-file-parallelism; tsc -b; vite build; node qa/bundle-on-demand.mjs; node qa/multitab-e2e.mjs; node qa/journal-e2e.mjs; node qa/journal-e2e.mjs --seeded-crash-only.
References: https://chromedevtools.github.io/devtools-protocol/tot/Page/ ; https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability .

## Owned fingerprints
qa/journal-e2e.mjs | 56915 | 3cb62fc8c3296e432f312b66b299f6e08ff0afb5a0e16ec3faf973f194b3de5d
qa/multitab-e2e.mjs | 25661 | 5d31989d6d52e239080cd0e8f66d5f4c671f57c7461ec76c793a0b090043f225
qa/owned-chrome.mjs | 6244 | 74e48a598f39c0aafe5148adf936abfe124e125ab4420ddf71e0b09ab471bcb1
qa/owned-chrome.test.mjs | 1457 | e8c50ed1a87a9a60f48701f493817b62b997836c375fece720da261814403fe0
