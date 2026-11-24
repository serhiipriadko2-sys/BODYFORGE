# BODYFORGE — fitted trainers and full-orbit inspection

Date: 2026-11-24. Status: locally implemented and verified; PARTIAL toward AAA.

## Scope
- Original Blender-authored outsole, foam midsole, tongue, eyestays, laces, and stitching. Adapted to the pinned CC0 MakeHuman-derived shoe surface, without a new external asset or rig.
- The sole is rigid on the existing protected foot bones. Upper detail weights are transferred by closest-triangle barycentric interpolation; the donor is validated before scene adoption. Original footwear remains if loading or validation fails.
- 360-degree orbit and new torso/legs camera modes. Existing face and full-body views retained; no change to game economy or persistence.
- Existing body asset remains unchanged: SHA256 df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e.
- Donor: public/assets/bodyforge-trainers.glb, 122828 bytes, SHA256 6bb23fd585b4c21c81c81c17c3d50e5f902f36936c1c88513f54cd2bd968f957. Blender generator: scripts/author-avatar-trainers.py.

## Evidence
- Full Vitest: 59 files / 611 tests passed. Build exit 0; existing >500 kB chunk warning.
- BODYFORGE_QA_TRAINERS_ONLY=1 node qa/avatar-quality-e2e.mjs: exit 0, 61 explicit assertions plus readiness waits.
- Real skinned indexed draws for donor parts, new selector at 320/360/390 px, complete turn through angle wrap, blocked donor fallback, level-5 growth, identical rear yaw, unchanged synthetic save and no uncaught browser exceptions.
- Pixel comparison: footwear 1796 changed pixels, rear torso 28019 changed pixels (summed RGB threshold 24; defined test regions). This establishes visible differences, not an AAA quality metric.
- trainers-0-legs.png: 197376 bytes, SHA256 0ce991196087ccb399b02ece76a03a8305e06f8719e024b3fa96e8d2ddc9eb99.
- trainers-5-legs.png: 200122 bytes, SHA256 e9f365593a935aa41b7301402635897f1d068c7ffdc832f3a4d376fc879dbb21.
- trainers-fallback-legs.png: 194028 bytes, SHA256 fe25544dbb4b43dd06cebd67ca2711b6515f70940f91b831b99ba560378bc61e.
- growth-0-rear-torso.png: 194952 bytes, SHA256 715ac944cb8b0eb98fbdb4f76c29f9568b6caff608df33b35e84d8b641f3b3a5.
- growth-5-rear-torso.png: 197406 bytes, SHA256 161eab9170324fe84b7010e3c23c3659f605fc3856eb291b6f11547a1a14f074.

## Limits and decisions
Initial closest-vertex transfer rejected the sparse shoe hull; replaced with closest-triangle transfer and re-tested. Sole geometry was simplified before integration to keep the asset small. No full-body model replacement, animation loop, remote Git push, deployment, Android GPU timing, or AAA equivalence claim. Original asset and concurrent project changes preserved. Remaining artistic limitations: garment cut/fit, sculpted facial detail and hair, movement, lighting.
