# BODYFORGE — comprehensive interface polish / mobile accessibility

Date: 2026-11-10. Active user workspace: `C:\github\BODYFORGE`.
Observed Git branch/head: `main` / `d8e3859f1319601786067d2af066e3419bc87357`.

**Scope status: TESTED_LOCAL / PASS. Entire commercial mobile release: PARTIAL.**
This is one bounded polish iteration, not a claim that every UI screen, real-phone behavior, or a11y rule has been certified.

## A / Problem — actual browser evidence

A disposable Chrome profile toured **six real React screens** (Forge, Camera, Hero, Tower, Online, Settings/FAQ) at **320, 360, 390, 428 CSS px**. Findings before patch:

- Every bottom-nav item rendered at **7 px** font on 320–428 px, despite 44px+ target width.
- Forge quick-start was **35 px high**, two Pulse actions **34 px**, Camera sound control **35 px**, Hero turn buttons **42 px**, and two backup `summary` targets **17 px**.
- The fixed bottom navigation began at **y=680** in a 760px emulated viewport. Scrolling the last FAQ backup control into view using `scrollIntoView({block:"end"})` left its bottom at **y=760.48**, underneath the navigation. `html` computed `scroll-padding-bottom: 0`.
- The seven-day timeline has a **35px** individual day target at 320px. This is **above WCAG's 24px AA size threshold** but below the project's 44px design goal; not changed this iteration.

Baseline audit: `docs/audits/BF_UI_POLISH_AUDIT_20261110/audit.json` and 7 screenshots. Negative browser test with `BODYFORGE_QA_MODE=verify` on unchanged frozen baseline: **FAIL** due `Navigation labels >=9.5px` at width 320 (observed actual 7px).

Reference standards consulted:
- W3C WCAG 2.2, Target Size Minimum 2.5.8 (AA): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- W3C WCAG 2.2, Focus Not Obscured Minimum 2.4.11 (AA): https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum
- Google Core Web Vitals: https://developers.google.com/search/docs/appearance/core-web-vitals (field LCP/INP/CLS **NOT MEASURED**).

## B–D / Minimal reversible patch

**Code edit**: `src/neonPulseV2.css` (last global style file already used by AURORA FORGE), one isolated new media rule + two settings-summary overrides:

- `@media(max-width:740px)`: nav label font size `clamp(9.5px,2.7vw,11px)`, bold 800 and compact spacing. No changes to the six tabs, their labels or routing.
- `html {scroll-padding-bottom:calc(98px + env(safe-area-inset-bottom,0px))}` on mobile to prevent the fixed dock from obscuring scroll targets.
- Main actions in Forge, Camera, Hero and Pulse now have 44px minimum touch heights; Hero turn arrows 44x44.
- Settings backup **install help** and **JSON inspection** disclosure summaries now have minimum height 44px with padding, retaining native `details/summary` semantics.
- Existing user themes, high contrast, reduced-motion behavior, wallet, XP, workout journal, storage keys, camera permissions and GLB asset files were not changed.

**New audit/test**: `qa/interface-polish-e2e.mjs` creates a disposable Chrome user-data directory, measures real computed styles and element bounds across **6 × 4 = 24** screen/width combinations, saves screenshots and one local audit.json per run, checks last-FAQ-control location, horizontal overflow, control dimensions, and uncaught errors.

**Rollback of own CSS patch**: prior complete file bytes saved at `.bodyforge-qa/ui-polish-20261110/src_neonPulseV2.css.before`; SHA-256 `3664c7f932f0c87edec3c1a08f396a92bff4728c6ed2ec9c4066b981828df93c` (33,247 bytes). Restore only after checking concurrent edits; do not use hard reset or wipe working tree.

## E / Verification, exact conditions and receipts

