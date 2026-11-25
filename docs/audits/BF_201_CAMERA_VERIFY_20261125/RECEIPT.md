# BF-201 camera lifecycle verification

Status: TESTED_LOCAL / PASS on exact BF-107 frozen build, not current avatar changes or physical phone.
HEAD 664ab80c89b244bab1014ec5c652d11c6a490470; observed 2026-11-25T18:55:17.528867+03:00.
Source 295 files, build 72 files, entry SHA256 7ab6276752ef440234c1e07a39e30d998a41c98c986a731c1ecb4cdfcc8c5abf. Exact entry and source verified before and after.
Prior BF-201 early disconnect RED is now GREEN on the current integration snapshot. Lifecycle 41 checks, camera-runtime 26 checks, tower final 41 checks, exit 0. Permission rejection, late stream after cancel, disconnect during video.play, hidden page, failed runtime chunk/reload, normal finish and partial cancellation verified. No false credit. Temporary browser cleanup and preview stop observed.
The BF-107 receipt supplies unit 824/824, TypeScript/build/bundle and mobile 88 checks on this same source/build; mobile reused rather than rerun. Its first screenshot capture retry is preserved in prior receipt. Actual human accuracy and physical phone not tested.
Parallel source drift at end: ['qa/avatar-quality-e2e.mjs', 'src/components/Avatar3D.tsx']. No avatar edits by this task, no owner save access, APK, Firebase, commit/push or deployment.

Evidence | bytes | SHA256
docs\audits\BF_201_CAMERA_VERIFY_20261125\camera-runtime.log | 1666 | ab70ea75db53a3218a5118f9deeb5128f195fcae3f69984dc29d86e682f8dc2c
docs\audits\BF_201_CAMERA_VERIFY_20261125\lifecycle.log | 2331 | 35944e074f9884cf874b5c7648c694691facf342213507b8bd83d4faa3843415
docs\audits\BF_201_CAMERA_VERIFY_20261125\preview.log | 40 | 04c4d3d552b3b59199457546da126f1125cebcdc6622a1d923c44dc1f058091e
docs\audits\BF_201_CAMERA_VERIFY_20261125\tower-final.log | 2871 | cc6f6823ae379e64502040fb45991d8fa0a94847afb7dd2a1dbe976f0d43def6
docs\audits\BF_201_CAMERA_VERIFY_20261125\gates.json | 590 | e01bc98337516831d8d4987c4c3682844efa4540f3d227415146eb8d4da8adad
docs\audits\BF_107_HISTORY_INDEX_20261125\RECEIPT.md | 4103 | 3a3d0186ebdeba9346cb1a8d7715e26570b0b8775d616c2304414f13289ecb81
docs\audits\BF_107_HISTORY_INDEX_20261125\mobile-retry-gates.json | 496 | 9407c19b184535abaccfa243f8ca280b4da215284c37d07156af662b55776981
