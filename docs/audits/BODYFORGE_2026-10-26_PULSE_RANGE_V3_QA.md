# BODYFORGE · Pulse v3 / 7–30 day activity — QA receipt

**Date:** 2026-10-26. **Lifecycle:** `implemented + tested-locally`. NOT a public deployment or verified physical Android build.
**Repo:** `C:\github\BODYFORGE`. **Git HEAD read-back:** `3aa8eeb123e4e254b75be596c93296740b5c4c51` on `main`.
**Scope:** exactly 7 application/QA files below; separate active sessions are editing other 3D/avatar files in this same shared worktree. Never stage all changes as a single reviewed change.

## What changed

1. `src/lib/progressPulse.ts`: one pure, DST-safe 7/30-local-calendar-day aggregator; count only complete 20-rep saved workouts; prevent duplicate IDs; previous equal-length nonoverlapping period, without fake percentages; history-cap disclosure at 60 entries. Backward-compatible `weeklyPulse` preserved.
2. `src/lib/progressPulse.test.ts`: four new edge-case contracts (30-day New Year rollover, previous-period window, duplicate/invalid inputs, 60-entry retention); also existing 7-day cases.
3. `src/lib/dashboardDisplay.ts`: 30 truthful chart points, sparse seven readable date ticks, no overshooting curve; preserve existing seven-day mode.
4. `src/lib/dashboardDisplay.test.ts`: tests all 30 points, tick spacing and axis projection.
5. `src/components/ProgressPulseBoard.tsx`: working native range dropdown with 44px tap height, accessible daily buttons, selected-day sessions/reps details, equal-period comparison, honest empty state, exact month count in statistics, 30-day strip initially scrolled to most recent date.
6. `src/neonPulseV2.css`: opt-in v3 visual accents compatible with original AURORA NEON, narrow screens, high-contrast mode, reduced-motion and horizontal strip containment.
7. `qa/pulse-armory-e2e.mjs`: real browser interactions 7→30→choose day→7, latest 30-day button visible, selected aria state, 320/360/390/428 widths and no game-storage rewrites.

## QA evidence (user-owned Windows computer)

- `npx vitest run src/lib/progressPulse.test.ts src/lib/dashboardDisplay.test.ts --reporter=default`: **12/12 PASS**, two files.
- `npm test -- --reporter=default`: **413/413 PASS** (32 files); entire shared worktree, including concurrently authored unrelated 3D tests. Only five new assertions here are ours.
- `npm run build`: **PASS**, TypeScript + Vite 8.3.4, compiled entry **391081 B** / gzip **118193 B**; lazy avatar 3D chunk ~643 KB still emits normal >500 KB warning.
- `npm run qa:pulse-armory` using local production preview `http://127.0.0.1:5197`: **54 assertions PASS**, 9 saved screenshot captures and no uncaught browser JS errors.
- `npm run qa:mobile` against same local production preview: **BODYFORGE_MOBILE_E2E_PASS** (onboarding, 3D, rewards, purchases, tower navigation, camera, front/rear switch, manual stop yields no XP, 360px overflow).
- `npm run qa:appearance` at local dev server `http://127.0.0.1:5198`: **768 assertions PASS** (theme, 320/360/390 widths, actual contrast, data-preserving cross-tab preference workflows).
- `npm run qa:privacy`: **BODYFORGE_PRIVATE_DEV_PATHS_PASS=12** private-route HTTP 403.
- `npm run qa:bundle`: **BODYFORGE_BUNDLE_ON_DEMAND_PASS**, main initial JS still 21.3% below the pinned 496761-B baseline and camera chunk remains on-demand.
- `git diff --check`: PASS (only harmless local Windows LF→CRLF warnings).
- Current 7/30-day feature was never written into the user game profile or rewarded directly.

## Captured browser evidence

Screenshots are on the user's computer in the disposable QA output directory:
`%TEMP%\bf-pulse-shots-c75ad6\`
- `bodyforge-pulse-dashboard.png` — 7 days;
- `bodyforge-pulse-30days.png` — 30 days;
- `bodyforge-neon-actions.png` — functional cards;
- additional portrait/hero controls screenshots.

## Safe rollback (local only)

A byte-for-byte copy of all seven pre-edit files exists at:
`%TEMP%\bf-neon-range-rollback-20261026\`.
Do not reset the entire worktree or replace unrelated concurrent 3D changes. Restore only these seven paths if a targeted rollback becomes necessary.

## Verified status boundary

`implemented` → `tested-locally` **PASS**. Not claimed: `committed`, `merged`, `pushed`, `deployed`, `invoked on mobile HTTPS`, real human pose recognition accuracy, physical Android FPS/battery performance. Current GitHub `main` may change independently; do not infer remote sync from local tests. A conditional failure in visual QA should reopen only the affected module.

## ∆DΩΛ

- **∆:** truthful selectable 7/30-day trend with exact daily detail and bounded comparison.
- **D:** seven source/test/QA files; local screenshots, full test/build/browser proofs and SHA manifest.
- **Ω:** high for local browser/data behavior; insufficient evidence for physical-device and live deployment claims.
- **Λ:** revise when storing more than 60 sessions, supporting new verified workout formats, changing timezone handling, or observing an Android accessibility/scroll regression.
