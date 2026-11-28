# BF-105 / BF-106 - current receipt compatibility and safe import local acceptance

Observed: 2026-11-28. HEAD 11d51edf407bed2ad7e1fd0a04332654fe46afcb (existing dirty tree).
Status: TESTED_LOCAL for listed scenarios; not a release or cross-device acceptance. No product source edits were required for this pass.

282/282 focused Vitest tests (18 files). Browser checks: 33 receipt compatibility, 51 import (JSON/GZIP, cancellation, invalid/oversized file, stale approval, staged exact primary/fallback, rollback/keep), 73 replacement including 3 actual renderer crashes, 27 journal coordination, 31 generation fence. All exit 0. Owned cleanup remaining=0 in each of five browser gates. 215 browser assertions total.
469 source/build/QA files matched before/after and current read-back. Dedicated Vite loopback dev origin and private isolated Chrome profiles; synthetic data only. Canon integrity 30/30 PASS. No owner profile, camera, Downloads, v2 activation, commit, push, deployment or APK.
Import remains deliberately restricted to compatible identified fighter, preserved paid history, matching journal/auxiliary state and verified local rollback. Different journals/foreign fighters/unresolved records may be refused. Browser runs do not establish physical power-loss durability.
Reference: https://www.w3.org/TR/IndexedDB-3/

## Evidence
- .bodyforge-qa/bf105-106-local-20261128/run.mjs | 5024 bytes | SHA-256 9048f8c6aedd10d4d024dc0e3b05404d3637c1576848979f365c8670c03d75bb
- .bodyforge-qa/bf105-106-local-20261128/source-before.json | 63630 bytes | SHA-256 0d09e840e8d99d9481942044c3784bc01b1d19dee1b015f4af048dd7fcaf533d
- .bodyforge-qa/bf105-106-local-20261128/source-after.json | 63630 bytes | SHA-256 0d09e840e8d99d9481942044c3784bc01b1d19dee1b015f4af048dd7fcaf533d
- .bodyforge-qa/bf105-106-local-20261128/gates.json | 2090 bytes | SHA-256 78c890766d03823d62b805bc53c4670c1f25dd2b8b9e3794cfbc6999962278fd
- .bodyforge-qa/bf105-106-local-20261128/focused.log | 2609 bytes | SHA-256 998465e8baa4b06af06f49e4a9f4fd22224970a0bdbebf92f544659b9ceccb5a
- .bodyforge-qa/bf105-106-local-20261128/receipt-preview.log | 1833 bytes | SHA-256 6864d2dff3c81326eec2b757aee415580aa84cd91c2a44d3c408d7adddf7935a
- .bodyforge-qa/bf105-106-local-20261128/import-preview.log | 3147 bytes | SHA-256 d57f49e2d0ef607bd1dfaaf9c559d3c5cacb6b3118a87592029c8648158be7db
- .bodyforge-qa/bf105-106-local-20261128/profile-replacement.log | 4082 bytes | SHA-256 5cbdca403a43c87051a5c4a12e063b94b58f38687caf2bbbe0b0e9e23ae0c793
- .bodyforge-qa/bf105-106-local-20261128/journal-gate.log | 1605 bytes | SHA-256 fbd76f62ab646e24a88436a599fa5f6a2798a9f309adba59d1a1b985c1cde50c
- .bodyforge-qa/bf105-106-local-20261128/workout-epoch.log | 1826 bytes | SHA-256 efe2311b6aec211933e96b9450620306ece07eed2bb92e388bf1c0096c01a12f

Next: BF-107 history completeness and bounded retention; production build and full current regression remain separate.
Delta: actual current local compatibility/import verified. Trace: 6 gates, exact manifests. Confidence: high for listed tested paths. Revisit: drift or real-device failure.
