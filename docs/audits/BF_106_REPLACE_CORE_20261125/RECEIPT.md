# BF-106 - isolated profile replacement core

Status: IMPLEMENTED / TESTED_LOCAL for the narrow replacement state machine, explicit rollback and isolated browser crash recovery. Full BF-106 activation is NOT_IMPLEMENTED; no replace UI or startup guard.
HEAD 7caa598c873c92887ac2ae3071b13f433225312e; observed 2026-11-25T16:15:14.675866+03:00.
The exact primary and fallback are staged in a canonical marker before changing either key. The transaction ID is unique; stale confirmation cannot cancel a later identical replacement. Replacement writes and read-back operate on an injected port, with the existing exclusive Web Lock in the browser QA. No general storage mutation API, automatic replay or application wiring added. Successful apply retains marker and requires future finalization. Failures roll back recognized prefixes only, and retain explicit recovery-required status on uncertainty. Cancellation and invalid/stale decisions have zero replacement writes.
Pilot deliberately blocks nonempty pending/durable/quarantine journals, incompatible identity, unsupported full history or missing paid ledger, and different auxiliary data. A complete real-device import is not claimed. No power-loss durability or noncooperative-writer guarantee. Startup/replay/writer guard, locked source collection, retention/finalization and broader import policy remain required.
Targeted: 58/58 in 3 test files, including 20 replacement tests. Full Vitest 742/742 in 75 files. TypeScript/Vite and bundle gate exit 0. Browser QA 52/52, actual Chrome renderer crashes after marker, fallback and primary writes; each new renderer recognizes exact prefix and explicit rollback restores original bytes. Verified fault injections after real writes, cancellation, stale marker, normal reload and actual app hydration only after resolving pending marker. Prior import preview regression 24/24. Both disposable profiles cleaned. Privacy 12/12. No physical device verification.
Frozen inputs 268; output 64 files; production preview index and entry matched exact bytes. Entry assets/index-BOgLCx5a.js SHA-256 b89667b38b64b982688c0cb4826de63d1f35a0558e78641e4a5b9d67c6cdf910. Entry 397283 bytes; camera separate 154276 bytes. Existing large-chunk warning remains. Temporary QA servers stopped.
Current source drift: 1 changed and 2 new paths relative to tested snapshot. diff=0, cached=0, canon=0, syntax=0. Whole current-tree PASS requires parity, not merely frozen build.
Commands: npm test targeted files; node qa/profile-replacement-e2e.mjs; node qa/import-preview-e2e.mjs; vitest run --maxWorkers=1 --no-file-parallelism; tsc -b; vite build; node qa/bundle-on-demand.mjs; node qa/privacy-server-e2e.mjs.
No owner profile reads/writes, APK, Firebase, git stage/commit/push. Rollback of code: remove the three new owned files only if current hashes match; preserve all unrelated work.
Next: wire fail-closed startup and all writer/replay guards, verified source collector and explicit marker recovery/finalization; then run actual integrated app acceptance before enabling user replacement.

Owned paths | bytes | SHA-256
src/lib/profileReplacement.ts | 14300 | 9535349f81f975d8b8874545b8989a7b2c5cc56b08a781f840eba11a2f76401e
src/lib/profileReplacement.test.ts | 11058 | 68d2047871ddbeb33579fd4ae12fdd9cbf68517b24c82dd3a0426bbe10cc77ef
qa/profile-replacement-e2e.mjs | 16823 | 6e2ee1d6f6247c0c58e85a89de3ee84129e629425a1d9bdeec812aebad7fdc64

References: https://www.w3.org/TR/2021/SPSD-webstorage-20210128/ ; https://www.w3.org/TR/web-locks/
