# BODYFORGE / Forge avatar-only (2026-11-24)
Status: IMPLEMENTED / TESTED_LOCAL for the requested UI change.
Workspace: E:\github\BODYFORGE
HEAD: 4ddbfa7e74d876ed866ae5cdb1da9a807fa33095
Scope: created fighter on dashboard only. Removed kinetic-axis label, mobile-quickstart and character-footer; kept header, 3D scene, rotation and profile XP outside the card. Prior edits preserved. No camera, rewards or save schema changes.
QA: initial baseline rejected presence of removed zones. First post-patch E2E failed on a newly introduced incorrect 290px height assumption. Corrected test to existing appearance.css clamp(270px,75vw,315px); no production code changed after first build.
npm run build: exit 0; existing >500kB chunk warning. npm run qa:bundle: exit 0, 394167 entry bytes, 20.7% reduction. Unit: 578/578 in 50 files, exit 0.
Forge home/Camera/FAQ E2E: 54 PASS lines, exit 0; actual CC0 3D avatar, rotation hint, 320/360/390/428px, no empty footer or horizontal overflow. Prior activity relocation and profile CTA verified.
Appearance/kinetic E2E selectors updated for remaining controls; these full suites were not run. Physical device and Firebase not tested/deployed.
Source and evidence fingerprints:
src\App.tsx | 82415 bytes | 10ca47544db9b1487d0db425bd4ca4ea8a01e8225c0aac34c3b7d5dd735e6639
src\neonPulseV2.css | 35164 bytes | 77b1c04348f9cdf02a1dfe42950e75899433fb789b918b3c00bd5932836e659b
qa\forge-home-xp-faq-e2e.mjs | 18700 bytes | 3fd2a389e48c2a134d32f49717ef17ec7159e590b0d0a7099660463fea2f9122
qa\appearance-e2e.mjs | 50202 bytes | f2dee2f4dc7a41b1a00a7af4119c9581c27097804ebbd5b95c1ddd8205f4dd6b
qa\kinetic-e2e.mjs | 19117 bytes | 6dc0b936c3639ec83f004c0111a9209643301582757deb75a058209bc944966e
E:\github\BODYFORGE\docs\audits\BF_FORGE_AVATAR_ONLY_20261124\forge-home.log | 5745 bytes | 32c7fcfa32a7a27403348f77caa1f86a7c4c99080aee15b0bd8455bb7e668a1f
E:\github\BODYFORGE\docs\audits\BF_FORGE_AVATAR_ONLY_20261124\unit.log | 6485 bytes | f86d61ef4e45c00ac67cc10bf4ce869ed31484edec39d5b648ad16f6b1b8e5f7
E:\github\BODYFORGE\docs\audits\BF_FORGE_AVATAR_ONLY_20261124\verified-shots\forge-avatar-only-390.png | 202759 bytes | c1bd2e76af765ed82eb1e36363fc6ef02dbab232053478686ea8d8a01391d352
Rollback: compare current hashes and use the corresponding .before backups in this audit directory, restoring only this iteration. Never reset unrelated changes.
