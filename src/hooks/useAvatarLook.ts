import { useCallback, useEffect, useState } from 'react';
import { AVATAR_LOOK_KEY, readAvatarLook, saveAvatarLook, type AvatarLook } from '../lib/avatarLook';

/** Cosmetic state only; it must never use the profile write lock or rewrite XP. */
export function useAvatarLook() {
  const [read, setRead] = useState(readAvatarLook);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== AVATAR_LOOK_KEY && event.key !== null) return;
      const next = readAvatarLook();
      if (next.status === 'ready') {
        setRead(next);
        setMessage('Внешность обновлена в другой вкладке.');
      } else {
        setMessage('Данные внешности в другой вкладке не прочитаны. Текущий образ сохранён.');
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const update = useCallback((look: AvatarLook) => {
    const saved = saveAvatarLook(look);
    setRead({ status: saved ? 'ready' : 'unavailable', look });
    setMessage(saved ? 'Образ сохранён на этом устройстве.' : 'Образ изменён на экране, но браузер не подтвердил сохранение.');
    return saved;
  }, []);
  return { look: read.look, readStatus: read.status, message, update };
}
