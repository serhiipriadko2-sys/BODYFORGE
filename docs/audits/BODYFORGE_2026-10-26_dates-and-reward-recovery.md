# BODYFORGE: принадлежность ввода дню и целостность наград

Дата: 2026-10-26. Объект исследования — локальное приложение и его сохранения. Применён метод: явный инвариант → воспроизведение до исправления → минимальная интервенция → положительные и отрицательные регрессии → независимый review → свежий read-back. Это инженерное исследование конкретных состояний, не клиническое исследование и не статистическая оценка точности камеры.

## A. Intake и границы

[FACT] Рабочая папка `C:\github\BODYFORGE`, `main`, исходный HEAD `1a240ee07bca710414a01ab8467ade276a94059c`. На старте сохранялись восемь незакоммиченных файлов предыдущей итерации. Семь из них сохранены побайтово; `StepsBoard.tsx` намеренно доработан поверх существующего исправления черновиков. Резервный снимок 12 исходных файлов и manifest находится локально в `.iskra/reports/BODYFORGE_STEPS_DAY_20261026-baseline/`. Индекс не изменялся; commit, push, merge, deployment и внешние записи не выполнялись.

Два последовательных этапа: защита датированной ручной заметки; устранение воспроизведённого повторного начисления при повреждении списка учтённых тренировок. Камера, формулы XP/монет и геометрия 3D не менялись. Дополнительно исправлен путь открытия актуального повреждённого сохранения без перезагрузки документа.

## B. SIFT: источники и метод

[FACT] Свежий валидатор SoT30 `--negative-test --json`: PASS, 30 файлов, 4 054 425 байт, 7 проектных Skills, negative tamper PASS. Manifest SHA-256: `0decd118a6300324b757d2587ec315a569aaf5800299d2b33bf046feaf56aeff`. Канон не менялся. Прочитаны AGENTS, CODEX_ISKRA, Project Instructions, manifest/router, проектные Skills; инструкции не объявлялись вызовом исполняемого сервиса.

Фактический sandbox — `workspace-write`, reviewer — `auto_review`; проект запрашивает `on-request`. Полная загрузка проектного config отдельно не доказана, глобальные настройки не менялись, `danger-full-access` не включался. Браузерные прогоны — только собственные временные Chrome-профили, существующий Vite на loopback, по одному прогону одновременно. Чужие процессы не завершались.

Применённые инструменты: PowerShell, Python, Node/npm, Git; реальные страницы Chrome через CDP, localStorage и IndexedDB; независимые агенты для review и регрессий. Наличие иных MCP-коннекторов не считается успешным вызовом. Guard/Council/Statecycle применены как поведенческие контракты; исполняемый Guard и внешняя память не вызывались. `metric computation unavailable`; `memory write unavailable` для неподтверждённой авторизованной внешней памяти. Этот отчёт и engineering receipt не являются записью canonical Archive или Guard-receipt.

Методические первоисточники:

