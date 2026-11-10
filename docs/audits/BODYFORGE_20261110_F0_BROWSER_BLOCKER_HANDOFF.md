# BODYFORGE — F0 evidence & isolated Chrome CDP blocker

Дата проверки: 2026-11-10 (Windows, Europe/Moscow). Авторизованная рабочая папка: `C:\github\BODYFORGE`.

**Статус итерации:** AUDITED / PARTIAL. Локальный production-патч в этом проходе **не создавался**, поскольку заявленные P0/P1 файлы уже редактировались параллельным процессом. Это отдельная квитанция проверки, не заявление о новой функции, commit или deployment.

## A. Intake и базовый снимок

Git: `main`, исходный и повторно наблюдавшийся HEAD `7144fc4c20d813979c82a9bd980f4b274c24af67`. При первом чтении `git status --short --branch` — чисто; `git diff --check` — exit 0.

Прочитаны: `AGENTS.md`, `CODEX_ISKRA.md`, `README.md`, `docs/BODYFORGE_MASTER_GDD_TDD_20261110.md`, `package.json`, `src/lib/game.ts`, `src/lib/progression.ts`, `src/lib/trainingCatalog.ts`, `src/App.tsx` (секции кода/экрана), `qa/bundle-on-demand.mjs`, `qa/mobile-e2e.mjs`, `qa/appearance-e2e.mjs`, соответствующие тесты и сведения об asset license. Проверены канонические маршруты `.iskra/knowledge/00_PROJECT_ROUTER.md`, `29_INDEX_UPLOAD_MANIFEST.md`, инструкции проекта. Immutable canon не изменялся.

Исходный unit: `npm test -- --maxWorkers=1 --no-file-parallelism`, **exit 0, 564/564 PASS, 46 файлов**. Исходная сборка `npm run build` — **exit 0**, TypeScript + Vite 8.3.4. Неблокирующее предупреждение о лениво загружаемом 3D-чанке ~651 КБ.

## B. Доказанный RED / подтверждённый параллельный GREEN

`npm run qa:bundle` до параллельного исправления: **exit 1**. `entryBytes=400955`, baseline `496761`, экономия `95806`, снижение **19.3%** при гейте **>=20%**; `vision_bundle=154276`. Гейт не ослаблялся.

**Параллельная работа ДРУГОГО процесса** (не приписывать этой итерации): появились незакоммиченные изменения `src/App.tsx`, `qa/bundle-on-demand.mjs`, `qa/mobile-e2e.mjs`, отдельные QA-скриншоты. Из кода видно: `DailyPlanBoard` перенесён в lazy chunk с `Suspense` и fallback при ошибке. Новая проверка `npm run qa:bundle`: **exit 0, PASS** `entryBytes=396967`, экономия `99794`, снижение **20.1%**, `DailyPlanBoard=5117`, `vision_bundle=154276`. Это GREEN **текущего незакоммиченного дерева и dist**, не утверждение о коммите/деплое. Код/QA этого процесса не перезаписывался.

Другой процесс одновременно начал править `src/lib/game.test.ts` и `src/lib/game.ts` для календарного rollback; затем они снова были чистыми. Я не вносил конфликтующих правок и не делал автоматического reset/revert.

## C. Browser/CDP — BLOCKED, не product UI FAIL

Моё отдельное Vite preview `http://127.0.0.1:5200/` запущено без изменения чужих серверов: **HTTP 200**, PID владельца слушающего процесса `18032` на момент проверки; командная строка подтверждала `vite preview --host 127.0.0.1 --port 5200 --strictPort`.

`BODYFORGE_QA_ORIGIN=http://127.0.0.1:5200 npm run qa:appearance` — **exit 18**, `Owned Chrome exited 0` до DevToolsActivePort, без загрузки DOM или user UI. Тест сообщил `QA_PROFILE_CLEANUP_INCOMPLETE` для своего временного профиля. Видеозаписи или данные реального пользователя не исследовались.

