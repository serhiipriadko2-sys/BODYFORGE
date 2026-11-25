from pathlib import Path
from hashlib import sha256
a=Path('docs/audits/BF_107_GZIP_ARCHIVE_20261125')
p=Path('src/lib/progressImportPreview.ts')
t=Path('src/lib/progressImportPreview.test.ts')
b=Path('src/lib/progressBackup.ts')
q=Path('src/components/ProgressBackupPanel.tsx')
expected={p:'c932302058f927dd47b8ef1d5b980b01c07ad60d7bb36147393d7a0b6e0b076a',t:'2a2897140e12f58f579d264e7e1c5a41f7439a4884f360d93c52a33b569bdade',b:'f1affce4f28336a3e8147401c9669078886d920eae8ed93d686b9584c1cb1993',q:'cebe5db74e06634e407b83af9261b7c7732a9cb0083833d67f098a97181a79ae'}
old={f:f.read_bytes() for f in expected}
for f,h in expected.items():assert sha256(old[f]).hexdigest()==h,f
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
s=old[p].decode().replace('\r\n','\n')
s=once(s,"import { previewReceiptMigration, type ReceiptMigrationPreview } from './receiptCompatibility';","""import { previewReceiptMigration, type ReceiptMigrationPreview } from './receiptCompatibility';
import { BackupArchiveError, decodeBackupBytes } from './backupArchive';""")
s=once(s,"  onComparable?: (validatedJson: string) => void,","  onComparable?: (validatedJson: string) => void, signal?: AbortSignal,")
s=once(s,"    const bytes = await file.arrayBuffer();","    if (signal?.aborted) return invalid(current, 'Проверка отменена.');\n    const bytes = await file.arrayBuffer();")
s=once(s,"    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);","    const json = await decodeBackupBytes(bytes, signal);\n    if (signal?.aborted) return invalid(current, 'Проверка отменена.');")
s=once(s,"  } catch {\n    return invalid(current, 'Не удалось прочитать файл как корректный UTF-8 JSON.');","""  } catch (error) {
    if (error instanceof BackupArchiveError) {
      if (error.code === 'limit') return invalid(current, 'Распакованный JSON больше 16 МиБ. Проверка остановлена.');
      if (error.code === 'unsupported') return invalid(current, 'Этот браузер не умеет распаковывать GZIP. Выбери исходный JSON.');
      if (error.code === 'cancelled') return invalid(current, 'Проверка отменена.');
    }
    return invalid(current, 'Не удалось прочитать корректный UTF-8 JSON или GZIP-архив.');""")
