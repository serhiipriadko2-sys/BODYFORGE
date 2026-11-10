# BODYFORGE — Master Spec / Agent Prompt · Engineering Receipt
**Date:** 2026-11-10 · **surface:** authorised Windows Remote Desktop Commander / C:\github\BODYFORGE · **scope:** documents only · **status:** CREATED_AND_QC_VERIFIED, NOT IMPLEMENTED.

## Original worktree evidence
- HEAD: bfecc83f543208289ed56b7cbc6d11fa7121ee09, main tracking origin/main (observed before this documentation run).
- Other sessions already own uncommitted work in Avatar3D, appearance, QA, mobileGraphics and MOBILE_INSTALL. None was reset, staged, committed, or overwritten by this doc task.
- New specification visible through open VS Code reused with: code -r <two files>; code CLI exit 0.

## Exact artifact allowlist and read-back
| File | Bytes | SHA-256 |
|---|---:|---|
| docs/BODYFORGE_MASTER_GDD_TDD_20261110.md | 73020 | 82b27244a4f4544dc55f0b79bb585ff093bfdc2958c191adc3ab23e728a862a5 |
| docs/BODYFORGE_AGENT_MASTER_PROMPT_20261110.md | 28955 | f8ed8ecd7959fd2c3d5d294283cfdd630fad0292d712c6cfb89ad9eb8fb2f497 |

**Source file count:** 2 · **source bytes:** 101975 · **source hash read-back:** PASS.
Semantic QC: explicit feature status EXISTS/IMPROVE/PROPOSED/TARGET, eight exercise IDs, 3D bone-space attachment, camera lifecycle, game economy, 7/30 days, reliable saves, Health Connect/online boundary, mobile accessibility, performance, security, release, field QA, numbered ADR candidates and official-source references present. Markdown non-empty, no null bytes, no matched private-key/token pattern; executable code assets unchanged by this work.

## Application checks: actually run
| Check | Observation | Verdict |
|---|---|---|
| Baseline npm test -- --maxWorkers=1 --no-file-parallelism | 46 files, 564/564 tests, exit 0 | PASS |
| Baseline npm run build | TypeScript + Vite production build, exit 0 | PASS |
| After writing docs npm test -- --maxWorkers=1 --no-file-parallelism | 46 files, 564/564 tests, exit 0 | PASS |
| After writing docs npm run build | exit 0; entry JS 400955 B, MediaPipe chunk 154276 B; lazy 3D ~651 KB warning | PASS_WITH_WARNING |
| Production preview | http://127.0.0.1:5189/ HTTP 200 and index script asset present | PASS |
| Dev server | http://127.0.0.1:5173/ HTTP 200 | PASS |
| npm run qa:pwa | filesChecked=7, exit 0, no offline service worker | PASS |
| npm run qa:privacy with dev server running | 12/12 protected routes HTTP 403, app HTTP 200, exit 0 | PASS |
| npm run qa:bundle | entry 400955 B, pinned baseline 496761 B; 19.3% reduction vs ≥20% required, exit 1 | FAIL (existing code budget) |
| npm run qa:mobile with production preview | Owned headless Chrome exited 0 before CDP; exit 12, no app scenario executed | BLOCKED (test harness) |

A first privacy attempt ran without dev server and failed all requests with connection error. That attempt is NOT a privacy regression; after starting the expected server the same test passed. A mobile attempt failed before any application navigation; it is NOT a passed E2E or a proven app regression.

## What is explicitly NOT claimed
- Not a game code change, not «AAA delivered», not improved 3D or real pose accuracy.
- Not committed, pushed, merged, deployed to Firebase, or verified on a physical Android in this iteration.
- No new Firebase config/credentials and no changes to existing deployment.
- Not a performance PASS: qa:bundle still fails by 0.7 percentage points against its threshold.
- Not a mobile E2E PASS: browser harness blocked before loading the app.
- Running localhost does not make the app accessible over HTTPS on a separate phone.

## Follow-up gates
1. Audit entry chunk and reduce proven initial JS by at least the missing budget without relaxing test, while keeping MediaPipe lazy.
2. Investigate isolated Chrome/CDP startup, restore qa:mobile to reproducible PASS.
3. Validate camera recognition with real humans, outfit/hair/shoes fit on physical Android, FPS, memory and battery; do not infer from synthetic tests.
4. For any Firebase update: exact target site + clean commit + preview + rollback + HTTPS version read-back. Requires a separate release action.

## ∆DΩΛ
∆ — added two complete, executable-direction project docs in the user's VS Code project. 
D — repository read-back, official sources, baseline and post-doc unit/build, two HTTP smoke results, PWA/privacy and measured failures, SHA receipt.
Ω — high for documents and local test results; no confidence claim for real mobile behavior or deployment.
Λ — revise on next HEAD, improved bundle, browser harness fix, field QA, changed backend/economy or Firebase release.
