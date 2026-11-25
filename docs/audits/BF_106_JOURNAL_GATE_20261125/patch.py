from pathlib import Path
from hashlib import sha256
a=Path('docs/audits/BF_106_JOURNAL_GATE_20261125')
p=Path('src/lib/durableJournal.ts');q=Path('src/lib/profileReplacementRecovery.ts')
old=p.read_bytes();prior=q.read_bytes()
assert sha256(old).hexdigest()=='4009b083d300dafd822d6098f5d76ebb5aa54c4c6537b740205718be868a0e65'
assert sha256(prior).hexdigest()=='95fc22c5914fea1e353ef22c91949a12c533cc8a744f2f774c39ce66be2bd43a'
s=old.decode().replace('\r\n','\n');t=prior.decode().replace('\r\n','\n')
def once(s,old,new):
 assert s.count(old)==1,old
 return s.replace(old,new)
s=once(s,"import { RESULT_JOURNAL_PREFIX } from './workoutJournal';", "import { RESULT_JOURNAL_PREFIX } from './workoutJournal';\nimport { withDurableJournalGate } from './durableJournalGate';")
s=once(s,'async function writeEntries(entries:', 'async function writeEntriesUnlocked(entries:')
anchor='/** Immutable inserts are serialized by the IDB transaction itself and may run'
s=once(s,anchor,'''/** Snapshot mutable inputs before waiting; no IDB access without the gate. */
async function writeEntries(entries: readonly EntryInput[], baseProfileRaw: string | null,
  state: 'settled' | 'quarantined' | null, signal?: AbortSignal): Promise<DurableWriteResult> {
  if (signal?.aborted) return { status: 'unavailable' };
  if (!Array.isArray(entries) || entries.some(entry => !validInput(entry)) ||
      (baseProfileRaw !== null && typeof baseProfileRaw !== 'string')) return { status: 'invalid' };
  const snapshot = entries.map(({ key, raw }) => ({ key, raw }));
  const result = await withDurableJournalGate('shared', () =>
    writeEntriesUnlocked(snapshot, baseProfileRaw, state, signal), { signal });
  return result.status === 'completed' ? result.value : { status: 'unavailable' };
}

'''+anchor)
s=once(s,' * before the profile Web Lock. This operation never changes a stored payload,', ' * before the profile Web Lock, holding shared journal access through read-back.\n * This operation never changes a stored payload,')
t=once(t,"import { withProfileWriteLock } from './profileLock';", "import { withProfileWriteLock } from './profileLock';\nimport { withDurableJournalGate } from './durableJournalGate';")
t=once(t,' * The independent completion stage can still add a durable result; never\n * delete/replay one here, and never enable forward finalization from this path.', ' * Profile -> exclusive journal lock prevents an independent stage between\n * the durable snapshot and rollback read-back. Never delete/replay records here,\n * and never enable forward finalization from this path.')
t=once(t,'''      const port = await lockedPort(signal);
      if (!port) return unavailable();
      if (port.getMarker() !== marker) return { state: 'conflict' as const, marker: port.getMarker() };
      return { state: inspectProfileReplacement(port), marker };''','''      const journal = await withDurableJournalGate('exclusive', async () => {
        const port = await lockedPort(signal);
        if (!port) return unavailable();
        if (port.getMarker() !== marker) return { state: 'conflict' as const, marker: port.getMarker() };
        return { state: inspectProfileReplacement(port), marker };
      }, { signal });
      return journal.status === 'completed' ? journal.value : unavailable();''')
t=once(t,'''    const port = await lockedPort(signal);
    if (!port || signal?.aborted) return { status: 'cancelled' };
    const outcome = rollbackProfileReplacement(port, expectedMarker, 'rollback');
    // A late completion is not discarded. The original profile, not the
    // imported wallet, will be the next replay base. Normal startup owns replay.
    return outcome;''','''    const journal = await withDurableJournalGate('exclusive', async (): Promise<ReplacementResult> => {
      const port = await lockedPort(signal);
      if (!port || signal?.aborted) return { status: 'cancelled' };
      // Existing durable results block rollback; none can enter while this
      // snapshot is used. A queued late stage is preserved after gate release.
      return rollbackProfileReplacement(port, expectedMarker, 'rollback');
    }, { signal });
    return journal.status === 'completed' ? journal.value : journal.status === 'cancelled'
      ? { status: 'cancelled' } : { status: 'unavailable', reason: journal.reason };''')
assert p.read_bytes()==old and q.read_bytes()==prior
p.write_bytes(s.encode());q.write_bytes(t.encode())
for x in (p,q,Path('src/lib/durableJournalGate.ts')):print(x,x.stat().st_size,sha256(x.read_bytes()).hexdigest())