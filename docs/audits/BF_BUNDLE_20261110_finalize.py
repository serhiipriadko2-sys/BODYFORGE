"""Seal tested sources without overwriting concurrent application edits."""
from pathlib import Path
from datetime import datetime, timezone
import difflib
import hashlib
import json
import re
import subprocess
import urllib.request

root = Path('C:/github/BODYFORGE')
audit = root / 'docs/audits'
prefix = 'BF_BUNDLE_20261110'
old_path = audit / (prefix + '.receipt.json')
old = json.loads(old_path.read_text(encoding='utf8'))
manifest = json.loads((audit / (prefix + '.inputs.json')).read_text(encoding='utf8'))
owned = old['ownedScope']
archive = audit / (prefix + '_tested_sources')
final_path = audit / (prefix + '.final.receipt.json')
assert not archive.exists() and not final_path.exists(), 'Do not overwrite an existing seal'


def record(path):
    data = path.read_bytes()
    return {'path': path.relative_to(root).as_posix(), 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest()}


# Reconstruct exact compiled App bytes from the original backup and owned diff.
# All hunk contexts must match; the old receipt must confirm the resulting hash.
patch = (audit / (prefix + '.patch')).read_text(encoding='utf8').splitlines(keepends=True)
base = (audit / (prefix + '_before/App.tsx.txt')).read_text(encoding='utf8').splitlines(keepends=True)
out, pos = [], 0
i = patch.index('+++ b/src/App.tsx\n') + 1
while i < len(patch) and not patch[i].startswith('--- a/'):
    match = re.match(r'@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@', patch[i])
    assert match, 'Invalid hunk header'
    start = int(match[1]) - 1
    out.extend(base[pos:start])
    pos, i = start, i + 1
    while i < len(patch) and not patch[i].startswith(('@@ ', '--- a/')):
        line = patch[i]
        if line[0] in ' -':
            assert base[pos] == line[1:], 'Patch context drift'
            pos += 1
        if line[0] in ' +':
            out.append(line[1:])
        i += 1
out.extend(base[pos:])
expected = {v['path']: v for v in old['files']}
app = ''.join(out).replace('\n', '\r\n').encode('utf8')
assert len(app) == expected[owned[0]]['bytes']
assert hashlib.sha256(app).hexdigest() == expected[owned[0]]['sha256']
prepared = {owned[0]: app}
for name in owned[1:]:
    assert record(root / name) == expected[name], 'QA source changed'
    prepared[name] = (root / name).read_bytes()

# Verify existing immutable evidence and all compiled outputs before new writes.
for original in old['files']:
    if original['path'] not in owned:
        assert record(root / original['path']) == original, original['path']
compiled = []
for original in manifest['dist']:
    path = root / manifest['buildDirectory'] / Path(original['path']).relative_to('dist')
    actual = record(path)
    assert actual['bytes'] == original['bytes'] and actual['sha256'] == original['sha256']
    compiled.append(actual)
diff_check = subprocess.run(['git', 'diff', '--check'], cwd=root, capture_output=True)
assert diff_check.returncode == 0, diff_check.stdout.decode(errors='replace')
response = urllib.request.urlopen(old['origin'], timeout=10)
html = response.read().decode('utf8')
assert response.status == 200 and old['bundle']['entryName'] in html

live = record(root / owned[0])
concurrent_diff = ''.join(difflib.unified_diff(
    app.decode('utf8').splitlines(keepends=True),
    (root / owned[0]).read_text(encoding='utf8').replace('\n', '\r\n').splitlines(keepends=True),
    fromfile='tested/src/App.tsx', tofile='concurrent/src/App.tsx'))
assert concurrent_diff, 'Expected documented concurrent source drift'

archive.mkdir()
mapped, artifacts = [], []
for name, data in prepared.items():
    target = archive / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    actual = record(target)
    assert actual['sha256'] == expected[name]['sha256']
    mapped.append({'sourcePath': name, 'testedArtifact': actual})
    artifacts.append(actual)
