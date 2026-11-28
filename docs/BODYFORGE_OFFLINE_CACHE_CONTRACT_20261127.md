# BF-604 — offline cache integration contract
Date: 2026-11-27
Status: accepted engineering direction / scoped implementation, not production activation.
Source: BODYFORGE_MASTER_ROADMAP_20261124.md BF-603, BF-604; BF_604_EGRESS_AND_REGIONAL_BASELINE_20261127/RECEIPT.md.
Context: verified isolated experiment passed 30 assertions; production app still uses the online pose URLs. Existing release boundary checks exact build output. Concurrent avatar work and the owner-accepted regional progression must remain untouched.

Decision: extract a reusable, typed cache engine into src/lib/offlineCache.ts. The future root service worker receives an immutable generated manifest, never a network-provided arbitrary list. Shell and full-training manifests are distinct; training requires every exact pinned WASM/model asset. Cache keys are version-scoped by SHA-256 of canonical manifest contents. New and interrupted installations verify every resource before writing a commit marker. Cached reads verify the exact bytes; online repair accepts only the version's original hash. Unknown URLs and non-GET are not intercepted. No user-data storage, automatic download, registration, release or third-party redistribution in this step.
Alternatives: unverified cache.addAll, opportunistic runtime cache, destructive cache clearing, or immediate forced activation rejected because partial installs, cross-version assets and profile risk would be difficult to diagnose.
Consequences: SHA verification consumes CPU; 128 MiB total/32 MiB file limits bound allocation. Browser quota/eviction must be reported honestly. CacheStorage is not durable storage; old versions are retained rather than deleting an active one. Single root registration and writer per version are preconditions. Do not equate ready shell with ready offline training. Future integration must define bounded retention, update and recovery UX, policy/notice review, exact build manifest generation, registration consent and real browser/device tests.
Test scope: manifest validation, pin drift, interruption/resume, quota, cleanup, corrupt update, version isolation, read/repair, eviction, no unknown URLs. No user data read/write.
Rollback: remove only the newly created matching files; no edits to current UI, App, Vite config, public assets or storage.
Sources: https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil ; https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers ; https://huggingface.co/litert-community/MediaPipe-PoseLandmarker-Lite .
Delta: reusable production-source cache foundation.
Trace: subsequent local tests and receipt.
Confidence: implementation and test outcomes only.
Revisit: worker adapter, build integration, actual browser lifecycle and current-tree release gate.
