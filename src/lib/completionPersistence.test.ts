import { describe, expect, it, vi } from 'vitest';
import { createCompletionPersistence, type PreparedWorkoutContext } from './completionPersistence';
import { resultJournalEntry, type CompletedWorkoutResult } from './workoutJournal';
import type { DurableJournalEntry, DurableWriteResult } from './durableJournal';

const result: CompletedWorkoutResult = { schemaVersion: 1, profileId: 'player', sessionId: 'session',
  mode: 'tower', floor: 1, repetitions: 20, durationMs: 32000, finishedAt: '2026-10-27T12:00:00Z' };
const context: PreparedWorkoutContext = { session: result, baseProfileRaw: 'prepared revision' };
const row = (state: DurableJournalEntry['state'] = 'active'): DurableJournalEntry => ({
  ...resultJournalEntry(result)!, baseProfileRaw: context.baseProfileRaw, state,
});
const saved = (state: DurableJournalEntry['state'] = 'active'): DurableWriteResult => ({ status: 'saved', entries: [row(state)] });

describe('completion persistence before profile lock acquisition', () => {
  it('rejects unprepared, foreign, changed-floor and changed-exercise completions', () => {
    const write = vi.fn();
    expect(createCompletionPersistence(result, null, write)).toBeNull();
    for (const change of [{ profileId: 'other' }, { sessionId: 'other' }, { floor: 2 }, { exerciseId: 'pushup' as const }]) {
      expect(createCompletionPersistence({ ...result, ...change }, context, write)).toBeNull();
    }
    expect(write).not.toHaveBeenCalled();
  });

  it('owns an immutable copy and shares one in-flight strict write across retries', async () => {
    let resolve!: (result: DurableWriteResult) => void;
    const write = vi.fn(() => new Promise<DurableWriteResult>(done => { resolve = done; }));
    const input = { ...result, splitsMs: Array.from({ length: 20 }, (_, i) => i * 1000) };
    const operation = createCompletionPersistence(input, context, write)!;
    input.durationMs = 99999; input.splitsMs[0] = 999;
    expect(operation.result.durationMs).toBe(32000);
    expect(operation.result.splitsMs![0]).toBe(0);
    expect(Object.isFrozen(operation.result)).toBe(true);
    expect(Object.isFrozen(operation.result.splitsMs)).toBe(true);
    const a = operation.stage(), b = operation.stage();
    expect(a).toBe(b);
    expect(operation.acknowledged).toBeNull();
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]).toHaveLength(2); // No queue-owned AbortSignal.
    const entry = resultJournalEntry(operation.result)!;
    resolve({ status: 'saved', entries: [{ ...entry, baseProfileRaw: context.baseProfileRaw, state: 'active' }] });
    expect((await a).status).toBe('saved');
    expect(operation.acknowledged?.raw).toBe(entry.raw);
    await operation.stage();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it.each(['settled', 'quarantined'] as const)('recognizes a monotonic concurrent %s receipt without rewriting its payload', async (state) => {
    const operation = createCompletionPersistence(result, context, vi.fn(async () => saved(state)))!;
    expect(await operation.stage()).toEqual(saved(state));
    expect(operation.acknowledged?.state).toBe(state);
  });

  it.each(['unavailable', 'invalid'] as const)('never acknowledges %s and permits a controlled retry', async (status) => {
    const write = vi.fn().mockResolvedValueOnce({ status }).mockResolvedValueOnce(saved());
    const operation = createCompletionPersistence(result, context, write)!;
    expect((await operation.stage()).status).toBe(status);
    expect(operation.acknowledged).toBeNull();
    expect((await operation.stage()).status).toBe('saved');
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('rejects missing, changed-payload and changed-base read-backs', async () => {
    for (const entries of [[], [{ ...row(), raw: '{different}' }], [{ ...row(), baseProfileRaw: 'other revision' }]]) {
      const operation = createCompletionPersistence(result, context, vi.fn(async () => ({ status: 'saved' as const, entries })))!;
      expect((await operation.stage()).status).toBe('unavailable');
      expect(operation.acknowledged).toBeNull();
    }
  });

  it('converts a rejected storage operation into an honest unavailable outcome', async () => {
    const operation = createCompletionPersistence(result, context, vi.fn(async () => { throw new Error('closed IDB'); }))!;
    expect(await operation.stage()).toEqual({ status: 'unavailable' });
    expect(operation.acknowledged).toBeNull();
  });
});
