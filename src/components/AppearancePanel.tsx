import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Palette as PaletteIcon, X } from 'lucide-react';
import { APPEARANCE_KEY, applyAppearance, loadAppearance, saveAppearance, type Appearance } from '../lib/appearance';
import type { AppearanceDialogContentProps } from './AppearanceDialogContent';

export default function AppearancePanel({ disabled = false }: { disabled?: boolean }) {
  const [initial] = useState(loadAppearance);
  const [settings, setSettings] = useState(initial.settings);
  const [draft, setDraft] = useState(initial.settings.customAccent);
  const [message, setMessage] = useState(initial.status === 'invalid' ? 'Настройки оформления не прочитаны. Показан стандартный стиль; исходная запись не изменена.'
    : initial.status === 'unavailable' ? 'Хранилище недоступно. Оформление можно менять для этой страницы.' : '');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { applyAppearance(settings); }, [settings]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_KEY && event.key !== null) return;
      const current = loadAppearance();
      if (current.status === 'ready') {
        setSettings(current.settings); setDraft(current.settings.customAccent);
        setMessage('Оформление обновлено в другой вкладке.');
      } else setMessage('Не удалось прочитать изменение другой вкладки. Текущий стиль сохранён на экране.');
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  function choose(next: Appearance) {
    setSettings(next);
    setMessage(saveAppearance(next) ? 'Оформление сохранено в этом браузере.' : 'Стиль применён только к этой странице: браузер не подтвердил сохранение.');
  }
  const [Editor, setEditor] = useState<ComponentType<AppearanceDialogContentProps> | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const loading = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function loadEditor() {
    if (Editor || loading.current) return;
    loading.current = true;
    setLoadState('loading');
    try {
      const module = await import('./AppearanceDialogContent');
      if (!mounted.current) return;
      setEditor(() => module.default);
      setLoadState('ready');
    } catch {
      if (mounted.current) setLoadState('error');
    } finally { loading.current = false; }
  }

  function openEditor() {
    if (disabled || !dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    void loadEditor();
  }
  return <>
    <button type="button" className="appearance-trigger" aria-label="Внешний вид" title="Внешний вид" disabled={disabled}
      aria-haspopup="dialog" onClick={openEditor}><PaletteIcon size={20}/></button>
    <dialog ref={dialog} className="appearance-dialog" data-appearance-load={loadState} aria-labelledby="appearance-title" onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close();
    }}>
      <div className="appearance-heading"><div><span>BODYFORGE / НАСТРОЙКИ</span><h2 id="appearance-title">Твой стиль</h2></div>
        <button type="button" className="appearance-close" aria-label="Закрыть внешний вид" onClick={() => dialog.current?.close()}><X size={21}/></button></div>
      {Editor ? <Editor settings={settings} draft={draft} setDraft={setDraft} choose={choose} message={message}/>
        : loadState === 'error' ? <div data-appearance-load-error role="status" className="appearance-message">
            Не удалось загрузить редактор оформления. Закрой окно и открой его снова; если ошибка повторится, обнови страницу.
            Текущий стиль и прогресс не изменены.
          </div> : <p role="status" className="appearance-message">Загружаем настройки оформления…</p>}
    </dialog>
  </>;
}
