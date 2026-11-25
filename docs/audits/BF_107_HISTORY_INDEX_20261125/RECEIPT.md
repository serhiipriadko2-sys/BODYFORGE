# BF-107 - read-only full activity history projection

Status: IMPLEMENTED / TESTED_LOCAL for the activity index and its visible coverage; BF-107 full retention/migration remains PARTIAL.
HEAD 664ab80c89b244bab1014ec5c652d11c6a490470; observed 2026-11-25T18:51:42.115038+03:00.
The local profile remains the only wallet. A read-only projection combines exact current profile receipts with settled, canonical, same-fighter IndexedDB originals whose IDs occur in the stored paid ledger. Conflicting facts are excluded, pending/quarantined/foreign/unpaid results are not admitted, and a capped history is considered complete only with explicit retained identities and matching workout/repetition/hold totals. No dates or rewards are synthesized. No journal rows are pruned. The index checks the saved revision and epoch under the existing profile lock. The Camera activity card refreshes when visible and cancels stale requests; without full coverage it displays lower bounds.
Browser production fixture: 65 paid workouts, 60 visible records, five older settled originals and one duplicate visible ID. 7-day comparison: 64 current, 1 prior, 1280 reps, 2 active days; 30-day: 65, 1300 reps, 3 active days. The earlier incomplete fixture continues to omit unknown dates. All localStorage key/value bytes and each IndexedDB original key/raw/base/state/schema preserved across viewing and reload. This does not prove camera validity.
Focused tests 20/20; first fixture run 19/20 because the synthetic plank lacked its required holdSeconds=30; only fixture corrected. Full Vitest 824/824 in 86 files; TypeScript, Vite build and bundle gate exit 0. Production forge 82 PASS lines, privacy 13 PASS lines. Initial mobile gate exit 12 on CDP Unable to capture screenshot after all backup inspection assertions; repeated unchanged build, new disposable browser and port, mobile exit 0 with 88 PASS lines. Both owned preview servers stopped; no change to app code between runs.
Frozen inputs 295; build 72 files. Entry assets/index-AnS-iAfD.js SHA-256 7ab6276752ef440234c1e07a39e30d998a41c98c986a731c1ecb4cdfcc8c5abf; 388964 bytes, 21.7% below 496761 byte baseline. Camera chunk 154276 bytes. Large-chunk warning remains. Production preview HTTP 200 and exact entry/index checks. PNG headers and hashes verified for 21 captures; no independent visual inspection claimed.
Current tree parity: 0 changed, 0 new paths versus frozen source. diff=0, staged diff=0, canon=0, syntax=0. See final-readback.json for exact paths. Do not extrapolate test results to untested parallel work.
Limits: no persistent history migration or new retention database schema, no recovery of already lost dates, no physical-device/power-loss/eviction test. Explicit retention rules and safe preservation of uncapped legacy raw history before normal saves are still required. No owner progress accessed, modified or exported; no APK or Firebase publication; no Git commit/push.
Rollback: restore only the exact pre-edit progressPulse.ts.before, ProgressPulseBoard.tsx.before and forge-home-xp-faq-e2e.mjs.before after matching owned hashes; remove only the two unchanged new activityHistory files. Preserve all parallel avatar changes.
Commands: npm test targeted activityHistory/progressPulse; vitest run --maxWorkers=1 --no-file-parallelism; tsc -b; vite build; node qa/bundle-on-demand.mjs; node qa/forge-home-xp-faq-e2e.mjs; node qa/mobile-e2e.mjs (one unchanged-build retry); node qa/privacy-server-e2e.mjs.

Owned paths | bytes | SHA-256
src/lib/activityHistory.ts | 6496 | d0ded94810f5ff40e0df2e573580709770c7f543a15d79148f6953648e6ec2d8
src/lib/activityHistory.test.ts | 5598 | 039ff632f4db51bcc5cae7a430a3d532249a705bb16a64aba18493d4d324f2a0
src/lib/progressPulse.ts | 4187 | ca7b38ff227080011c97d5094e20c2ba0d79fa69e6f5b4c2da31e8b704529b04
src/components/ProgressPulseBoard.tsx | 17674 | 05458c68e1b83725aae0b18d481547298e57615e2a02cd6cbab31efe93e6889b
qa/forge-home-xp-faq-e2e.mjs | 29517 | efdb1cf0cf9755fefe1348fcf0a598f5f4d96f4682f26b1886d4601bd31c6e7c

Reference: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
