import { stageDurableResults, type DurableJournalEntry, type DurableWriteResult } from './durableJournal';
import { resultJournalEntry, type CompletedWorkoutResult, type WorkoutSession } from './workoutJournal';

export interface PreparedWorkoutContext { session: WorkoutSession; baseProfileRaw: string | null }
export type CompletionPhase = 'idle' | 'saving-result' | 'durable-pending' | 'credited' | 'quarantined';
type Stage = typeof stageDurableResults;

/** One immutable completion owns a stage promise, independent of the profile
 * queue's cancellation. No React, profile writes or reward decisions here. */
export class CompletionPersistence {
  readonly result: CompletedWorkoutResult;
  readonly raw: string;
  readonly key: string;
  acknowledged: DurableJournalEntry | null = null;
  private flight: Promise<DurableWriteResult> | null = null;

  constructor(result: CompletedWorkoutResult, private readonly baseProfileRaw: string | null, private readonly write: Stage) {
    if (result.splitsMs) Object.freeze(result.splitsMs);
    this.result = Object.freeze(result);
    const entry = resultJournalEntry(this.result)!;
    this.raw = entry.raw; this.key = entry.key;
  }

  stage(): Promise<DurableWriteResult> {
    if (this.acknowledged) return Promise.resolve({ status: 'saved', entries: [this.acknowledged] });
    if (this.flight) return this.flight;
    const task: Promise<DurableWriteResult> = Promise.resolve().then(async (): Promise<DurableWriteResult> => {
      const outcome = await this.write([{ key: this.key, raw: this.raw }], this.baseProfileRaw);
      if (outcome.status !== 'saved') return outcome;
      const row = outcome.entries.find(entry => entry.key === this.key);
      if (!row || row.raw !== this.raw || row.baseProfileRaw !== this.baseProfileRaw) return { status: 'unavailable' };
      this.acknowledged = Object.freeze({ ...row });
      return { status: 'saved', entries: [this.acknowledged] };
    }).catch(() => ({ status: 'unavailable' }));
    this.flight = task;
    void task.then(() => { if (this.flight === task) this.flight = null; });
    return task;
  }
}

export function createCompletionPersistence(input: CompletedWorkoutResult, prepared: PreparedWorkoutContext | null,
  write: Stage = stageDurableResults): CompletionPersistence | null {
  const entry = resultJournalEntry(input), session = prepared?.session;
  if (!entry?.result || !session || entry.result.profileId !== session.profileId ||
      entry.result.sessionId !== session.sessionId || entry.result.mode !== session.mode ||
      entry.result.floor !== session.floor || (entry.result.exerciseId ?? 'squat') !== (session.exerciseId ?? 'squat')) return null;
  return new CompletionPersistence(entry.result, prepared!.baseProfileRaw, write);
}
