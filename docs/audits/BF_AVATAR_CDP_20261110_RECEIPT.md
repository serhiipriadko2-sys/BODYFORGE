# BODYFORGE / Avatar QA harness CDP receipt

Date: 2026-11-10
HEAD: ad0c23b86f9d1776807882c2fc7a8a43639573ce
Changed: qa/avatar-lifecycle-e2e.mjs only (QA harness).
Rollback copy: docs/audits/BF_AVATAR_CDP_20261110_BEFORE.mjs.txt

## Repro before
npm run qa:avatar on preview origin: Chrome exited 0 before CDP; exit 12.
After first connection patch: 23/23 avatar assertions passed but owned temporary browser not closed; TEMP_CLEANUP_BLOCKED, exit 13.

## Fix
Wait for live DevToolsActivePort plus responding CDP endpoint instead of relying on Windows Chrome launcher exitCode.
Close only the browser associated with this test's unique temporary CDP profile via Browser.close; retain all Chrome flags.
No source app files, graphics materials, user saves or other profiles changed.

## Verification
BODYFORGE_QA_ORIGIN=http://127.0.0.1:5174 npm run qa:avatar => 23/23 PASS, exit 0; no cleanup failure.
npm test -- --maxWorkers=1 --no-file-parallelism => 575/575 PASS, 49/49 files, exit 0 (repeat run after concurrent progressPulse.test.ts changed).
npm run build => PASS, exit 0.
git diff --check => PASS, exit 0 (line-ending warnings).
Preview http://127.0.0.1:52871/ => HTTP 200 and React root.
Source size: 12571 bytes
Source sha256: 0C1AE9F59D941732A5F22D40F3A550FCC2AF03B91DAFBB6D65ACF30FC0DAB6E5

## Nonclaims
Earlier npm run qa:mobile => FAIL exit 12: WebGL shader validation errors, GLB fallback after full reload.
The avatar lifecycle harness PASS does NOT fix or clear that mobile failure.
No field QA, no release, no push, no deploy, no FPS or accuracy claims.
Parallel uncommitted files remain untouched.