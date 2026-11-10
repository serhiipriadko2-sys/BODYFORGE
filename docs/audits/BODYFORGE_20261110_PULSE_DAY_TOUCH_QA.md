# BODYFORGE — улучшение выбора дат в «Активности тренировок»

Дата: **2026-11-10**. Реальная рабочая папка: `C:\github\BODYFORGE`.

**Итог узкой задачи: TESTED_LOCAL / PASS. Полный release gate: PARTIAL.**

## A — Problem / фактический дефект

После предыдущей полировки нижней навигации кнопки дат графика на 320 CSS px оставались **34.56–34.58 px шириной** (при 48px высоты): правило `@media(max-width:390px)` сжимало семь кнопок через `flex:1 1 0; min-width:0`. При этом физически на ленте помещались семь дней, но элементы были слишком узкими для проектной цели 44px.

Стандарт W3C WCAG 2.2: **2.5.8 AA — 24x24 CSS px** с оговорёнными исключениями, **2.5.5 AAA — 44x44 CSS px**. Это **не утверждение, что до исправления UI не соответствовал AA**. Для удобства касания выбран внутренний усиленный проектный критерий 44px.

Источники: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum ; https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced ; https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow-x ; https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scroll-snap-type .

## B — RED → GREEN

Создан новый изолированный скрипт `qa/pulse-day-touch-e2e.mjs`, который на **production preview** проверяет 320/360/390/428px, 7/30 дней, все кнопки, выбранную и раннюю дату, видимость последнего дня, горизонтальное пролистывание, клавиатуру Enter и отсутствие изменений в `bodyforge:pilot:v1`.

**Исходная неизменяемая сборка:** `.bodyforge-qa/pulse-days-20261110/baseline-dist`, `index.html` SHA-256 `0467edb97ac8215f34f32074bbba10989bc450df507965b03682b8fee87f6f5c`.

RED: `node qa/pulse-day-touch-e2e.mjs` на `http://127.0.0.1:5240/` **exit 1**, после корректной регистрации состояния 7 дней: минимальная ширина 34.5625px, вертикаль 48px, `regionFocus=false`. Провал именно проверки `every weekly day touch target >=44x44 at 320`.

## C–D — минимальный патч

1. `src/neonPulseV2.css`: в уже существующем `@media(max-width:390px)` недопустимое сжатие семи кнопок заменено на `flex:0 0 44px; min-width:44px; min-height:48px`; между датами 6px. Узкий список пользуется существующими `overflow-x:auto` и `scroll-snap-type:x proximity`. На узких телефонах видна подсказка **«← Листай даты →»**.
2. `src/components/ProgressPulseBoard.tsx`: выбранный последний день автоматически видим после первого появления и смены **7↔30**; горизонтально прокручивается только лента, а не вся страница. Лента стала доступной клавиатуре (`tabIndex=0`, `role=region`, понятное `aria-label`). Логика статистики `comparePulsePeriods`, выбор дат и сохранения не изменены.
3. `qa/pulse-day-touch-e2e.mjs`: новый автоматизированный контракт против регрессии.

**Откат:** снимки исходных двух файлов в `.bodyforge-qa/pulse-days-20261110/`; CSS до патча 34,351 bytes / SHA256 `e115849c07d249ce4ecb8d6585cdf087b6e35afd1376bd4b54ce30ab732d7ec0`, компонент до патча 13,298 bytes / SHA256 `1ea39166ffe4cce441b1ea742dbe62ef30b46134a6ef4d99527c0bb16b5731b5`. Только адресный откат при необходимости после проверки актуального Git-дерева; **никаких reset hard/clean**.

## E — Проверки

- Адресные Vitest (`progressPulse.test.ts`, `dashboardOrder.test.ts`, `screenNavigation.test.ts`): **15/15 PASS, exit 0**.
- Полный `npm test -- --maxWorkers=1 --no-file-parallelism`: **577/577 PASS, 50 файлов, exit 0**.
- `npm run build`: **PASS, exit 0**, TypeScript + Vite 8.3.4. Предупреждение об отдельном большом 3D-чанке (~651 KB) сохраняется и не было скрыто изменением порога.
- `npm run qa:bundle`: **PASS, exit 0**; entry **393787 bytes**, исходный baseline **496761**, сокращение **20.7%** (требование >=20% не изменено), MediaPipe отдельным on-demand чанком **154276 bytes**.
- Запечатанная production-сборка `.bodyforge-qa/pulse-days-20261110/after-dist`: 34 assets, `index.html` **1,188 bytes**, SHA-256 `0522e97b317a41c0cfaada09d99513ed5a379af6d304751c33167e8854483087`; `http://127.0.0.1:5241/` **HTTP 200**.
- `node qa/pulse-day-touch-e2e.mjs` на указанной сборке: **BODYFORGE_PULSE_DAY_TOUCH_E2E_PASS, exit 0**. На 320px недельные кнопки **44×48px**, strip width 260px, scrollWidth 344px, начальный scrollLeft 84px: последнее число видно сразу. Проверены 320, 360, 390, 428px, 7/30 дней, горизонтальное листание, настоящий `aria-pressed` (строго один), соответствующая детализация, фокус+Enter, no page overflow и идентичные исходные байты сохранения после каждого выбора. Ни одного browser exception.
- `node qa/forge-home-xp-faq-e2e.mjs` на той же сборке: **BODYFORGE_FORGE_XP_FAQ_E2E_PASS, exit 0**. При отсутствии тренировки — **0/7 и 0/30** активных дней и **0 повторов**, нет записи в игровой прогресс от выбора диапазона; остальные переходы «Горн / Камера / FAQ» корректны.
- `npm run qa:mobile` **первый прогон FAIL exit 12** на `Runtime.evaluate timeout` ещё до первой сценарной проверки; отдельно был `EPERM` на очистке временного Chrome-профиля. Нельзя считать его PASS или доказательством ошибки приложения.
- После диагностики Chrome PID из первого прогона уже завершились, production preview оставался HTTP 200; **один явный диагностический повтор** на той же immutable-сборке: `BODYFORGE_MOBILE_E2E_PASS`, **exit 0**. Пройдены 3D, магазин, save/reload, backup, камера и её освобождение, отказ от награды при ручной остановке и 360px no overflow. Нестабильность E2E-среды из первого прогона остаётся техническим долгом.
- Существующий `npm run qa:pulse-armory`: **BLOCKED exit 19** — `Chrome exited` до открытия проверяемого UI / создания CDP-соединения; не считать PASS. Профильная QA из этого пункта заменяет только проверку дат, не весь оригинальный bank.
- `git diff --check` и адресный `git diff --check -- src/components/ProgressPulseBoard.tsx src/neonPulseV2.css`: **exit 0** на окончательном чтении. Прежние и новые изменения других агентов не откатывались.

