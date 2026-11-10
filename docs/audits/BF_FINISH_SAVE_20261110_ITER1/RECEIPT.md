voice=ISKRA; phase=BUILD → VERIFY; intent=BODYFORGE / P0 finish-save reliability

# BODYFORGE · P0 finish-save / Chrome QA · 2026-11-10
Рабочая папка: `C:\github\BODYFORGE`. Git HEAD вход/выход: `d8e3859f1319601786067d2af066e3419bc87357`.
**Итог: IMPLEMENTED → TESTED_LOCAL / PASS для ограниченного QA-патча.** Не означает COMMITTED, DEPLOYED, VERIFIED_LIVE. Ни одной правки производственной экономики, камеры, пользовательских сохранений и Firebase.

## A / Problem
На независимом стабильном сервере Vite без HMR `http://127.0.0.1:5307/`, до патча `npm run qa:finish-save -- --race-only` завершился `exit 14` с `Owned Chrome exited 0` до первой проверки (`assertions=0`). Windows Chrome launcher иногда завершается после передачи управления реальному браузеру, поэтому его `exit 0` не доказывает, что весь Chrome закрыт. Тест также некорректно падал при попытке удалить уже отсутствующий CDP document-injection script после навигации.

## B / Evidence / SIFT
- Источники выполнения: `qa/finish-save-e2e.mjs`, `src/App.tsx`, `src/lib/progression.ts`, `src/lib/workoutJournal.ts`, `src/hooks/useProfileStorage.ts`. Предмет: разовый reward, CAS при конфликте, результат после реального `localStorage`/IndexedDB и reload. Не меняли `bodyforge:pilot:v1`.
- Исходная целевая копия (не имела чужих uncommitted изменений): `finish-save.before.mjs` **13833 bytes**, SHA256 `09b5259c2c75080a4e77570669ab7ee62eb7c08d3080ab838cbe2e83867a86ae`.
- Официальная спецификация CDP: `Page.addScriptToEvaluateOnNewDocument`, `Page.removeScriptToEvaluateOnNewDocument`: https://chromedevtools.github.io/devtools-protocol/tot/Page/ ; `Browser.close`: https://chromedevtools.github.io/devtools-protocol/tot/Browser/ ; `DevToolsActivePort` и browser endpoint: https://chromedevtools.github.io/devtools-protocol/ .
- Официальный Web Locks API: https://www.w3.org/TR/web-locks/ ; синтетический тест не доказывает отсутствие проблем во всех браузерах и физических устройствах.

## C / Decision / rollback
Выбран минимальный scope: **только `qa/finish-save-e2e.mjs`**, документы в `docs/audits/BF_FINISH_SAVE_20261110_ITER1/`. Инвариант: test Chrome запускается/закрывается из собственного временного профиля; отсутствующий старый CDP script не ломает текущий тест; остальные ошибки CDP всё ещё прекращают тест; реальная проверка начисления/сохранения не ослаблена.
Rollback: проверить, что целевой файл всё ещё соответствует SHA после патча, затем возвратить только его из `finish-save.before.mjs` или обратным целевым diff. **Не делать `git reset --hard`, `git clean`, массовых замен или отмены чужих изменений.** Полный diff только наших изменений: `finish-save.patch`, 3 hunks, 73 additions/9 deletions.

## D / Changed
1. Ожидание выделенного `DevToolsActivePort` до 15 секунд, при `exitCode=0` launcher не прекращать ожидание. Ненулевой launcher exit остаётся ошибкой.
2. Только при точной ошибке `Script not found` `boot` признаёт, что предыдущая инъекция уже отсутствует, и безопасно регистрирует новую; иные CDP ошибки распространяются. `reloadSaved` и условия начислений не упрощались.
3. Добавлена диагностическая сводка тайм-аута в `waitFinishFailure` (реальный вызов позы, состояние камеры/хранилища и fixture wallet) без записи видео или landmarks.
4. Закрытие **только собственного** `/devtools/browser/` WebSocket, сверенного с локальным портом уникального временного профиля; ограниченное удаление только `bf-finish-save-*` внутри OS temp, отчёт о блокировке удаления. Параметры защиты Chrome и аккаунты владельца не менялись.

## E / QA — полная последовательность, включая FAILED попытки
| Команда / доказательство | Наблюдение | Verdict |
|---|---|---|
| До патча `npm run qa:finish-save -- --race-only` | `race-before.log`, exit 14, 0 assertions, `Owned Chrome exited 0` | RED |
| После CDP исправления `--race-only` | `race-after1.log`, **7/7** PASS, exit 0 | PASS |
| Первая полная попытка | `finish-save-full.log`, exit 14, 9 PASS, timeout ожидаемого `unavailable` | FAIL |
| Диагностическая полная попытка | `finish-save-diag.log`, `Script not found`; затем `Fatal process out of memory: Zone`, Windows exit -2147483645; недостаточная память/нестабильный Chrome — не подтверждён баг игры | FAIL/BLOCKED |
| Уборка собственных подтверждённых профилей | `close-owned-finish-profiles.mjs`, `chrome-cleanup.log`, exit 0; очищены `bf-finish-save-0hqMCp` и `bf-finish-save-6qcn5x`, связанные Chrome processes=0 | PASS |
| Повторный полный `npm run qa:finish-save` | `finish-save-after2.log`, **28/28** PASS, exit 0 | PASS |
| Финальный `npm test -- --maxWorkers=1 --no-file-parallelism` | `unit-final.log`, **577/577** PASS, 50 test files, exit 0 | PASS |
| Финальный `npm run build` | `build-final.log`, exit 0 (предупреждение о >500 KB lazy 3D chunk осталось) | PASS |
| Финальный `npm run qa:bundle` | `bundle-final.log`, exit 0; entry **393787** bytes vs 496761, сокращение **20.7%**; MediaPipe **154276** bytes; not preloaded | PASS |
| `node --check`, `git diff --check` | exit 0 | PASS |
| Production preview | `http://127.0.0.1:5293/`: HTTP 200, `id="root"`; текущий `index` JS 393787 bytes, HTTP 200 | PASS ограниченно |

