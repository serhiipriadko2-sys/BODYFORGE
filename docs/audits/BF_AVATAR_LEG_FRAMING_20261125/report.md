# BODYFORGE - hip verification and leg camera framing

Date: 2026-11-25. Local implementation and targeted QA PASS; AAA goal remains PARTIAL.

- Previous hip browser runs timed out before the avatar appeared. Added synthetic-browser failure diagnostics (DOM readiness, canvas attributes, local failed request paths, recent exceptions and screenshot); does not change pass/fail conditions. On an isolated loopback Vite server with HMR disabled, old camera max and neutral runs each passed 22 assertions. This does not establish the exact historical timeout cause. Old server logged an EBUSY watcher error on a journal file; one disposable browser profile cleanup was incomplete. No owner profile inspected or edited.
- Inspection of the old rear screenshot showed clipped upper shorts. Leg camera only: previous camera position (0,1.26,4.25), look-at (0,1.20,0); final position (0,1.44,5.47), look-at (0,1.39,0). FOV unchanged. No new geometry, texture, render pass or gameplay change. Other three views unchanged. First candidate failed the existing projection margin target; changed camera rather than weakening test.
- Final projection test uses the actual compact rig, fitted shorts, shoes and six trainer detail meshes, three growth states, two widths, six orbit angles, three aspect ratios. 698328 projected vertices across configurations (not unique vertices), min/max normalized Y -0.924702/0.902637, max abs X 0.576302. All pass the +/-0.95 margin. Targeted Vitest 10/10, four files. Full TypeScript and Vite build PASS; old journal errors no longer reproduced before our camera edit. No journal changes made by this pass. Existing large-chunk warning remains (Avatar3D 834.81 kB, gzip 236.10 kB).
- Final actual browser max and neutral each 22 assertions PASS. Real compact GLB and indexed fitted shorts draw, front/rear view and unchanged exact synthetic save bytes, zero uncaught exceptions. Max rear screenshot visually inspected: complete shorts and shoes now visible. Before/after camera pairs saved; difference is framing, not an anatomical sculpt or an independent photorealism score. Full suite, physical Android performance and refined photographic face candidate not reverified. No commit, push or deployment.
- References: https://playwright.dev/docs/best-practices ; https://chromedevtools.github.io/devtools-protocol/tot/Network/

## Receipts (relative path; bytes; SHA-256)
- src/lib/avatarViewFraming.ts: 347; 83baeea9c53ad34720cd2a56af7398b329afd7e11c9479f19fa73e46b212456b
- src/lib/avatarViewFraming.test.ts: 4041; 45824b1afac240becb08c5875c366ce497d565e8217ac05f5a1b4eb490d6f9e2
- src/components/Avatar3D.tsx: 61848; c6196c8560890bc46b99e7c648147ceafe41337e2eed19c9f2a62626cef75b01
- qa/avatar-quality-e2e.mjs: 108266; 83b6e38419491ecc622dc2a82f511874228f42017e1750ba965d8314b72b89d8
- public/assets/bodyforge-athlete-efficient.glb: 4639184; df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e
- docs/audits/BF_AVATAR_HIP_VERIFY_20261125/hips-max-front.png: 199821; 43405031655b25455c359829888a7567cb9a9704cdec2cd651ce92966b9443c7
- docs/audits/BF_AVATAR_HIP_VERIFY_20261125/hips-max-rear.png: 199802; d0be3a7954a48f338af55ebfdf7523b9e957c19585c886ea99413c3b8702a739
- camera-before-after-front.png: 345348; 372a0d26b3e3aff149c8622d7cd2c394bc0ca8a45b0f4f5b1cf238bdc7253a9e
- camera-before-after-rear.png: 357481; 9b25c4d8a97366c05882653c842cecc4d0da2db60b9acedc942436a716ddee75
- hips-max-front.png: 198707; 389a5f78f75860693be388b164ae58cec841d7e089cf41fabaf9dff42ca9e727
- hips-max-rear.png: 198696; 26922322908b70815c5ecc11c9c6a105f9af7e4876bf989c06b7ef00aa5b8465
- hips-neutral-front.png: 198496; 2c4e9bb2718cd303f6afb5355d7d6938126a758e0e6dc52ea591606f739aa77b
- hips-neutral-rear.png: 198167; 829bd1fe93fb79dd51c9ba8ed5e246e20ca879e3d08616eaccfc0b874e53c76e
