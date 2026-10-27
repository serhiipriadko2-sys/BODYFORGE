import { useEffect, useState } from 'react';
import { Activity, Camera, ChevronDown, ShieldCheck, Smartphone } from 'lucide-react';
import { EXERCISE_GUIDES, exerciseGuide, canStartCameraExercise, type ExerciseId } from '../lib/trainingCatalog';

interface CatalogProps { selected: ExerciseId; onSelect: (id: ExerciseId) => void; busy?: boolean }

export function ExerciseCatalog({ selected, onSelect, busy = false }: CatalogProps) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  useEffect(() => {
    if (busy) { setCatalogOpen(false); setGuideOpen(false); }
  }, [busy]);
  const guide = exerciseGuide(selected);
  const available = canStartCameraExercise(selected);
  return (
    <section className="bf-catalog" aria-label="Каталог упражнений">
      <button type="button" className="bf-catalog-trigger" aria-expanded={catalogOpen}
        onClick={() => setCatalogOpen((value) => !value)} disabled={busy}>
        <span className="bf-catalog-trigger-icon"><Activity size={19}/></span>
        <span><small>ВЫБОР УПРАЖНЕНИЯ</small><strong>{guide.name}</strong></span>
        <span className="bf-catalog-expand">{available ? 'СЧЁТЧИК' : 'НЕДОСТУПНО'} <ChevronDown size={16}/></span>
      </button>
      {catalogOpen && (
        <div className="bf-catalog-grid" role="group" aria-label="Выбери упражнение для камеры">
          {EXERCISE_GUIDES.map((item) => (
            <button key={item.id} type="button" disabled={busy}
              className={'bf-catalog-item' + (selected === item.id ? ' selected' : '')}
              data-exercise={item.id} aria-pressed={selected === item.id}
              onClick={() => { onSelect(item.id); setGuideOpen(true); }}>
              <Camera size={16}/>
              <span>{item.name}</span>
              <small>{item.unit === 'seconds' ? 'ТАЙМЕР' : 'СЧЁТЧИК'}</small>
            </button>
          ))}
        </div>
      )}
      <div className="bf-capability" data-recognition={guide.recognition}>
        <ShieldCheck size={15}/>
        <span>{guide.recognition === 'camera-tested'
          ? 'Экспериментальный счётчик приседаний: 20 полных повторений. Точность зависит от кадра.'
          : guide.unit === 'seconds'
            ? 'Экспериментальный таймер: 30 секунд видимой планки. Алгоритм не проверен на всех пользователях и ракурсах.'
            : 'Экспериментальный счётчик: 20 полных движений. Возможны пропуски и ложные срабатывания; нужна проверка на реальной камере.'}</span>
      </div>
      <button type="button" className="bf-guide-trigger" onClick={() => setGuideOpen((value) => !value)}
        disabled={busy} aria-expanded={guideOpen}>
        <Smartphone size={17}/> КАК ПОСТАВИТЬ ТЕЛЕФОН · {guide.name.toUpperCase()}
        <ChevronDown size={16}/>
      </button>
      {guideOpen && (
        <div className="bf-guide" data-camera-guide={selected}>
          <div className="bf-guide-visual" aria-hidden="true">
            <div className="bf-guide-phone"><Smartphone size={44}/><span>{guide.camera.includes('горизонтальный') ? '16:9' : '9:16'}</span></div>
            <div className="bf-guide-dots"><i/><i/><i/></div>
            <div className="bf-guide-pose"><span>ТЕЛО В КАДРЕ</span><strong>{guide.camera}</strong></div>
          </div>
          <ol className="bf-guide-steps">
            {guide.placement.map((tip) => <li key={tip}>{tip}</li>)}
          </ol>
          <p className="bf-guide-warning">{guide.coaching}</p>
          <p className="bf-guide-privacy"><ShieldCheck size={14}/> Видео обрабатывается на устройстве и не сохраняется приложением.</p>
        </div>
      )}
    </section>
  );
}
