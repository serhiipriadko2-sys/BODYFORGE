# BF-107 - bounded paged readback of existing durable history

Status: IMPLEMENTED / TESTED_LOCAL_WITH_HARNESS_RETRY. Existing journal v1 remains the production authority. Compact candidate caps are unchanged; no production v2 activation or migration.
HEAD 664ab80c89b244bab1014ec5c652d11c6a490470; observed 2026-11-25T21:22:31.420441+03:00.
Decision: replace unbounded getAll readback with sequential pages of at most 32 physical rows in one readonly transaction. Exclusive lowerBound on last validated key, no offset/truncation; every row validated even for a selected acknowledgement. Preserve all original values and order. Readback retains only requested results; full history API still materializes all logical rows. Abort/timeout/invalid page returns unavailable and no partial entries, not proof of zero prior writes. No schema, wallet, existing record format or retention deletion change.
Bounds: maximum 32 cloned records per request, not a strict byte/memory bound, and no arbitrary total row limit. Existing 5s total read timeout unchanged. This does not solve full-history memory cost or candidate 16 MiB / 4096 limits.
Native journal 77/77 checks. Synthetic existing history 4105 rows; 19501560 UTF-8 baseline bytes (not disk usage); new stage exact, 129 bounded pages, max 32 rows, measured 103 ms on local machine; complete read restores all originals. Last-page unknown schema prevents acknowledgement and partial read; cancellation after commit yields unavailable and retry preserves first baseline; later page failure returns no partial result.
TypeScript/build/bundle exit 0; full Vitest 1167/1167 in 109 files. Initial entry 394853 bytes, baseline 496761, reduction 20.5%, gate PASS; existing large chunk warning remains. Privacy 13 PASS lines (12 denied paths plus app HTTP).
First production mobile run exit 12 after 91 PASS lines. Tower DOM/layout check passed; Page.captureScreenshot timed out and disposable Chrome profile removal failed EPERM. This is an incomplete harness run, not proof of an application defect or full PASS. First run log retained. Exact source/build preserved, servers stopped.
One bounded repeat on identical hashed build: exit=0; 124 PASS lines; verified retry pass=True. Original failed run remains evidence. First temporary profile still exists=True; no claim that original cleanup succeeded. No owner browser read or process termination.
Verified 349 source paths, 74 build paths, 16 PNG headers and hashes; no independent visual review. Owned files match; live drift 2 changed and 3 new paths. See final-readback.json. Exact dependency junction removed without modifying shared dependencies.
Diff check=0; canon=0; QA syntax=0.
Remaining: scalable compact integration and versioned authority/recovery, large history full materialization limits and real device/storage pressure tests. Browser storage quota is not guaranteed; no owner profile accessed or modified. No APK, Firebase, Git commit or push.
Rollback: restore only the two owned files from .before copies after confirming their exact hashes. Preserve all parallel changes.
Commands: tsc -b; qa/durable-journal-e2e.mjs; full Vitest threads; vite build; qa/bundle-on-demand.mjs; production mobile E2E (initial + one same-build retry); privacy E2E; verify_canon.py.

Owned paths | bytes | SHA-256
src/lib/durableJournal.ts | 12507 | 3a44acaa602460ae024956a70235a44391e2ecb6aca6fde7a2d9746c8ee5407c
qa/durable-journal-e2e.mjs | 52582 | 404b64c1444e75952ff8cb48e88714278e8ae53c7488f30235357ad8a7d3b899

References: https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/getAll ; https://developer.mozilla.org/en-US/docs/Web/API/IDBKeyRange/lowerBound
