import { lazy, Suspense } from 'react';
import type { Profile } from '../lib/progression';
import type { CompletedWorkoutResult } from '../lib/workoutJournal';

// Load the file inspector and backup exporter only when Settings is opened.
const ProgressBackupPanel = lazy(() => import('./ProgressBackupPanel'));

interface Props {
  profile: Profile;
  pendingResult: CompletedWorkoutResult | null;
  disabled: boolean;
}

/** Help and local data protection; never initiates a download without a click. */
export default function SettingsFaq({ profile, pendingResult, disabled }: Props) {
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
        <details className="bf-faq-item">
          <summary>Как перенести прогресс на другой телефон?</summary>
          <p>Можно скачать JSON-копию ниже. Автоматического импорта и синхронизации между телефонами пока нет. Проверка файла не восстанавливает сохранения.</p>
        </details>
      </div>
      {profile.game.created
        ? <Suspense fallback={<p role="status">Загружаем защиту прогресса…</p>}>
            <ProgressBackupPanel profile={profile} pendingResult={pendingResult} disabled={disabled}/>
          </Suspense>
        : <p className="bf-settings-hint">Создай бойца на экране «Горн», чтобы сохранить его прогресс.</p>}
    </>
  );
}
