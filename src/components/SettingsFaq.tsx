import { lazy, Suspense, useState } from 'react';
import { CircleHelp, Info } from 'lucide-react';
import type { Profile } from '../lib/progression';
import type { CompletedWorkoutResult } from '../lib/workoutJournal';
import ThirdPartyNoticesPanel from './ThirdPartyNoticesPanel';

// Load the file inspector and backup exporter only when Settings is opened.
const ProgressBackupPanel = lazy(() => import('./ProgressBackupPanel'));
const OfflineReadinessPanel = lazy(() => import('./OfflineReadinessPanel'));

interface Props {
  profile: Profile;
  pendingResult: CompletedWorkoutResult | null;
  disabled: boolean;
}

/** Help and local data protection; never initiates a download without a click. */
export default function SettingsFaq({ profile, pendingResult, disabled }: Props) {
  const [openInspectorRequest, setOpenInspectorRequest] = useState(0);
  return (
    <>
      <div className="forge-heading">
        <span>НАСТРОЙКИ / FAQ</span>
        <h2>ТВОИ <em>НАСТРОЙКИ</em></h2>
        <p>Ответы на частые вопросы и безопасная копия прогресса на этом устройстве.</p>
      </div>
      <div className="bf-faq-list" aria-label="Частые вопросы">
        <details className="bf-faq-item">
          <summary>Записывает ли BODYFORGE видео?</summary>
          <p>Нет. Камера используется для определения движений на устройстве. Видео не сохраняется приложением и не отправляется на сервер.</p>
        </details>
        <details className="bf-faq-item">
          <summary>Почему упражнение не засчитывается?</summary>
          <p>Проверь освещение, ракурс и видимость суставов в кадре. Семь новых счётчиков пока экспериментальные. На вкладке «Камера» есть подсказки для каждого упражнения.</p>
        </details>
        <details className="bf-faq-item">
          <summary>Когда начисляются XP и монеты?</summary>
          <p>После выполнения цели и подтверждённого сохранения результата. Отмена подхода не даёт наград, повторное сохранение не должно начислять их второй раз.</p>
        </details>
        <details className="bf-faq-item" data-help-topic="backup-recovery">
          <summary>Как восстановить прогресс из копии?</summary>
          <p>В разделе «Сохрани своего бойца» подготовь резервную копию, скачай JSON или GZIP и проверь файл на устройстве.</p>
          <p>Просмотр файла не изменяет прогресс. Если копия совместима с текущим бойцом и журналом, появится возможность перейти к замене. Нажми «Подтвердить замену» только после сравнения данных. На экране восстановления можно оставить новую копию или вернуть прежние сохранения.</p>
          {profile.game.created && <p className="bf-goal-actions">
            <button type="button" className="bf-small-action" data-action="open-backup-inspector"
              aria-controls="progress-backup-file-checker" disabled={disabled}
              onClick={() => setOpenInspectorRequest((request) => request + 1)}>Открыть проверку копии</button>
          </p>}
        </details>
        <details className="bf-faq-item" data-help-topic="device-transfer">
          <summary>Как перенести прогресс на другой телефон?</summary>
          <p>Скачай полную резервную копию и храни её отдельно. Перенос на чистый телефон пока не поддерживается: проверка файла доступна после создания бойца, но замена требует совместимого профиля и журнала. Облачной синхронизации нет.</p>
          <p>Не удаляй данные исходного браузера, пока не проверишь полную копию и доступный способ восстановления.</p>
        </details>
        <Suspense fallback={<p role="status">Загружаем автономный режим…</p>}>
          <OfflineReadinessPanel disabled={disabled || pendingResult !== null}/>
        </Suspense>
        <ThirdPartyNoticesPanel/>
      </div>
      <div className="tips-card" aria-label="Подготовка кадра для приседаний">
        <div className="lower-card-header"><div><span className="section-index">ПЕРЕД УДАРОМ</span><h3>ПОДГОТОВЬ <em>КАДР</em></h3></div><CircleHelp size={22} /></div>
        <div className="tip-row"><div className="tip-number">01</div><div><strong>Телефон вертикально, сбоку</strong><span>Снимай в портретном положении 9:16. Целиком должны быть видны таз, колени и стопы.</span></div></div>
        <div className="tip-row"><div className="tip-number">02</div><div><strong>Прими исходную стойку</strong><span>Система сначала определит исходную стойку, затем включит секундомер.</span></div></div>
        <div className="tip-row"><div className="tip-number">03</div><div><strong>Выполни 20 полных приседаний</strong><span>Присядь достаточно глубоко и выпрями ноги. На двадцатом система остановится сама.</span></div></div>
        <div className="tips-note"><Info size={16} /><span>Подсчёт — экспериментальная функция. Он не заменяет тренера и не гарантирует оценку техники.</span></div>
      </div>
      {profile.game.created
        ? <Suspense fallback={<p role="status">Загружаем защиту прогресса…</p>}>
            <ProgressBackupPanel profile={profile} pendingResult={pendingResult} disabled={disabled}
              openInspectorRequest={openInspectorRequest}/>
          </Suspense>
        : <p className="bf-settings-hint">Создай бойца на экране «Горн», чтобы сохранить его прогресс.</p>}
    </>
  );
}