v=old[t].decode().replace('\r\n','\n')
v=once(v,"import { previewProgressImportFile, previewProgressImportJson } from './progressImportPreview';","""import { previewProgressImportFile, previewProgressImportJson } from './progressImportPreview';
import { prepareBackupArchive } from './backupArchive';""")
anchor="  it('captures comparison baseline before asynchronous reading', async () => {"
v=once(v,anchor,"""  it('compares an actual compressed backup with identical strict evidence and no additional authority', async () => {
    const json = JSON.stringify(envelope({ extra: 'opaque '.repeat(3000) }));
    const archive = await prepareBackupArchive(json, 'backup.json');
    if (archive.status !== 'ready') throw Error(archive.status);
    const comparable = vi.fn();
    const result = await previewProgressImportFile(archive.blob, initial, comparable);
    expect(result).toEqual(previewProgressImportJson(json, initial));
    expect(result.applyAuthorized).toBe(false);
    expect(comparable).toHaveBeenCalledExactlyOnceWith(json);
    const signal = new AbortController();
    signal.abort();
    comparable.mockClear();
    expect((await previewProgressImportFile(archive.blob, initial, comparable, signal.signal)).state).toBe('invalid');
    expect(comparable).not.toHaveBeenCalled();
  });
  it('keeps strict duplicate-key validation and inflated byte limit for gzip', async () => {
    const duplicate = JSON.stringify(envelope()).replace('"complete":true', '"complete":false,"complete":true');
    const pack = async (json: string) => new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    const comparable = vi.fn();
    expect((await previewProgressImportFile(await pack(duplicate), initial, comparable)).state).toBe('invalid');
    const huge = await pack('я'.repeat(MAX_PROGRESS_BACKUP_BYTES / 2 + 1));
    const rejected = await previewProgressImportFile(huge, initial, comparable);
    expect(rejected.state).toBe('invalid');
    expect(rejected.inspection.message).toContain('Распакованный');
    expect(comparable).not.toHaveBeenCalled();
  });
"""+anchor)
u=old[b].decode().replace('\r\n','\n')
u=once(u,"  const blob = new Blob([prepared.json], { type: 'application/json;charset=utf-8' });\n  const url = URL.createObjectURL(blob);","""  requestLocalBackupDownload(new Blob([prepared.json], { type: 'application/json;charset=utf-8' }), prepared.filename);
}

/** Same second-click download path for the optional verified gzip wrapper. */
export function requestLocalBackupDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);""")
u=once(u,"    link.download = prepared.filename;","    link.download = filename;")
z=old[q].decode().replace('\r\n','\n')
z=once(z,"import { prepareProgressBackup, requestProgressBackupDownload, type PreparedProgressBackup }","import { prepareProgressBackup, requestProgressBackupDownload, requestLocalBackupDownload, type PreparedProgressBackup }")
z=once(z,"import './progressBackup.css';","import { prepareBackupArchive, type PreparedBackupArchive } from '../lib/backupArchive';\nimport './progressBackup.css';")
z=z.replace("setPrepared(null);","clearPrepared();")
z=once(z,"  const capacityGeneration = useRef(0);","""  const capacityGeneration = useRef(0);
  const [archive, setArchive] = useState<Extract<PreparedBackupArchive, { status: 'ready' }> | null>(null);
  const [compressing, setCompressing] = useState(false);
  const archiveOperation = useRef<AbortController | null>(null);

  function clearPrepared() {
    archiveOperation.current?.abort();
    archiveOperation.current = null;
    setArchive(null);
    setCompressing(false);
    setPrepared(null);
  }

  async function prepareArchive() {
    if (disabled || !prepared || archiveOperation.current || archive) return;
    const controller = new AbortController();
    archiveOperation.current = controller;
    setCompressing(true);
    const packed = await prepareBackupArchive(prepared.json, prepared.filename, controller.signal);
    if (controller.signal.aborted || archiveOperation.current !== controller) return;
    archiveOperation.current = null;
    setCompressing(false);
    if (packed.status === 'ready') {
      setArchive(packed);
      setMessage('Архив подготовлен, распаковка проверена. Выбери файл для скачивания.');
    } else {
      setMessage(packed.status === 'too-large' ? 'Для сжатия в браузере исходный JSON слишком большой. Скачай обычный JSON.'
        : packed.status === 'unsupported' ? 'Этот браузер не поддерживает GZIP. Скачай обычный JSON.'
        : packed.status === 'not-smaller' ? 'Сжатие не уменьшило файл. Скачай обычный JSON.'
        : 'Не удалось проверить сжатый архив. Обычный JSON по-прежнему доступен.');
    }
  }

  function downloadArchive() {
    if (disabled || !archive || !prepared || status !== 'ready') return;
    try {
      requestLocalBackupDownload(archive.blob, archive.filename);
      setStatus('idle');
      clearPrepared();
      setMessage(archive.inspectableSize
        ? 'Запрос скачивания GZIP передан браузеру. Проверь файл в загрузках.'
        : 'Запрос скачивания GZIP для разбора передан браузеру. Распакованный JSON превышает предел проверки. Не очищай данные.');
    } catch { setMessage('Браузер не подтвердил запрос скачивания. Попробуй ещё раз.'); }
  }""")
z=once(z,"    const pageHidden = () => { invalidateImport(); invalidateCapacity(); };","    const pageHidden = () => { generation.current++; invalidateImport(); invalidateCapacity(); clearPrepared(); setStatus('idle'); };")
z=once(z,"      capacityGeneration.current++;\n      operation.current?.abort();","      capacityGeneration.current++;\n      operation.current?.abort();\n      archiveOperation.current?.abort();")
z=once(z,"      raw => { json = raw; });","      raw => { json = raw; }, controller.signal);")
z=once(z,'accept=".json,application/json"','accept=".json,.gz,application/json,application/gzip"')
z=once(z,'ПРОВЕРИТЬ СКАЧАННЫЙ JSON','ПРОВЕРИТЬ СКАЧАННЫЙ JSON / GZIP')
z=once(z,'Проверяем структуру JSON без отправки файла…','Проверяем структуру файла без отправки…')
z=once(z,'        {prepared && <small data-backup-capacity=',"""        {prepared && <div data-archive-stage={archive ? 'ready' : compressing ? 'preparing' : 'idle'}>
          {archive ? <>
            <button type="button" data-action="download-progress-archive" disabled={disabled} onClick={downloadArchive}>
              {archive.inspectableSize ? 'СКАЧАТЬ GZIP' : 'СКАЧАТЬ GZIP ДЛЯ РАЗБОРА'}
            </button>
            <small data-archive-bytes={archive.blob.size}>
              Архив: {formatStorageBytes(archive.blob.size)} вместо {formatStorageBytes(archive.sourceBytes)}.
              {' '}{archive.inspectableSize ? 'Размер распакованного JSON допустим для проверки.'
                : 'Распакованный JSON больше 16 МиБ; встроенная проверка недоступна.'}
            </small>
          </> : <button type="button" data-action="prepare-progress-archive" disabled={disabled || compressing}
            onClick={() => { void prepareArchive(); }}>{compressing ? 'СЖИМАЕМ И ПРОВЕРЯЕМ…' : 'ПОДГОТОВИТЬ GZIP'}</button>}
        </div>}
        {prepared && <small data-backup-capacity=""")
for f,data in old.items():
 with (a/(f.name+'.before')).open('xb') as out:out.write(data)
for f,data in old.items():assert f.read_bytes()==data
for f,content in [(p,s),(t,v),(b,u),(q,z)]:
 f.write_bytes(content.encode());print(f,f.stat().st_size,sha256(f.read_bytes()).hexdigest())
