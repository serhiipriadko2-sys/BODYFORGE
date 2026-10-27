# BODYFORGE · Efficient athlete GLB + mobile loading QA · 2026-10-27

**LIFECYCLE:** LOCAL PASS for the scoped implementation, **NOT COMMITTED, NOT PUSHED, NOT DEPLOYED, NOT VERIFIED ON A PHYSICAL PHONE**.

Workspace: `C:\github\BODYFORGE` in the owner's existing VS Code window; branch `main`, observed HEAD `dcd2471ec7eabcf0f564c6ec077745b15edda769`.
The working tree contained **43 modified/untracked paths** at final inspection, some from simultaneous development. This receipt covers only the specifically scoped files below; it does not freeze the whole repository or authorize a Firebase release.

## 1. Changes made

1. **New near-lossless primary GLB.** `public/assets/bodyforge-athlete-efficient.glb` is created from the pinned CC0-derived full-precision `bodyforge-athlete-detail.glb` without deleting triangles, bones, meshes, skinning hierarchy or materials. Runtime now tries efficient → original detail → realistic → previous athlete → original MakeHuman rig, and retains the procedural avatar if WebGL is unavailable.
2. **Conservative packing.** glTF `KHR_mesh_quantization`, normalized signed 16-bit normals (4-byte aligned stride 8), normalized unsigned 16-bit weights, and normalized 16-bit UVs only when their source is within [0,1]. Original UVs outside that range remain floats.
3. **Reproducible authoring.** `scripts/pack-athlete-glb.py` checks the original GLB SHA-256, refuses overwrite/unknown extensions, verifies skeleton and mesh metadata and writes only to a new isolated candidate. A second independent generation produced an identical SHA-256. Blender 5.2 was invoked **read-only** to inspect source and candidate, never saving over the source `.blend`.
4. **Measured visual parity.** `scripts/compare-athlete-screenshots.ps1` compares nine paired real Chrome/WebGL screenshots sampled in the avatar area, not just React dataset labels.
5. **Better first mobile download.** `CameraControls` is dynamically imported only when the training section is needed, with a visible loading state. The original strict entry-JS budget was preserved; `qa/bundle-on-demand.mjs` now asserts the camera-controls chunk stays separate and unpreloaded. Mobile E2E checks lazy loading before/after entering training.
6. **Repeatable QA.** `npm run qa:athlete-glb` checks pinned hashes, immutable source geometry/skin nodes/materials, every packed accessor's numeric error and the byte-exact `dist` copy. The athlete-quality E2E now checks that the **compact** model really loaded instead of silently falling back, then exercises every fallback in sequence.

## 2. Model metrics

| Attribute | Original | New |
|---|---:|---:|
| GLB bytes | 6,038,680 | **4,639,184** |
| Absolute reduction | — | **1,399,496 bytes** |
| Relative reduction | — | **23.2%** |
| glTF mesh primitives/meshes | 15 | 15 |
| glTF triangles | 129,973 | 129,973 |
| Skin joints | 163 | 163 |
| Embedded images | 0 | 0 |
| Normal vertices quantized | — | 89,104 |
| Weight vertices quantized | — | 89,104 |
| UV vertices quantized | — | 82,817 |
| UV vertices retained as floats | — | 3,201 |

SHA-256 original: `16d3f6110d07179d71378af462a2c0ddc99d7e73207df123b3401769f18d53d6`.

SHA-256 compact: `df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e`.

Largest observed component deviations: normals `0.00001526`, weights `0.00001125`, UV `0.00000763`. These are quantization errors, **not measured changes in physical biomechanics**.

Blender import comparison: **PASS**. The imported scene preserved 163 bones, 15 skinned meshes plus the same unskinned scene object, 89,146 imported vertices and 130,053 evaluated triangles (includes 80 scene-only triangles beyond the 129,973 glTF-mesh count). Maximum world bounding-box difference `1.19e-7` scene units, aggregate skin-weight deviation `0.000392`.

**Pixel QA:** 9/9 paired screenshots, 5,865 sample pixels per view, 52,785 samples total. Maximum observed mean RGB difference across sampled views approximately `0.001 / 255`; fraction of pixels with per-channel difference above 24: **zero**. This is a controlled Chrome/SwiftShader comparison, not a claim of pixel identity on all phones.

## 3. Final observed QA receipts

