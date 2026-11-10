"""Read-back/QC for this bounded local iteration, without Git or app writes."""
from pathlib import Path
import datetime, difflib, hashlib, json, re, subprocess

root = Path('C:/github/BODYFORGE')
audit = root / 'docs/audits'
prefix = 'BF_BUNDLE_20261110'
def textlog(name):
    data = (audit / (prefix + name)).read_bytes()
    return data.decode('utf16' if data.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig')
def item(path):
    data = path.read_bytes()
    return {'path': path.relative_to(root).as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
def run(args):
    return subprocess.run(args, cwd=root, capture_output=True, text=True)

manifest = json.loads((audit / (prefix + '.inputs.json')).read_text(encoding='utf8'))
owned = ['src/App.tsx', 'qa/bundle-on-demand.mjs', 'qa/mobile-e2e.mjs']
expected = {v['path']: v for v in manifest['inputs']}
assert item(root / owned[0]) == expected[owned[0]], 'App changed after compilation'
assert item(root / owned[1]) == expected[owned[1]], 'Bundle gate changed after compilation'
drift = [dict(v, currentSha256=item(root / v['path'])['sha256']) for v in manifest['inputs']
         if item(root / v['path']) != v]
foreign_drift = [v for v in drift if v['path'] not in owned]
build_root = root / manifest['buildDirectory']
for record in manifest['dist']:
    copy = build_root / Path(record['path']).relative_to('dist')
    assert copy.stat().st_size == record['bytes']
    assert hashlib.sha256(copy.read_bytes()).hexdigest() == record['sha256'], 'Compiled artifact changed'

mobile = textlog('.final-mobile.log')
assert 'BODYFORGE_MOBILE_E2E_PASS' in mobile and 'BROWSER_EXCEPTION' not in mobile
assert 'PASS touching the actual recovery button' in mobile
target = json.loads(re.search(r'DAILY_PLAN_RELOAD_TARGET (\{.+\})', mobile)[1])
assert target['height'] >= 44 and target['width'] >= 44 and target['bottom'] <= target['usableBottom']
assert re.search(r'Tests\s+565 passed', textlog('.final-tests.log'))
assert 'built in' in textlog('.release-build.log')
bundle = json.loads(re.search(r'BODYFORGE_BUNDLE_ON_DEMAND_PASS (\{.+\})', textlog('.release-bundle.log'))[1])
assert bundle['entryBytes'] < bundle['baselineEntryBytes'] * .8
assert 'BODYFORGE_PRIVATE_DEV_PATHS_PASS=12' in textlog('.sealed-privacy.log')
assert 'BODYFORGE_PWA_INSTALL_PASS' in textlog('.sealed-pwa.log')
extra_qa = json.loads((audit / (prefix + '.browser-summary.json')).read_text(encoding='utf-8-sig'))
assert len(extra_qa) == 3 and all(v['exitCode'] == 0 for v in extra_qa)
assert 'BODYFORGE_ON_DEMAND_CAMERA_PASS {"checks":26' in textlog('.camera-runtime.log')
assert 'BODYFORGE_TRAINING_EXPERIENCE_PASS checks=26' in textlog('.experience.log')
assert 'BODYFORGE_APPEARANCE_E2E_PASS assertions=812' in textlog('.appearance.log')

canon = run(['python', '.iskra/scripts/verify_canon.py', '--negative-test'])
assert canon.returncode == 0, canon.stdout + canon.stderr
(audit / (prefix + '.canon.log')).write_text(canon.stdout, encoding='utf8')
diff_check = run(['git', 'diff', '--check'])
assert diff_check.returncode == 0, diff_check.stdout + diff_check.stderr
head = run(['git', 'rev-parse', 'HEAD']).stdout.strip()

backups = dict(zip(owned, ['App.tsx.txt', 'bundle-on-demand.mjs.txt', 'mobile-e2e.mjs.txt']))
patch = ''.join(''.join(difflib.unified_diff(
    (audit / (prefix + '_before') / backups[name]).read_text(encoding='utf8').splitlines(keepends=True),
    (root / name).read_text(encoding='utf8').splitlines(keepends=True),
    fromfile='a/' + name, tofile='b/' + name)) for name in owned)
patch_path = audit / (prefix + '.patch')
patch_path.write_text(patch, encoding='utf8')
reverse = run(['git', 'apply', '--reverse', '--check', '--ignore-space-change', str(patch_path)])

adr = audit / ('ADR-' + prefix + '-DAILY-PLAN.md')
adr.write_text('''# ADR — BF-BUNDLE-20261110: дневной план по требованию

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
''', encoding='utf8')

report = audit / (prefix + '.md')
drift_text = ', '.join(v['path'] for v in foreign_drift) or 'не обнаружен'
report.write_text(f'''# BODYFORGE — одна итерация: initial bundle и безопасный lazy-план

voice=ISKRA; phase=BUILD → VERIFY; intent=BODYFORGE / INITIAL_BUNDLE

## A / Problem
ТЗ — требования, код — исполнение, эта квитанция — результаты конкретных вызовов. Известный performance gate воспроизведён: entry400955 bytes, baseline496761, снижение19.3%, qa:bundle exit1. Блок дневной цели входил в первый JS даже до создания бойца. Изменение сделано непосредственно в C:/github/BODYFORGE, не в другом клоне.

## B / Evidence
Исходный HEAD7144fc4c20d813979c82a9bd980f4b274c24af67, стартовое дерево чистое. Итоговый HEAD при receipt: {head}. App.tsx:23 — lazy loader; qa/mobile-e2e.mjs — resource observation и negative chunk lifecycle. До/после сохранены в backup/patch и inputs manifest.

Исторический handoff сообщал Chrome exited0 до CDP. Свежий повтор на том же preview5189 запустил Chrome/CDP и дошёл до UI. Фактический отказ оказался позже: QA искал только /src/components/*.tsx и не узнавал production /assets/*-hash.js. Первопричина исторического процесса exited0 остаётся UNKNOWN; launcher, защитные флаги и личные профили не менялись.

## C / Decision
Лениво загружать существующий DailyPlanBoard после создания бойца, с независимыми Loading/Error и reload. Начальный dashboard/камера не должны падать при отказе второстепенного chunk. Политика budget gate сохранена; чисел-заглушек, новой экономики, API/Health Connect или ассетов не добавлено. Подробности и цена решения: ADR-BF_BUNDLE_20261110-DAILY-PLAN.md.

## D / Changed
- src/App.tsx: eager import → lazy; локальный catch; Suspense с существующим id daily-plan; кнопка восстановления в существующем bf-goal-actions.
- qa/bundle-on-demand.mjs: отдельный daily chunk, отсутствие HTML preload и dynamic reference; порог≥20% и baseline неизменны.
- qa/mobile-e2e.mjs: распознавание dev/production resources; реальная задержка и отказ модуля; доступные состояния; touch-target; touch-reload и byte read-back; snapshots в выбранной папке.

Во время работы наблюдались параллельные изменения game.ts, затем они отсутствовали в diff. Чужие camera-feedback/test правки присутствовали в финальной сборке, поэтому unit565 вместо прежних564; их авторство этой итерации не приписывается. После фиксации сборки продолжились другие CSS/QA изменения. Их не перезаписывали. Отдельный drift относительно зафиксированных входов: **{drift_text}**. Собственные App/bundle gate совпадают со снимком; финальный mobile-harness дополнен проверкой настоящего touch уже после sealing, его итоговые bytes/SHA указаны отдельно.

## E / QA
| Команда / контекст | Exit | Фактический результат |
|---|---:|---|
| npm test -- --maxWorkers=1 --no-file-parallelism, baseline | 0 | 564/564 |
| npm run build, baseline | 0 | PASS |
| npm run qa:bundle, baseline | 1 | Воспроизведён budget FAIL400955 bytes |
| npm run qa:mobile, baseline preview5189 | 12 | CDP и UI запустились, затем dev-only URL assertion FAIL |
| npm test -- --maxWorkers=1 --no-file-parallelism, после последнего App patch | 0 | 565/565, 46 файлов |
| npm run build, после последнего App patch | 0 | PASS |
| npm run qa:bundle | 0 | entry{bundle['entryBytes']}, gzip{bundle['entryGzipBytes']}, снижение{bundle['entryReductionPercent']}% |
| npm run qa:mobile, frozen production5193 | 0 | Полный mobile; реальный touch-reload; profile bytes неизменны |
| npm run qa:privacy, production5193 | 0 | 12 HTTP403 + приложение200 |
| npm run qa:pwa, dist + HTTP5193 | 0 | 7 статических файлов, icons, localHttp=true; offline=false |
| git diff --check / node --check | 0 | PASS |

Дополнительные прогоны до последней правки размера fallback-кнопки: qa:camera-runtime26 PASS, qa:experience26 PASS, qa:appearance812 PASS. Они не выдаются за повторную проверку нынешних чужих изменений этих QA-скриптов/CSS. После последней правки целиком повторены unit/build/bundle и затронутый production mobile-сценарий.

Новый touch-регрессионный тест сначала измерил26px и упал exit12. После исправления: **{target['width']}×{target['height']} CSS px**, top{target['top']}, bottom{target['bottom']}, верх нижней навигации{target['usableBottom']}. Нажатие Input.dispatchTouchEvent вызвало настоящий новый документ, дневной план загрузился; raw primary остался прежним. Camera/pose startup и ручная остановка без XP входят в полный mobile. Необработанных Runtime.exceptionThrown в финальном логе нет; ожидаемый отказ ресурса в negative-test отделён от JS exception.

Установленный Chrome binary157.0.8103.40, Windows, отдельный temporary profile. 390px основной mobile, 360px проверка overflow. Все camera данные синтетические. Screenshots loading/error/ready/3D находятся в BF_BUNDLE_20261110_shots; error-red — исторический FAIL, не финальный дизайн. Проверялось headless UI, состояние окна VS Code/личного браузера не подтверждалось.

Промежуточный собственный preview на5176 не стартовал: порт оказался занят другим процессом. Его не останавливали; выбраны свободные порты. Это локальный инфраструктурный отказ, не сбой UI. Production5191 также отдавал200; для неизменяемой проверки compiled output скопирован в {manifest['buildDirectory']} и открыт только на127.0.0.1:5193. Исходные файлы остались в основной папке.

## F / Receipt
BF_BUNDLE_20261110.receipt.json — размеры, SHA256, QC и snapshot inputs. BF_BUNDLE_20261110.inputs.json фиксирует127 входов и48 build-файлов; snapshot проверен побайтово. BF_BUNDLE_20261110.patch — только три собственных исходных файла. Обратная git apply --check: exit{reverse.returncode}. Перед реальным откатом обязательна проверка совпадения текущих SHA; работа других процессов не откатывается.

Открыть проверенное приложение: **http://127.0.0.1:5193/**. HTTP200 и нужный entry подтверждены. Новый граф состояния виден после создания бойца; обычная загрузка показывает тот же существующий план. Loading/Error воспроизводятся контролируемым перехватом только в QA; постоянная demo-ошибка в приложение не внесена.

## G / Status
SPECIFIED=YES; IMPLEMENTED=YES; TESTED_LOCAL=PASS для указанного frozen build; COMMITTED_BY_THIS_AGENT=NO; PUSHED=NO; DEPLOYED_BY_THIS_AGENT=NO; VERIFIED_LIVE=NOT_VERIFIED. Для всего параллельно изменяемого working tree общий release-статус остаётся PARTIAL. Это не готовность всех фаз GDD.

Снижение entry относительно свежей baseline: {400955 - bundle['entryBytes']} bytes; размер отдельного дневного chunk{bundle['dailyPlanChunkBytes']}. Общий JS для возвращающегося игрока может стать больше из-за дополнительного chunk/request. LCP/INP/CLS, физические FPS, нагрев, батарея и точность человека **NOT VERIFIED**. Запас до целочисленного потолка entry397408 — **{397408 - bundle['entryBytes']} bytes**. Asset/3D geometry и CV-пороги этой итерацией не менялись.

Канон проверен отдельно, исходные canonical files не менялись. Skills использовались как прочитанные инструкции; native Guard/memory services не вызывались. metric computation unavailable; memory write unavailable в данном scope. Инженерная квитанция не является Guard receipt или записью внешней памяти.

## H / Next 15 minutes
Следующий отдельный шаг — согласовать один стабильный набор параллельных CSS/QA-правок и повторить гейты на общей ревизии. Затем провести полевой контроль на RMX3393 с ручным счётом. Публикация требует отдельного release-gate и разрешения; этот сеанс ничего не публикует.

**∆DΩΛ** — ∆: безопасно отложен дневной редактор и исправлен production QA; D: RED/green,565 unit, build/bundle, controlled chunk failure, touch и byte read-back; Ω: высокая для зафиксированной локальной версии; Λ: пересмотр при изменении source/budget или результате настоящего телефонного эксперимента.
''', encoding='utf8')

paths = [root / p for p in owned] + [adr, report, patch_path, audit / (prefix + '.inputs.json')]
paths += sorted((audit / (prefix + '_before')).glob('*'))
paths += sorted((audit / (prefix + '_shots')).glob('*.png'))
paths += sorted(audit.glob(prefix + '*.log'))
paths += [audit / (prefix + '.browser-summary.json'), root / 'docs/audits/BF_BUNDLE_20261110_capture.py', Path(__file__).resolve()]
records = [item(p) for p in dict.fromkeys(paths)]
for record in records:
    if record['path'].endswith('.png'):
        assert (root / record['path']).read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
receipt = {'schema': 'bodyforge.engineering-qa-receipt.v1', 'id': prefix, 'date': '2026-11-10',
    'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'head': head,
    'ownedScope': owned, 'status': 'TESTED_LOCAL', 'testedBuild': manifest['buildDirectory'],
    'origin': manifest['origin'], 'unit': {'exitCode': 0, 'passed': 565, 'files': 46},
    'buildExit': 0, 'bundleExit': 0, 'bundle': bundle,
    'mobile': {'exitCode': 0, 'origin': manifest['origin'], 'synthetic': True, 'touchTarget': target, 'actualTouchRecovery': True, 'runtimeExceptions': 0},
    'otherQA': {'privacyExit': 0, 'blockedPaths': 12, 'pwaExit': 0, 'preFinalRuns': extra_qa},
    'sourceDriftSinceSeal': drift, 'wholeMutableWorkspaceReleaseStatus': 'PARTIAL',
    'rollbackCheckExit': reverse.returncode, 'canonExit': canon.returncode,
    'lifecycle': {'implemented': True, 'testedLocalBuild': True, 'committedByThisAgent': False, 'pushedByThisAgent': False, 'deployedByThisAgent': False, 'verifiedLive': False},
    'nonclaims': ['physical movement accuracy', 'real phone FPS/battery/heat', 'LCP INP CLS p75', 'current parallel CSS and QA completion', 'historical Chrome exited0 root cause'],
    'files': records}
output = audit / (prefix + '.receipt.json')
assert not output.exists(), 'Do not overwrite an existing receipt'
output.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
verified = json.loads(output.read_text(encoding='utf8'))
for record in verified['files']:
    assert item(root / record['path']) == record, 'Artifact changed during read-back: ' + record['path']
print(json.dumps({'receipt': item(output), 'report': item(report), 'adr': item(adr),
    'qc': 'PASS', 'fileCount': len(records), 'rollbackCheckExit': reverse.returncode,
    'foreignDrift': [v['path'] for v in foreign_drift]}, ensure_ascii=False))
