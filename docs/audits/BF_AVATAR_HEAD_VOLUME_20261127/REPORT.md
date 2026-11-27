# BODYFORGE head volume V4 — local experiment
Status: PARTIAL (implementation, target tests, production build and enabled browser scenario verified; full visual acceptance not established).
Scope: local development only. No commit, push, deployment, distribution, or modification of real player progress.

## Geometry
55 manually selected correspondences from front and +/-55 degree views, 21 stable anchors, 19 registration inliers. V2 rejected by deformation gates; V3 rejected visually (chin transition). V4 uses smooth normalized Gaussian control volumes with protected anatomical boundaries.
V4 regression: 5101 fit samples, 1276 held-out samples; held-out residual RMS 6.09048 -> 4.91351 mm. These are sampled registration residuals, not an independent clinical or photorealism score. V3 used a different support/sample count and its RMS is not directly comparable.
Blender: 3806 vertices moved >0.05 mm, peak 3.45670 mm; 60438 protected vertices, minimum sampled Jacobian 0.74791, triangle orientation ratio 0.85088 (6424 triangles in derivation, 6418 in reopened float mesh). Scene reopened and shape keys and armature verified. Runtime: 3802 vertices moved, peak 3.456235 mm, 60438 protected; original index, UV, weights and protected facial positions preserved. Local bounds do not prove global non-intersection.
Private scene: .bodyforge-qa/scan-reference-artec/head-volume-review-v4.blend. Private numeric recipe stays under ignored .bodyforge-qa; the local-only endpoint returns only the 9 fitted zones. Source licensing must be resolved before distribution; no raw scan is served.

## Verification
- targeted-final.log: 17/17 tests, 4 files. Includes actual private recipe, protected face, normals, animation, independent paid group growth, reset.
- blender-readback.json: reopened private scene and original mesh correspondence.
- endpoint-verified.json: 9/9 checks, 1 valid local response and 8 denied requests.
- verified-on.log: 21 browser assertions; 4 captured frames; all 4 muscle groups maximum; synthetic game bytes unchanged; no uncaught browser exceptions; 96 skin diffusion draws.
- verified-off.log: failed due to Chrome Runtime.evaluate timeout; owned temporary profile cleanup incomplete. Fallback browser scenario not run because suite stopped on failure. No successful matched off/on pair from this run. Full repository test suite not rerun this turn.
- build-final.log: npm run build exit 0. Existing >500 kB chunk-size warning remains. Four experimental identifiers absent from production JS (0 hits).
- Original production GLB retained. Experimental mode not default. Visual inspection of enabled frontal frame confirms rendered geometry but does not establish AAA photorealism or a visual improvement over matched baseline. Android hardware/performance not tested.

## Dev-server recovery and decisions
Initial large PowerShell command failed with Windows virtual-memory shortage (0x800705AF); source checks confirmed no changes from that command. Split writes and scoped edits succeeded. Vite dependency optimization / snapshot watcher caused failed startup attempts (React dependency 404 and HTTP timeout). Vite config now explicitly enumerates optimized dependencies with noDiscovery and ignores frozen QA snapshots and audit folders in watcher. This is a dev-only optimization decision; new CommonJS dependencies may require updating include. Restarted only identified assistant-owned Vite process. HTTP and enabled browser checks then passed. Off scenario still timed out; causation not established. Free virtual memory was ~2472772 KB before final build. Further heavy runs deferred to avoid stressing system; no user programs or OS memory settings changed.
Local preview: http://127.0.0.1:5173/?avatarScanTorso=1&avatarScanTorsoColor=1&avatarScanTorsoNormal=1&avatarAthletic=1&avatarSkinDiffusion=1&avatarHeadVolume=1

## Next gate
Obtain matched baseline, experimental and missing-recipe fallback frames under stable memory conditions; evaluate full anatomical appearance and physical mobile performance; resolve asset rights before any publication. Do not equate tests with AAA acceptance.
