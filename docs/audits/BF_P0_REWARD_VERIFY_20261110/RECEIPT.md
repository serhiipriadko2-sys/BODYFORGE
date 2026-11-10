voice=ISKRA; phase=BUILD → VERIFY; intent=BODYFORGE / P0 reward dedup Chrome QA
# BODYFORGE · P0 сохранения и однократная награда · Windows QA
Дата: 2026-11-10. Рабочая папка: `C:\github\BODYFORGE`. Базовый и финальный HEAD: `d8e3859f1319601786067d2af066e3419bc87357`.

**ИТОГ: TESTED_LOCAL / PASS для ограниченного исправления `qa/journal-e2e.mjs`.**
Не является COMMITTED/DEPLOYED/VERIFIED_LIVE. Другие незакоммиченные правки репозитория сохранены. Приложение, экономика, камера и реальные сохранения пользователя не изменялись этим исправлением.

## A / Problem
До патча `npm run qa:dedup-recovery` на отдельном `127.0.0.1:5224` завершался `exit 16`, `Owned Chrome exited 0`, `assertions=0`. Chrome на Windows может закрыть стартовый launcher после передачи управления живому браузеру. После первого устранения этого сбоя полный `qa:journal` обнаружил устаревший селектор проверки `prepare-progress` вне экрана настроек (`exit 16`, 10 PASS). Это ложные отрицательные результаты тестового контура, а не доказанный дефект двойной награды.

## B / Evidence и SIFT
[FACT] Перед редактированием `qa/journal-e2e.mjs` был чистым относительно Git; SHA256 `f767f191a023dff41d01585f857efed63b9d380451601cfd3c9b3afbec49655f`, 49683 байта. Исходный файл `journal.before.mjs` совпал по хешу.
[FACT] Код `src/App.tsx` монтирует `SettingsFaq` только когда `section === 'settings'`. Кнопка `[data-action=prepare-progress]` находится в `src/components/ProgressBackupPanel.tsx` за ленивой загрузкой настроек. Поэтому без перехода в настройки старый тест не мог найти её на экране тренировки.
[FACT] Официальная документация Chrome требует отдельный `--user-data-dir` для удалённой отладки; он уже использовался и оставлен: https://developer.chrome.com/blog/remote-debugging-port . Запрос `Browser.close` предусмотрен браузерным доменом CDP: https://chromedevtools.github.io/devtools-protocol/tot/Browser/ .

## C / Decision / scope / alternatives
Принят один малый QA-патч в `qa/journal-e2e.mjs` (3 diff hunks; 50 additions / 7 deletions). Альтернатива `Chrome for Testing` потребовала бы новой зависимости/установки, поэтому не использована. Другие файлы тестов, `src/App.tsx`, `useProfileStorage`, CSS, permissions, награды, ключ `bodyforge:pilot:v1` не менялись. Откат только нашего патча: восстановить точную исходную копию `journal.before.mjs` при подтверждённом отсутствии стороннего изменения целевого файла; не выполнять `git reset`/массовое восстановление.

## D / Changed
1. Lines around CDP startup: ожидание `DevToolsActivePort` собственного временного профиля (не более 15 сек), launcher `exit 0` не считается ошибкой до проверки порта. Ошибка с ненулевым `exitCode` сохраняется.
2. Lines around `foregroundReconciliation`: после подтверждённой обычной записи проверяется доступность вкладки «Настройки и FAQ», выполняется переход, затем проверяется `prepare-progress`. Порог проверки и условие отсутствия двойной награды не ослаблены.
3. Lines around cleanup: `Browser.close` вызывается только для CDP browser endpoint, сверенного с портом из нашего `mkdtemp` профиля, затем ограниченные попытки удаления этой папки. Если очистка не удалась, тест получает ненулевой код; пользовательский Chrome не затрагивается.
Точный исходник `journal.before.mjs` и ограниченный diff `journal-candidate.patch` лежат в этом каталоге.

## E / QA (exit codes, source truth)
| Проверка | Результат | Статус |
| --- | --- | --- |
| `npm run qa:dedup-recovery` до патча | exit 16, `Owned Chrome exited 0`, 0 проверок | RED |
| `npm run qa:dedup-recovery` после патча | **34/34**, exit 0; реальный IndexedDB, reload, целостность wallet | PASS |
| `npm run qa:journal` после начального CDP патча | exit 16, 10 PASS; старый selector вне settings | RED |
| `npm run qa:journal` после актуализации маршрута | **136/136**, exit 0, `crashes=3` (reload/close/renderer crash/recovery/quota/quarantine) | PASS |
| `npm test -- --maxWorkers=1 --no-file-parallelism` до патча | **575/575**, 49 файлов, exit 0 | PASS |
| Первый postpatch unit-прогон | 575/577 PASS, 2 FAIL из нового, чужого `src/lib/heroLayout.test.ts` | FAIL зафиксирован, не скрыт |
| Изолированная проверка изменившегося чужого теста | `src/lib/heroLayout.test.ts`, **2/2**, exit 0 | PASS |
| Финальный postpatch unit-прогон | **577/577**, 50 файлов, exit 0 | PASS |
| Финальный `npm run build` | TypeScript + Vite, exit 0 | PASS |
| Финальный `npm run qa:bundle` | exit 0, entry **393787** bytes vs baseline 496761 = **20.7%**; pose chunk **154276** bytes, `dailyPlanRemoved=true` | PASS |
| `node --check qa/journal-e2e.mjs`, `git diff --check` | оба exit 0 | PASS |
| Первая попытка preview на 5225 | Порт занят другим процессом; чужой сервер не останавливался | BLOCKED (выбран 5293) |
| `npm run preview -- --host 127.0.0.1 --port 5293 --strictPort` | `http://127.0.0.1:5293/`: HTTP 200, `id="root"`, entry JS HTTP 200, 393787 bytes | PASS ограниченно |
| Физический Android/iOS, полевая accuracy, FPS, battery | Не запускались | NOT VERIFIED |

