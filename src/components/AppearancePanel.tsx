import { useEffect, useRef, useState } from 'react';
import { Check, Palette as PaletteIcon, X } from 'lucide-react';
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, PALETTES, applyAppearance, isHexColor, loadAppearance, saveAppearance, type Appearance } from '../lib/appearance';

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
  const validDraft = isHexColor(draft);
  return <>
    <button type="button" className="appearance-trigger" aria-label="Внешний вид" title="Внешний вид" disabled={disabled}
      aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}><PaletteIcon size={20}/></button>
    <dialog ref={dialog} className="appearance-dialog" aria-labelledby="appearance-title" onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close();
    }}>
      <div className="appearance-heading"><div><span>BODYFORGE / НАСТРОЙКИ</span><h2 id="appearance-title">Твой стиль</h2></div>
        <button type="button" className="appearance-close" aria-label="Закрыть внешний вид" onClick={() => dialog.current?.close()}><X size={21}/></button></div>
      <p className="appearance-intro">Цвет и материал интерфейса. Прогресс и внешний вид бойца настраиваются отдельно.</p>
      <fieldset><legend>Палитра</legend><div className="appearance-palette">
        {PALETTES.map((palette) => <button type="button" key={palette.id} data-palette={palette.id} aria-pressed={settings.palette === palette.id}
          onClick={() => choose({ ...settings, palette: palette.id })}>
          <i style={{ background: palette.color }} aria-hidden="true"/>{palette.label}{settings.palette === palette.id && <Check size={15} aria-hidden="true"/>}
        </button>)}
        <button type="button" data-palette="custom" aria-pressed={settings.palette === 'custom'} onClick={() => choose({ ...settings, palette: 'custom' })}>
          <i style={{ background: settings.customAccent }} aria-hidden="true"/>Свой{settings.palette === 'custom' && <Check size={15} aria-hidden="true"/>}</button>
      </div></fieldset>
      <div className="appearance-custom"><label className="appearance-color">Свой акцент<input type="color" aria-label="Свой акцент" value={settings.customAccent}
        onChange={(event) => { setDraft(event.target.value); choose({ ...settings, palette: 'custom', customAccent: event.target.value }); }}/></label>
        <label className="appearance-hex">HEX акцента<input type="text" aria-label="HEX акцента" value={draft} maxLength={7} spellCheck={false}
          aria-invalid={!validDraft} aria-describedby={!validDraft ? 'appearance-hex-error' : undefined} onChange={(event) => setDraft(event.target.value)}/></label>
        <button type="button" data-action="apply-custom" disabled={!validDraft} onClick={() => choose({ ...settings, palette: 'custom', customAccent: draft.toLowerCase() })}>Применить</button>
      </div>
      {!validDraft && <p id="appearance-hex-error" className="appearance-validation">Нужен цвет в формате #12abef.</p>}
      <fieldset><legend>Материал</legend><div className="appearance-material">
        <label><input type="radio" name="material" value="glass" checked={settings.material === 'glass'} onChange={() => choose({ ...settings, material: 'glass' })}/><span>Стекло<small>Мягкая глубина навигации</small></span></label>
        <label><input type="radio" name="material" value="solid" checked={settings.material === 'solid'} onChange={() => choose({ ...settings, material: 'solid' })}/><span>Матовый<small>Без прозрачности и размытия</small></span></label>
      </div></fieldset>
      <label className="appearance-contrast"><span>Повышенный контраст<small>Непрозрачные панели, чёткие границы</small></span>
        <input type="checkbox" name="highContrast" checked={settings.highContrast} onChange={(event) => choose({ ...settings, highContrast: event.target.checked })}/></label>
      <p className="appearance-note">Системное уменьшение прозрачности и движения имеет приоритет. Стекло автоматически упрощается, если браузер его не поддерживает.</p>
      <div className="appearance-preview" aria-hidden="true"><span>ТВОЙ СЛЕДУЮЩИЙ ШАГ</span><strong>Стань сильнее</strong><i>20 приседаний</i></div>
      <p className="appearance-message" role="status" aria-live="polite">{message}</p>
      <button type="button" className="appearance-reset" data-action="reset-appearance" onClick={() => {
        setDraft(DEFAULT_APPEARANCE.customAccent); choose({ ...DEFAULT_APPEARANCE });
      }}>Вернуть стандартный стиль</button>
    </dialog>
  </>;
}
