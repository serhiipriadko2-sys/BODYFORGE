from pathlib import Path
from hashlib import sha256
root=Path.cwd()
a=Path('docs/audits/BF_106_IMPORT_PREVIEW_20261125')
p=Path('src/components/ProgressBackupPanel.tsx')
c=Path('src/components/progressBackup.css')
old=p.read_bytes();css=c.read_bytes()
assert sha256(old).hexdigest()=='36765beecdf9d77396370e743706a90bfa0e9297b9ba70f66534ab55bef6b24a'
assert sha256(css).hexdigest()=='45261d6c02ca11cc6d39be3838deb336ad380d29989816ab68848982a63a6b33'
s=old.decode('utf-8').replace('\r\n','\n')
def once(old,new):
 global s
 assert s.count(old)==1,old
 s=s.replace(old,new)
once("import { inspectProgressBackupFile, type BackupInspection } from '../lib/progressBackupInspector';","import { previewProgressImportFile, type ProgressImportPreview } from '../lib/progressImportPreview';")
once("const [inspection, setInspection] = useState<BackupInspection | null>(null);","const [preview, setPreview] = useState<ProgressImportPreview | null>(null);\n  const inspection = preview?.inspection;")
once("    generation.current++;\n    setPrepared(null);\n    setStatus('idle');\n    setMessage('');\n  }, [profile, pendingResult]);","    generation.current++;\n    inspectionGeneration.current++;\n    setPreview(null);\n    setInspecting(false);\n    setPrepared(null);\n    setStatus('idle');\n    setMessage('');\n  }, [profile, pendingResult]);")
once("    setInspection(null);\n  }, [disabled]);","    setPreview(null);\n  }, [disabled]);")
once("      generation.current++;\n      setPrepared(null);","      generation.current++;\n      inspectionGeneration.current++;\n      setPreview(null);\n      setInspecting(false);\n      setPrepared(null);")
once("    setInspection(null);\n    setInspecting(true);\n    const result = await inspectProgressBackupFile(file);\n    if (request !== inspectionGeneration.current) return;\n    setInspection(result);\n    setInspecting(false);","    setPreview(null);\n    setInspecting(true);\n    const result = await previewProgressImportFile(file, profile);\n    if (request !== inspectionGeneration.current) return;\n    setPreview(result);\n    setInspecting(false);")
once("  return (\n    <section id=",'''  function cancelPreview() {
    inspectionGeneration.current++;
    setPreview(null);
    setInspecting(false);
  }

  return (
    <section id=''')
# Keep previous QA data attributes and labels; extend them, not replace the verifier.
once("          <small>Это проверка структуры файла, не доказательство подлинности наград и не импорт.","""          {preview?.incoming && (
            <div className="progress-import-preview" data-import-preview={preview.state}>
              <p role="status">{preview.state === 'blocked'
                ? 'Копия требует дополнительного разбора. Замена недоступна.'
                : 'Предварительный просмотр готов. Текущий прогресс не изменён.'}</p>
              <table aria-label="Сравнение текущего прогресса и резервной копии">
                <thead><tr><th scope="col">Показатель</th><th scope="col">Сейчас</th><th scope="col">В копии</th></tr></thead>
                <tbody>
                  {([
                    ['XP', 'xp'], ['Монеты', 'coins'], ['Всего тренировок', 'workouts'],
                    ['Записей в истории', 'availableWorkouts'], ['Повторения', 'repetitions'],
                    ['Планка, сек.', 'holdSeconds'], ['Этаж Башни', 'towerFloor'], ['Костюмы', 'ownedOutfits'],
                  ] as const).map(([label, field]) => (
                    <tr key={field}><th scope="row">{label}</th><td>{preview.current[field].toLocaleString('ru-RU')}</td>
                      <td>{preview.incoming![field].toLocaleString('ru-RU')}</td></tr>
                  ))}
                </tbody>
              </table>
              <small>Совпадение бойца: {preview.identity === 'same' ? 'по локальному ID'
                : preview.identity === 'different' ? 'другой ID' : 'не установлено'}.
                Записанных квитанций выплат: {preview.recordedGrants}.</small>
            </div>
          )}
          {preview && preview.warnings.length > 0 && (
            <ul className="progress-import-warnings" data-import-warnings>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
          )}
          {(inspecting || preview) && <button type="button" className="progress-import-cancel"
            data-action="cancel-import-preview" onClick={cancelPreview}>ОТМЕНИТЬ ПРОСМОТР</button>}
          <small>Это проверка структуры файла, не доказательство подлинности наград и не импорт.""")
once("            onChange={(event) => {","            onChange={(event) => {")
once("        <small>Файл может содержать имя бойца и историю тренировок. Никуда не отправляется. Автоматического импорта пока нет — копия предназначена для хранения и технического восстановления.</small>","        <small>Файл может содержать имя бойца и историю тренировок. Никуда не отправляется. Можно проверить копию и сравнить прогресс; замена сохранения пока недоступна.</small>")
cssnew=css.decode('utf-8')+"""
/* BF-106 comparison is read-only and fits narrow mobile viewports. */
.progress-import-preview { margin: 12px 0; min-width: 0; }
.progress-import-preview table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 11px; color: #e6f4fc; }
.progress-import-preview th, .progress-import-preview td { padding: 7px 4px; border-bottom: 1px solid #365165; overflow-wrap: anywhere; }
.progress-import-preview th:first-child { width: 46%; text-align: left; }
.progress-import-preview td, .progress-import-preview th:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; }
.progress-import-preview thead th { color: #a4f0da; font-weight: 800; }
.progress-import-warnings { margin: 10px 0; padding-left: 19px; color: #ffd6ab; font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.progress-import-cancel { min-height: 44px; max-width: 100%; margin-top: 8px; padding: 9px 13px; border: 1px solid #4d7081; border-radius: 8px; background: #111f2b; color: #e6f4fc; font-size: 11px; cursor: pointer; }
.progress-import-cancel:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
"""
for f,b in [(a/'ProgressBackupPanel.tsx.before',old),(a/'progressBackup.css.before',css)]:
 with f.open('xb') as out: out.write(b)
assert p.read_bytes()==old and c.read_bytes()==css
p.write_bytes(s.encode('utf-8'))
c.write_bytes(cssnew.encode('utf-8'))
for f in (p,c): print(f,f.stat().st_size,sha256(f.read_bytes()).hexdigest())

