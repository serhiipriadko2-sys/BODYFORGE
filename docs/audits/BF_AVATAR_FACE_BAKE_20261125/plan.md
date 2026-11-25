# Face relief bake implementation plan

Goal: improve mid-frequency facial surface definition without replacing the rig or changing muscle progression.
Architecture: author bounded sub-millimetre relief on a subdivided copy of the pinned, Face-V2-deformed skin in Blender. Bake tangent-space normals, preserve the old normal atlas outside the affected face region, and load the new local atlas with the old one as fallback.
Stack: existing Blender 5.2, Three.js, TypeScript, Vitest, owned-profile Chrome QA.
Spec: user's continuing BODYFORGE realism request and this plan; no new gameplay or identity changes.

Approaches: another per-frame shader layer adds cost and duplicates existing pore detail; replacing the full human rig breaks the established fitting contracts. Selected approach is an offline geometry bake onto the unchanged UV layout. It cannot fix silhouette or establish AAA quality by itself.

Scope/rollback: existing VS Code workspace explicitly requested by owner. New script, generated atlas and review scene; minimal edits to avatarDetailMaps.ts and Avatar3D.tsx; a bounded branch in the existing QA harness. Current originals saved in .bodyforge-qa/face-bake-20261125. Do not restore whole files over concurrent changes; reverse exact scoped hunks. No commit/push, external upload, owner profile edits, database writes or memory writes.

Review focus: tangent convention and numerical color space; UV continuity and preserved body area; scene teardown during load; candidate failure retains old map; muscle geometry, eyelids and materials unchanged.

- [x] Task 1: verify existing normal map, write a replacement-texture ownership test, observe failure, implement minimal disposal guard.
- [x] Task 2: generate bounded high-resolution geometry, bake a 2048 atlas in linear numeric channels, decode and verify dimensions/finite normalized normals/bounds/margins. Save editable review scene and hashes. Reject invalid bake rather than weaken checks.
- [x] Task 3: load the validated atlas only on the preferred compatible facial rig, retain original fallback and existing scan bump. Matched camera old/new screenshots, successful GPU draw and blocked asset fallback; check maximum muscle growth.
- [x] Task 4: full test command, production build, scoped diff review, exact receipt. Label artistic result separately from tests.

Execution: inline in authorized workspace. Tests first for runtime code. Candidate asset generation is an isolated authoring experiment until semantic and visual validation. No fresh reviewer is available; final review is a separate self-review, not an independent audit.


Ruling: ship a 1024 runtime atlas, not the 2048 candidate. Matched screenshots showed only subtle benefit; the previous normal-map resolution budget is preserved. Task 4 records executed checks, not overall PASS: TypeScript and 15 profileReplacement tests are still failing outside this pass. No independent reviewer or physical-phone evidence.
