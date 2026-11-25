from pathlib import Path
from hashlib import sha256
a=Path('docs/audits/BF_107_STORAGE_CAPACITY_20261125')
p=Path('src/lib/progressBackup.ts')
t=Path('src/lib/progressBackup.test.ts')
i=Path('src/lib/progressBackupInspector.ts')
it=Path('src/lib/progressBackupInspector.test.ts')
q=Path('src/components/ProgressBackupPanel.tsx')
expected={p:'641a700cd1a12af6760a6165f802aeb0ce9977a97dada859c32a42d2b6dad556',
t:'4791b3996c68a4544cce217224ec4e60564da4949b566d4c784c342058a1c1c6',
i:'5bdb4df024523c8066150141a6f097a3cf9ac773a1bc46da11a29be937e859fb',
q:'e9307a6a6b4821a3ff8fc1be615e121217085fc194d4f9f335d3e53f3aeee3ac'}
old={f:f.read_bytes() for f in expected}
for f,h in expected.items():assert sha256(old[f]).hexdigest()==h,f
old[it]=it.read_bytes()
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
s=old[p].decode('utf-8').replace('\r\n','\n')
s=once(s,"import { readProfileQuarantine } from './profileQuarantineExport';","""import { readProfileQuarantine } from './profileQuarantineExport';
import { MAX_PROGRESS_BACKUP_BYTES } from './progressBackupInspector';

export type BackupCapacity = 'within-limit' | 'near-limit' | 'oversize';
export function classifyBackupBytes(bytes: number): BackupCapacity {
  return bytes > MAX_PROGRESS_BACKUP_BYTES ? 'oversize'
    : bytes >= MAX_PROGRESS_BACKUP_BYTES * 0.75 ? 'near-limit' : 'within-limit';
}""")
s=once(s,"  readonly complete: boolean;","""  /** Source-read completeness is separate from local inspection capacity. */
  readonly complete: boolean;
  readonly byteLength: number;
  readonly capacity: BackupCapacity;""")
s=once(s,"  }, null, 2);","""  });
  // Compact JSON retains every field and exact embedded raw string; it avoids
  // unnecessary indentation in a potentially large local evidence file.
  const byteLength = new Blob([json]).size;
  const capacity = classifyBackupBytes(byteLength);""")
s=once(s,"  return { json, filename: \x60bodyforge-backup-\x24{stamp}.json\x60, complete, sourcesChangedDuringRead };","""  const prefix = capacity === 'oversize' ? 'bodyforge-backup-evidence-' : 'bodyforge-backup-';
  return { json, filename: prefix + stamp + '.json', complete, byteLength, capacity, sourcesChangedDuringRead };""")
