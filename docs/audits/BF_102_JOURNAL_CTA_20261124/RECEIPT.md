# BODYFORGE / R1 · BF‑102 · Повтор тренировки и восстановление

Статус **TESTED_LOCAL** на снимке `7caa598c873c92887ac2ae3071b13f433225312e` в E:\github\BODYFORGE.
Старый тест выполнял click на первом .primary-button при удерживаемом Web Lock. Реальный интерфейс блокирует data-action=restart-workout до начисления. В RUN04 тест упал именно на клике после подтверждения записи в IndexedDB.
Патч касается одного QA-сценария. Во время блокировки он требует disabled, вызывает .click() и проверяет отсутствие дополнительного потока. После освобождения блокировки проверяет прежний sessionId из журнала, однократное начисление, доступность повтора и сохранение результата после reload.

Команды и выходы: {'owned-chrome': 0, 'unit': 0, 'build': 0, 'bundle': 0, 'forge': 0, 'privacy': 0, 'journal': 0}. Git и канон: {'diff': 0, 'cached-diff': 0, 'canon': 0}. Vitest: 666 прошедших тестов.
Исполняемая сборка и все файлы dist побайтно совпали с R0: True. Exact preview entry и локальные адреса сохранены в gates.json. Оба QA-сервера остановлены.
Очередь, начисление и reload: PASS; полный журнал: 0. Утверждений в журнале: 161. Вызванных падений рендерера Chrome: 3.
Граница сбоя: см. результаты команд. Отличия исходников проекта от снимка: 0.
Chrome использовал изолированный тестовый профиль и синтетические landmarks. Падение рендерера через CDP не моделирует потерю питания. Физическое устройство, APK и Firebase в этот прогон не входили.

`qa/journal-e2e.mjs` — 59032 байт, SHA‑256 `48aa98b6c64ea37b62cb11f14ebd75b16217d8868a518bfe8609a069e0e04067`.
Откат только после проверки after-хеша, из .bodyforge-qa/roadmap-bf102-journal-cta/journal-e2e.mjs.before с SHA‑256 `918d1a64773c5b3c4b9d8aa9fe8eae4e8cdca8f5440ddaab48d4de2ab2c6aa5c`.
Хеши, фактические команды, exit codes, идентичность сборки и результаты сохранены в [receipt.json](receipt.json) и [gates.json](gates.json).
Контракт IndexedDB и граница сбоя описаны в [IndexedDB 3.0](https://w3c.github.io/IndexedDB/#durability-hint) и [CDP Page.crash](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-crash).