delta_path = audit / (prefix + '.concurrent-App.diff')
delta_path.write_text(concurrent_diff, encoding='utf8', newline='')
addendum = audit / (prefix + '.final.md')
addendum.write_text('''voice=ISKRA; phase=BUILD → VERIFY; intent=BODYFORGE / final evidence seal

## A / Problem and B / Evidence

После исходной квитанции `src/App.tsx` изменён параллельным процессом: добавляются SettingsFaq, навигация и перенос блоков. Эти изменения сохранены. Наш DailyPlan lazy/error/Suspense остаётся в файле. Текущая общая рабочая папка не равна проверенной сборке.

## C / Decision and D / Changed

Исходники приложения повторно не изменялись. Точная проверенная версия трёх наших файлов архивирована в `BF_BUNDLE_20261110_tested_sources/`. App восстановлен из исходной копии и diff; его 82 614 байт и SHA-256 полностью совпали с исходной квитанцией. QA-файлы совпали напрямую. Различия с текущим App сохранены в `BF_BUNDLE_20261110.concurrent-App.diff`; это наблюдение, не патч для отмены чужой работы.

## E / QA

Существующие журналы и артефакты исходной квитанции сверены по размеру/SHA-256, с заменой mutable-путей трёх исходников на их точные архивные копии. Все 48 файлов frozen production-сборки сверены с build manifest. Новый полный прогон на изменяемой рабочей папке не заявляется.

Проверенная сборка: unit 565/565, build, bundle, production mobile (включая настоящий touch восстановления плана и неизменность профиля), privacy и PWA — exit 0. Entry 397150 байт, экономия 20.1% против baseline 496761; запас до численного gate всего 258 байт. Это размер загрузки, не измерение FPS или Web Vitals. Историческая причина Chrome exited 0 не установлена.

## F / Receipt and G / Status

`BF_BUNDLE_20261110.final.receipt.json` дополняет исходную квитанцию, уточняя mapping проверенных исходников и границу PASS. TESTED_LOCAL — для frozen-сборки на http://127.0.0.1:5193/; общая текущая рабочая папка — PARTIAL до согласованного прогона после параллельных изменений. Коммит, публикация и проверка live не выполнялись. Канон и сохранения не изменялись. Телефон, настоящая точность движений и производительность realme не проверялись в этой итерации.

## H / Next 15 minutes

После завершения параллельной работы зафиксировать новый input manifest и проверить общую сборку, qa:bundle и mobile на ней. Не откатывать App целиком: исходный diff отменим только после сверки пересекающихся областей.

∆DΩΛ: ∆ — отделены проверенные артефакты от concurrent WIP; D — точное восстановление SHA-256, журналы, 48 compiled-файлов и HTTP 200; Ω — высокая для frozen-сборки, ограниченная для текущей папки; Λ — новая проверка после изменения исходников.
''', encoding='utf8', newline='\n')
artifacts.extend(v for v in old['files'] if v['path'] not in owned)
artifacts.extend([record(old_path), record(delta_path), record(addendum), record(Path(__file__))])
final = {
    'schema': 'bodyforge.engineering-qa-final-seal.v1',
    'id': prefix + '-FINAL', 'createdAt': datetime.now(timezone.utc).isoformat(),
    'head': old['head'], 'supersedesSourceMappingOf': record(old_path),
    'testedStatus': 'TESTED_LOCAL', 'currentWorkspaceStatus': 'PARTIAL',
    'sourceMapping': mapped, 'liveAppObservation': live,
    'compiledArtifacts': compiled, 'files': artifacts,
    'qa': {key: old[key] for key in ['unit', 'buildExit', 'bundleExit', 'bundle', 'mobile', 'otherQA']},
    'finalChecks': {'gitDiffCheckExit': diff_check.returncode, 'httpStatus': response.status,
                    'servedExpectedEntry': True, 'videoRecorded': False},
    'origin': old['origin'], 'lifecycle': old['lifecycle'], 'nonclaims': old['nonclaims'],
    'readBackScope': 'Archived tested inputs, immutable logs/receipts and compiled artifacts; mutable live source observations are not assertions of its future state.'
}
final_path.write_text(json.dumps(final, ensure_ascii=False, indent=2) + '\n', encoding='utf8', newline='\n')
read_back = json.loads(final_path.read_text(encoding='utf8'))
for item in read_back['files'] + read_back['compiledArtifacts']:
    assert record(root / item['path']) == item, item['path']
print(json.dumps({'readBack': 'PASS', 'artifacts': len(artifacts), 'compiledFiles': len(compiled),
                  'receipt': record(final_path), 'addendum': record(addendum),
                  'currentAppChanged': live['sha256'] != expected[owned[0]]['sha256']}, ensure_ascii=True))
