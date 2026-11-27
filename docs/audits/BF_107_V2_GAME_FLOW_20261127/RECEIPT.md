# BF-107 - keyed v2 production game flow

Status: IMPLEMENTED / TESTED_LOCAL for new opt-in browser acceptance scenario. No production business-logic change in this step; the existing v2 facade is exercised through the actual hashed application bundle.
Frozen HEAD 5ef0bb170cfa411e5c9bf8be95739c6e85104d1e; current HEAD 5ef0bb170cfa411e5c9bf8be95739c6e85104d1e; observed 2026-11-27T15:08:37.120259+03:00.
Scope: qa/tower20-e2e.mjs --journal-v2; the mode requires a pinned production preview and uses the existing finite timestamp-paced synthetic squat fixture. New disposable Chrome profile only, no owner save, camera or Downloads. The harness explicitly prepares an empty v1 database with native v2 metadata (not the production activation API); actual preparation API remains covered by separate native journal QA. Uses the existing final-floor fixture with prior four floors seeded, not a proof of playing those floors.
TypeScript, full Vitest 1186/1186 in 111 files, build and bundle exit 0. Native IndexedDB 110 checks; new production v2 game flow 77 checks. Tower finish + ordinary finish use real app counter, rewards, journal and renderer. A partial stopped attempt earns nothing. Ordinary settlement creates a real compact record under the original key.
Simulated wallet rollback restores the pre-workout primary and fallback at reload, preserving the settled IndexedDB. Startup replays once and restores exact post-workout primary/fallback bytes; packed bytes and revision unchanged. This is a controlled browser data-loss fixture, not a physical power-loss measurement.
UI backup uses real prepare and second-click download, intercepting only the disposable Blob. Independent Node gzip decoder and SHA-256 verify each logical original; v1 backup schema contains exact originals. Selected file preview/cancel preserve pair and physical journal. A nickname-only synthetic file replacement is explicitly staged, reloaded and rolled back; a second gzip replacement is explicitly kept, reloaded and checked with exact paid IDs and unchanged physical journal. No new reward on import. Profile epoch changes only on explicit keep.
Final synthetic sample: 2 workouts, 360 XP, 120 coins, 2 durable records including 1 compressed, revision 6.
Production mobile 124 and privacy 13 PASS lines. Preview HTTP 200; entry and pose digests verified. Entry 383784 bytes vs 496761, 22.7% reduction. Existing large chunk warning remains. No field pose accuracy or physical Android claim.
Verified 358 frozen source paths, 79 build paths, 11 PNG signatures/dimensions/hashes (not independent visual review). Owned QA file matches workspace. Other live drift: 1 changed, 0 new paths; see final-readback.json. Both owned servers stopped and dependency junction removed; shared dependencies unchanged.
Diff check=0; canon=0; QA syntax=0.
Remaining: physical-device storage pressure, performance, lifecycle and actual activation/recovery acceptance; roadmap not complete. No APK, Firebase, Git commit or push, no owner DB activation. Source-only rollback: restore only qa/tower20-e2e.mjs from exact .before after verifying its current SHA-256; preserve other work.
Commands: node --check; tsc -b; native durable-journal-e2e.mjs; full Vitest threads; vite build; bundle gate; production tower20-e2e.mjs --journal-v2; production mobile/privacy; verify_canon.py.

Owned path | bytes | SHA-256
qa/tower20-e2e.mjs | 37860 | 32192951ee90214a4db04ddf575eb39dbe69e067b7694a8f1ffece2f879bfa56

Reference: https://www.w3.org/TR/IndexedDB/ (transaction and upgrade scheduling).