- [HTML Standard, Web storage](https://html.spec.whatwg.org/multipage/webstorage.html#introduction): общая localStorage не предоставляет предполагаемой блокировки между процессами. Поэтому preflight read → write не назван транзакцией или CAS.
- [Chrome DevTools Protocol, Emulation.setTimezoneOverride](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setTimezoneOverride): часовой пояс изменяется для тестовой страницы. Системное время Windows не менялось. Конструктор Date/Date.now контролируется только внутри тестового документа, реальные таймеры продолжают работать.

## C. Frame: причины и проверяемые инварианты

| Подсистема | Наблюдение до исправления | Причина | Инвариант после изменения |
|---|---|---|---|
| Ручные шаги / полночь | RED: до полуночи draft 7777, после полуночи save записывает 7777 под новым днём | Дата записи читалась заново, а принадлежность черновика дню не проверялась | День редактора должен совпасть с единственным captured `savedAt`; иначе ноль записей и явный повторный ввод |
| Перевод даты назад | RED: старая вкладка заменяет валидную запись следующего дня своим числом | Reader скрывал более позднюю заметку как ноль, writer не проверял сохранённую дату | Валидная известная будущая запись видна как date-conflict и не заменяется обнаружившим её writer; UI объясняет блокировку |
| Возврат к правильной дате | Промежуточный GREEN обнаружил зависший read-only после возврата часов | Локальный editor уже обновился, но day key родителя остался прежним | StepsBoard независимо перечитывает данные при visibility/focus/pageshow; readonly снимается после устранения конфликта |
| Часовой пояс / дневной UI | Старый Date повторно интерпретировался в новом часовом поясе | Сравнение двух Date в новой timezone теряло ранее показанный календарный день | App сравнивает сохранённый строковый day key со свежим; проверяется отдельный дневной прогресс |
| Награды / повреждённый ledger | RED: при 65 тренировках и старом settled receipt XP 7800 превращались в 7920, монеты получали ещё 35 | `parseProfile` молча отбрасывал повреждённые записи `creditedWorkoutIds`; старая сессия уже вышла из последних 60 | Явно повреждённый ledger не разрешает новые или повторные начисления; wallet и точный raw сохраняются для восстановления |
| Открытие актуального профиля | RED: native storage event → conflict → «Открыть актуальное» → снова conflict при пустом IDB | `accept` не подтверждал прочитанную recovery revision и оставлял старый профиль | Read-only recovery принимает наблюдённую ревизию и читаемый баланс, сохраняя запрет записи |

[INTERP] Ошибка наград имеет более высокий приоритет, чем косметика: она нарушает однократность начисления. Использована качественная оценка влияния и проверяемости; численные risk scores не вычислялись.

## D. Step: решения и цена совместимости

### Датированная заметка

`StepsBoard` хранит черновик как `{value, day}`. До проверки числа и до записи сравнивается день с текущей локальной датой. При несовпадении хранилище только читается, редактор показывает актуальное число и просит ввести его заново. Same-day dirty draft по-прежнему сохраняется при записи другой вкладки.

`stepsLog` переиспользует единый parser. Валидная заметка с более поздней датой даёт отдельный `date-conflict` с `recordDay`. Writer также проверяет существующую запись до замены, включая попытку записать 0. Если preflight не может прочитать storage, `setItem` не выполняется. Повреждённая заметка по-прежнему заменяется только явным сохранением пользователя. Формат JSON и ключ не менялись.

Цена: при неверной дате устройства запись временно недоступна; пользователь видит причину и должен исправить дату/часовой пояс. Это один дневной слот, не история шагов. Межпроцессный TOCTOU между preflight и `setItem` остаётся: строгая сериализация предпочтений требует отдельного кооперативного lock и теста принудительного interleaving. Даже lock не защитит от старого или стороннего writer. Обычные настройки остаются last-writer-wins.

### Целостность учтённых тренировок

Отсутствующее поле `creditedWorkoutIds` остаётся допустимым legacy. Явно присутствующее поле должно быть плотным массивом валидных ID; тип object/null/string или ошибочный элемент считается неоднозначностью, которую нельзя исправлять фильтрацией перед начислением.

В читаемом recovery-представлении используется `null`: parse → JSON → parse не превращает повреждение в доверенные данные. Обычный save такой профиль не принимает и nullable ledger не создаёт. `loadProfileState` сохраняет читаемые XP, монеты, бойца и историю, но возвращает `recovery-required`. `saveProfile`, прямой `addCompletedWorkout` и preflight durable replay отказывают до начисления, изменения backup или staging.

Проверенная резервная копия восстанавливается только явным действием; повреждённый оригинал сохраняется в карантине. Повреждённый backup не считается доверенным. Recovery UI показывает прочитанный баланс и точную причину; экспорт содержит нормализуемый профиль вместе с точными исходными строками и сохранёнными durable receipts.

`useProfileStorage.accept` подтверждает прочитанную ревизию для non-unavailable состояния, не выдавая это за успешную запись. Читаемый null-ledger snapshot обновляет экран и экспорт; при недоступном storage RAM не стирается. Автосохранение по-прежнему требует `ready`; pending result не теряется.

Четыре прежних теста прямо разрешали начисления после очистки malformed ledger. Первый полный прогон выявил этот конфликт контракта. Тесты сохранены и усилены: XP/монеты/история остаются неизменными, но новые начисления требуют восстановления. Обычные legacy-профили без поля и корректные старые ID сохраняют совместимость. Формулы наград не менялись.

Цена: повреждение correctness-critical поля блокирует изменения профиля, пока однократность нельзя установить. Отсутствие поля невозможно достоверно отличить от настоящего legacy; удалённый ID в правдоподобном массиве также не обнаруживается этой проверкой. Это не античит и не серверная валидация.

### Изменённые файлы

Продукт: `src/App.tsx`, `src/components/StepsBoard.tsx`, `src/components/StorageRecovery.tsx`, `src/hooks/useProfileStorage.ts`, `src/lib/stepsLog.ts`, `src/lib/progression.ts`, `src/lib/durableWorkout.ts`.

Регрессии: `src/lib/stepsLog.test.ts`, `src/lib/dedupRecovery.test.ts`, `src/lib/rewardIntegrity.test.ts`, `qa/steps-day-e2e.mjs`, `qa/journal-e2e.mjs`. В package добавлены discoverable `qa:steps-day` и `qa:dedup-recovery`.

## E. Verify: границы доказательства

Все численные результаты ниже — тесты или assertions конкретного прогона, не число независимых пользователей или оценка физической точности. Browser-профили синтетические; видео владельца, профиль владельца и Downloads владельца не использовались. В датах измеряются также вызовы `Storage.prototype.setItem`: отсутствие записи тех же байтов проверяется отдельно от равенства raw.

Для dedup unit использует реальные функции progression/replay с mock durable acknowledgements. Отдельный браузерный сценарий использует настоящий strict IndexedDB, 65 production-generated тренировок, старый settled receipt, реальные reload, экспорт Blob и явный restore. Горячий путь проверяется двумя настоящими вкладками с native StorageEvent и пустыми обоими журналами. Контрольные балансы: 7800 XP / 2275 монет и 240 XP / 70 монет соответственно.

Промежуточные неуспехи не удалены: первоначальные RED дат и ledger; зависание редактора после возврата даты; конфликт четырёх старых unit-контрактов; hot recovery loop. Отдельный CDP navigation-context сбой сохранён как сбой harness, а не product RED. Его ожидание исправлено только после явно запрошенного reload, с прежним ограниченным timeout и повторным полным целевым прогоном.

### Fresh QA: PASS within the listed matrix

| Command | Exit | Result |
|---|---:|---|
| `python .iskra/scripts/verify_canon.py --negative-test --json` | 0 | PASS |
| `npm test -- --maxWorkers=1 --no-file-parallelism` | 0 | 353 tests |
| `npm run build` | 0 | PASS |
| `npm run qa:steps-day` | 0 | 28 assertions |
| `npm run qa:steps-day -- --case=future` | 0 | 15 assertions |
| `npm run qa:steps-day -- --case=timezone-day` | 0 | 11 assertions |
| `node qa/journal-e2e.mjs --dedup-only` | 0 | 34 assertions |
| `npm run qa:mobile` | 0 | 56 assertions |
| `npm run qa:tower20` | 0 | 17 assertions |
| `npm run qa:journal` | 0 | 100 assertions; 2 real renderer crashes |
| `npm run qa:multitab` | 0 | 31 assertions |
| `npm run qa:privacy` | 0 | 12 private paths HTTP 403 + application HTTP 200 |
| `npm run qa:bundle` | 0 | entry 387129 bytes; camera chunk 154276 bytes |
| `node --check qa/journal-e2e.mjs`; `node --check qa/steps-day-e2e.mjs` | 0 | PASS |
| `git diff --check` | 0 | PASS |

Full-browser hard-kill and power-loss were not tested. The existing lazy Avatar3D ~627.49 kB build warning remains; its limit was not raised. PowerShell NativeCommandError lines wrap stderr notices: final exit artifacts are checked separately.

### Source artifact bytes and SHA-256

| Path | Bytes | SHA-256 |
|---|---:|---|
| `src/App.tsx` | 69586 | `e8c42aa854dbc13a1cd1963b73ef9ff1030859944eb7098407a2f4f8b30c3e2a` |
| `src/components/StepsBoard.tsx` | 7454 | `99623fd070a8c744e78d2b0ab7820e93a51bc3b7f066dc471a967724196a6183` |
| `src/components/StorageRecovery.tsx` | 11357 | `8a41598cef6186193fa89588fb0de0f2f4f64431b86bc8157ab4e10ad941fe63` |
| `src/hooks/useProfileStorage.ts` | 13305 | `9791f7ad377dc818fb7a841db08839fc1138c30d7bbe5becd555e0c6d0615140` |
| `src/lib/stepsLog.ts` | 3384 | `7703b795f159f97311de4af078154dc600a7eb234fee08a60a34223c239cc32b` |
| `src/lib/progression.ts` | 14828 | `d9b03a945dea76a10554d46e9836abdfa0184f3e9214b66aa4eeba642f84ae5f` |
| `src/lib/durableWorkout.ts` | 5489 | `023510924bcc3ef043c77292c5038b49ef30458bbb77e5f1967b1869b71ee9f8` |
| `src/lib/stepsLog.test.ts` | 3791 | `7d8561ed2c53827f348050160cb2f4100a77c971f2532c13bd4bf69cb9e57d9f` |
| `src/lib/dedupRecovery.test.ts` | 9188 | `85fa4cdd013e590a154c6dd6c8ab5fbfbedc19ad8454806c6e70bc728af65627` |
| `src/lib/rewardIntegrity.test.ts` | 8274 | `a1589615ef481a4033116516c98195b43909f943aed6dc3ba1090fee6e3f2e2b` |
| `qa/steps-day-e2e.mjs` | 22404 | `c82a61f2e87b1685f27dacb2bf6734bc678874619edeae306f952d73f15c8243` |
| `qa/journal-e2e.mjs` | 41247 | `588a394b9919811e16808ab8840e05d87b753b1ca9a20c2f627fb27bb90be860` |
| `package.json` | 1488 | `a11b33d8a57e1e1f4c24bbbdcca16ed05cb908e0c57b65725c0ad94d1420def1` |

Engineering receipt: `.iskra/receipts/BODYFORGE_RELIABILITY_20261026.json`. Logs use `BODYFORGE_STEPS_DAY_20261026`, `BODYFORGE_DEDUP_RECOVERY_20261026`, and `BODYFORGE_RELIABILITY_20261026` prefixes under `.iskra/reports/`. Ten synthetic mobile/tower PNGs are archived there. The receipt also hashes this report, the baseline, evidence and build. Its own hash is reported separately after independent read-back.

## F. Close и следующий шаг

Статус: IMPLEMENTED и локально VERIFIED в указанной матрице. Приложение в целом PARTIAL; merged/deployed/verified-live не заявляются. Не измерены реальный Android, физическая точность приседаний, FPS, энергопотребление, аппаратные объективы и поведение ОС при смене времени. Синтетические двадцать поз не доказывают распознавание человека.

Следующие три инженерные итерации:

1. **Сериализация датированных предпочтений.** Зависимость — текущие helper/editor и browser clock fixtures. Готовность: принудительный конфликт двух writers не заменяет более позднюю заметку, lock timeout/cancel имеют понятный UX, сохранения профиля не меняются. Цена — зависимость от кооперации writers и поддержки lock; история заметок отдельно не вводится.
2. **Изолированный full-browser crash harness.** В существующем `qa/browser-crash-e2e.mjs` обе фазы используют один profileId и очищают localStorage без отдельной очистки durable IDB. Это угроза независимости baseline, а не доказанный новый дефект приложения. Перед запуском исправить фазовую изоляцию и повторную проверку собственного PID/profile непосредственно перед hard kill. Готовность: два независимых cutpoint, рестарт того же тестового профиля, exact-once награда и проверенная уборка. Renderer-crash и process-crash не равны power loss.
3. **Android и измеряемая оптимизация 3D.** Зависимость — конкретный телефон и безопасный HTTPS для камеры. Измерить загрузку GLB, frame/inference задержки и lifecycle фон/возврат/камера без записи raw-видео; затем сравнить одну оптимизацию до/после в одинаковых условиях. Сборочный размер чанка не заменяет эти измерения.

Тамагочи и башня продолжают развиваться поверх восстановимого профиля и однократных наград. Онлайн остаётся планируемым до backend и серверной валидации. Новые упражнения не получают автоматически алгоритм приседаний.

Откат: сравнить текущий diff с локальным baseline и вернуть только изменения этой итерации; семь сохранённых прежних файлов и новые пользовательские правки не затрагивать. Для бывших чистых файлов опорой служит исходный HEAD. `reset --hard` не применять. Формат здорового сохранения не менялся; удалять или «чинить» ledger без доказательств нельзя.

**∆DΩΛ**

∆ — защищены принадлежность ввода дню и восстановление списка учтённых наград; исправлен hot recovery.
D — до/после, production code, unit, настоящий browser storage, native events, read-back.
Ω — высокая для проверенных локальных состояний, ограниченная для иных отказов и физического устройства.
Λ — пересмотр при новом воспроизводимом сбое; ближайший эксперимент — принудительное межвкладочное interleaving записи датированной заметки.
