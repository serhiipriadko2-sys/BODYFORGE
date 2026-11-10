# ADR — BF-BUNDLE-20261110: дневной план по требованию

Статус: ACCEPTED LOCAL / IMPLEMENTED; внешнего release-решения нет.

## Context
Свежая baseline-сборка на HEAD7144fc4: 564 unit PASS, build PASS, qa:bundle FAIL — entry400955 bytes, снижение19.3% относительно исторического496761 при гейте≥20%. Исходники открытой папки были чистыми; прошлые graphics/Avatar изменения уже включены в HEAD. Подтверждённого более высокого P0 из свежих исходных тестов/скриншотов для этой итерации не получено. Выбран воспроизводимый долг, явно указанный в handoff.

## Decision
В src/App.tsx DailyPlanBoard объявлен через React.lazy на уровне модуля; запрос начинается после создания бойца. Локальный Suspense показывает Loading. Ошибка импорта преобразуется в локальную панель Error с явной кнопкой reload; App не получает необработанное отклонение. Контейнер bf-goal-actions даёт кнопке существующую высоту48px. Цель, primary/backup и журнал результатов не мигрируют и не меняют формулы.

qa:mobile наблюдает реальные dev и hashed-production URL по pathname. Он задерживает и отклоняет только DailyPlanBoard, проверяет Loading/Error, неизменность профиля и восстановление через touch-нажатие реальной кнопки с новым document load. Параметры запуска собственного временного Chrome, fake camera и защитные флаги не меняются. qa:bundle сохраняет baseline и исходный порог, добавляя запрет раннего preload дневного плана и проверку dynamic reference.

## Alternatives
- Сохранить eager import: остаётся воспроизведённый отказ budget gate.
- Разделить крупный ForgeWorld: затрагивает критический onboarding и больше экранов.
- Изменить budget threshold: противоречит принятому контракту.

## Costs and limits
Отдельный запрос и chunk5117 bytes для созданного бойца; у возвращающегося игрока общий загружаемый JS не обязан уменьшиться. Ошибка lazy promise кэшируется до перезагрузки документа; поэтому повтор явный. Меньший entry не доказывает LCP/INP/CLS, FPS или батарею. Layout shift нового placeholder не измерен. Финальный запас относительно исходного целочисленного потолка entry —258 bytes; будущие изменения потребуют повторного budget QA.

## QA
RED до изменения: qa:bundle exit1. RED внутри итерации: новый reload touch target26px, qa:mobile exit12. Исправление использует существующий контейнер без новой CSS-системы. После фикса: unit565/build/bundle PASS, production mobile PASS, loading/error screenshots и read-back профиля. Дополнительные pre-final camera-runtime26, experience26, appearance812 PASS; происхождение их версий отдельно указано в отчёте.

## Rollback
Scope только src/App.tsx, qa/bundle-on-demand.mjs, qa/mobile-e2e.mjs. Исходные bytes лежат в BF_BUNDLE_20261110_before. Перед откатом сравнить текущие SHA с receipt; при чужом изменении файла остановить откат. Приложен unified patch для обратной проверки. Не откатывать параллельные camera/CSS/QA-файлы, Git-историю, сохранения или assets. Откат в прежнюю версию вернёт известный bundle FAIL; это не release rollback.

## References / ∆DΩΛ
[React.lazy](https://react.dev/reference/react/lazy), [Suspense](https://react.dev/reference/react/Suspense): компонент загружается при первом render, fallback локален. [Chrome debugging policy](https://developer.chrome.com/blog/remote-debugging-port): automation использует отдельный user-data-dir. Исходная причина исторического Chrome exited0 не доказана; в свежем прогоне CDP работает без изменения launcher.

∆ — отложен необязательный редактор; D — RED/green и артефакты; Ω — проверенный локальный снимок; Λ — пересмотр при изменении loader, budget или полевых наблюдениях.
