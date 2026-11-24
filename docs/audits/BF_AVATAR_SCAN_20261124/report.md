# BODYFORGE — measured skin and textile pass

Status: PARTIAL toward AAA / implemented locally and verified in Chrome software WebGL.
Date: 2026-11-24.

## Changes
- Real scan-derived, seamless 256px skin height tile layered on the existing normal atlas with a bounded single-pass shader. No donor face or rig is transferred.
- Measured 512px textile normal and roughness maps; dedicated PBR cloth material with fibre sheen and preserved outfit tint.
- Optional asset loading, fallback and scene-owned texture disposal.
- Existing muscle progression, rig, clothes deformation and game economy remain intact.
- Attribution and adaptation records: public/assets/athlete-scan-source.md; linked from AvatarLab.

## Verification
- Full Vitest: 58 files, 609 tests passed (before adding attribution-only link).
- Production build after link: exit 0. Existing >500 kB chunk warning remains.
- BODYFORGE_QA_SCAN_ONLY=1 node qa/avatar-quality-e2e.mjs: exit 0, 19 explicit assertions plus readiness waits. Real linked shader draws, all three optional assets blocked, fallback, recovery at max growth, unchanged disposable fixture and no uncaught exceptions.
- Same portrait crop: 1588 pixels changed by >=5 summed RGB units; total absolute RGB difference 22310. This is evidence of visible material changes, not a realism score.
- Source maps + derivatives pinned and documented in public/assets/athlete-scan-source.md.

## Evidence
- scan-full.png: 197019 bytes, SHA256 64fa43bc36531546ffbd3c443d20d4b3729445b07db8a5c64af9efbe08c8c893.
- scan-portrait.png: 193745 bytes, SHA256 32a46348bf5eaf22edd87da4c0dd854536e453311d0e9a8063e44df90cc347d7.
- fallback-portrait.png: 187119 bytes, SHA256 89cbb419c4541534394ea3232b92e1f5d8f5242028d7222019e974ccb615f982.
- scan-level5-full.png: 199614 bytes, SHA256 7a5c946800b73aeaba5af14511e6acf333003364cc7529399e5da73272b91e36.
- scan-level5-portrait.png: 193364 bytes, SHA256 c72f5a16dbda5dd71013356c4a4b677e191a22dc67e02fd8ca99f68800484662.

## Limits
New maps add 113791 bytes. GPU frame time, real Android and artistic AAA equivalence not verified. Existing clothing shell, hair silhouette and face geometry still limit visual fidelity. Initial textile preparation rejected the non-square 1024x1023 source, then succeeded with the actual pinned dimensions. No Git push or production deployment performed.
