# BODYFORGE directional groom V3 — verified local review

Status: technical PASS for scoped V3 implementation; AAA PARTIAL. The V3 and subsequent scalp-surface buzz experiments are opt-in only.

- Restored the isolated drafts from .bodyforge-qa/groom-review-v3 after Windows virtual memory headroom recovered. Original GLB remained byte-exact. No OS settings or user programs changed.
- Two Blender-authored procedural hairstyles, 800 cards and 11680 triangles per style (V2 11854). Pinned private GLB 1083452 bytes, SHA-256 37fd6ca23f50d666dfbe64b81ae8746b049cec64998e4770cb7466945a54b8d5.
- Deterministic 256x256 RGBA8 fibre coverage atlas, mesh tangent bases, anisotropic PBR with alpha test and alpha-to-coverage. This is not a measured hair BCSDF or multiple-scattering simulator. See https://www.cs.cornell.edu/~srm/publications/SG03-hair-abstract.html and https://threejs.org/docs/pages/Material.html.
- Development-only same-origin loopback route, pinned SHA-256, private folder deny rule retained. V2 and V1 fallbacks retained.
- 4/4 targeted Vitest tests; 7/7 local endpoint checks; production build exit 0 and zero experimental marker hits. 1199/1199 full Vitest tests, 114 files at the V3 checkpoint.
- Browser on/off/fallback: 28/29/28 assertions, 85 total, 21 frames. Actual linked anisotropic textured alpha-tested tangent shader draws (22 observed in enabled scenario), no V3 draw in off/fallback. Hair switching and silver dye, four max-growth groups, exact synthetic progress bytes unchanged and no uncaught browser errors. All three scenarios returned exit 0.
- comparison.json: matched viewport crops. All seven fallback crops byte-equivalent at decoded channel level to V2 baseline; buzz crop identical between V3 enabled and disabled. Hair detail visibly more distinct; dark highlight still too shiny, scalp edge and silver tone still need visual refinement. Do not equate pixel difference with realism.
- matched-groom-comparison.png: 849526 bytes, SHA-256 ed3a19967927cd5d4c60006cde68d0670aaf25a5357b33d76b60f2e5d75ec635.
- Subsequent buzz integration modifies Avatar3D and avatar-quality-e2e. The exact V3 checkpoint copies are in ../BF_AVATAR_BUZZ_SURFACE_20261127/*.before.txt. See that stage's report and combined receipt for final source hashes.
- Existing chunk-size warning from the V3 build; alpha-tested overdraw and physical Android performance are not measured. No commit/push/deploy or actual player save change.
