import { useCallback, useEffect, useRef, useState } from 'react';
import { loadProfileState, saveProfile, recoverProfile, STORAGE_KEY, type Profile, type ProfileLoadResult } from '../lib/progression';
import { withProfileWriteLock, type ProfileWriteIssue } from '../lib/profileLock';
import { prepareWorkoutSession, readResultJournal, readQuarantinedResults, sameWorkoutResult,
  type CompletedWorkoutResult, type JournalEntry, type JournalOutcome, type WorkoutSession } from '../lib/workoutJournal';
import { replayDurableWorkouts, quarantineDurableWorkouts } from '../lib/durableWorkout';
import { readDurableJournal } from '../lib/durableJournal';
import type { WorkoutMode } from '../lib/game';

export type StorageStatus = 'ready' | 'checking' | 'recovery-required' | 'unavailable' | 'conflict' | 'pending-result';
const uiStatus = (state: ProfileLoadResult): StorageStatus => state.status === 'empty' ? 'ready' : state.status;

/** All production profile mutations share a cooperative browser lock. Queued
 * snapshots are cancelled when superseded; errors never imply durability. */
export function useProfileStorage() {
  const [initial] = useState(loadProfileState);
  const [initialJournal] = useState(readResultJournal);
  const [profile, setProfile] = useState<Profile>(initial.profile);
  const [status, setStatus] = useState<StorageStatus>(() => initial.status === 'ready' || initial.status === 'empty'
    ? 'checking'
    : uiStatus(initial));
  const [backupAvailable, setBackupAvailable] = useState(initial.backupAvailable);
  const [writeIssue, setWriteIssue] = useState<ProfileWriteIssue | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [journalEntries, setJournalEntries] = useState(initialJournal.entries);
  const [quarantined, setQuarantined] = useState(readQuarantinedResults);
  const [pendingResult, setPendingResult] = useState<CompletedWorkoutResult | null>(null);
  const volatileResult = useRef<CompletedWorkoutResult | null>(null);
  const [reconcileToken, requestReconcile] = useState(0);
  const revision = useRef(initial.revision);
  // Viewing a legacy/empty profile must not rewrite or seed storage.
  const saved = useRef<Profile>(initial.profile);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const hydrated = useRef(false);
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

  const runWrite = useCallback(<T,>(operation: (context: { signal: AbortSignal; isCurrent: () => boolean }) => T | Promise<T>) => {
    cancelPending();
    const token = generation.current;
    const controller = new AbortController();
    pending.current = controller;
    setIsSaving(true);
    const isCurrent = () => token === generation.current && !controller.signal.aborted;
    return withProfileWriteLock(async () => {
      if (token !== generation.current || controller.signal.aborted) return;
      const value = await operation({ signal: controller.signal, isCurrent });
      if (isCurrent()) { pending.current = null; setIsSaving(false); }
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
    // A recovery view acknowledges the observed raw revision without treating
    // it as writable. Keep RAM untouched when storage could not be read.
    if (state.status !== 'unavailable') revision.current = state.revision;
    if (state.status === 'ready' || state.status === 'empty' ||
        (state.status === 'recovery-required' && state.profile.creditedWorkoutIds === null)) {
      saved.current = state.profile;
      setProfile(state.profile);
    }
  }, []);
  const applyJournal = useCallback((outcome: JournalOutcome) => {
    accept(outcome.state);
    setJournalEntries(readResultJournal().entries);
    setQuarantined(readQuarantinedResults());
    hydrated.current = outcome.status !== 'unavailable';
    const own = volatileResult.current;
    // A batch can credit our result but still report a different damaged record.
    // Clear RAM by its own verified identity, independently of the global issue.
    if (own && outcome.state.status === 'ready' && outcome.state.profile.profileId === own.profileId &&
        (outcome.state.profile.creditedWorkoutIds?.includes(own.sessionId) || outcome.state.profile.workouts.some((w) => w.id === own.sessionId))) {
      volatileResult.current = null;
      setPendingResult(null);
    }
    if (outcome.status !== 'saved') {
      setStatus(outcome.status === 'mismatch' || outcome.status === 'invalid' ? 'pending-result' : outcome.status);
    }
  }, [accept]);
  const replay = useCallback(() => runWrite(async (context) => {
    const outcome = await replayDurableWorkouts(volatileResult.current, context);
    if (context.isCurrent()) applyJournal(outcome);
  }), [applyJournal, runWrite]);
  useEffect(() => {
    let active = true;
    const token = generation.current;
    // A clean startup or explicit "load latest" only needs a read. Requiring a
    // Web Lock for an empty journal would leave the recovery screen waiting on
    // another tab that intentionally holds the lock. Check both journal stores:
    // IndexedDB can have a durable result after localStorage rolled back.
    void (async () => {
      const local = readResultJournal();
      if (local.status === 'ready' && local.entries.length === 0 && !volatileResult.current) {
        const durable = await readDurableJournal();
        if (!active || token !== generation.current) return;
        if (durable.status === 'ready' && durable.entries.length === 0) {
          const checked = readResultJournal();
          const current = loadProfileState();
          if (checked.status === 'ready' && checked.entries.length === 0) {
            if (current.revision !== revision.current) {
              setStatus('conflict');
              return;
            }
            if (current.status === 'ready' || current.status === 'empty') {
              hydrated.current = true;
              setStatus(uiStatus(current));
              return;
            }
            setStatus(current.status);
            setBackupAvailable(current.backupAvailable);
            return;
          }
        }
      }
      if (active && token === generation.current) void replay();
    })();
    return () => { active = false; };
  }, [reconcileToken, replay]);

  const beginWorkout = useCallback(async (mode: WorkoutMode): Promise<WorkoutSession | null> => {
    if (volatileResult.current) { setStatus('unavailable'); return null; }
    const response = await runWrite(async (context) => {
      if (loadProfileState().revision !== revision.current) { setStatus('conflict'); return null; }
      const reconciled = await replayDurableWorkouts(null, context);
      if (!context.isCurrent()) return null;
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
    // A fresh profile view cannot erase an unjournaled completion. Retry its
    // identity-bound result; mismatched identities remain explicit recovery.
    // The effect preflights both durable stores before needing the write lock.
    setStatus('checking');
    requestReconcile((n) => n + 1);
  }, [accept, cancelPending]);
  const openCurrent = useCallback(() => {
    cancelPending();
    // This action is offered only for a durable unresolved record, never to
    // silently discard a RAM-only result that failed to reach the journal.
    const journal = readResultJournal();
    if (volatileResult.current && journal.status === 'ready' && journal.entries.some((e) => sameWorkoutResult(e.result, volatileResult.current))) {
      volatileResult.current = null;
      setPendingResult(null);
    }
    accept(loadProfileState());
    if (volatileResult.current) setStatus('unavailable');
  }, [accept, cancelPending]);
  const recover = useCallback((source: 'backup' | 'empty') => runWrite(async (context) => {
    const state = recoverProfile(source);
    accept(state);
    if (state.status === 'ready' || state.status === 'empty') {
      const outcome = await replayDurableWorkouts(volatileResult.current, context);
      if (context.isCurrent()) applyJournal(outcome);
    }
  }), [accept, applyJournal, runWrite]);
  const retry = useCallback(() => {
    const journal = readResultJournal();
    return !hydrated.current || volatileResult.current || journal.status === 'unavailable' || journal.entries.length ? replay() : save(profile, true);
  }, [profile, replay, save]);

  const quarantine = useCallback((expected: readonly JournalEntry[]) => runWrite(async (context) => {
    const outcome = await quarantineDurableWorkouts(expected, context);
    if (!context.isCurrent()) return;
    if (outcome.status === 'saved' && volatileResult.current && expected.some((e) => sameWorkoutResult(e.result, volatileResult.current))) {
      volatileResult.current = null;
      setPendingResult(null);
    }
    applyJournal(outcome);
    if (outcome.status === 'saved' && volatileResult.current) {
      const retried = await replayDurableWorkouts(volatileResult.current, context);
      if (context.isCurrent()) applyJournal(retried);
    }
  }), [applyJournal, runWrite]);

  return { profile, setProfile: guardedSetProfile, status, backupAvailable, writeIssue, pendingResult, journalEntries, quarantined, quarantine, beginWorkout, completeWorkout, openCurrent,
    isSaving: isSaving || status === 'checking' || (status === 'ready' && (saved.current !== profile || volatileResult.current !== null)), retry, recover, reload };
}
