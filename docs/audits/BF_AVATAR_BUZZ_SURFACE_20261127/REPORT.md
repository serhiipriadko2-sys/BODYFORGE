# BODYFORGE scalp-surface buzz V1 вЂ” verified local review

Status: technical PASS for scoped opt-in hair experiments; AAA PARTIAL. No commit, push, deployment, distribution, real user-save mutation or OS setting change.

## Scope
- V3 directional card hair already verified in sibling BF_AVATAR_GROOM_V3_20261127 (85 browser assertions, 21 frames). The previous body and V2 hair GLBs remain byte-exact. Both styles retain head anchoring and existing dye control.
- New optional scalp-surface buzz uses the real skin mesh instead of the old opaque 1792-triangle shell (5376 indices). 256x256 R8 tile, 65536 base bytes; 16x16 jittered short projected segments, 0.72 mm nominal spacing, artistic width/length, mean atlas coverage 0.0909494. No new geometry or draw pass; 3 triplanar textureGrad samples on enabled scalp fragments. Reference for approximate scale: https://bionumbers.hms.harvard.edu/bionumber.aspx?id=116431 and https://pmc.ncbi.nlm.nih.gov/articles/PMC9113037/. Not a density measurement or physically measured hair reflectance.
- Existing scalp boundaries and skin lighting retained. Texture lifetime tied to body material. In review mode with V3 missing, the old buzz cap remains visible, and the surface shader stays disabled. On other hairstyles the uniform is disabled.

## Verification
- 18/18 targeted tests (5 files), full Vitest 1202/1202 (115 files), final TypeScript/Vite build exit 0. Experimental markers absent from production JS. V3 local endpoint 7/7 checks.
- Current buzz browser on/fallback: 30/30 assertions each, 14 frames. Enabled scenario observed 9 active surface draws, 90 inactive, zero original cap draws. Fallback: zero active draws, 99 inactive, 6 original cap draws. Verified switching away, exact synthetic game bytes unchanged, all four groups at maximum, no uncaught browser exceptions. Total for both sequential checkpoints: 145 browser assertions, 35 actual frames (not 145 distinct features).
- Matched comparison: five non-buzz portrait crops exactly identical to prior V3; buzz portrait 8514 changed pixels of 110250; all seven fallback crops identical to prior V2; torso crop changed 23134 pixels with maximum decoded channel difference 2/255. Possible draw timing/low-amplitude shading variation; no claim of global byte identity. No calibration or photorealism score.
- matched-buzz-comparison.png: 337160 bytes, SHA256 5f15d9484746be1b97e25d104b31175a1758bd4be2a602333f3d4f82c440d36a.
- Visual observation: eliminates helmet silhouette and gives visible skin between hairs. Current material resembles closely shaved scalp rather than dense short-cut hair; hairline and pigmentation require artistic refinement. Dark V3 long hair still slightly over-glossy.
- Memory headroom recovered before testing; guarded sequential browser and test runs completed. No hardware Android benchmark. No ADB on PATH observed. No global performance or zero-error claim. Existing V3 checkpoint bundle-size warning; latest build succeeded.

## Local review
http://127.0.0.1:5173/?avatarScanTorso=1&avatarScanTorsoColor=1&avatarScanTorsoNormal=1&avatarAthletic=1&avatarSkinDiffusion=1&avatarHeadVolume=1&avatarGroomV3=1&avatarBuzzSurface=1

Next acceptance gate: improve visual hair density and pigment under multiple lights, then stronger head/skin and muscular relief work and actual device profiling. Current experimental switches are excluded from production assets. Do not equate QA with AAA visual acceptance.