# BODYFORGE — Training activity moved from Forge to Camera (2026-11-24)

Status: IMPLEMENTED / TESTED_LOCAL for the requested relocation. Additional pulse-armory browser QA: BLOCKED (Chrome exit before navigation). No commit, push, Firebase deployment, physical-device verification or camera accuracy claim.

## Scope
Workspace: E:\github\BODYFORGE. HEAD: 4ddbfa7e74d876ed866ae5cdb1da9a807fa33095.
The user requested moving only the training activity card from Forge to Camera. The fighter development ring remains on Forge. A single mounted progress board retains the selected range and date between tabs. On Camera the existing activity card follows the camera controls; its two action buttons are disabled during a busy workout. No change to rewards, workout calculations, storage keys, or camera permissions. Previous Chronicle collapse changes are preserved.

## Verification
- Baseline regression before implementation: failed expected assertion that activity is absent on Forge (baseline.log).
- Initial build failed because the existing static rendering test omitted the new explicit props. Updated the test and added a visibility/disabled-action assertion. Final npm run build: exit 0; existing large-chunk warning remains.
- npm run qa:bundle: exit 0; entry 394056 bytes, reduction 20.7%, camera chunk 154276 bytes.
- npm test -- --maxWorkers=1 --no-file-parallelism: exit 0, 578/578 in 50 files.
- qa/forge-home-xp-faq-e2e.mjs: exit 0, 47 PASS lines; activity visible on Camera only, follows existing controls, single card, fighter development stays on Forge, 7/30 day range preserved across tabs, FAQ and quick navigation work.
- qa/pulse-day-touch-e2e.mjs: exit 0, 65 PASS lines; day selection and keyboard focus, 320/360/390/428 px, no horizontal document overflow, range selection does not rewrite stored fighter.
- npm run qa:pulse-armory: exit 19 twice, Chrome exited before CDP connection/navigation; no browser exceptions observed because scenario did not start. This gate is BLOCKED, not a proven application failure or PASS.
- git diff --check: exit 0, LF/CRLF advisories.
- Dev http://127.0.0.1:5173/ and production preview http://127.0.0.1:5176/: HTTP 200; isolated Chrome E2E used preview. Developer server retained. Actual user's VS Code window contents not independently observed.
- Screenshots and logs in this audit directory; visual inspection of screenshot pixels and real-phone behavior are not asserted.

## Fingerprints
| File | Bytes | SHA256 |
|---|---:|---|
| src/App.tsx | 82190 | 7c4764641c6cd83c2eb145dfb80a96499f3f80ae5fdee6aa15657c762977ab21 |
| src/components/ProgressPulseBoard.tsx | 14295 | dcd353783d3cf437182229265430483cff091a45ef79d4c77e061874741728c7 |
| src/neonPulseV2.css | 34992 | fa9f465992280a6f6b5d6c190f2cbfee7dd21e40caa81f97685cb41167013cf0 |
| src/lib/progressPulse.test.ts | 7785 | dde3061c330da73eca736e60b2438ab818a5f94c517e487a4055cdba7f6c488c |
| qa/forge-home-xp-faq-e2e.mjs | 16943 | 30b71097234505407cef49dda96d18854a380b2b963c5dd98ac9b9464fe2071a |
| qa/pulse-day-touch-e2e.mjs | 10923 | 6888cc81a8d515835ea2756c7f693e5eff8ca9610b6fc2c4914a858842b8a803 |
| qa/pulse-armory-e2e.mjs | 16671 | 9c9e8026072895d055612f93850a353a027b32e4dda236ac6025fa84bdb42b50 |
| src/index.css (prior Chronicle patch, unchanged) | 28424 | b841e98262956ded909ba0d64378006551a70a5364f75e0ffb72599e0a71daf0 |

Rollback: compare exact current hashes with this receipt, then revert only this iteration's diff using the *.before copies in this directory, preserving prior Chronicle changes. No destructive Git operations. Next: verify on owner's screen and investigate the separate Chrome-launch blocker before broader release.
