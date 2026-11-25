from pathlib import Path
import hashlib
p=Path('src/lib/receiptCompatibility.ts')
q=Path('src/lib/receiptCompatibility.test.ts')
a=Path('docs/audits/BF_105_RECEIPT_SCHEMA_20261124')
raw=p.read_bytes(); test=q.read_bytes()
assert hashlib.sha256(raw).hexdigest()=='bff65783983fa313d5c13c782d6d3ba74a2b901457eab4ffd0b9c65bd2ac3586'
assert hashlib.sha256(test).hexdigest()=='d3c19144fe0479295cb44b79d536a937bf626881c647d934fccaee44fe50f1ff'
s=raw.decode('utf-8').replace('\r\n','\n')
t=test.decode('utf-8').replace('\r\n','\n')
def once(text,old,new):
 assert text.count(old)==1,old
 return text.replace(old,new)
s=once(s,'/** Compare supplied JSON fields without requiring newly introduced defaults.',"""// Bound work before invoking legacy normalization or recursive comparison.
// These are preview limits, not a change to the live save or backup format.
const MAX_PREVIEW_DEPTH = 32;
const MAX_PREVIEW_NODES = 250_000;
const UNSAFE_JSON_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
function boundedJsonTree(source: unknown): boolean {
  const pending: { value: unknown; depth: number }[] = [{ value: source, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const current = pending.pop()!;
    if (++nodes > MAX_PREVIEW_NODES || current.depth > MAX_PREVIEW_DEPTH) return false;
    if (Array.isArray(current.value)) {
      for (const value of current.value) {
        if (pending.length + nodes >= MAX_PREVIEW_NODES) return false;
        pending.push({ value, depth: current.depth + 1 });
      }
    } else if (record(current.value)) {
      for (const [key, value] of Object.entries(current.value)) {
        if (UNSAFE_JSON_KEYS.has(key) || pending.length + nodes >= MAX_PREVIEW_NODES) return false;
        pending.push({ value, depth: current.depth + 1 });
      }
    }
  }
  return true;
}

/** Compare supplied JSON fields without requiring newly introduced defaults.""")
s=once(s,'  readonly profile: Profile;',"""  /** The existing v1 reader's display view, never a new authoritative ledger. */
  readonly profile: Profile;
  /** Exact explicitly stored identities, null if the old source had none. */
  readonly storedCreditedWorkoutIds: readonly string[] | null;""")
s=once(s,"  catch { return blocked('invalid', 'source-json'); }\n  if (!record(source)", "  catch { return blocked('invalid', 'source-json'); }\n  if (!boundedJsonTree(source)) return blocked('invalid', 'source-complexity');\n  if (!record(source)")
s=once(s,"  const ledger = source.creditedWorkoutIds;\n  if (Array.isArray(ledger) && new Set(ledger).size !== ledger.length) {","  const ledger = source.creditedWorkoutIds;\n  const storedIds = Array.isArray(ledger) ? new Set(ledger) : null;\n  if (storedIds && storedIds.size !== (ledger as unknown[]).length) {")
s=once(s,"if (Array.isArray(ledger) && !ledger.includes(parsed.id))","if (storedIds && !storedIds.has(parsed.id))")
s=once(s,"    ledgerEvidence: Array.isArray(ledger) ? 'stored-identities' : 'legacy-unproven',","    storedCreditedWorkoutIds: Array.isArray(ledger) ? [...ledger] as string[] : null,\n    ledgerEvidence: Array.isArray(ledger) ? 'stored-identities' : 'legacy-unproven',")
s=once(s,' * No current history is truncated here, no ledger or grants are synthesized.',' * Available receipt history is not truncated. The v1 display view may seed\n * known legacy IDs, but storedCreditedWorkoutIds records only source evidence.')
t=once(t,"    expect(result.profile.creditedWorkoutIds).toHaveLength(65);","    expect(result.profile.creditedWorkoutIds).toHaveLength(65);\n    expect(result.storedCreditedWorkoutIds).toEqual(p.creditedWorkoutIds);")
t=once(t,"    expect(result.ledgerEvidence).toBe('legacy-unproven');","    expect(result.ledgerEvidence).toBe('legacy-unproven');\n    expect(result.storedCreditedWorkoutIds).toBeNull();")
t=once(t,"  it('deterministic property sweep:", """  it('bounds hostile JSON depth and object keys without changing opaque ID values', () => {
    const deep = '{"xp":0,"coins":0,"workouts":[],"extra":' + '['.repeat(40) + '0' + ']'.repeat(40) + '}';
    const polluted = '{"xp":0,"coins":0,"workouts":[],"__proto__":{"polluted":true}}';
    const excessive = '{"xp":0,"coins":0,"workouts":[],"extra":[' + '0,'.repeat(250000) + '0]}';
    for (const raw of [deep, polluted, excessive]) {
      expect(previewReceiptMigration(raw)).toMatchObject({ status: 'invalid', reason: 'source-complexity', activationAuthorized: false });
    }
    const p = paid(1);
    const raw = JSON.stringify({ xp: 120, coins: 35, workouts: [{ ...p.workouts[0], id: '__proto__' }] });
    const result = previewReceiptMigration(raw);
    if (result.status !== 'preview-ready') throw Error(result.reason);
    expect(result.receipts[0].sessionId).toBe('__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('deterministic property sweep:""")
(a/'receiptCompatibility.ts.initial').write_bytes(raw)
(a/'receiptCompatibility.test.ts.initial').write_bytes(test)
assert p.read_bytes()==raw and q.read_bytes()==test
p.write_bytes(s.encode());q.write_bytes(t.encode())
for f in [p,q]: print(f, f.stat().st_size,hashlib.sha256(f.read_bytes()).hexdigest())