| Command / scenario | Result |
|---|---|
| `npm test -- --reporter=dot` | **492/492 PASS**, 41 files |
| `npm run build` | **PASS** (TypeScript + Vite) |
| `npm run qa:bundle` | **PASS**, entry `394,711` bytes, **20.5%** below 496,761-byte baseline |
| `npm run qa:athlete-glb` | **PASS**, 4,639,184-byte built asset identical to source |
| Blender 5.2 read-only import compare | **PASS**, skeleton and mesh data preserved |
| 9-way screenshot pixel parity | **9/9 PASS** |
| `npm run qa:avatar-quality` | **50 browser checks PASS** including compact source and multi-level fallback |
| `npm run qa:avatar` | **22/22 PASS**, zero idle/background GPU draws |
| `npm run qa:avatar-observers` | **21/21 PASS** |
| `npm run qa:resilience` | **63/63 PASS**, camera/model/GPU fallback |
| `npm run qa:finish-save` | **28/28 PASS**, quota and conflict reward safety |
| `npm run qa:tower20` | **PASS**, one complete synthetic workout/bonus |
| `npm run qa:multitab` | **31/31 PASS**, concurrent durable writes |
| `npm run qa:camera-runtime` | **26 checks PASS**, delayed MediaPipe and cancellation |
| `npm run qa:pulse-armory` | **54 checks PASS**, cosmetics/persistence |
| `npm run qa:mobile` | **PASS** on repeat, including delayed CameraControls import, MediaPipe, lens switching, Wake Lock, 360px |
| `npm run qa:pwa` | **PASS**, installed asset paths and loopback HTTP |
| `npm run qa:privacy` | **PASS**, 12 blocked private development paths |
| `git diff --check` scoped tracked paths | **PASS** |
| Targeted secret-pattern scan | **0 hits** |
| Independent rebuild of compact GLB | **PASS**, exact SHA-256 match |

**Important residual signal:** One mobile E2E run failed to select the simulated rear lens while capture remained active. A subsequent instrumented run passed, confirming the expected selected state and message; the cause of the first failure is not established. The fake single-camera environment does not validate a physical multi-lens Android. Do not reclassify that first failure as non-existent.

## 4. Exact local file inventory

The following **13 existing or new scoped files**, totaling **4,847,856 bytes**, were read back on the Windows filesystem. These hashes cover complete files; shared `App.tsx` and mobile QA scripts may contain unrelated concurrent changes and their full SHA-256 does not assign authorship.

| Scoped file | Bytes | SHA-256 |
|---|---:|---|
| `public/assets/bodyforge-athlete-efficient.glb` | 4639184 | `df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e` |
| `src/components/Avatar3D.tsx` | 40442 | `9f36e8b72644a8e2dc24a09c0ff466f99ec58b2c6fac7fcde8e08cc6e1b2e079` |
| `src/App.tsx` | 79487 | `96bc691fd6aeee88a46acb593d9e097525e32b2ea0cec83ca9b156dcb31c5bc8` |
| `qa/avatar-quality-e2e.mjs` | 19903 | `fc71abc5e4a4b6f15202a9873df3c79018489e07491f102158f99ec5b54b8f8d` |
| `qa/mobile-e2e.mjs` | 28889 | `6f3642500815f42d936c4b8ef8adcd4d2e9f647285b97ab137955ef7bf758dea` |
| `qa/bundle-on-demand.mjs` | 2322 | `185f3f75479fb441b9b0f3640b8878806faa5aab0048d2b627bee9e0d4f92701` |
| `qa/athlete-efficient.mjs` | 6496 | `684bd0f6b303950bb9460c6dfd7fb838dcf515c89625a48ee21f57f23e14dfb9` |
| `scripts/audit-glb-structure.py` | 4574 | `db276153a890142bc8a2500461c7495ddec18d1d3757b3f40bca7465170b7544` |
| `scripts/pack-athlete-glb.py` | 12514 | `cd49643a694feb1d779a9b9c0100a16b98befea00016c7887ceff88695b0f3e9` |
| `scripts/verify-athlete-glb-blender.py` | 5471 | `2b837883c98fddad22f5e48f0ae5fb9d9dd5d58e29241a0b7a3d52061277288d` |
| `scripts/compare-athlete-screenshots.ps1` | 2579 | `33d6e09b89cf61e975499f0e030b83c243cf65b26c2a5fef34f9bf616c6b9f35` |
| `docs/AVATAR_ASSET_LICENSE.md` | 4183 | `fbbb6f373e92c4fd99f962a1be2582c9d09720ff036f4651822240fd1db42e2a` |
| `package.json` | 1812 | `1cf98ce082c080404af7ff1395ec1211ee43e5350783c3ceee2e9d89134e5ba1` |

## 5. Release and rollback boundaries

- **Original 6,038,680-byte detailed GLB and editable Blender source are unchanged.** To rollback this optimization, restore the previous asset order in `Avatar3D.tsx`, leaving the original GLB as first choice.
- No new camera recording, personal data collection, cloud upload, server storage or API credentials were introduced by this optimization.
- The 3D JavaScript chunk itself is still about **651 KB**, and WebGL/texture runtime memory is not proven lower by a smaller transferred GLB. A smaller download is not a demonstrated improvement in thermal or battery measurements.
- No physical Android/iPhone camera, multi-lens switching, install, frame-time, heat or battery test was run.
- Parallel work remains in progress. **No Git commit, push, Firebase Hosting deploy, release rollback, or live-site verification occurred in this task.**
- To release: freeze the exact tree/commit, reconcile concurrent edits, rerun all gates, verify Firebase target and backup channel, perform physical-phone acceptance, then deploy with read-back and rollback proof.

**Receipt verdict:** scoped engineering **LOCAL PASS**; production readiness **NOT VERIFIED**.