## F — Artifact inventory

- `docs/audits/BF_PULSE_DAYS_TOUCH_RED_20261110/`: 1 PNG, **175,048 bytes**, исходный FAIL.
- `docs/audits/BF_PULSE_DAYS_TOUCH_PASS_20261110/`: 8 PNG, **1,592,980 bytes**, по 7- и 30-дневному экрану на каждой ширине, plus `pulse-days-qa.json`.
- `docs/audits/BF_PULSE_DAYS_FORGE_20261110/`: 6 PNG, **809,882 bytes**.
- `docs/audits/BF_PULSE_DAYS_MOBILE_RECHECK_20261110/`: 10 PNG, **1,450,581 bytes**, успешный мобильный прогон.
- Суммарно **25 PNG**, без пользовательского видео, персональных данных или снимков чужого Chrome.

Контрольные кадры:
- RED 320: `pulse-week-320.png` 175,048 bytes, SHA256 `2cdfa61ebff98372765fccdbb7c9fe2dda4f9deb484756ef894d82fd861e8e6d`.
- PASS 7 дней 320: `pulse-week-320.png` 170,092 bytes, SHA256 `8e0bfefc8a86b3ca0b1a9268e471e683bda4c39c5f27bee81b6be55a79b756d8`.
- PASS 30 дней 320: `pulse-month-320.png` 171,597 bytes, SHA256 `5c22bed0f7520675ea3a43749b58612bdce290daa7369629c771ea7289ffb240`.

Исходные файлы на последнем read-back:

| Файл | Bytes | SHA256 |
|---|---:|---|
| `src/components/ProgressPulseBoard.tsx` | 13,582 | `df687fa5d8bd6a2797b657b21d1c6cf3fef0f6633dcbab528d3fced3c2804c44` |
| `src/neonPulseV2.css` | 34,699 | `7cd1e474b24266ed8b0d5b36bb695dbfdf6551bfe1bbe3cc3467f315a7afafa3` |
| `qa/pulse-day-touch-e2e.mjs` | 10,798 | `c61f3d7dfee53d808e09dc007181dc621f019ce3d3c510e4e84ac6fe5fa46fc3` |

## G — Git / lifecycle / nonclaims

Во время выполнения задачи наблюдавшийся HEAD **изменился** с `d8e3859f1319601786067d2af066e3419bc87357` на `e9762a215ec830be70922d138dfe13aa65c09cec`. Финальный прочитанный commit `e9762a2 chatgpt` **уже включает все три файла этой итерации**; локальный `origin/main` также указывал на e9762a2. Это событие **произошло из параллельного процесса**: текущая итерация не выполняла git commit, push, merge, reset или deploy. Нельзя считать локальный remote-tracking указатель доказательством Firebase live.

`SPECIFIED=YES | IMPLEMENTED=YES | TESTED_LOCAL=PASS | COMMIT_OBSERVED_EXTERNALLY=YES | COMMITTED_BY_THIS_ITERATION=NO | DEPLOYED_BY_THIS_ITERATION=NO | VERIFIED_LIVE=NO`.

**Не проверено:** физический Android/iPhone, реальная точность распознавания движения, WCAG 2.2 AA полный аудит, увеличенный системный шрифт 200%, полевой FPS/LCP/INP/CLS. Существующий `qa:pulse-armory` имеет Chrome-CDP blocker.

## H — Следующий безопасный шаг

В отдельном изолированном Chrome-харнессе починить воспроизводимый ранний выход Chrome в `qa:pulse-armory` **без снижения защитных параметров и без изменения порогов**, повторить экран на 320–428px с текстовым масштабом 200%. Только после нового зелёного гейта продолжать следующую мини-итерацию.

## ΔDΩΛ

∆: все недельные даты получили реальные 44px цели, выбранная дата доступна сразу и листание объясняется текстом/ARIA.
D: RED 34.6→GREEN 44x48, focused 15/15, full 577/577, production build/bundle, 7/30 Chrome E2E, Forge+FAQ E2E, отдельный мобильный PASS после первоначального timeout, QA receipt и SHA files.
Ω: высокая для проверенного локального UI, ограниченная для всего E2E-харнесса и физических устройств.
Λ: пересмотреть при изменении CSS контейнера, 200% масштабировании, аппаратной проверке или воспроизводимом сбое Chrome.
