# BF-701 private QA and audit paths

Status: TESTED_LOCAL for two private directory boundaries; broader BF-701 remains PARTIAL.
HEAD: 664ab80c89b244bab1014ec5c652d11c6a490470
RED: 22/62 passed; 40 failed; 12 responses returned synthetic canary content. No real private data read. Preview HTTP 200 was fallback, not demonstrated content disclosure.
GREEN: 62/62 passed; zero canary responses. Dev and production preview on owned isolated loopback fixtures: 403 with no-store for private directories and earlier protected paths; normal app/assets remain 200. Encoded separators, casing, dot segments, Windows path aliases, HEAD tested. Both servers closed and temporary fixture removed.
TypeScript node config, QA syntax, scoped git diff check, canon verifier all exit 0. No dependency changes or restart of existing server.
This is defense in depth, not mitigation of all Vite vulnerabilities. GHSA-p4f5-76q4-ffq7 separately requires update: installed/locked Vite 8.3.4 and Rolldown 1.2.14; upstream fixed Vite 8.3.7 and Rolldown 1.2.17. Observed app listener 127.0.0.1:5173. No exploit probe, incident attribution or live verification. Avoid LAN exposure until patched.
References: https://vite.dev/config/server-options ; https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7

Rollback: restore vite.config.ts from exact .before only when current hash matches; remove only the matching new QA test. Do not touch concurrent product edits.

Files and evidence:
- vite.config.ts | 2687 bytes | SHA256 3919cd43ebc9ad24478089e0918b5c06398256df0b1e0e0d134b19a2b6f05bb3
- qa/private-qa-paths-e2e.mjs | 5877 bytes | SHA256 0cdc454e8a2624b66883c756f5ddd1a9b8c50b7b530b494619f3015ab8dabba2
- docs/audits/BF_701_PRIVATE_QA_PATHS_20261125/vite.config.ts.before | 2035 bytes | SHA256 8d9736a6d377c1abfe3ebf681508ac918a9394cf1b15f02c9bed9c390b2ba8ab
- docs/audits/BF_701_PRIVATE_QA_PATHS_20261125/red-expanded.log | 2478 bytes | SHA256 84203e63963cade4cf2a41d418ea21fa5db4ec03adb76c9923250400b60b2dca
- docs/audits/BF_701_PRIVATE_QA_PATHS_20261125/green.log | 2320 bytes | SHA256 45e28bf907fb64702ed5ea36022aa4520767814975fd62f8c70ab5dc708a3bca
- docs/audits/BF_701_PRIVATE_QA_PATHS_20261125/gates.json | 315 bytes | SHA256 57f5cceec3771b10f049c00d4991d1ae143fd6f7a23c358c794ce560a1dbf94e
- docs/audits/BF_701_PRIVATE_QA_PATHS_20261125/tsc-node.log | 0 bytes | SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- docs/audits/BF_701_PRIVATE_QA_PATHS_20261125/diff.log | 107 bytes | SHA256 74b493b92c4635b2eadc8ef037a8d35308264732153a33112081fdd9018ccd14
- docs/audits/BF_701_PRIVATE_QA_PATHS_20261125/canon.log | 191 bytes | SHA256 bd4804de303f67e95fa25e0fa54c637d0ae574c4ff18b54cfa79d64738587506
- docs/audits/BF_701_PRIVATE_QA_PATHS_20261125/syntax.log | 0 bytes | SHA256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