s=once(s,"  prepared: PreparedProgressBackup,","  prepared: Pick<PreparedProgressBackup, 'json' | 'filename' | 'complete'>,")
u=old[i].decode('utf-8').replace('\r\n','\n')
u=once(u,"  if (json.length > MAX_PROGRESS_BACKUP_BYTES) {","  if (json.length > MAX_PROGRESS_BACKUP_BYTES || new Blob([json]).size > MAX_PROGRESS_BACKUP_BYTES) {")
v=old[t].decode('utf-8').replace('\r\n','\n')
v=once(v,"import { prepareProgressBackup, requestProgressBackupDownload } from './progressBackup';","""import { classifyBackupBytes, prepareProgressBackup, requestProgressBackupDownload } from './progressBackup';
import { inspectProgressBackupJson, MAX_PROGRESS_BACKUP_BYTES } from './progressBackupInspector';""")
v=once(v,"  it('detects a cross-tab mutation while an asynchronous IndexedDB read is in progress', async () => {","""  it('counts exact UTF-8 bytes, compacts only the envelope and keeps opaque Unicode originals', async () => {
    const raw = '{"name":"Боец 😀", "future":true}';
    values.set(AVATAR_LOOK_KEY, raw);
    const prepared = await prepareProgressBackup(parseProfile(null), null);
    expect(prepared.byteLength).toBe(new TextEncoder().encode(prepared.json).length);
    expect(prepared.capacity).toBe('within-limit');
    expect(prepared.json).not.toContain('\\\\n  ');
    expect(JSON.parse(prepared.json).storedAuxiliaryRaw.avatarLook).toBe(raw);
    expect(inspectProgressBackupJson(prepared.json).state).toBe('readable');
  });

  it('classifies the soft warning and hard file limit independently of source completeness', () => {
    const limit = MAX_PROGRESS_BACKUP_BYTES;
    expect(classifyBackupBytes(limit * 0.75 - 1)).toBe('within-limit');
    expect(classifyBackupBytes(limit * 0.75)).toBe('near-limit');
    expect(classifyBackupBytes(limit)).toBe('near-limit');
    expect(classifyBackupBytes(limit + 1)).toBe('oversize');
  });

  it('keeps oversized raw evidence downloadable without suggesting the built-in reader can inspect it', async () => {
    const raw = 'я'.repeat(MAX_PROGRESS_BACKUP_BYTES / 2);
    vi.mocked(readDurableJournal).mockResolvedValue({ status: 'ready', entries: [
      { key: STORAGE_KEY + ':result:large', raw: '{}', baseProfileRaw: raw, state: 'settled' },
    ] });
    const prepared = await prepareProgressBackup(parseProfile(null), null);
    expect(prepared.complete).toBe(true);
    expect(prepared.capacity).toBe('oversize');
    expect(prepared.byteLength).toBeGreaterThan(MAX_PROGRESS_BACKUP_BYTES);
    expect(prepared.filename).toContain('bodyforge-backup-evidence-');
    expect(JSON.parse(prepared.json).durableResults[0].baseProfileRaw === raw).toBe(true);
    expect(inspectProgressBackupJson(prepared.json).state).toBe('invalid');
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('detects a cross-tab mutation while an asynchronous IndexedDB read is in progress', async () => {""")
w=old[it].decode('utf-8').replace('\r\n','\n')
w=once(w,"  it('limits file size before reading, handles empty file and blocked file reads', async () => {","""  it('rejects multibyte JSON over the byte limit even when its character count fits', () => {
    const json = JSON.stringify(good({ storedAuxiliaryRaw: {
      avatarLook: 'я'.repeat(MAX_PROGRESS_BACKUP_BYTES / 2), appearance: null, manualSteps: null, dailyPlan: null,
    } }));
    expect(json.length).toBeLessThan(MAX_PROGRESS_BACKUP_BYTES);
    expect(inspectProgressBackupJson(json).state).toBe('invalid');
  });

  it('limits file size before reading, handles empty file and blocked file reads', async () => {""")
z=old[q].decode('utf-8').replace('\r\n','\n')
z=once(z,"import './progressBackup.css';","""import { formatStorageBytes, readStorageCapacity, type StorageCapacity } from '../lib/storageCapacity';
import './progressBackup.css';""")
z=once(z,"  const [importMessage, setImportMessage] = useState('');","""  const [importMessage, setImportMessage] = useState('');
  const [capacity, setCapacity] = useState<StorageCapacity | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const capacityGeneration = useRef(0);

  function invalidateCapacity() {
    capacityGeneration.current++;
    setCapacity(null);
    setMeasuring(false);
  }

  async function measureCapacity() {
    const request = ++capacityGeneration.current;
    setMeasuring(true);
    setCapacity(null);
    const observed = await readStorageCapacity();
    if (request !== capacityGeneration.current) return;
    setCapacity(observed);
    setMeasuring(false);
  }""")
z=once(z,"    generation.current++;\n    invalidateImport();\n    setPrepared(null);\n    setStatus('idle');\n    setMessage('');","""    generation.current++;
    invalidateImport();
    invalidateCapacity();
    setPrepared(null);
    setStatus('idle');
    setMessage('');""")
z=once(z,"      if (event.key !== null && !event.key.startsWith('bodyforge:')) return;","""      invalidateCapacity();
      if (event.key !== null && !event.key.startsWith('bodyforge:')) return;""")
z=once(z,"      inspectionGeneration.current++;\n      operation.current?.abort();","""      inspectionGeneration.current++;
      capacityGeneration.current++;
      operation.current?.abort();""")
z=once(z,"      setMessage(backup.complete\n        ? 'Данные подготовлены. Нажми «Скачать» и проверь файл в загрузках.'","""      setMessage(backup.capacity === 'oversize'
        ? 'Файл превышает 16 МиБ. Можно скачать исходные данные для разбора, но встроенная проверка и замена такого файла недоступны. Не очищай хранилище.'
        : backup.complete
        ? 'Данные подготовлены. Нажми «Скачать» и проверь файл в загрузках.'""")
