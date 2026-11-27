import { useLayoutEffect, useRef, useState } from 'react';
import type { Profile } from '../lib/progression';
import type { CompletedWorkoutResult } from '../lib/workoutJournal';
import { prepareProgressBackup, requestProgressBackupDownload } from '../lib/progressBackup';

interface Props { profile: Profile; pendingResult: CompletedWorkoutResult | null }

export default function RecoveryExportButton({ profile, pendingResult }: Props) {
  const [prepared, setPrepared] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);

  useLayoutEffect(() => {
    function invalidate() {
      generation.current++;
      setPrepared(null);
      setPreparing(false);
      setMessage('');
    }
    function storageChanged(event: StorageEvent) {
      if (event.key === null || event.key.startsWith('bodyforge:')) invalidate();
    }
    invalidate();
    window.addEventListener('storage', storageChanged);
    window.addEventListener('pagehide', invalidate);
    return () => {
      generation.current++;
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener('pagehide', invalidate);
    };
  }, [profile, pendingResult]);

  async function prepare() {
    if (preparing) return;
    const request = ++generation.current;
    setPreparing(true);
    setMessage('Читаем данные для восстановления…');
    try {
      const evidence = await prepareProgressBackup(profile, pendingResult, new Date(), 'recovery-evidence');
      if (generation.current !== request) return;
      setPrepared(evidence.json);
      setMessage('Файл для разбора готов. Нажми «Скачать данные» и проверь загрузки.');
    } catch {
      if (generation.current === request) setMessage('Не удалось подготовить файл. Попробуй снова.');
    } finally {
      if (generation.current === request) setPreparing(false);
    }
  }

  function download() {
    if (prepared === null) return;
    try {
      requestProgressBackupDownload({ json: prepared, filename: 'bodyforge-local-progress.json', complete: false });
      setPrepared(null);
      setMessage('Запрос на скачивание передан браузеру. Проверь загрузки.');
    } catch {
      setMessage('Браузер не принял запрос. Попробуй скачать файл снова.');
    }
  }

  return <>
    {prepared === null
      ? <button type="button" data-action="export-session" disabled={preparing}
        onClick={() => { void prepare(); }}>Подготовить данные для восстановления</button>
      : <button type="button" data-action="download-session" onClick={download}>Скачать данные</button>}
    <p role="status" aria-atomic="true">{message}</p>
  </>;
}
