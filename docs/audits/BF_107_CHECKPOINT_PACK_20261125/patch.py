from pathlib import Path
from hashlib import sha256
a=Path('docs/audits/BF_107_CHECKPOINT_PACK_20261125')
p=Path('src/lib/backupArchive.ts')
q=Path('src/components/ProgressBackupPanel.tsx')
expected={p:'da43b805f52f4506045fdae15e78be24f42753272f1aad0845f9485a3db48489',
q:'63b0d4e7bba2b463b7938cfc3c0ada32705c3c3355a4567332ee8a154623f3d1'}
old={f:f.read_bytes() for f in expected}
for f,h in expected.items():assert sha256(old[f]).hexdigest()==h,f
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
s=old[p].decode('utf-8').replace('\r\n','\n')
s=once(s,"export async function decodeBackupBytes(bytes: ArrayBuffer, signal?: AbortSignal): Promise<string> {","""export async function decodeBackupBytes(bytes: ArrayBuffer, signal?: AbortSignal,
  maxDecodedBytes = MAX_PROGRESS_BACKUP_BYTES): Promise<string> {""")
s=once(s,"  if (!bytes.byteLength || bytes.byteLength > MAX_PROGRESS_BACKUP_BYTES) throw new BackupArchiveError('limit');","""  if (!Number.isSafeInteger(maxDecodedBytes) || maxDecodedBytes <= 0 || maxDecodedBytes > MAX_PROGRESS_BACKUP_BYTES ||
      !bytes.byteLength || bytes.byteLength > maxDecodedBytes) throw new BackupArchiveError('limit');""")
s=once(s,"const decoded = await inflate(new Blob([bytes]), MAX_PROGRESS_BACKUP_BYTES, signal);","const decoded = await inflate(new Blob([bytes]), maxDecodedBytes, signal);")
z=old[q].decode('utf-8').replace('\r\n','\n')
z=once(z,"import './progressBackup.css';","import { previewCheckpointBatch, type CheckpointPreview } from '../lib/journalCheckpointBatch';\nimport './progressBackup.css';")
z=once(z,"  const archiveOperation = useRef<AbortController | null>(null);","""  const archiveOperation = useRef<AbortController | null>(null);
  const checkpointOperation = useRef<AbortController | null>(null);
  const [checkpointPreview, setCheckpointPreview] = useState<CheckpointPreview | null>(null);
  const [checkingCheckpoints, setCheckingCheckpoints] = useState(false);

  async function estimateCheckpoints() {
    if (!prepared || disabled || checkpointOperation.current) return;
    const controller = new AbortController();
    checkpointOperation.current = controller;
    setCheckingCheckpoints(true);
    setCheckpointPreview(null);
    const result = await previewCheckpointBatch(prepared.json, controller.signal);
    if (controller.signal.aborted || checkpointOperation.current !== controller) return;
    checkpointOperation.current = null;
    setCheckingCheckpoints(false);
    setCheckpointPreview(result);
  }""")
z=once(z,"  function clearPrepared() {\n    archiveOperation.current?.abort();","""  function clearPrepared() {
    checkpointOperation.current?.abort();
    checkpointOperation.current = null;
    setCheckpointPreview(null);
    setCheckingCheckpoints(false);
    archiveOperation.current?.abort();""")
z=once(z,"      archiveOperation.current?.abort();\n    };","      archiveOperation.current?.abort();\n      checkpointOperation.current?.abort();\n    };")
anchor="        {prepared && <small data-backup-capacity="
z=once(z,anchor,"""        {prepared && <details data-checkpoint-preview={checkingCheckpoints ? 'checking' : checkpointPreview?.status ?? 'idle'}>
          <summary>ОЦЕНКА СЖАТИЯ ЖУРНАЛА</summary>
          <small>Проверка до 64 завершённых записей из подготовленного JSON. Ничего не меняет в базе.</small>
          <button type="button" data-action="estimate-journal-checkpoints" disabled={disabled || checkingCheckpoints || !prepared.complete}
            onClick={() => { void estimateCheckpoints(); }}>
            {checkingCheckpoints ? 'ПРОВЕРЯЕМ…' : 'ОЦЕНИТЬ СЖАТИЕ'}
          </button>
          {checkpointPreview && <div role="status">
            {checkpointPreview.status === 'ready' || checkpointPreview.status === 'not-smaller' ? <>
              <p data-checkpoint-sample={checkpointPreview.sampleCount}>
                Проверено {checkpointPreview.sampleCount} из {checkpointPreview.settledCount} завершённых записей.
              </p>
              <p data-checkpoint-original={checkpointPreview.originalBytes} data-checkpoint-packed={checkpointPreview.packedBytes}>
                Исходный объём: {formatStorageBytes(checkpointPreview.originalBytes)}.
                {' '}Компактное представление: {formatStorageBytes(checkpointPreview.packedBytes)}.
              </p>
              <small>{checkpointPreview.status === 'ready' ? 'Исходные данные восстановлены без потерь.'
                : 'Для этой выборки заметной экономии нет.'} Это сравнение форматов, не свободное место на устройстве.</small>
            </> : <small>{checkpointPreview.status === 'empty' ? 'В копии пока нет завершённых записей журнала.'
              : checkpointPreview.status === 'too-large' ? 'Выборка превышает безопасный объём проверки.'
              : 'Оценка недоступна. Исходные сохранения не изменены.'}</small>}
          </div>}
        </details>}
"""+anchor)
for f,data in old.items():
 with (a/(f.name+'.before')).open('xb') as out:out.write(data)
for f,data in old.items():assert f.read_bytes()==data
for f,content in [(p,s),(q,z)]:
 f.write_bytes(content.encode());print(f,f.stat().st_size,sha256(f.read_bytes()).hexdigest())
