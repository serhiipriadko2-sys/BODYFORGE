# BODYFORGE mobile WebGL reproduction / environment boundary
Date: 2026-11-10
HEAD read-back: ad0c23b86f9d1776807882c2fc7a8a43639573ce
Scope: diagnostic only. No application or QA source edited in this iteration.

## Evidence
Earlier production preview qa:mobile, origin http://127.0.0.1:52871/: CDP connected; game and purchases/reload succeeded, then Three.js shader VALIDATE_STATUS false / 1282; GLB fell back to SVG; TIMEOUT GLB measured after full reload; exit 12.
New qa:mobile, same preview origin: CDP_OWNER emitted; Runtime.evaluate timeout before onboarding assertions; cleanup EPERM on owned temporary Chrome profile; exit 12.
Preview port 52871 returned HTTP 200. Stable dev port 5174 returned HTTP 200.
Historical qa:avatar focused run after QA harness patch: 23/23 PASS, exit 0. Historical full unit 575/575 PASS, build exit 0. These results do not prove the failing mobile E2E.
Recent git status showed no modifications to qa/mobile-e2e.mjs or src/components/Avatar3D.tsx.

## Falsifiable hypotheses (NOT FACTS)
H1: Headless SwiftShader process/profile contention or GPU context exhaustion under multiple active QA Chromes; verify in isolated, controlled fresh browser with no other concurrent QA.
H2: Renderer context lifecycle after full reload plus purchased outfit; reproduce on one fresh browser with console and webglcontextlost/restored events, compare reload before versus after purchase.
H3: Browser process hang unrelated to GLB; instrument CDP Page/Runtime timestamps and process exit to distinguish.

## Boundary
Do not kill any non-owned Chrome, disable security or change Avatar3D materials on this evidence.
Do not mark mobile PASS, release-ready, field-validated or deployed.
If the QA environment is isolated, rerun the unchanged built version and collect browser exception, context events, and screenshots; only then define one source patch and negative regression.
Source rollback not applicable; delete only this audit note if necessary.