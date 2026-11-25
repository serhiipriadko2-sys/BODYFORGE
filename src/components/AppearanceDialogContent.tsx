import { Check } from 'lucide-react';
import { DEFAULT_APPEARANCE, PALETTES, isHexColor, type Appearance } from '../lib/appearance';

export interface AppearanceDialogContentProps {
  settings: Appearance;
  draft: string;
  setDraft: (value: string) => void;
  choose: (value: Appearance) => void;
  message: string;
}

/** Only loaded on explicit appearance-editor intent. No persistence authority. */
export default function AppearanceDialogContent({ settings, draft, setDraft, choose, message }: AppearanceDialogContentProps) {
  const validDraft = isHexColor(draft);
  return <>
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
      <fieldset><legend>Графика 3D</legend><div className="appearance-material">
        <label><input type="radio" name="graphics" value="balanced" checked={settings.graphics !== 'economy'}
          onChange={() => choose({ ...settings, graphics: 'balanced' })}/><span>Сбалансированная<small>Более чёткий персонаж</small></span></label>
        <label><input type="radio" name="graphics" value="economy" checked={settings.graphics === 'economy'}
          onChange={() => choose({ ...settings, graphics: 'economy' })}/><span>Экономная<small>Меньше пикселей и размытия</small></span></label>
      </div></fieldset>
      <p className="appearance-note">Экономный режим снижает чёткость 3D и отключает размытие панелей. Качество камеры и правила зачёта упражнений сохраняются.</p>
      <div className="appearance-preview" aria-hidden="true"><span>ТВОЙ СЛЕДУЮЩИЙ ШАГ</span><strong>Стань сильнее</strong><i>20 приседаний</i></div>
      <p className="appearance-message" role="status" aria-live="polite">{message}</p>
      <button type="button" className="appearance-reset" data-action="reset-appearance" onClick={() => {
        setDraft(DEFAULT_APPEARANCE.customAccent); choose({ ...DEFAULT_APPEARANCE });
      }}>Вернуть стандартный стиль</button>
  </>;
}
