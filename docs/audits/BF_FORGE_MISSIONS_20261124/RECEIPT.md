# BODYFORGE / missions moved to Forge
Status: IMPLEMENTED / TESTED_LOCAL; no APK, deploy or commit.
HEAD: 4ddbfa7e74d876ed866ae5cdb1da9a807fa33095
Scope: one mounted DailyBoard, visibility only on dashboard, shortcut scrolls to missions on Forge, steps and activity remain on Camera. Existing reward handlers/storage unchanged. Previous unrelated edits preserved.
Baseline regression FAIL, build and bundle PASS, unit 596/596, Forge browser 
67
 PASS assertions, mobile 
86
 PASS assertions. Four mobile widths 320/360/390/428, bonus once and tab switches preserve exact save. Appearance QA selectors updated but full suite not run; physical phone not tested. Existing large chunk warning.
Rollback: compare hashes below then restore owned files using .before backups. Screenshots captured in browser; not independently visually inspected.
Fingerprints (path | bytes | SHA256)
src\App.tsx | 82570 | 4535ace2df64fe68998ba7e2d657d0a21cd3cfe4c64041307dfd8442fcada282
src\neonPulseV2.css | 35306 | eb21a4d38146407990dcca44e9ecfc3ef069f5e76c41f1164902aa4f62aa5a41
src\components\ForgeQuickDeck.tsx | 3305 | 1e195e59f320b06d0112769c46cbe755c24a0cfe8513c6bd729bdf5b5dcc2905
src\lib\screenNavigation.test.ts | 3040 | b16c9f789f3ba5cbacbe0a85d836a12ba9d9f3b2f53ff086b9d3f9b697ecc5e7
qa\forge-home-xp-faq-e2e.mjs | 21035 | 0d90f6bf465abd8856391cec11598571b1beaa7c29b4d0a2e31eeae93f8e94b7
qa\mobile-e2e.mjs | 39375 | 9dbf84c75e8b6e9b9a75c6c62418ddd7c7c722d31cd7270efb482eb2d9071992
qa\appearance-e2e.mjs | 50864 | 7116d481bfa0ce749213c4e02d93b4e2428abda7ee32e6d107fbe9687a5be89d
E:\github\BODYFORGE\docs\audits\BF_FORGE_MISSIONS_20261124\baseline.log | 497 | c6a6438c63c70aab2d3726988fa17c4d67577aa39fb7bdcf795eefff1b1ff861
E:\github\BODYFORGE\docs\audits\BF_FORGE_MISSIONS_20261124\forge-home.log | 6404 | 45619b751c92018758068da63872de5e68aa13e25381106b73b2b5e48977ac16
E:\github\BODYFORGE\docs\audits\BF_FORGE_MISSIONS_20261124\unit.log | 7835 | 62087b4b2f5d54ff0eacab6c08f0cc24f684c95e0963fabbc224b432835ad016
E:\github\BODYFORGE\docs\audits\BF_FORGE_MISSIONS_20261124\build.log | 2220 | 924fa29f8d4e827bd246de979c2b2b5a413bc23df2a6d45df68c386ed47915e9
E:\github\BODYFORGE\docs\audits\BF_FORGE_MISSIONS_20261124\bundle.log | 366 | b145622c093e7bab09400804b3766feff7156f42e2ef2e809eb1c238387ddcff
E:\github\BODYFORGE\docs\audits\BF_FORGE_MISSIONS_20261124\mobile.log | 7773 | f9154224714004d57d01f60c4811a7afdbfc70561e96871f0f077f86590b315c
E:\github\BODYFORGE\docs\audits\BF_FORGE_MISSIONS_20261124\forge-shots\forge-missions-390.png | 97848 | c3601faa17265b948d837f5610a1c5850ba2010592e5c29f483215c4eee7b972
