# BODYFORGE photographic studio lighting

Date: 2026-11-24. Status: implemented locally and browser-verified; PARTIAL toward AAA.

## Changes
- Pinned CC0 Poly Haven Studio Small 03 environment (Greg Zaal), area-averaged to 512x256 in Blender with bounded linear radiance and direct RGBE export. Local asset, no runtime third-party request.
- Three-point lighting with restrained rim tint, one 1024px PCF key shadow map fitted to each hero view, pedestal receives shadows. Economy mode disables shadows, static non-studio views keep the cheaper budget. Local synthetic RoomEnvironment remains fallback.
- Existing geometry, rig, growth, clothing and idle motion retained.

## Verification
- Production build passed; existing >500 kB chunk warning. Targeted tests 7/7. Full suite: 63 files, 643/643 tests with --maxWorkers=2. First parallel run had two 5-second timeouts (avatarOcclusion and avatarPhysique); both passed without changing assertions/timeouts.
- BODYFORGE_QA_LIGHTING_ONLY=1 node qa/avatar-quality-e2e.mjs: 44 assertions passed; real skinned PBR draws and depth pass in four views, economy disables shadow/depth draws, blocked HDR fallback, level-5 recovery and rear view, unchanged synthetic save, no uncaught exceptions.
- Initial browser launch hit EBUSY on its disposable DevToolsActivePort; harness now retries transient file-lock reads. First disposable profile cleanup incomplete. No owner profile touched.
- Shadow comparison changed 916 pixels and HDR-vs-synthetic comparison 18148 in defined portrait crop at summed RGB difference >=15. These establish visible change, not realism scores.
- Blender image.save first produced altered radiance; replaced with direct linear RGBE encoder and independently decoded mean .365015 and peak 32.1016.

## Receipt (bytes, SHA-256)
- public/assets/athlete-studio.hdr: 424097, 47904da51b108266a26ab71e56626304cfe744c49767472ca640a22ac4067614
- public/assets/athlete-studio-source.md: 1092, 079aa5d4316f59a1bff62f5e13942f3bb0a7fe9f6da2dc121091189d9a4e841e
- scripts/prepare-avatar-studio.py: 2967, 04debd586f19e93e976f02b177e8d19ad683fde17968b7b6cdffea23741c5712
- src/lib/avatarLighting.ts: 1946, 5cbe7af9c3dc40542d0948d8159fc049896f4de976152ae7ba98658bcb203a8a
- src/lib/avatarLighting.test.ts: 2824, 44a3605c946dc2bdbb3733c60de9c600bc6eedf15f5d40839cb7c993868db174
- src/lib/avatarStudio.ts: 1397, aa191b90a0e0ee49c54a9ca328f6a21dcfc61f48fb65b3f4921d5ae430d17f35
- src/components/Avatar3D.tsx: 54657, 20596f1d7b704cb97c6514625a299fe267ce65928d9a2896ad0a984496703b4e
- Original bodyforge-athlete-efficient.glb unchanged: 4639184, df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- studio-full.png: 202471, 247ee43355cb14b594874bae60c4158b1c4616367ee42b1c36fc6caa34e3f304
- studio-legs.png: 203937, 8211d0376b262f4c371486294b0bb3b7e678a9f0e9e2e9b7b8f6de7f5f4c9255
- studio-level5-rear.png: 203713, 3839292f4186140889c8578511cf470a250a1414f92a201f7618c4040844cf82
- studio-level5-torso.png: 205524, 7ba5133938625745f8edf65a284c6b1148faa08e62197a5575a78f6fd7d1aefc
- studio-portrait-economy.png: 194914, 634cd1a0101f87911275def6ef3c1eb476fca920dff45d3e2510f53574c3d6de
- studio-portrait-synthetic.png: 196309, 86c0f095e5bf8391ca376db1ec9dd3821a1480d96403a093305b6891fd70d070
- studio-portrait.png: 197719, 27b64fe0c1cee22f0b3b2fcf72b0b12f991bd4c300db2458f2a278e7ede4673a
- studio-torso.png: 204060, 50e024278b5f3568500b59e0216aa4843fe1114ed69073615d638bedc4368ea8

## Limits
Chrome software WebGL, no physical Android GPU, thermal or sustained FPS measurements. Shadows cost additional rendering; economy disables them. Visible limitations remain: artificial skin and hair, fitted cloth highlights, cut edges and simplified anatomical shapes. No AAA equivalence, production deployment or Git push. Prior unrelated local work preserved.
