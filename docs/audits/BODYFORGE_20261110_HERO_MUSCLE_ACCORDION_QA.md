# BODYFORGE — Hero: muscles below 3D and collapsible Avatar Lab / wardrobe

Дата: **2026-11-10**. Рабочая директория VS Code: `C:\github\BODYFORGE`.

**Статус UI-итерации: TESTED_LOCAL / PASS. Общий релизный статус: PARTIAL.** Ни один исходный canon, runtime policy, camera stream, reward balance или storage key не менялся.

## A / Problem — пользовательский скриншот

На экране «Герой» карточки **«ПРОКАЧКА МЫШЦ»** находились в `studio-content` **после** `AvatarLab`, справа от 3D. Требовалось расположить четыре игровых улучшения **сразу под 3D-персонажем**. Редактор **«BODYFORGE / AVATAR LAB — СОБЕРИ СВОЙ ОБЛИК»** и **«ГАРДЕРОБ»** должны сворачиваться и раскрываться по стрелке независимо друг от друга.

Текущее состояние проверено в `src/components/ForgeWorld.tsx`, `src/world.css`, `src/pulseArmory.css`, `src/neonPulseV2.css`. Сверены `AGENTS.md`, `CODEX_ISKRA.md`, `README.md` и релевантные секции `docs/BODYFORGE_MASTER_GDD_TDD_20261110.md`. Границы лицензионных GLB сохранены: ассеты не добавлялись и не заменялись.

## B / RED → GREEN и решение

В `src/lib/heroLayout.test.ts` записаны 2 теста структурной разметки:
- мышцы расположены после модели и до косметических панелей;
- оба косметических блока представлены отдельными нативными `<details>/<summary>` с доступным фокусом.

**До исправления: 2 FAIL (exit 1). После патча: 2/2 PASS (exit 0).**

Решение: сохранить существующий `studio-layout` (2 колонки на desktop, 1 колонка на mobile), объединить `studio-preview` и четыре мышечных улучшения в `studio-hero-column`. «Собери свой облик» и «Гардероб» обёрнуты **в отдельные нативные disclosure-панели**. Они **по умолчанию раскрыты** ради совместимости с существующими действиями и тестами; нажатие стрелки/заголовка их закрывает, повторное нажатие открывает. Никакой новой библиотеки или сохраняемого флага не добавлено. Скрытие панелей не изменяет профиль или внешний вид.

## C–D / Изменения и контролируемый откат

1. `src/components/ForgeWorld.tsx`: `studio-hero-column` с моделью и `studio-muscle-panel` в нужном порядке; два независимых `data-studio-panel="appearance|wardrobe"` с `summary` и `ChevronDown`. Обработчики монет, покупки, выбора костюма и значения мышц не изменены.
2. `src/neonPulseV2.css`: небольшие стили колонки и сворачиваемых заголовков; размер нажатия >=44 px, контрастная рамка фокуса, high-contrast, отключение анимации стрелки при `prefers-reduced-motion`; отсутствует горизонтальный overflow.
3. `src/lib/heroLayout.test.ts`: адресный unit-тест, RED до и GREEN после.
4. `qa/hero-layout-e2e.mjs`: браузерная QA с изолированным Chrome, пятью viewport, мышью/клавиатурой, скриншотами, отсутствием побочных записей.

**Rollback:** исходные байты `ForgeWorld.tsx` и `neonPulseV2.css` сохранены в игнорируемой папке `.bodyforge-qa/hero-layout-20261110/` с SHA-256; откатывать лишь эти два файла после проверки статуса чужой работы. Никакого `git reset --hard`, `git clean` или изменения параллельных файлов не было.

## E / QA