Дополнительно создано ДВА НОВЫХ временных Chrome-профиля (ни один не являлся личным профилем владельца). Обычный запуск Chrome headless со стандартными QA-параметрами и минимальный запуск **без** GPU/SwiftShader-параметров оба завершились **exit 0**, без DevToolsActivePort. Установленная версия Chrome: `157.0.8103.40`. Удаление/изменение глобальных политик и ослабление sandbox не выполнялись. Тестовый PowerShell и существующие Chrome принадлежат одной Windows session (`SessionId=3`), следовательно причина **не доказана** и её нельзя автоматически приписать Session0 или коду BODYFORGE.

**Вывод:** проблема воспроизводится вне UI-приложения и блокирует CDP-ориентированную приёмку (`qa:mobile`, `qa:appearance`) этой тестовой среды. Unit/build/HTTP 200 не заменяют визуальный или мобильный PASS.

## D. Минимальный scope / владельцы

В этой итерации изменяется только **этот отчёт**:
`docs/audits/BODYFORGE_20261110_F0_BROWSER_BLOCKER_HANDOFF.md`.

**Не изменять и не откатывать:** чужие `src/App.tsx`, `qa/bundle-on-demand.mjs`, `qa/mobile-e2e.mjs`, `src/lib/camera.ts`, `src/lib/cameraSelection.test.ts` и чужие `BF_BUNDLE_*`, `BF_CHROME_CDP_*` evidence directories. Права/секреты/папки браузера пользователя не затрагиваются.

## E. Честные гейты

- UNIT baseline: PASS 564/564 перед параллельными изменениями.
- BUILD baseline: PASS перед параллельными изменениями.
- BUNDLE baseline: FAIL 19.3%; foreign working tree: PASS 20.1%, только локально.
- PREVIEW HTTP 200: PASS; реальный React mount/отсутствие exception: **NOT VERIFIED** в моей отдельной браузерной проверке из-за CDP.
- Browser appearance: **BLOCKED (exit18, Chrome exit0)**.
- Mobile E2E этого прохода: **NOT RUN**; прежний зафиксированный harness blocker не становится PASS сам по себе.
- Physical exercise accuracy, UI FPS, production HTTPS, Firebase live: **NOT VERIFIED**.
- Мой git commit/push/deploy: **NO**.

## F. Дальнейший обратимый шаг (до 15 минут)

1. В изолированном QA-сценарии уточнить, почему именно Chrome 157 завершает запуск без CDP. Сравнить с авторизованным Chrome for Testing, если он уже установлен, без установки новых исполняемых файлов и без отключения sandbox; не подключаться к персональным вкладкам.
2. После восстановления браузерного harness **на одной и той же фиксированной сборке** запустить `qa:mobile` и `qa:appearance`, снять скриншоты мобильного экрана и проверить реальные исключения/загрузку lazy chunks.
3. Перед релизом заморозить незакоммиченные изменения, выполнить полный unit/build/qa:bundle/preview/профильные E2E и фиксировать SHA выбранного commit. Уменьшение entry JS не доказывает отдельно качество FPS/скорость на телефоне.

## ∆DΩΛ

∆ — замерен и разграничен baseline FAIL 19.3%, параллельный локальный PASS 20.1% и независимый блокер Chrome/CDP.
D — текущие file/git reads, unit/build, bundle RED→foreign-GREEN, preview HTTP200, два независимых headless Chrome startup probes, документ с границей владельцев файлов.
Ω — высокая для указанных наблюдений; причина Chrome exit0 и качество UI на этом preview неизвестны.
Λ — пересмотр после успешного CDP и воспроизводимого mobile QA на фиксированном снимке.

**Lifecycle:** report=created; unit-baseline=verified; working-tree-bundle=verified; code-change-by-me=NO; committed-by-me=NO; deployed=NO; verified-live=NO.
