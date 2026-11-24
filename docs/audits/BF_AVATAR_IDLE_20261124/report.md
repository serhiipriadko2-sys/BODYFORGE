# BODYFORGE — live idle animation

Date: 2026-11-24. Status: locally implemented and browser-verified; PARTIAL toward AAA.

## Scope
- Deterministic breathing, subtle spine/neck/arm movement, gaze and paired upper/lower eyelid rotations on the actual pinned athlete skeleton. Eleven verified joints; no new body asset, stored progression change, or animation download.
- Existing growth compensation preserves head, hand and foot bases during animated respiration. Garment seams are updated from the evaluated skinning; original body geometry and weights remain unchanged.
- Studio-only motion toggle, default enabled. Target cadence is 20 Hz, not a measured device FPS. Motion stops in economy graphics, reduced-motion mode, background/offscreen or paused state, legs inspection, and on disposal. The onboarding and other static views remain event-driven.
- References: https://threejs.org/docs/pages/Mesh.html ; https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame ; https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API ; https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion .

## Verification
- Targeted Vitest: 27/27. Full Vitest: 62 files / 637 tests passed. Production build passed; pre-existing chunk-size warning (>500 kB).
- BODYFORGE_QA_IDLE_ONLY=1 node qa/avatar-quality-e2e.mjs: 29/29 assertions, exit 0. Real GPU draws under native RAF and QA-controlled exact pose timestamps; screenshot differences for authored motion, max growth, no recurring draws after stop, preserved synthetic save, zero uncaught exceptions.
- node qa/avatar-lifecycle-e2e.mjs: 23/23 assertions. Static view idle GPU draws = 0; background draws = 0; no uncaught exceptions.
- Visually inspected neutral and peak blink portraits. Eyelids visibly close; this is not a photorealism score or proof of collision-free eyelids in all poses.
- Pixel difference counts in defined portrait crops: breath/pose 4598; blink/open pose 604 (summed RGB threshold 15). These include other pose changes and are not isolated eyelid or breath metrics.

## Receipt
- src/lib/avatarIdle.ts — 5052 bytes — SHA-256 37a6e2ca058a933ead82d4890ad7f796d377d0400bd21eca232333908b64b1f3
- src/lib/avatarIdle.test.ts — 7466 bytes — SHA-256 77d1bfbce4bde040707f147d62d28ac99276cd89656878bb17d8c9535c96c0df
- src/lib/avatarGrowth.ts — 3872 bytes — SHA-256 6c50a869ce4cba6c874814f395be51b97fb23c631628ffb3217fc5270f160039
- src/components/Avatar3D.tsx — 53457 bytes — SHA-256 c4c4c332b3f285adbea03fb54bfccb77c76acbcb3d31dfbcab8fe2ed1f14cabb
- public/assets/bodyforge-athlete-efficient.glb — 4639184 bytes, unchanged SHA-256 df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- idle-neutral-portrait.png — 196122 bytes — SHA-256 67542dbcce0bb3565d04bcb9fd3324b743d7702284844379031b34aa521bd1e7
- idle-inhale-portrait.png — 196231 bytes — SHA-256 6995fc80a337bbec897629793d76e682427054b4733ea8576a57706fd6ed3dff
- idle-blink-portrait.png — 196166 bytes — SHA-256 14a4b97cfffbc2e23146f3f9f45883fcd6dc71e9bc9bbd698740ee845b7d27aa
- idle-open-portrait.png — 196264 bytes — SHA-256 61c49de2c2ef86bbc3bcfc4d561b78d59a799e05e13cb4ec4f8a7bc43b5a302a
- idle-level5-torso.png — 203659 bytes — SHA-256 f02f62c48c0ef49a5bea3b4e2c47535d05a81a3885bfe911848b1c2c09f7fb85

## Limits
No new Blender sculpt in this pass: the existing Blender-exported rig is animated in Three.js. No physical Android FPS, power or thermal measurements; Chrome used software WebGL. No mocap, full facial expression set, cloth simulation, new lighting or AAA equivalence claim. No Git push or production deployment. Unrelated local changes preserved.
