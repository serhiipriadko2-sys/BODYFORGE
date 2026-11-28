# BF-703 — mandatory backup recovery gate and local release verification
Date: 2026-11-27
Scope: local engineering and synthetic release QA; NOT a release authorization or field qualification.
Baseline HEAD: 11d51edf407bed2ad7e1fd0a04332654fe46afcb (dirty working tree preserved).

## Change
qa/release-gates.mjs: insert mandatory synthetic-backup-help after synthetic-screen-content, before synthetic-tower. Uses screenBrowser without optional screenshot output; requires exit 0, BF_BACKUP_HELP_PASS, QA_OWNED_CLEANUP PASS and remaining=0. Existing release gates unchanged.
Before: 11900 bytes, SHA256 9e76bcf4923e41340e54f4a89b34190d5c3586d53c4bdf46cbf7b044b8e9e74e.
After: 12140 bytes, SHA256 22ff534e8382d2e97d9e401fa44379ad081a20ad9a52d65579db3bc0e18832aa.
Scoped rollback preimage: .bodyforge-qa/bf703-recovery-gate-20261127/release-gates.mjs.before (restore only if current target still equals the recorded postimage; do not revert unrelated work).
Prior BF-407 feature and user changes preserved.

## Evidence
Independent sequential reproduction against the previously pinned production build: .bodyforge-qa/bf703-repro-20261127-r2/run.mjs, exit 0, 197.56 s.
Screen ownership 94/94; screen content 15/15; tower 26/26; mobile 124 PASS lines, completion marker and exit 0. Owned cleanup verified. Prior avatar timeout did not recur; root cause remains unproven. Mobile Forge screenshot inspected visually: rendered anatomical 3D hero.
Reproduction log SHA256:
screen-ownership/console.log 4c68b4f20032400618899a1878a0335048a90e14d0a65994ee69ed4e3c04d1ab
screen-content/console.log 0d8734c0aebb4f25b38782d13c7c6403a319c78750e3f01bc05f311321458640
tower20/console.log b8bb9e3f35af5f375597ce233feabf8923ccdb74a9247706f57ae663cb9ee71c
mobile/console.log 64a4207216affab29b8b25b12c3d49334a7927cc806540ca6222c65dae55d039

Integrated command: node qa/release-gates.mjs in isolated snapshot-real under .bodyforge-qa/bf703-recovery-gate-20261127; JAVA_HOME scoped to installed Android Studio JBR. Physically copied installed dependencies, excluding temporary caches. Root dist and actual player profile not used for synthetic testing.
Observed process exit 0, elapsed 393.78 s, tested-local, stage read-back, 23/23 gates PASS, no mobile replay.
Gate names: resource-unit, artifact-unit, owned-browser-unit, native-policy-unit, native-policy, offline-runtime-unit, offline-runtime-pins, field-metrics-unit, owned-browser-recovery, unit, types, artifact, bundle, pwa-install, private-path-fixtures, preview, privacy, synthetic-screen-ownership, synthetic-screen-content, synthetic-backup-help, synthetic-tower, synthetic-mobile, read-back.
Native: source-only; packaging not-run; field not-run. Offline: pinned-installed-bytes; model not-verified; inference not-run. fieldDevice not-run. Optional private research fixtures may be skipped in clean snapshot; no claim of full research coverage.
Stable input count 422. Runner source SHA256 8a582692a6a7c384e8c8ad90158ea0d87c5a936398b10e0e3ed7c69af9d42fa1.
Source-before, snapshot-real-before, source-real-after inventories: each 43059 bytes, SHA256 09396987b89ffe1436817d9aecd0370d8ea79437849a31864f9e3ea44d8cf05. SOURCE_DRIFT=NO. HEAD unchanged.
Distribution: 76 files, 35919679 bytes. All 76 files equal previous BF-407 isolated dist by hash. Served index HTTP 200; SHA256 035590f8e2726bfc523022b65bfb70d49cb9122ceed45b8ffa94cd06f2654c07; entry SHA256 8f0e96eda920b04b653ed93e6b13f07318914d1546fbe731dd9062e8af10147d.
Raw receipt: .bodyforge-qa/bf703-recovery-gate-20261127/release-real.json, 20400 bytes, SHA256 cf1ad2ee19e452a135c7f323e0a2b334e39e13045583a568b4283f18230ef40d.
stderr: release-real.stderr.log, 1442 bytes, SHA256 20a94860160c38b84f1f45a2b3f28ba19f57d939016f8bcc775adb56105b7435.
Root dev HTTP 200; git diff --check PASS (line-ending warnings only).

## Failed attempts retained
Reproduction r1: existing screenshot-directory EEXIST; temporary runner corrected, not production code.
release.json: native-policy exit 16, missing JAVA_HOME; scoped installed javac 21.0.10 used for retry.
release-jdk.json: offline-runtime-pins exit 16, junction violates canonical path boundary; real dependency copy used. No validation weakened.
The two failed integrated runs are not counted as passes.

## BF-603 follow-up evidence (research only)
https://huggingface.co/litert-community/MediaPipe-PoseLandmarker-Lite
https://huggingface.co/litert-community/MediaPipe-PoseLandmarker-Lite/blob/main/README.md
Community model card reports Apache-2.0, official GCS provenance, generation 1682624738331272, version /1/, exact 5777746 bytes and SHA256 59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a, matching existing expected Lite-model pin. This is stronger evidence, not local model-byte verification or final distribution clearance; review upstream model card and applicable notices. No model downloaded; 7 installed SDK runtime files verified, 40825735 bytes.
Next dependency: authorized pinned model acquisition, exact byte/hash verification, isolated local inference, then BF-604 service worker/cache/upgrade and offline E2E. No claim of offline workouts yet.

## Verdict
Local integrated release regression PASS. Overall roadmap and BF-703 field/accessibility qualification remain incomplete: real phone, camera/physical activity and accessibility evidence not run here. BF-704 requires authorized clean immutable candidate and rollback rehearsal. No commit/push/deploy/APK installation or real player save mutation performed.