- `npm test -- --maxWorkers=1 --no-file-parallelism`: **577/577 PASS, 50 test files, exit 0**.
- `npm run build`: **PASS, exit 0** (TypeScript + Vite 8.3.4). A separate baseline attempt to create a second output directory previously returned a one-off Rust memory-allocation failure; used a **verified preexisting production dist** for baseline, and the actual **post-patch production build PASSED**. Do not confuse environment failure with browser defect.
- `npm run qa:bundle`: **PASS, exit 0**, start JS 393,787 bytes vs 496,761 baseline, **20.7% smaller** (>=20% gate preserved), MediaPipe remains separate on-demand chunk 154,276 bytes. Existing large 3D chunk warning is not resolved.
- Snapshot of the post-patch build `.bodyforge-qa/ui-polish-20261110/fixed-dist`: 34 asset files; `index.html` 1,188 bytes, SHA-256 `2f4585ad9ebdb2c432be93a6d075ef4b1b52e2ebc53084393eaf201b580e99a6`. Frozen preview `http://127.0.0.1:5238/`: **HTTP 200**.
- `node qa/interface-polish-e2e.mjs` with `BODYFORGE_QA_MODE=verify` on that frozen preview: **BODYFORGE_UI_POLISH_VERIFY_PASS**, exit 0. All **24** screen/width combinations passed. Navigation text **9.5px at 320px**, **9.72px at 360px**, **10.53px at 390px**, **11px at 428px**, none truncated; every nav button >=44px; tested primary controls and backup summary targets >=44px; no horizontal document overflow.
- **Fixed-navigation regression**: last FAQ backup button `scrollIntoView({block:"end"})` now ends at **y=662.48**, while fixed bottom navigation starts **y=680** — **17.52px visible clearance**, previous y=760.48 / obstruction.
- `npm run qa:mobile` on identical frozen post-patch build: **BODYFORGE_MOBILE_E2E_PASS, exit 0**: actual React flows, 3D pause during camera, camera lens switching with fake browser camera, reward-free manual stop, hero outfit/muscle save, backup and narrow widths.
- `npm run qa:appearance`: **BODYFORGE_APPEARANCE_E2E_PASS, 616 assertions, exit 0** on local dev `http://127.0.0.1:5173/`. The first run on frozen production preview failed with exit 18 because **this dev-only test imports `/src/lib/progression.ts`** (unavailable in production dist), so the correct dev origin was used for the successful rerun. Checks palettes, high contrast, visible controls, token-based text ratios, GPU economy mode, cross-tab persistence, corrupt preferences, 320/360 mobile overlays. Do not treat the initial test-harness origin mismatch as an application defect.
- `npm run qa:privacy`: **BODYFORGE_PRIVATE_DEV_PATHS_PASS=12, exit 0**; all tested private URLs 403, application route 200.
- `git -c core.safecrlf=false diff --check -- src/neonPulseV2.css`: **exit 0** for the actual UI patch. The **global** `git diff --check` was exit 0 immediately after the patch, but became **exit 2** at final QC because an unrelated concurrent uncommitted `qa/multitab-e2e.mjs:412` acquired trailing whitespace. This global Git hygiene gate is **FAIL / external scope**, not an interface test failure; this iteration does not overwrite that other agent's changes.
- Local app `http://127.0.0.1:5173/`: HTTP **200**. Active dev server was not stopped or restarted.

## F / Audit inventory

1. `docs/audits/BF_UI_POLISH_AUDIT_20261110/`: 7 baseline PNG, **832,320 bytes**, plus audit.json.
2. `docs/audits/BF_UI_POLISH_VERIFY_20261110/`: 7 after-fix PNG, **840,290 bytes**, plus audit.json with 24 observations and focus clearance.
3. `docs/audits/BF_UI_POLISH_MOBILE_20261110/`: 10 PNG, **1,449,516 bytes**.
4. `docs/audits/BF_UI_POLISH_APPEARANCE_DEV_20261110/`: 20 PNG, **1,994,646 bytes**.

Together **44 PNG / 5,116,772 bytes** (not all screenshots are of the same viewport or feature). Tests used disposable Chrome profiles. No raw camera video or personal fitness data were archived.

Changed/added file hashes after verification:

| Path | Bytes | SHA-256 |
|---|---:|---|
| `src/neonPulseV2.css` | 34,351 | `e115849c07d249ce4ecb8d6585cdf087b6e35afd1376bd4b54ce30ab732d7ec0` |
| `qa/interface-polish-e2e.mjs` | 9,974 | `1a62470319d4283fcb7c764f4dc5c564565bb14c231c8487963a7a296b277a69` |

The repo has other active modified/untracked files (including App, ForgeWorld, forge.css, appearance QA). They belong to other work. **No attempt was made to stage, reset, revert, or overwrite them.**

## G / Status and limitations

`SPECIFIED=YES | IMPLEMENTED_LOCAL=YES | TESTED_LOCAL=PASS | COMMITTED_BY_THIS_ITERATION=NO | PUSHED=NO | DEPLOYED=NO | VERIFIED_LIVE=NO`.

This is **not a WCAG 2.2 AA certification**. Only the touched controls, observed themes, and tested screen widths are verified. User text resizing to 200%, real device safe-area/gesture bars, physical phone energy/FPS, and field Core Web Vitals (LCP/INP/CLS p75) remain **UNMEASURED**. The 7-day compact chart control width 35px at 320px remains above WCAG 24px but below our 44px design target.

## H / Next ≤15 minutes

Take one separate reversible iteration to give 7-day timeline day buttons at least 44px on narrow handsets, preserving horizontal swipe to access all days. Verify day selection for 7/30 days, screenshot 320/360/390/428, test 200% text resizing, and rerun relevant QA/build before acceptance. No deployment without release gates.

## ΔDΩΛ

∆: nav labels legible, mobile primary actions larger, backup disclosure hit targets enlarged and sticky dock no longer obstructs FAQ scroll target.
D: baseline Chrome audit and RED case, focused CSS-only patch with rollback snapshot, production build, 577 unit tests, 24/24 Chrome visual-layout checks, full mobile E2E, appearance E2E with 616 assertions, privacy checks, artifact read-back.
Ω: high confidence in tested local Chrome layouts and isolated-storage safety; field performance and handset checks unavailable.
Λ: revise after large-font and real-device tests, or if a later CSS/theme edit alters measured touch targets.
