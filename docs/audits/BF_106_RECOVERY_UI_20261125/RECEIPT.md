# BF-106 - explicit recovery UI and locked rollback

Status: IMPLEMENTED / TESTED_LOCAL for explicit rollback of existing replacement markers and normal startup after rollback. Full BF-106 forward import/finalization remains not enabled.
HEAD 7caa598c873c92887ac2ae3071b13f433225312e; observed 2026-11-25T16:50:11.892244+03:00.
Scope: reuse canonical replacement core and parallel startup fence. Locked recovery reads exact primary/fallback, auxiliary values, local/durable journal and quarantine state. It binds rollback confirmation to exact observed marker. Cancel performs no recovery mutation. Unknown, malformed or conflicting marker is preserved. Existing pending result or write blocks rollback in UI. Export requests local download; actual file saving is not inferred. Recovery UI is loaded only on demand; ordinary recovery and quarantine notice remain available in their respective states.
No forward replace button, automatic commit, marker retention/finalization, deletion of durable results, or production/user-profile restore. Independent durable stage can race the profile lock; complete forward import requires a verified coordination/finalization gate. This is not a physical-device power-loss guarantee. No real device check.
Tests: 33/33 focused (20 core, 9 adapter, 4 fence); final full 757/757 in 77 files; tsc and Vite build exit 0. Initial frozen run 756/757: parallel avatar emblem clearance test failed at -1.20742 mm vs -0.5 mm threshold. Parallel avatar correction changed avatarPhysique.ts and added avatarChestMarkFit.ts. New frozen snapshot confirms 4/4 avatar anatomy tests and 757/757 total. No changes to parallel avatar code by this patch.
Initial recheck browser attempts at port 6000 failed before scenarios with TypeError fetch failed; direct Node fetch cause bad port verified. Retried exact same source/build on 6100 with Node HTTP preflight. Final browser: 64/64 replacement with 3 real renderer crashes, exact marker and primary/fallback on cancellation, confirmed UI rollback and reopen, malformed marker evidence export and no normal retry; import preview 24/24; dedup 34/34; privacy 12/12. Disposable Chrome cleaned; test servers stopped. Production index and entry HTTP exact byte match.
Frozen inputs 273; build 69 files. Entry assets/index-mp0A8EyM.js SHA-256 2079ce20d43b3c4132b88fa341ec4b89cce31fabf23405b5be06602cca6243d5; 375329 bytes (24.4% below historical 496761 byte baseline), camera chunk separate 154276 bytes. Previous fence entry 397313 bytes; warning for other large chunks remains.
Live source drift: 1 changed, 1 new paths vs final tested snapshot. diff=0, cached=0, canon=0, syntax=0. See final-readback.json. Whole-current-tree verification bounded by exact manifest parity.
No owner profile reads/writes; no APK, Firebase publication, Git commit/stage/push. Rollback of changes: compare exact owned hashes, restore only App.tsx.before, StorageRecovery.tsx.before, profile-replacement-e2e.mjs.before; remove only new recovery adapter, adapter tests, and new panel if unchanged. ReplacementRecoveryPanel.tsx.before is the pre-wiring intermediate, not the pre-task state. Preserve unrelated work.
Next: design exclusive coordination with independent result staging and durable retention, finalization receipts and full acceptance before enabling actual replace.

Owned paths | bytes | SHA-256
src/App.tsx | 82613 | aed7c608fa02371bf5bc6aaf0620e135a94e37d38ded08ab208de903e512cc3d
src/components/StorageRecovery.tsx | 12356 | e4cb38de47702017a0363f98311df1d042d0a4426705c259d093ee48286a016e
src/components/ReplacementRecoveryPanel.tsx | 6497 | 85b93e874360ac16c9f83a31ce5fd95d43457394f5e1b6827dc490b00f54d7d5
src/lib/profileReplacementRecovery.ts | 5776 | 95fc22c5914fea1e353ef22c91949a12c533cc8a744f2f774c39ce66be2bd43a
src/lib/profileReplacementRecovery.test.ts | 6816 | 9115d63c6379010d2b9ce119c173247321309e56ff0c68e0ed981c3b6bb8c562
qa/profile-replacement-e2e.mjs | 21687 | a1241a154c5d8bc7b4494d89c631d5ff1cc8eb44c59656e1fbfc7a18245e660f

References: https://www.w3.org/TR/web-locks/ ; https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event