**Подтверждённые инварианты browser E2E:** другой вкладке нельзя перезаписать свежий баланс; при квоте награда не появляется до сохранения; повторная запись начисляет тренировку и бонус этажа **один раз** (fixture 185 XP / 65 coins), тот же `sessionId` переживает reload; синтетические 20 повторов освобождают фейковую камеру и pose module; при конфликте итог экспортируется без записи на диск пользователя, новый профиль не перезаписывается.
**Что не проверено:** настоящая точность распознавания движений человека, real-device GPU/FPS, Android/iOS field QA, мобильный HTTPS, Firebase live, работа offline worker. Скриншоты не создавались: патч затрагивает только QA-runner, не UI.

## F / Receipt / source integrity
Аудит: `C:\github\BODYFORGE\docs\audits\BF_FINISH_SAVE_20261110_ITER1\`.
- Текущий `qa/finish-save-e2e.mjs`: **17662 bytes**, SHA256 `67e367c29b105b9d45a15300c90cfe2333dff6daaff368582bac7cc9c7e1f65e`.
- `finish-save.before.mjs`: **13833 bytes**, SHA256 `09b5259c2c75080a4e77570669ab7ee62eb7c08d3080ab838cbe2e83867a86ae`.
- `finish-save.patch`: **7047 bytes**, SHA256 `d474d846080c23249ecc44c194754e0bc59d058975d04a3a50baea5d31f8ab0b`.
- `finish-save-after2.log`: **2173 bytes**, SHA256 `37cd13e9254cb4f52eddb905facabfb7dd073451c6e62b02a46c86969aed863a`.
- `race-after1.log`: **811 bytes**, SHA256 `b28ea85e8dfd171a3acd205993be091f488631a54fd680eef977847955d265cb`.
- `unit-final.log`: **6481 bytes**, SHA256 `9f10353ea0496c9247877004a7234113ab0c54ae78001a6ea1c651e1afb94630`.
- `build-final.log`: **2220 bytes**, SHA256 `be80644ed447c6bcff1a5a83e8fd472e81a92728d2ed01306a8bfb3ef611feb3`.
- `bundle-final.log`: **366 bytes**, SHA256 `93fd1fb6c8ca08c9c9ef4ff0a1400efcfb13060b6195694ddad0b04c8f2cdd91`.
- `preview-smoke.log`: **70 bytes**, SHA256 `266d184cf6e4d736d4bd3d0fdfdb65b2f0577a5176261a8237ca40225e1655fb`.
- `MANIFEST_SHA256.txt`: **22 evidence files**, 2115 bytes, SHA256 `3d7fb252c0de0ce22a9450889c5c26859c42099ddfb56a5251a16c640d60a0bc`. Receipt самого себя не хеширует.
- `sot-canon.log`: `SOT30_VERIFY_PASS`, 30 files / 4054425 bytes; эта проверка не доказывает использование внешних память/Guard сервисов.
- Источники перед и после финального unit/build/bundle имеют совпадающие SHA256 для `finish-save-e2e.mjs`, `App.tsx`, `game.ts`, `progression.ts`, `workoutJournal.ts`, `useProfileStorage.ts`, `bundle-on-demand.mjs`; HEAD не менялся. В конце подтверждены **0 Chrome процессов и 0 папок** по нашему `bf-finish-save-*`. Лог с Windows профилем обезличен.

## G / Lifecycle & claims
Изменённый QA harness: **IMPLEMENTED → TESTED_LOCAL**. Исходники игры: чужие локальные изменения сохранены, нами не менялись. COMMITTED by this investigator: NO. DEPLOYED: NO. VERIFIED_LIVE: NO. Экономика 120 XP + 35 coins за обычную тренировку не изменена; fixture 185/65 включает отдельный бонус башни. Ни одно измерение real FPS, реальной камеры, здоровья, калорий или сетевого PvP не заявлено.

## H / Next <=15 min
На фиксированном локальном source snapshot запустить следующую независимую проверку `qa:multitab` либо `qa:mobile` в отдельном временном профиле (не одновременно), записать PASS/FAIL; если тестовый Chrome снова нестабилен, воспроизводить и исправлять только узкий harness scope. Важнее проверить восстановление сохранений, чем добавлять новый арт или главы.

## ∆DΩΛ
∆: устранён ложный launcher exit, изолирована устаревшая CDP инъекция, добавлен fail-closed cleanup и диагностика. D: RED → минимальные правки → повторные FAIL честно записаны → scoped Chrome cleanup → 28/28 E2E → 577/577 unit → build/bundle/preview → источник SHA → receipt. Ω: высокая уверенность в конкретной локальной синтетической QA-цепочке; нельзя переносить её на полевую accuracy или live release. Λ: пересмотреть после следующего изменений Chrome, навигации/сохранений и при проверке на физических телефонах.
