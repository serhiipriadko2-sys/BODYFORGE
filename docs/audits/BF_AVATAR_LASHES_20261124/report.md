# BODYFORGE - fitted skinned eyelash fibres

Date: 2026-11-24. Status: implemented locally; targeted geometry and browser checks passed, full browser regression incomplete; PARTIAL toward AAA.

## Scope
- Blender samples the actual Face V2 eyelid rims using skin/eye ray comparisons and barycentric interpolation of existing skin weights.
- 156 authored strands (52 upper and 26 lower per eye); 3120 vertices, 5304 triangles, one additional indexed skinned mesh. Deliberately reduced strand count and length for the existing real-time mobile character.
- Mesh is created only for the identified face profile, preserves the original rig, and is skinned with normalized existing bone weights. No per-frame CPU geometry update or new external asset request. Original body GLB unchanged.
- Hairline, scalp, lip texture and body proportions were not changed in this pass.

## Evidence
- Blender guide generation: exit 0, 156 guides, 30465-byte recipe.
- Targeted Vitest: 3 files, 8/8 tests, exit 0. Real GLB eyelash attachment checked across neutral, blink, five blink samples at maximum muscle growth, breathing, and reset. Largest observed root-to-corresponding-skin-triangle distance: 0.095249467 mm in unnormalized model space. This is not a global collision test.
- TypeScript check and production build: exit 0. Existing large-chunk warning; Avatar3D bundle 745.11 kB / 203.18 kB gzip.
- First browser run: verified real indexed skinned eyelash draw and no recurring reduced-motion frames, timed out waiting for media transition.
- Second browser run: QA clock installed only after native Chrome media preference changes, using the actual motion toggle. Verified new indexed skinned draw, actual blink, inhalation, eye reopening, visible pose changes, native continuing frames, no idle frames while hidden or in economy/legs mode, original synthetic save unchanged. Final maximum-growth reload timed out on Runtime.evaluate (20 s), exit 1. One disposable Chrome profile cleanup incomplete. Full browser suite is not PASS.
- Four actual application screenshots saved. Blink portrait visually inspected. Eyelashes are subtle at current mobile framing; no AAA equivalence claimed. Physical Android performance unmeasured.
- References: https://pmc.ncbi.nlm.nih.gov/articles/PMC6147748/ ; https://docs.blender.org/manual/en/5.3/modeling/geometry_nodes/hair/utility/attach_hair_curves_to_surface.html

## Receipt (bytes; SHA-256)
- src/lib/avatarLashes.ts: 4823; b2848c4f97783a54df4efb3db7b438b55f65999864c7f62631c17746f424ec3d
- src/lib/avatarLashes.test.ts: 4817; f32a209a339f24f00e7f3f54f1fff2ba2dc18c2a60610cf8e6ed700fe7917f1e
- src/lib/avatarLashGuides.json: 30465; 0068fa5cfd377529495d85b5f4733b60393cfb3badd9d701a91db0ffa721a489
- scripts/author-avatar-lashes.py: 5269; 395a7bb753029f5d82763cdbb08943e0add39adf757a05650d2b230e5d544749
- src/components/Avatar3D.tsx: 55831; f31101354b74cfe8da2da6b6cf9b7968327ca381835d5b9f407bdc8c2bc9f947
- qa/avatar-quality-e2e.mjs: 74760; 991632ad8753032557d61c40b777c7c31a8ebd34f861c263bd3689776d719e1d
- public/assets/bodyforge-athlete-efficient.glb unchanged: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- idle-blink-portrait.png: 189053; e6577a8b3f84b06a677b17ef734f69a4e455899ed7fa03b7726532a794010d46
- idle-inhale-portrait.png: 189045; e71fd1bfa5bf0694851006c8e3619068d110d0e6cdd188ff4837435c7199be9f
- idle-neutral-portrait.png: 189530; 5d1b752de93058aad690796ddde0d23739db499296329495c83b192531d20388
- idle-open-portrait.png: 189199; e16a8335582b4e3a63f28d08e1c9032cab689a2648c09b5769eaf2a4cc9a1989

Local changes only. No Git push, deployment or modification of unrelated work. Remaining: isolate maximum-growth browser regression and improve hairline/skin/overall anatomy.
