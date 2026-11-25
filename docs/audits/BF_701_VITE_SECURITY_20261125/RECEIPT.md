# BF-701 Vite security dependency candidate

Status: candidate lock resolved; INSTALLATION / TEST / LIVE FIX BLOCKED on new transitive dependency approval and coordinated isolated verification.
Upstream advisory GHSA-p4f5-76q4-ffq7, 2026-11-10: installed/locked Vite 8.3.4 and Rolldown 1.2.14 affected. Fixed upstream Vite 8.3.7 and Rolldown 1.2.17 minimum; registry Vite 8.3.7 requires ~1.2.18; resolved candidate Rolldown 1.2.19.
Registry metadata checked for Vite 8.3.7 and Rolldown 1.2.18: MIT and SHA-512 integrity. First metadata parser expected an object but got a single-item array, then corrected; no product writes. npm package-lock-only, ignore scripts, no audit/fund. Resolution exit 0.
Candidate changes: 7 new optional dev transitive entries; 22 changed lock entries including root. No removed entries. New lock metadata licenses MIT or 0BSD; registry origin and integrity present. Package contents not independently verified. Two added entries are beta versions. Do not install without separate approval.
Root package.json and lockfile byte-identical to preflight. Installed dependencies unchanged. Existing server not restarted or stopped. No exploit probes or compromise claims. Keep dev server loopback-only. New private-path patch is a separate, tested defense and does not fix the upstream RCE.
Next: after approval, isolated npm ci --ignore-scripts from candidate, actual installed version check, scoped privacy test, complete TypeScript/build/unit/browser regression on a pinned current source snapshot; no root adoption until all gates pass and concurrent work is coordinated.
Source: https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7

## Evidence
- docs/audits/BF_701_VITE_SECURITY_20261125/package.json.candidate | 2005 bytes | SHA-256 5a5e6876cb35587e61dcae692e71ece209f530089d0a8c305a03570406400b2a
- docs/audits/BF_701_VITE_SECURITY_20261125/package-lock.json.candidate | 70381 bytes | SHA-256 bbe8f2caa0b6c125ea277993cad03b4512cc3897aa2faa895cf97865c65e56b9
- docs/audits/BF_701_VITE_SECURITY_20261125/candidate-lock-review.json | 5411 bytes | SHA-256 31630e8fc3723eacaebe38126fc554840b22287cf2784f05dd4c3ad309a367b2
- docs/audits/BF_701_VITE_SECURITY_20261125/optional-transitive-review.json | 2282 bytes | SHA-256 37ae47b75d4a2ab70446df3fbeb2d701c581a6baff851c8d414ded71e6b8f979
- docs/audits/BF_701_VITE_SECURITY_20261125/vite-8.3.7-metadata.verified.json | 460 bytes | SHA-256 eac0f760caade6c81d0346dc314d6d9806e50e9a6ed858a08f8be76e7290844a
- docs/audits/BF_701_VITE_SECURITY_20261125/rolldown-1.2.18-metadata.verified.json | 1139 bytes | SHA-256 51d34b1152e34226567649c6038b2bdc789e54486f9d42449b97cd3c788ec68d
- docs/audits/BF_701_VITE_SECURITY_20261125/lock-resolution.log | 18 bytes | SHA-256 4c2a0edc189edd72682ff8adda87e72f27972256071a3d6d6047b99e6aa11b40
