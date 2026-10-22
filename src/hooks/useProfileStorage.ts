import { useCallback, useEffect, useRef, useState } from 'react';
import { loadProfileState, saveProfile, recoverProfile, STORAGE_KEY, type Profile, type ProfileLoadResult } from '../lib/progression';
import { withProfileWriteLock, type ProfileWriteIssue } from '../lib/profileLock';
import { commitWorkoutResult, prepareWorkoutSession, readResultJournal, reconcileWorkoutResults,
  type CompletedWorkoutResult, type JournalOutcome, type WorkoutSession } from '../lib/workoutJournal';
import type { WorkoutMode } from '../lib/game';

export type StorageStatus = 'ready' | 'recovery-required' | 'unavailable' | 'conflict' | 'pending-result';
const uiStatus = (state: ProfileLoadResult): StorageStatus => state.status === 'empty' ? 'ready' : state.status;

/** All production profile mutations share a cooperative browser lock. Queued
 * snapshots are cancelled when superseded; errors never imply durability. */
export function useProfileStorage() {
  const [initial] = useState(loadProfileState);
  const [initialJournal] = useState(readResultJournal);
  const [profile, setProfile] = useState<Profile>(initial.profile);
  const [status, setStatus] = useState<StorageStatus>(() => initial.status === 'ready' || initial.status === 'empty'
    ? initialJournal.status === 'unavailable' ? 'unavailable' : initialJournal.entries.length ? 'pending-result' : uiStatus(initial)
    : uiStatus(initial));
  const [backupAvailable, setBackupAvailable] = useState(initial.backupAvailable);
  const [writeIssue, setWriteIssue] = useState<ProfileWriteIssue | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [journalEntries, setJournalEntries] = useState(initialJournal.entries);
  const [pendingResult, setPendingResult] = useState<CompletedWorkoutResult | null>(null);
  const volatileResult = useRef<CompletedWorkoutResult | null>(null);
  const [reconcileToken, requestReconcile] = useState(0);
  const revision = useRef(initial.revision);
  // Viewing a legacy/empty profile must not rewrite or seed storage.
  const saved = useRef<Profile>(initial.profile);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  // A completed result owns the next write. Ordinary UI updates must not cancel
  // its queued journal commit or replace it with an unrelated profile snapshot.
  const guardedSetProfile = useCallback((action: Parameters<typeof setProfile>[0]) => {
    if (!volatileResult.current) setProfile(action);
  }, []);

  const cancelPending = useCallback(() => {
    generation.current++;
    pending.current?.abort();
    pending.current = null;
    setIsSaving(false);
  }, []);

  const runWrite = useCallback(<T,>(operation: () => T) => {
    cancelPending();
    const token = generation.current;
    const controller = new AbortController();
    pending.current = controller;
    setIsSaving(true);
    return withProfileWriteLock(() => {
      if (token !== generation.current || controller.signal.aborted) return;
      const value = operation();
      pending.current = null;
      setIsSaving(false);
      return value;
    }, { signal: controller.signal }).then((result) => {
      if (token !== generation.current || controller.signal.aborted) return { status: 'cancelled' as const };
      pending.current = null;
      setIsSaving(false);
      if (result.status === 'unavailable') {
        setWriteIssue(result.reason);
        setStatus('unavailable');
      }
      return result;
    });
  }, [cancelPending]);

  const save = useCallback((next: Profile, retry = false) => runWrite(() => {
    setWriteIssue(null);
    if (retry) {
      const current = loadProfileState();
      if (current.status === 'recovery-required' || current.status === 'unavailable') {
        setStatus(current.status);
        setBackupAvailable(current.backupAvailable);
        return;
      }
    }
    // Read and acknowledge our revision while holding the lock.
    const result = saveProfile(next, { expectedRaw: revision.current });
    if (result.status === 'saved') {
      revision.current = result.revision;
      saved.current = next;
      setStatus('ready');
    } else {
      setStatus(result.status);
      if (result.status === 'recovery-required') setBackupAvailable(loadProfileState().backupAvailable);
    }
  }), [runWrite]);

  useEffect(() => {
    if (status === 'ready' && saved.current !== profile) {
      save(profile);
      return cancelPending;
    }
  }, [profile, status, save, cancelPending]);

  useEffect(() => {
    const inspect = () => {
      try {
        if (localStorage.getItem(STORAGE_KEY) !== revision.current) {
          cancelPending();
          setStatus('conflict');
        }
      } catch { cancelPending(); setStatus('unavailable'); }
    };
    const changed = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) inspect();
    };
    const returned = () => { if (!document.hidden) inspect(); };
    const leaving = () => {
      if (pending.current) {
        cancelPending();
        setWriteIssue(null);
        setStatus('unavailable');
      }
    };
    window.addEventListener('storage', changed);
    window.addEventListener('pagehide', leaving);
    document.addEventListener('visibilitychange', returned);
    return () => {
      cancelPending();
      window.removeEventListener('storage', changed);
      window.removeEventListener('pagehide', leaving);
      document.removeEventListener('visibilitychange', returned);
    };
  }, [cancelPending]);

  const accept = useCallback((state: ProfileLoadResult) => {
    setWriteIssue(null);
    setBackupAvailable(state.backupAvailable);
    setStatus(uiStatus(state));
    if (state.status === 'ready' || state.status === 'empty') {
      revision.current = state.revision;
      saved.current = state.profile;
      setProfile(state.profile);
    }
  }, []);
  const applyJournal = useCallback((outcome: JournalOutcome) => {
    accept(outcome.state);
    setJournalEntries(readResultJournal().entries);
    if (outcome.status === 'saved') {
      volatileResult.current = null;
      setPendingResult(null);
    } else {
      setStatus(outcome.status === 'mismatch' || outcome.status === 'invalid' ? 'pending-result' : outcome.status);
    }
  }, [accept]);
  const replay = useCallback(() => runWrite(() => applyJournal(volatileResult.current
    ? commitWorkoutResult(volatileResult.current) : reconcileWorkoutResults())), [applyJournal, runWrite]);
  useEffect(() => {
    const journal = readResultJournal();
    if (journal.status === 'unavailable' || journal.entries.length) void replay();
  }, [reconcileToken, replay]);

  const beginWorkout = useCallback(async (mode: WorkoutMode): Promise<WorkoutSession | null> => {
    if (volatileResult.current) { setStatus('unavailable'); return null; }
    const response = await runWrite(() => {
      if (loadProfileState().revision !== revision.current) { setStatus('conflict'); return null; }
      const reconciled = reconcileWorkoutResults();
      applyJournal(reconciled);
      if (reconciled.status !== 'saved') return null;
      const result = prepareWorkoutSession(revision.current, mode);
      if (result.status !== 'ready') { setStatus(result.status); return null; }
      accept(result.state);
      return result.session;
    });
    return response.status === 'completed' ? response.value ?? null : null;
  }, [accept, applyJournal, runWrite]);
  const completeWorkout = useCallback((result: CompletedWorkoutResult) => {
    volatileResult.current = result;
    setPendingResult(result);
    return replay();
  }, [replay]);
  const reload = useCallback(() => {
    cancelPending();
    accept(loadProfileState());
    // Explicitly opening the durable profile never applies a RAM-only result.
    volatileResult.current = null;
    setPendingResult(null);
    requestReconcile((n) => n + 1);
  }, [accept, cancelPending]);
  const openCurrent = useCallback(() => {
    cancelPending();
    // This action is offered only for a durable unresolved record, never to
    // silently discard a RAM-only result that failed to reach the journal.
    if (volatileResult.current && readResultJournal().entries.some((e) => e.result?.sessionId === volatileResult.current?.sessionId)) {
      volatileResult.current = null;
      setPendingResult(null);
    }
    accept(loadProfileState());
  }, [accept, cancelPending]);
  const recover = useCallback((source: 'backup' | 'empty') => runWrite(() => {
    const state = recoverProfile(source);
    accept(state);
    if (state.status === 'ready' || state.status === 'empty') applyJournal(reconcileWorkoutResults());
  }), [accept, applyJournal, runWrite]);
  const retry = useCallback(() => {
    const journal = readResultJournal();
    return volatileResult.current || journal.status === 'unavailable' || journal.entries.length ? replay() : save(profile, true);
  }, [profile, replay, save]);

  return { profile, setProfile: guardedSetProfile, status, backupAvailable, writeIssue, pendingResult, journalEntries, beginWorkout, completeWorkout, openCurrent,
    isSaving: isSaving || (status === 'ready' && (saved.current !== profile || volatileResult.current !== null)), retry, recover, reload };
}