Проверена неизменность SHA256 шести файлов (`qa/journal-e2e.mjs`, `src/App.tsx`, `ForgeWorld.tsx`, `heroLayout.test.ts`, `neonPulseV2.css`, `bundle-on-demand.mjs`) от начала до конца финального unit/build/bundle-прогона; HEAD не изменился. Синтетический браузерный E2E проверил реальный React UI и сохранения в **тестовом** Chrome, но не физическую камеру.

## F / Receipts и очистка
Каталог: `C:\github\BODYFORGE\docs\audits\BF_P0_REWARD_VERIFY_20261110`.
- Исправленный `qa/journal-e2e.mjs`: **52487 bytes**, SHA256 `402a8fe3fa2913964c267383003e174d14be64bd0ddf8d1d60c1d4bf894e445d`.
- `journal.before.mjs`: **49683 bytes**, SHA256 `f767f191a023dff41d01585f857efed63b9d380451601cfd3c9b3afbec49655f`.
- `journal-candidate.patch`: **5369 bytes**, SHA256 `2e3fa00b9407030ed6479a22e9e62dd7fb08cbfd130310a501b0bde30397cf46`, 3 hunks.
- `dedup-recovery-after.log`: 3032 bytes, SHA256 `129cd90b0503e7f680f78bdc2d5b4679d8afc8d7bf10d8d148601aa81d712595`.
- `journal-full-after2.log`: 9168 bytes, SHA256 `8e5a35452c6c736979f40c5d3d369282389eedb8fb42524cd6d07e4e8d63dece`.
- `unit-final.log`: 6708 bytes, SHA256 `3e9f4e4ec52107a04964686662c8d784b915e4a399cccfdd8b01ce557d47e0e3`.
- `build-final.log`: 2220 bytes, SHA256 `c5ee8cb7b3939ebc40b5f30e12e9136cee836c24e0132f2155a6ae9e777ab0b3`.
- `bundle-final.log`: 366 bytes, SHA256 `93fd1fb6c8ca08c9c9ef4ff0a1400efcfb13060b6195694ddad0b04c8f2cdd91`.
- `preview-smoke.log`: 75 bytes, SHA256 `86037ef320525e1d15fc2484c690b407952c710f3810f825d03aef570cad84f9`.
- `MANIFEST_SHA256.txt`: 27 файлов, **2589 bytes**, SHA256 `af88a1345b8c70e341f7f90caa839d072321413ab9e9002371e1f11c00dc58c3`. Receipt не самохешируется.
- Первый неудачный E2E оставил `bf-journal-r4GcLm`, созданный только этим тестом. Его собственный CDP browser закрыт, профиль удалён; повторное чтение подтвердило 0 Chrome-процессов с этим `--user-data-dir`. Лог очистки: `owned-profile-cleanup.log`, exit 0. Чужие процессы не завершались. Один исходный лог обезличен по пути Windows-профиля.

## G / Lifecycle / non-claims
**IMPLEMENTED + TESTED_LOCAL**: только QA-надёжность проверки журнала/однократной награды, не функциональная новая фича пользователя.
**COMMITTED by this investigator: NO. DEPLOYED: NO. VERIFIED_LIVE: NO.**
Рабочий Git содержит чужие незакоммиченные изменения (герой/навигация/CSS и QA). Не выдавать этот локальный PASS за релиз, реальную точность MediaPipe, физический телефон или облачную синхронизацию.

## H / Next ≤15 minutes
На неизменённом локальном snapshot выполнить отдельно `qa:finish-save` с собственным Chrome-профилем и портом и проверить отказ/восстановление после финиша, сохраняя новые статусы независимо от успешного `qa:journal`. Не переходить к Firebase, пока не завершены mobile HTTPS/field gates.

## ∆DΩΛ
∆ — устранён ложный Windows CDP launcher-fail, синхронизирован E2E с реальным экраном настроек, подтверждена однократная награда в 136 браузерных сценариях.
D — HEAD/status → red test → точечный QA-патч → 34/34 dedup → 136/136 journal → 577/577 unit → build/bundle/preview PASS → SHA/read-back/receipt.
Ω — высокая для наблюдаемой локальной тестовой среды и синтетических сценариев; недостаточно данных для полевой камеры или production readiness.
Λ — пересмотреть при новой навигации, версии Chrome/Node, падении `qa:finish-save`, изменениях сохранений или проверке на реальном смартфоне.