z=once(z,"      setMessage('Запрос скачивания передан браузеру. Проверь папку «Загрузки» — сам факт сохранения ещё не подтверждён.');","""      setMessage(prepared.capacity === 'oversize'
        ? 'Запрошено скачивание большого JSON для разбора. Встроенная проверка недоступна. Не очищай данные браузера.'
        : 'Запрос скачивания передан браузеру. Проверь папку «Загрузки» — сам факт сохранения ещё не подтверждён.');""")
z=once(z,'        <details className="progress-install-help">',"""        <details className="progress-install-help" data-storage-capacity={measuring ? 'checking' : capacity?.local.state ?? 'idle'}>
          <summary>МЕСТО ДЛЯ СОХРАНЕНИЙ</summary>
          <p>Проверка только читает объём данных. Ничего не удаляет и не запрашивает разрешения.</p>
          <button type="button" className="progress-import-cancel" data-action="measure-storage-capacity"
            disabled={disabled || measuring} onClick={() => { void measureCapacity(); }}>
            {measuring ? 'Проверяем…' : 'Проверить объём'}
          </button>
          {capacity && <div role="status" data-capacity-warning={capacity.local.state === 'observed'
            ? (capacity.local.warning ? 'advisory' : 'none') : 'unknown'}>
            <p>{capacity.local.state === 'observed'
              ? 'Локальные записи этого адреса: около ' + formatStorageBytes(capacity.local.estimatedBytes) + ' (оценка по строкам).'
              : 'Объём локальных записей определить не удалось.'}</p>
            {capacity.local.state === 'observed' && capacity.local.warning &&
              <p>История занимает много места. Скачай свежую копию. Если запись не проходит, не удаляй исходные данные.</p>}
            <p>{capacity.origin ? 'Оценка общего хранилища браузера: ' + formatStorageBytes(capacity.origin.usage)
              + ' из ' + formatStorageBytes(capacity.origin.quota) + '.' : 'Общая оценка хранилища недоступна.'}</p>
            <p>{capacity.persistent === true ? 'Браузер сообщает о постоянном режиме хранения.'
              : capacity.persistent === false ? 'Браузер может освободить данные при нехватке места.'
              : 'Режим постоянного хранения неизвестен.'}</p>
            <small>Это не точный остаток localStorage и не гарантия следующей записи. Даже постоянный режим не заменяет файл резервной копии.</small>
          </div>}
        </details>
        <details className="progress-install-help">""")
# Keep the existing install-guide selector unique for old browser tests.
z=once(z,'<details className="progress-install-help" data-storage-capacity=', '<details className="progress-backup-file-checker" data-storage-capacity=')
# file checker must remain unique too; reuse style via separate class in CSS later.
z=once(z,'<details className="progress-backup-file-checker" data-storage-capacity=', '<details className="progress-storage-capacity" data-storage-capacity=')
z=once(z,'              СКАЧАТЬ ПОДГОТОВЛЕННЫЙ JSON','              {prepared?.capacity === \'oversize\' ? \'СКАЧАТЬ JSON ДЛЯ РАЗБОРА\' : \'СКАЧАТЬ ПОДГОТОВЛЕННЫЙ JSON\'}')
z=once(z,'        <p role="status" aria-live="polite" data-backup-status={status}>{message}</p>',"""        {prepared && <small data-backup-capacity={prepared.capacity} data-backup-bytes={prepared.byteLength}>
          Размер JSON: {formatStorageBytes(prepared.byteLength)}. {prepared.capacity === 'near-limit'
            ? 'Приближается к пределу встроенной проверки 16 МиБ.' : prepared.capacity === 'oversize'
              ? 'Встроенная проверка недоступна.' : 'В пределах ограничения размера проверки.'}
          {!prepared.complete && ' Не все источники прочитаны согласованно.'}
        </small>}
        <p role="status" aria-live="polite" data-backup-status={status}>{message}</p>""")
for f,data in old.items():
 with (a/(f.name+'.before')).open('xb') as out:out.write(data)
for f,data in old.items():assert f.read_bytes()==data
for f,content in [(p,s),(t,v),(i,u),(it,w),(q,z)]:
 f.write_bytes(content.encode('utf-8'));print(f,f.stat().st_size,sha256(f.read_bytes()).hexdigest())
