# BF-107 - restore initial entry budget using on-demand appearance editor

Status: IMPLEMENTED / TESTED_LOCAL for entry-budget repair and bounded regression. Actual journal migration, production activation, physical-device acceptance, Vite security upgrade integration and release remain separate.
HEAD 664ab80c89b244bab1014ec5c652d11c6a490470; observed 2026-11-25T21:03:38.890168+03:00.
Decision: keep appearance state, startup application, persistence, cross-tab handling, trigger and native modal shell in AppearancePanel. Move editor controls to AppearanceDialogContent loaded only on user intent. Preserve existing settings, validation and actions. Explicit loading and caught failure; a late download never reopens a closed dialog. No change to reward logic, v1 journal or owner data. Added actual network-interception test and extended existing bundle gate; original 20% requirement unchanged.
Entry 394581 bytes, baseline 496761, reduction 20.6%; previous measured failed build 398302 bytes (different snapshot). Gzip 120757 bytes. Editor chunk not preloaded; dynamic import reference and actual first-click request verified. Initial entry digest 5fb3d1a3c232d8bdf31a64ab731566f38e5ff7a5e98b172e4dc7e94fcbe2b7e9. Existing >500 kB chunk warning remains.
TypeScript/build/bundle exit 0; full Vitest 1167/1167 in 109 files; new appearance lazy 13 checks. New test uses production preview with exact entry digest, seeded synthetic preference, withheld editor request, close during load, successful late load, reopening, persisted choice, focus return, failed module request and exact game storage preservation. No uncaught exception.
Native IndexedDB 69 PASS lines; targeted preference-draft 18; production mobile 124; privacy 13 (12 paths denied plus app). Both owned servers stopped. No physical Android or live camera accuracy claim. Full standalone appearance visual suite and separate private-QA-path suite not run in this step.
First isolated dev startup was denied by the new Vite private .bodyforge-qa filesystem rule. Corrected test infrastructure by copying exact 349 frozen inputs into a newly owned OS temporary directory, with original Vite deny config unchanged and loopback-only explicit source/dependency allow scope. All remaining gates then passed. The temporary dependency junction was removed without touching shared dependencies; the temporary source copy is retained as evidence.
Verified 349 source files, 74 build files, 10 PNG signatures and hashes; no independent visual review claimed. Toolchain Vite 8.3.4 (current installed root dependencies, not proposed security update). Current owned hashes match=True; v1 source matches=True; live drift 0 changed and 0 new paths. Exact paths in final-readback.json.
Diff check=0; staged owned diff check=0; canon=0; QA syntax={'qa/appearance-e2e.mjs': 0, 'qa/bundle-on-demand.mjs': 0, 'qa/appearance-lazy-e2e.mjs': 0}.
Remaining: safe bounded production storage integration/retention, actual authority handoff and recovery, large history and quota/device tests, security dependency update and other roadmap phases. Do not treat this receipt as general commercial readiness. No owner database migration, APK, Firebase, Git commit or push.
Rollback: restore only three original files from .before copies after confirming owned hashes; remove only unchanged newly added AppearanceDialogContent.tsx and appearance-lazy-e2e.mjs. Preserve concurrent work.
Commands: tsc -b; vite build; qa/bundle-on-demand.mjs; production qa/appearance-lazy-e2e.mjs; full Vitest threads; native qa/durable-journal-e2e.mjs; qa/appearance-e2e.mjs --preferences-only; production mobile/privacy E2E; verify_canon.py.

Owned paths | bytes (frozen) | SHA-256
src/components/AppearancePanel.tsx | 4747 | 4ee4453f03703d7fc6ee259f069310350456b6a7b6f9742a6a15e6c5b5b4e698
qa/appearance-e2e.mjs | 50999 | 19cb11a53197340da63d3bb5a01e71dcbf134bf1303896a7ba73b7bc819f48ff
qa/bundle-on-demand.mjs | 2851 | b2d404f720ce68e98849f7b75b60d55f21d6738f1485f39bc9dba3d5213b6a7f
src/components/AppearanceDialogContent.tsx | 5392 | 9c573c7a3e3bbe21cf3981c71d08d8f163a4766b172f0451ba36a5d3e859b019
qa/appearance-lazy-e2e.mjs | 7888 | 0090eb4c2bce5a03443f23cb47b3f06aee92c513723f2a8341d122d90e5788e5

References: https://react.dev/reference/react/lazy ; https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal
