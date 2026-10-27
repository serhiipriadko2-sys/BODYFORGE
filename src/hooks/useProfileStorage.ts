import { useCallback, useEffect, useRef, useState } from 'react';
import { loadProfileState, saveProfile, recoverProfile, STORAGE_KEY, type Profile, type ProfileLoadResult } from '../lib/progression';
import { withProfileWriteLock, type ProfileWriteIssue } from '../lib/profileLock';
import { prepareWorkoutSession, readResultJournal, readQuarantinedResults, sameWorkoutResult,
  type CompletedWorkoutResult, type JournalEntry, type JournalOutcome, type WorkoutSession } from '../lib/workoutJournal';
import { replayDurableWorkouts, quarantineDurableWorkouts } from '../lib/durableWorkout';
import { readDurableJournal } from '../lib/durableJournal';
import type { WorkoutMode } from '../lib/game';
import type { ExerciseId } from '../lib/trainingCatalog';
import { createCompletionPersistence, type CompletionPersistence, type CompletionPhase, type PreparedWorkoutContext } from '../lib/completionPersistence';

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
  const preparedWorkout = useRef<PreparedWorkoutContext | null>(null);
  const completionOperation = useRef<CompletionPersistence | null>(null);
  const lastResolvedCompletion = useRef<CompletedWorkoutResult | null>(null);
  const [completionPhase, setCompletionPhase] = useState<CompletionPhase>('idle');
  const replayFlight = useRef<{ generation: number; promise: Promise<void> } | null>(null);
  const mounted = useRef(false);
  const pageActive = useRef(true);
  const canContinue = useCallback(() => mounted.current && pageActive.current && !document.hidden, []);
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
      if (!isCurrent()) return;
      const value = await operation({ signal: controller.signal, isCurrent });
      if (isCurrent()) { pending.current = null; setIsSaving(false); }
      return value;
    }, { signal: controller.signal }).then((result) => {
      if (!isCurrent()) return { status: 'cancelled' as const };
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
    mounted.current = true;
    pageActive.current = true;
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
    const returned = () => {
      if (!document.hidden) {
        inspect();
        if (volatileResult.current || !hydrated.current) requestReconcile(n => n + 1);
      }
    };
    const shown = () => { pageActive.current = true; returned(); };
    const leaving = () => {
      pageActive.current = false;
      if (pending.current) {
        cancelPending();
        setWriteIssue(null);
        setStatus('unavailable');
      }
    };
    window.addEventListener('storage', changed);
    window.addEventListener('pagehide', leaving);
    window.addEventListener('pageshow', shown);
    document.addEventListener('visibilitychange', returned);
    return () => {
      mounted.current = false;
      pageActive.current = false;
      cancelPending();
      window.removeEventListener('storage', changed);
      window.removeEventListener('pagehide', leaving);
      window.removeEventListener('pageshow', shown);
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
        outcome.settledSessionIds?.includes(own.sessionId) &&
        (outcome.state.profile.creditedWorkoutIds?.includes(own.sessionId) || outcome.state.profile.workouts.some((w) => w.id === own.sessionId))) {
      volatileResult.current = null;
      lastResolvedCompletion.current = own;
      completionOperation.current = null;
      preparedWorkout.current = null;
      setPendingResult(null);
      setCompletionPhase('credited');
    }
    if (outcome.status !== 'saved') {
      setStatus(outcome.status === 'mismatch' || outcome.status === 'invalid' ? 'pending-result' : outcome.status);
    }
  }, [accept]);
  const replay = useCallback((): Promise<void> => {
    const existing = replayFlight.current;
    if (existing && existing.generation === generation.current) return existing.promise;
    const flight = { generation: generation.current, promise: Promise.resolve() };
    replayFlight.current = flight;
    flight.promise = (async () => {
      const own = completionOperation.current;
      if (own) {
        if (canContinue()) setCompletionPhase(own.acknowledged ? 'durable-pending' : 'saving-result');
        // Independent immutable IDB stage starts before any profile-lock wait.
        // pagehide and normal UI writes never abort this operation deliberately.
        const staged = await own.stage();
        if (!canContinue() || flight.generation !== generation.current || completionOperation.current !== own) return;
        if (staged.status !== 'saved') {
          setStatus(staged.status === 'invalid' ? 'pending-result' : 'unavailable');
          return;
        }
        if (own.acknowledged?.state === 'quarantined') {
          lastResolvedCompletion.current = own.result;
          volatileResult.current = null; completionOperation.current = null; preparedWorkout.current = null;
          setPendingResult(null); setCompletionPhase('quarantined');
        } else setCompletionPhase('durable-pending');
      }
      if (!canContinue() || flight.generation !== generation.current) return;
      const queued = runWrite(async (context) => {
        const foreground = { signal: context.signal, isCurrent: () => context.isCurrent() && canContinue() };
        if (!foreground.isCurrent()) return;
        const outcome = await replayDurableWorkouts(volatileResult.current, foreground);
        if (foreground.isCurrent()) applyJournal(outcome);
      });
      flight.generation = generation.current;
      await queued;
    })().finally(() => { if (replayFlight.current === flight) replayFlight.current = null; });
    return flight.promise;
  }, [applyJournal, runWrite, canContinue]);
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

  const beginWorkout = useCallback(async (mode: WorkoutMode, exerciseId: ExerciseId = 'squat'): Promise<WorkoutSession | null> => {
    if (volatileResult.current) { setStatus('unavailable'); return null; }
    const response = await runWrite(async (context) => {
      if (loadProfileState().revision !== revision.current) { setStatus('conflict'); return null; }
      const reconciled = await replayDurableWorkouts(null, context);
      if (!context.isCurrent()) return null;
      applyJournal(reconciled);
      if (reconciled.status !== 'saved') return null;
      const result = prepareWorkoutSession(revision.current, mode, exerciseId);
      if (result.status !== 'ready') { setStatus(result.status); return null; }
      accept(result.state);
      preparedWorkout.current = { session: { ...result.session }, baseProfileRaw: result.state.revision };
      setCompletionPhase('idle');
      return result.session;
    });
    return response.status === 'completed' ? response.value ?? null : null;
  }, [accept, applyJournal, runWrite]);
  const completeWorkout = useCallback((result: CompletedWorkoutResult) => {
    if (lastResolvedCompletion.current && sameWorkoutResult(lastResolvedCompletion.current, result)) return Promise.resolve();
    const existing = completionOperation.current;
    if (existing && !sameWorkoutResult(existing.result, result)) {
      setStatus('pending-result');
      return Promise.resolve();
    }
    const own = existing ?? createCompletionPersistence(result, preparedWorkout.current);
    if (!own) { setStatus('pending-result'); return Promise.resolve(); }
    completionOperation.current = own;
    volatileResult.current = own.result;
    setPendingResult(own.result);
    setCompletionPhase(own.acknowledged ? 'durable-pending' : 'saving-result');
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
    if (volatileResult.current && (completionOperation.current?.acknowledged ||
        (journal.status === 'ready' && journal.entries.some((e) => sameWorkoutResult(e.result, volatileResult.current))))) {
      volatileResult.current = null;
      completionOperation.current = null;
      preparedWorkout.current = null;
      setPendingResult(null);
    }
    accept(loadProfileState());
    if (volatileResult.current) setStatus('unavailable');
  }, [accept, cancelPending]);
  const stageBeforeRecovery = useCallback(async () => {
    const own = completionOperation.current, token = generation.current;
    if (!own) return canContinue();
    const staged = await own.stage();
    if (!canContinue() || token !== generation.current || completionOperation.current !== own) return false;
    if (staged.status !== 'saved') { setStatus(staged.status === 'invalid' ? 'pending-result' : 'unavailable'); return false; }
    setCompletionPhase('durable-pending');
    return true;
  }, [canContinue]);
  const recover = useCallback(async (source: 'backup' | 'empty') => {
    if (!await stageBeforeRecovery()) return;
    return runWrite(async (context) => {
      const state = recoverProfile(source);
      accept(state);
      if (state.status === 'ready' || state.status === 'empty') {
        const outcome = await replayDurableWorkouts(volatileResult.current, context);
        if (context.isCurrent()) applyJournal(outcome);
      }
    });
  }, [accept, applyJournal, runWrite, stageBeforeRecovery]);
  const retry = useCallback(() => {
    const journal = readResultJournal();
    return !hydrated.current || volatileResult.current || journal.status === 'unavailable' || journal.entries.length ? replay() : save(profile, true);
  }, [profile, replay, save]);

  const quarantine = useCallback(async (expected: readonly JournalEntry[]) => {
    if (!await stageBeforeRecovery()) return;
    return runWrite(async (context) => {
      const outcome = await quarantineDurableWorkouts(expected, context);
      if (!context.isCurrent()) return;
      if (outcome.status === 'saved' && volatileResult.current && expected.some((e) => sameWorkoutResult(e.result, volatileResult.current))) {
        lastResolvedCompletion.current = volatileResult.current;
        volatileResult.current = null;
        completionOperation.current = null;
        preparedWorkout.current = null;
        setPendingResult(null);
        setCompletionPhase('quarantined');
      }
      applyJournal(outcome);
      if (outcome.status === 'saved' && volatileResult.current) {
        const retried = await replayDurableWorkouts(volatileResult.current, context);
        if (context.isCurrent()) applyJournal(retried);
      }
    });
  }, [applyJournal, runWrite, stageBeforeRecovery]);

  return { profile, setProfile: guardedSetProfile, status, backupAvailable, writeIssue, pendingResult, completionPhase, journalEntries, quarantined, quarantine, beginWorkout, completeWorkout, openCurrent,
    isSaving: isSaving || status === 'checking' || (status === 'ready' && (saved.current !== profile || volatileResult.current !== null)), retry, recover, reload };
}
