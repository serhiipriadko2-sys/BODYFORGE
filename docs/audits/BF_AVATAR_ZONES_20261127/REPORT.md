# BODYFORGE regional zones V4e - local review

Status: PARTIAL / verified local mechanics and UI; art acceptance open.

15 independent zones, 12 points each, 180 total; fixed 25 coins per point (design default). Three starting builds lean/solid/full; paired volume and relief fields. t=level/12; volume=t; relief=.35*t+.65*t*t.

The game maintains a versioned per-zone profile; old group progress converts proportionally on first valid purchase, without charging migration; legacy compatibility projection retained. Invalid progress blocks spending.

Geometry: 699 sampled states (233 per build), no new intersecting pairs in tested swept ROI, minimum area ratio >= .43318; each isolated step increases measured mesh volume and relief RMS. Not exhaustive of all 13^15 states; not a pose/garment collision certificate. Values describe fictional mesh, not physiology.

Browser: 586 assertions, 180 lean + 15 solid + 15 full purchases and legacy migration; actual GPU rendering and CPU vertex changes, reload, caps, wallet and failure safety; 46 screenshots; 360px and 390px. RTX 3070. Compared same profile with relief on/off.

Regression: 14 targeted suites, 223 tests passed. TypeScript + Vite build exit 0. Production output excludes V4 assets and loader markers. Build has chunk-size warning. Full repository suite and physical Android not run.

Rejected V4f: zero-level lean preflight produced 6 new intersections and area ratio 0.07192369214136295; not installed. V4e remains pinned. Starter chest/arm relief still too pronounced for desired near-untrained look; lean/medium silhouette difference remains subtle and full needs stronger artistic differentiation. Static visual prototype, garment and animation acceptance open.

Preview (development computer only): http://127.0.0.1:5191/?avatarFoundation=4&avatarFoundationRelief=1 . No deployment or commit. Owner progress not accessed; browser tests use disposable synthetic profiles. Existing unrelated dirty changes preserved.

Local boundary: exact asset bytes served 200, cross-site and direct private paths 403. No production V4 asset publication. New preview is intentionally local-only; normal production path remains legacy and regional purchases disabled there.

Rollback: retain previous scoped source backups (*.before) and pre-fix copies under ignored work directory. Do not blanket-reset dirty worktree. Restore individual files only after checking post-edit drift and user scope. V4e Blender and sparse fields preserved.

See RECEIPT.json for exact hashes, file sizes, evidence inventory, and bounded non-claims.
