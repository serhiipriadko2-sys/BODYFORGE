import { useEffect, useState } from 'react';
import { Activity, BookOpen, Camera, ChevronDown, LockKeyhole, ShieldCheck, Smartphone } from 'lucide-react';
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
        <span className="bf-catalog-expand">{available ? 'СЧЁТЧИК' : 'ТОЛЬКО ГИД'} <ChevronDown size={16}/></span>
      </button>
      {catalogOpen && (
        <div className="bf-catalog-grid" role="group" aria-label="Выбери упражнение для просмотра инструкции">
          {EXERCISE_GUIDES.map((item) => (
            <button key={item.id} type="button" disabled={busy}
              className={'bf-catalog-item' + (selected === item.id ? ' selected' : '')}
              data-exercise={item.id} aria-pressed={selected === item.id}
              onClick={() => { onSelect(item.id); setGuideOpen(true); }}>
              {item.recognition === 'camera-tested' ? <Camera size={16}/> : <BookOpen size={16}/>}
              <span>{item.name}</span>
              <small>{item.recognition === 'camera-tested' ? 'СЧЁТЧИК' : 'ГИД'}</small>
            </button>
          ))}
        </div>
      )}
      <div className="bf-capability" data-recognition={guide.recognition}>
        {available ? <><ShieldCheck size={15}/><span>Экспериментальный счётчик приседаний: полный подход — 20 повторений. Точность зависит от кадра и условий съёмки.</span></>
          : <><LockKeyhole size={15}/><span>Гид доступен. Камера пока не считает «{guide.name.toLowerCase()}» и не начисляет за них XP. Для тренировки вернись к приседаниям.</span></>}
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
          <p className="bf-guide-privacy"><ShieldCheck size={14}/> Кадры обрабатываются на этом устройстве; BODYFORGE их не сохраняет.</p>
        </div>
      )}
    </section>
  );
}
