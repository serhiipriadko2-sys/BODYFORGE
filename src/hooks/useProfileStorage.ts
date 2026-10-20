import { useCallback, useEffect, useRef, useState } from 'react';
import { loadProfileState, persistProfile, recoverProfile, STORAGE_KEY, type Profile, type ProfileLoadResult } from '../lib/progression';

export type StorageStatus = 'ready' | 'recovery-required' | 'unavailable' | 'conflict';
const uiStatus = (state: ProfileLoadResult): StorageStatus => state.status === 'empty' ? 'ready' : state.status;

/** Owns the UI-to-storage boundary. Refuses stale or damaged saves rather than
 * pretending that an in-memory reward is durable. No external transport. */
export function useProfileStorage() {
  const [initial] = useState(loadProfileState);
  const [profile, setProfile] = useState<Profile>(initial.profile);
  const [status, setStatus] = useState<StorageStatus>(() => uiStatus(initial));
  const [backupAvailable, setBackupAvailable] = useState(initial.backupAvailable);
  const revision = useRef(initial.revision);
  const saved = useRef<Profile | null>(null);

  const save = useCallback((next: Profile) => {
    const result = persistProfile(next, { expectedRaw: revision.current });
    if (result === 'saved') {
      const state = loadProfileState();
      if (state.status !== 'ready') { setStatus('unavailable'); return; }
      revision.current = state.revision;
      saved.current = next;
      setStatus('ready');
      return;
    }
    setStatus(result);
    if (result === 'recovery-required') setBackupAvailable(loadProfileState().backupAvailable);
  }, []);

  useEffect(() => {
    if (status === 'ready' && saved.current !== profile) save(profile);
  }, [profile, status, save]);

  useEffect(() => {
    const inspect = () => {
      try {
        if (localStorage.getItem(STORAGE_KEY) !== revision.current) setStatus('conflict');
      } catch { setStatus('unavailable'); }
    };
    const changed = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) inspect();
    };
    const returned = () => { if (!document.hidden) inspect(); };
    window.addEventListener('storage', changed);
    document.addEventListener('visibilitychange', returned);
    return () => {
      window.removeEventListener('storage', changed);
      document.removeEventListener('visibilitychange', returned);
    };
  }, []);

  const accept = useCallback((state: ProfileLoadResult) => {
    setBackupAvailable(state.backupAvailable);
    setStatus(uiStatus(state));
    if (state.status === 'ready' || state.status === 'empty') {
      revision.current = state.revision;
      saved.current = state.status === 'ready' ? state.profile : null;
      setProfile(state.profile);
    }
  }, []);
  const reload = useCallback(() => accept(loadProfileState()), [accept]);
  const recover = useCallback((source: 'backup' | 'empty') => accept(recoverProfile(source)), [accept]);
  const retry = useCallback(() => {
    const current = loadProfileState();
    if (current.status === 'recovery-required') {
      setStatus('recovery-required');
      setBackupAvailable(current.backupAvailable);
      return;
    }
    if (current.status === 'unavailable') { setStatus('unavailable'); return; }
    // An unavailable first load never read the disk. Only reload is safe if
    // storage subsequently reveals a profile the app has not seen yet.
    if (current.revision !== revision.current) { setStatus('conflict'); return; }
    save(profile);
  }, [profile, save]);

  return { profile, setProfile, status, backupAvailable, retry, recover, reload };
}
