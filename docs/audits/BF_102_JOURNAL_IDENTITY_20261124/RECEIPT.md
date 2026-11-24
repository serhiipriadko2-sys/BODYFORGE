# BF-102 / BF-103 - journal identity recovery engineering receipt
Observed: 2026-11-24T21:07:12.6224358+03:00; workspace E:\github\BODYFORGE; HEAD 6b2319ac517883857aad2140e50e09c229d63245.
Status: IMPLEMENTED / TESTED_LOCAL for malformed journal identities, exact quarantine and dedup recovery. BF-102 complete fault-injection suite and BF-103 wider economy checks not completed in this batch.

Previous BF-101 timed-hold patch preserved. At intake all 272 RUN03 source fingerprints matched. No changes to progression.ts or exerciseRewards.test.ts. Owned files are workoutJournal.ts, durableWorkout.ts, new journalIdentity.test.ts, and qa/journal-e2e.mjs. Existing dirty files preserved; exact before bytes of changed files retained.
Problem: validId allowed lone UTF-16 surrogate session IDs. encodeURIComponent threw URIError outside protected storage code. A malformed record hid valid neighbors; a malformed source key could not be quarantined. Confirmed by seven failed tests before production patch; two compatibility tests passed. No claim of a remote attack or of observed damage to the owner profile.
Fix: validate session encoding at new journal envelope boundary; preserve historical IDs. Existing well-formed quarantine keys remain identical. For unencodable keys use an unambiguous %u16: prefix and fixed-width UTF-16 code-unit hex, not replacement-character normalization. Reuse key builder for local quarantine and durable replay. Exact raw records remain available for explicit recovery/export, not rewards.

RED: journalIdentity.test.ts 7 failed / 2 passed, exit 1. GREEN: 137/137 targeted tests in 7 files, exit 0. Nine new regression tests, including exact legacy history preservation and valid Unicode dedup.
First full workspace unit run 633/633 exit 0; Avatar3D.tsx changed concurrently during that run, so build and browser gates stopped. To avoid interfering with concurrent art edits, froze 227 src/public/qa and root build inputs under ignored .bodyforge-qa/bf102-journal-identity-20261124; copied bytes verified; no secrets, owner profile or private config copied. Dependencies resolved from parent workspace; no new dependency.
Frozen full unit: 637/637 in 62 files, exit 0; tsc -b and Vite build exit 0; bundle gate exit 0, entry 395133 bytes (20.5% smaller than recorded historical baseline), camera chunk separate 154276 bytes. Existing large-chunk warning remains.
Frozen production preview 5194 HTTP 200 with exact index and entry bytes; entry assets/index-HrVzpOmR.js, SHA-256 812936a2f4985bae2ea0a2317eca01d85a949161ed4ccddd7560c2bfda636f04. 59 build files. Stable dev 5195 (HMR disabled) used for actual browser storage tests importing source modules.
Browser qa/journal-e2e.mjs --identity-only: 18 assertions, exit 0. Four distinct malformed originals retained in real localStorage and strict IndexedDB; explicit confirmation/quarantine, export, reload, and durable mirror repair preserve exact source key/raw bytes and unchanged wallet. No renderer crashes in this scenario.
Browser qa/journal-e2e.mjs --dedup-only: 34 assertions, exit 0. 65 synthetic workout IDs (60 visible history), 7800 XP / 2275 coins, two reloads, explicit backup restore and actual cross-tab storage event. No camera invoked; owner profile never accessed.
Frozen source and build hashes verified again after both browser runs; both owned servers stopped. No product source outside the four owned files was modified. No game economy rule, profile migration, APK, Firebase, Git stage/commit/push or external publication.

Final read-back syntax=0 diff=0 cachedDiff=0 canon=0; owner dev/preview HTTP=200/200; owned port listeners=0. Current live source drift vs frozen copy: 1 changed, 0 new paths. See final-readback.json. Full current live-tree PASS is not inferred if unrelated work changed.
Rollback: compare current owned hashes; restore the exact .before files only if unchanged since this batch; remove only the new journalIdentity.test.ts if it still matches its owned hash. Never reset/clean or overwrite parallel edits.
Next: BF-102 full journal crash boundaries and BF-103 remaining purchase/date/ID contracts after rebaseline; no new economy schema before ADR. Physical Android and production live surfaces not verified.
References: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent ; https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability .

## Owned fingerprints (path | bytes | SHA-256)
qa/journal-e2e.mjs | 56666 | bbb1f53a3b225739440fefe463bf5da849ce8c45c6efaa307f9ec45c4001b8b8
src/lib/durableWorkout.ts | 6680 | ef70634a334699d18cf381ff118cbe5634f82b206e23da6ba7849a1a35696249
src/lib/journalIdentity.test.ts | 6628 | f50d4a4c582e3a2502f6c8f17181307bb9063db5b8ab556bc47888cb9c5e8dc9
src/lib/workoutJournal.ts | 13219 | 851ff0697a44fb17a157a9589d93c17c2f51088ec950c356e3c6ac5edeb70999
