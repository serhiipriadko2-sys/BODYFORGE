import { Check, ChevronLeft, ChevronRight, Eye, RotateCcw, ShieldCheck, SlidersHorizontal, Sparkles, UserRound, WandSparkles } from 'lucide-react';
import {
  DEFAULT_AVATAR_LOOK, HAIR_TONES, SKIN_TONES, TRIM_TONES, type AvatarLook,
} from '../lib/avatarLook';
import type { AvatarFocus } from './GameAvatar';

interface Props {
  look: AvatarLook;
  onChange: (look: AvatarLook) => void;
  focus: AvatarFocus;
  onFocus: (focus: AvatarFocus) => void;
  yaw: number;
  onYaw: (next: number) => void;
  message: string;
  readStatus: 'ready' | 'invalid' | 'unavailable';
}
export default function AvatarLab({ look, onChange, focus, onFocus, yaw, onYaw, message, readStatus }: Props) {
  const clamp = (next: number) => Math.max(-.95, Math.min(.95, Math.round(next * 100) / 100));
  return (
    <section className="armory-lab" aria-label="Редактор внешности бойца" id="avatar-lab">
      <header className="armory-lab-heading">
        <span><SlidersHorizontal size={17}/> BODYFORGE / AVATAR LAB</span>
        <h3>СОБЕРИ <em>СВОЙ ОБЛИК.</em></h3>
        <p>Цвета и визор меняются сразу на 3D-бойце. Эти настройки — оформление, а не покупка силы.</p>
      </header>
      <div className="armory-viewport-controls">
        <div className="armory-view-tabs" role="group" aria-label="Крупность 3D-персонажа">
          <button type="button" data-avatar-view="full" aria-pressed={focus === 'full'} onClick={() => onFocus('full')}>
            <UserRound size={16}/> РОСТ
          </button>
          <button type="button" data-avatar-view="portrait" aria-pressed={focus === 'portrait'} onClick={() => onFocus('portrait')}>
            <Eye size={16}/> ПОРТРЕТ
          </button>
        </div>
        <div className="armory-yaw-controls" role="group" aria-label="Повернуть персонажа">
          <button type="button" aria-label="Повернуть бойца влево" onClick={() => onYaw(clamp(yaw - .3))}><ChevronLeft size={20}/></button>
          <span>ПОВОРОТ</span>
          <button type="button" aria-label="Повернуть бойца вправо" onClick={() => onYaw(clamp(yaw + .3))}><ChevronRight size={20}/></button>
        </div>
      </div>
      <div className="armory-settings">
        <fieldset className="armory-swatches">
          <legend><span>01</span> ТОН КОЖИ <small>5 ВАРИАНТОВ</small></legend>
          <div className="armory-swatch-grid" role="group" aria-label="Тон кожи персонажа">
            {SKIN_TONES.map((item) => <button type="button" key={item.id} data-skin={item.id}
              title={item.label} aria-label={'Кожа: ' + item.label} aria-pressed={look.skin === item.id}
              onClick={() => onChange({ ...look, skin: item.id })}>
              <i style={{ background: item.color }} aria-hidden="true"/>{look.skin === item.id && <Check size={15}/>}
              <span>{item.label}</span>
            </button>)}
          </div>
        </fieldset>
        <fieldset className="armory-swatches">
          <legend><span>02</span> ЦВЕТ ВОЛОС <small>КОРОТКАЯ СТРИЖКА</small></legend>
          <div className="armory-swatch-grid four" role="group" aria-label="Цвет волос персонажа">
            {HAIR_TONES.map((item) => <button type="button" key={item.id} data-hair={item.id}
              title={item.label} aria-label={'Волосы: ' + item.label} aria-pressed={look.hair === item.id}
              onClick={() => onChange({ ...look, hair: item.id })}>
              <i style={{ background: item.color }} aria-hidden="true"/>{look.hair === item.id && <Check size={15}/>}
              <span>{item.label}</span>
            </button>)}
          </div>
        </fieldset>
        <fieldset className="armory-swatches">
          <legend><span>03</span> СВЕТОВОЙ КОД <small>АКЦЕНТ ЭКИПИРОВКИ</small></legend>
          <div className="armory-swatch-grid four" role="group" aria-label="Цвет акцента экипировки">
            {TRIM_TONES.map((item) => <button type="button" key={item.id} data-trim={item.id}
              title={item.label} aria-label={'Свечение: ' + item.label} aria-pressed={look.trim === item.id}
              onClick={() => onChange({ ...look, trim: item.id })}>
              <i style={{ background: item.color }} aria-hidden="true"/>{look.trim === item.id && <Check size={15}/>}
              <span>{item.label}</span>
            </button>)}
          </div>
        </fieldset>
      </div>
      <button className="armory-visor" type="button" data-visor={look.visor ? 'on' : 'off'}
        aria-pressed={look.visor} onClick={() => onChange({ ...look, visor: !look.visor })}>
        <span className="armory-visor-icon"><WandSparkles size={19}/></span>
        <span><strong>ГОРОДСКОЙ ВИЗОР</strong><small>Голографический аксессуар · бесплатно</small></span>
        <span className="armory-toggle" aria-hidden="true"><i/></span>
      </button>
      <div className="armory-status">
        <ShieldCheck size={16}/>
        <span>Внешность хранится только в этом браузере; уровни, монеты, мышцы и купленная одежда не меняются.</span>
      </div>
      {readStatus !== 'ready' && (
        <p className="armory-alert" role="alert">{readStatus === 'invalid'
          ? 'Предыдущие настройки внешности несовместимы. Оригинальная запись сохранена до твоего выбора.'
          : 'Хранилище недоступно. Внешность может сохраниться только на текущем экране.'}</p>
      )}
      {message && <p className="armory-message" role="status">{message}</p>}
      <div className="armory-lab-footer">
        <span><Sparkles size={15}/> БЕЗ ПЛАТНЫХ ПРЕИМУЩЕСТВ</span>
        <button type="button" data-action="avatar-look-reset" onClick={() => onChange({ ...DEFAULT_AVATAR_LOOK })}>
          <RotateCcw size={15}/> СБРОС ОБЛИКА
        </button>
      </div>
    </section>
  );
}
