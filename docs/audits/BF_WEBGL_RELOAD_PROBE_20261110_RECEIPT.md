# BODYFORGE WebGL reload isolated probe / receipt

Date: 2026-11-10
Git HEAD: ad0c23b86f9d1776807882c2fc7a8a43639573ce
Scope: docs/audits/BF_WEBGL_RELOAD_PROBE_20261110.mjs (new diagnostic only).
No application/3D/QA production source was edited in this iteration.

## Reproduction matrix
Fresh isolated disposable Chrome profile, production preview http://127.0.0.1:52871/, headless SwANGLE SwiftShader.

1. No fighter, full page reload: PASS, exit 0, cc0 GLB active before/after, zero observed webglcontextlost, zero browser errors.
2. Profile scenario: create fighter; disposable-profile fixture 180 coins; buy 1 arms upgrade and ember outfit; reload; reopen forge.
   PASS, exit 0. cc0 GLB active before and after; arms 1, outfit ember and coins 95 unchanged after reload; zero observed context-lost events and zero browser errors.
3. Earlier full qa:mobile (different, much larger multi-step scenario): FAIL exit 12 with shader validation errors/GLB fallback after reload; later full qa:mobile FAIL exit 12 Runtime.evaluate timeout. NOT CLEARED by this probe.

## QA gates
node --check diagnostic script: PASS exit 0.
npm test -- --maxWorkers=1 --no-file-parallelism: 575/575 PASS, exit 0 (current working tree at run time).
npm run build: PASS exit 0 (current working tree at run time).
Preview HTTP: 200.
git diff --check: PASS exit 0, LF/CRLF warnings only.

## Artifact
Path: docs/audits/BF_WEBGL_RELOAD_PROBE_20261110.mjs
Bytes: 9386
SHA256: 3D718874EF641C5A530A80E836B153659F647A4BB8018437C215A3BB22301E43
Rollback: delete only this new diagnostic .mjs and this receipt.

## Limits and next discriminating check
The tested browser is software WebGL, not a physical Android device. This check is narrower than full mobile QA; do not call release/mobile/accuracy PASS.
Six pre-existing BODYFORGE QA Chrome profiles observed active; not killed because ownership across sessions is not established.
Need isolate full mobile sequence or instrument CDP timeouts and WebGL context event history, keeping other agents' files intact.
No commit, push, Firebase deploy, personal data export, camera capture, memory write, or canon modification.