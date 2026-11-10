# BODYFORGE — appearance QA contract repair / 2026-11-10

voice=ISKRA; phase=BUILD → VERIFY; intent=BODYFORGE / актуальная навигация и appearance QA.

## A / Problem
Полный `npm run qa:appearance` был заблокирован устаревшим ожиданием удалённой карточки `#daily-plan`, а на Windows отдельный Chrome launcher завершался с кодом 0 до готовности CDP. После переключения на фиолетовую тему псевдоэлемент подсказки камеры иногда обновлялся на следующий кадр. Это три разных причины, не ошибки подсчёта приседаний.

## B / Evidence
- Текущая рабочая папка: C:\github\BODYFORGE; наблюдавшийся Git HEAD: d8e3859f1319601786067d2af066e3419bc87357.
- В docs/audits/BODYFORGE_20261110_REMOVE_CAMERA_DAILY_PLAN_QA.md записано решение пользователя убрать «ПЛАН НА СЕГОДНЯ» с «Камеры», оставив «Миссии» и «Шаги».
- src/lib/screenNavigation.test.ts подтверждает отсутствие DailyPlanBoard в App и сохранение DailyBoard/StepsBoard. 10/10 адресных unit по screenNavigation + dailyPlan ранее PASS.
- Предыдущий appearance запуск завершался FAIL по исчезнувшему #daily-plan и по Chrome launcher. До исправления цвета: первый кадр violet показывал цвет ::before rgb(101,234,208), через 150 ms rgb(188,165,255); неизменяемый ожидаемый цвет #bca5ff.
- Официальные источники: Chrome DevTools Protocol / Browser.close; MDN Window.getComputedStyle(..., "::before"); Vite server.hmr=false.

## C / Decision
Изменить только `qa/appearance-e2e.mjs`. Сохранить проверку cross-tab сохранения ручных шагов, неизменности XP/монет/профиля и старого ключа `bodyforge:daily-plan:v1`. Требовать отсутствие удалённого редактора и видимость #quests/#step-log; не пытаться восстановить пользовательский UI ради теста.
Для CSS-псевдоэлемента перед строгим сравнением ожидать не более 2000 ms, пока вычисленный цвет не станет равен вычисленной переменной --bf-accent. Если цвет не совпадёт, E2E всё равно FAIL. Никакого изменения порогов контраста/цвета.
Chrome launcher exit 0 сам по себе не означает провал owned browser; readiness определяется DevToolsActivePort в уникальном временном профиле. После теста закрывать только свой browser через CDP Browser.close, затем удалять временный профиль с ограниченными повторами.

## D / Changed
- `qa/appearance-e2e.mjs`: переработаны obsolete E2E-контракты daily-plan, сохранены cross-tab manual steps, legacy storage и независимые game bytes, геометрия #quests/#step-log на 320/360/390, палитры/custom/high contrast/keyboard tests. Изменена готовность owned Chrome CDP и очистка. Добавлено ограниченное ожидание фактического computed ::before цвета.
- Другие production-файлы, игровые правила, камера, локальные сохранения пользователя и Firebase не редактировались этим шагом.
- До редактирования создан `appearance-before.mjs` — 52940 bytes, SHA256 ce357d8619b1d686090717262668b11c3892dc9b7725fb5bb42bd069339ba92b.
- Текущий QA-файл: 49813 bytes, SHA256 32a60330ccdf5c6b394b9b0ac78b185b711599d1afbd0289d96f7bbea62759e9.
- Native reversible diff: `appearance-contract.patch`, 25623 bytes, SHA256 ef934765c8d80d856103e88a0b2272adee50e2ef4aef0ec1da8c1e96471b6cbe. Targeted rollback: only after fresh read-back and `git apply --reverse --check`, not whole-file reset over another agent.

## E / QA
- `node --check qa/appearance-e2e.mjs`: PASS.
- `node qa/appearance-e2e.mjs --preferences-only` against isolated localhost:5261: exit 0, **15/15** assertions. Cross-tab unsaved manual steps, durable reload and legacy key verified.
- `npm run qa:appearance` against isolated localhost:5261: exit 0, **616/616** PASS checks; no recorded uncaught browser errors, no QA Chrome close/cleanup errors.
- `npm test -- --maxWorkers=1 --no-file-parallelism`: exit 0, **577/577** tests.
- `npm run build`: exit 0.
- `npm run qa:bundle`: exit 0, entry JS 393787 bytes vs 496761-byte baseline, reduction **20.7%** (threshold >=20% unchanged), MediaPipe chunk 154276 bytes, dailyPlanRemoved=true.
- `npm run qa:mobile`: exit 0, **86** PASS checks, final BODYFORGE_MOBILE_E2E_PASS. Synthetic camera (not human field QA); camera stop awarded no XP.
- `git diff --check`: exit 0.
- QA server localhost:5261: HTTP 200 + #root, HMR disabled in existing qa:serve-stable. No claim of physical-device runtime.
- Five files' SHA256 (qa/appearance-e2e, src/App, src/neonPulseV2.css, src/lib/screenNavigation.test.ts, qa/mobile-e2e.mjs) stayed byte-identical between the final unit/build/bundle snapshots. qa/mobile-e2e SHA256 before and after mobile QA was also identical.
- 30 PNG screenshots generated; examined integration-violet-missions.png and appearance-320-mint-dialog.png. The mobile dialog fits within width 320 CSS px and the mission panel renders in violet as intended. Pixel positioning on actual Android/iOS NOT verified.

## F / Receipt
All evidence: `C:\github\BODYFORGE\docs\audits\BF_APPEARANCE_CONTRACT_20261110\`.
- `MANIFEST_SHA256.txt`: **49 evidence files**, **3932289 bytes** total, manifest **5133 bytes** SHA256 2feeff3ff6bcfd97db44df6451a07b7333be20ef28eefccee1badc7640a19b0a.
- Logs: preferences-after.log; appearance-full-settled.log; unit-final.log; build-final.log; bundle-final.log; mobile-final.log; source-hashes before/after; screenshots.
- Size and SHA256 of THIS receipt to be checked independently after write; never self-embed unverifiable hash.

## G / Status and nonclaims
For `qa/appearance-e2e.mjs`: IMPLEMENTED + TESTED_LOCAL (PASS), uncommitted by this session; not deployed.
Other contributors had uncommitted changes in App.tsx, mobile-e2e and surrounding layers: not overwritten, staged or committed here.
NOT VERIFIED: physical squat accuracy, actual mobile GPU frame-rate/battery, all release-specific suites, Firebase HTTPS production, true backup import, Health Connect.
Independent screenshots and CDP browser E2E are synthetic, not a substitute for in-vivo detection.

## H / Next ≤15 minutes
On a stable worktree, review the previously saved HUD candidate in docs/audits/BF_CAMERA_HUD_20261110_ITER3/hud-candidate-native.patch. Because qa/mobile-e2e.mjs is currently modified by another agent, do NOT apply an old two-file patch blindly. Stage a CSS-only camera overlay adjustment plus a separate geometric four-width regression; demand full unit/build/bundle/appearance/mobile PASS before shipping.

## ΔDΩΛ
∆: восстановлена работоспособность полного appearance E2E без возвращения удалённой карточки.
D: documentation/current code/read-back → scoped QA edit → 15 preference + 616 appearance + 577 unit + 86 mobile PASS → build/bundle/localhost → hashes/receipt.
Ω: high for the exact tested local state; unverified physical-device behavior.
Λ: пересмотреть после изменения навигации, SHA исходников, Chrome/CDP или появления реального мобильного дефекта.