- `npm test -- --maxWorkers=1 --no-file-parallelism`: **577/577 PASS, 50 test-файлов, exit 0**.
- `npm run build`: **PASS (exit 0)**, TypeScript + Vite, тот же алгоритм камеры и 3D-компонент.
- `npm run qa:bundle`: **PASS (exit 0)**; entry JS **393787 bytes**, сокращение **20.7%** при неизменённом пороге >=20%, MediaPipe-chunk **154276 bytes**. Неблокирующее предупреждение о 3D-чанке ~651KB остаётся.
- Тестовое immutable preview из `.bodyforge-qa/hero-layout-20261110/frozen-dist`: `index.html` **1188 bytes**, SHA-256 `685bfa499cebdcc751a766f0a25602a08fd8496ef1d4038817cad4f1fb8a43fe`; `http://127.0.0.1:5236/` HTTP **200**.
- `node qa/hero-layout-e2e.mjs` на frozen preview: **BODYFORGE_HERO_ACCORDION_E2E_PASS**, выход 0 на повторном прогоне. Chrome, временный пустой профиль. Проверены **320/360/390/428/1080 CSS px**: четыре мышечные карточки строго под моделью, расстояние 12–14px; отсутствие боковой прокрутки; два независимых открытия/закрытия; явные размеры кнопок >=44px; стандартный `summary` получает фокус и **Enter открывает гардероб**; reduced motion отключает переходы; косметика и игровой прогресс в localStorage после переключений не изменились; JS exceptions — 0.
- Первая версия скрипта дала **FAIL по эмуляции клавиши**, не по UI: CDP `keyDown` без текстового Enter не сработал. Исправлен тестовый протокол `rawKeyDown/char/keyUp`, повторное выполнение **PASS** с подтверждённым `document.activeElement === SUMMARY`. Изменений production-кода для этой несуществовавшей ошибки не делалось.
- `npm run qa:mobile` на **той же frozen-сборке**: **BODYFORGE_MOBILE_E2E_PASS, exit 0**. Проверены настоящая React-навигация, WebGL/3D, мышечное улучшение за монеты, покупка и сохранение одежды, сохранение прогресса после перезагрузки, Camera/MediaPipe lifecycle с fake browser camera, отсутствие награды при остановке, backup и мобильная ширина.
- `npm run qa:pulse-armory`: **BLOCKED exit 19** — отдельный скрипт завершился на `Chrome exited` до подключения CDP/загрузки UI; это **не** PASS и **не** доказанная ошибка приложения. Сама функциональность Avatar Lab проверена адресным Chrome E2E и мобильным сценарием.
- `git diff --check`: exit 0. Dev-сервер `http://127.0.0.1:5173/` отвечает HTTP **200**. Деплой и физическая проверка realme не проводились.

## F / Файлы и контрольные суммы (после QA)

| Путь | Bytes | SHA-256 |
|---|---:|---|
| `src/components/ForgeWorld.tsx` | 17430 | `8007fb521a3e02261e69ac2194cac0b5fdbae7f3fafc6ab3905bb6dc06d2adc4` |
| `src/neonPulseV2.css` | 33247 | `3664c7f932f0c87edec3c1a08f396a92bff4728c6ed2ec9c4066b981828df93c` |
| `src/lib/heroLayout.test.ts` | 1810 | `5989906a6344a57a85f7eb87c28d66ebb3952dcb87f6364a668b27ffb5a02bad` |
| `qa/hero-layout-e2e.mjs` | 10316 | `e90aa98093057bb017d58e6b78f1a4e07ca53f78f893de72252641bfe8f8ce3c` |

Браузерные артефакты:
- `docs/audits/BF_HERO_LAYOUT_20261110_KEYBOARD_RECHECK/` — **6 PNG, 1300311 bytes**, успешная видимая приёмка.
- `docs/audits/BF_HERO_LAYOUT_20261110_MOBILE/` — **10 PNG, 1433300 bytes**, мобильная регрессия.
- `docs/audits/BF_HERO_LAYOUT_20261110/` — 6 PNG первоначального прогона с последующим тестовым FAIL по клавише.
- Вид «Герой», две закрытые панели, 390px: `hero-390-both-closed.png`, **163818 bytes**, SHA-256 `b8567f22010847250d2c63e51e35e4b736a5fdb6427dc8f6cc32dd50d8ae2cd5`.
- Desktop, 1080px: `hero-1080-initial.png`, **363776 bytes**, SHA-256 `5d5038f95c4f3e5ece1906072cd3604ae3be5be32afe89e61777597f81fd3f5e`.

## G / Статусы без переоценки

`SPECIFIED=YES | IMPLEMENTED_LOCAL=YES | TESTED_LOCAL=PASS | COMPLETE_RELEASE_QA=PARTIAL | COMMITTED=NO | PUSHED=NO | FIREBASE_DEPLOYED=NO | VERIFIED_LIVE=NO`.

Ограничения: точность распознавания движений на физическом человеке и аппаратная производительность реального телефона в этом проходе не измерялись. Полный банк визуальных QA, включая исходный `qa:pulse-armory`, не объявлен полностью зелёным.

## H / Следующий обратимый шаг

При свободном изолированном Chrome-харнессе повторить `qa:pulse-armory` (запуск отдельного Chrome до CDP — текущий инфраструктурный блокер); затем выполнить аппаратный viewport-тест на realme и проверить сворачивание/разворачивание в браузере Android.

## ΔDΩΛ

∆: модель и мышцы объединены в вертикальную колонку; Avatar Lab и гардероб — независимые disclosure-панели.
D: подтверждённый RED→GREEN, 577 unit, production build, bundle-gate, настоящий Chrome-UI на пяти размерах, мобильный full E2E, скриншоты, код и отчёт с read-back.
Ω: высокая для локального UI; QA-harness `qa:pulse-armory` blocked, аппаратные испытания остаются UNKNOWN.
Λ: пересмотр после воспроизводимого изолированного `qa:pulse-armory` и реального мобильного теста.
