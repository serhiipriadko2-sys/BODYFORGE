from pathlib import Path
from hashlib import sha256
p=Path('src/lib/profileReplacement.ts')
q=Path('src/lib/profileReplacement.test.ts')
a=Path('docs/audits/BF_106_REPLACE_CORE_20261125')
orig=p.read_bytes(); tests=q.read_bytes()
assert sha256(orig).hexdigest()=='b186134b82042f4c8bc331a32c168e76b5d29fb114703a84da37325d9afef62b'
assert sha256(tests).hexdigest()=='a628242a4ee2f6503a36bec91cdf6be9048d0bdf0cb37c82d9494caa7fa1ce9b'
s=orig.decode('utf-8').replace('\r\n','\n')
t=tests.decode('utf-8').replace('\r\n','\n')
def once(text,old,new):
 assert text.count(old)==1,old
 return text.replace(old,new)
s=once(s,'export interface ReplacementPlan {\n  readonly before:', 'export interface ReplacementPlan {\n  readonly transactionId: string;\n  readonly before:')
s=once(s,'  const plan: ReplacementPlan = Object.freeze({\n    before: Object.freeze({ ...observed.pair }), after: Object.freeze(after),',
'''  let transactionId: string;
  try { transactionId = crypto.randomUUID(); } catch { return blocked('transaction-id-unavailable'); }
  const plan: ReplacementPlan = Object.freeze({
    transactionId,
    before: Object.freeze({ primary: observed.pair.primary, backup: observed.pair.backup }), after: Object.freeze(after),''')
s=once(s,"  issuedPlans.add(plan);\n  if (bytes(markerFor(plan)) > MAX_PROGRESS_BACKUP_BYTES) return blocked('rollback-record-too-large');",
"  if (bytes(markerFor(plan)) > MAX_PROGRESS_BACKUP_BYTES) return blocked('rollback-record-too-large');\n  issuedPlans.add(plan);")
s=once(s,"interface ReplacementMarker {\n  version: 1;", "interface ReplacementMarker {\n  version: 1;\n  transactionId: string;")
s=once(s,'JSON.stringify({ version: 1, before: plan.before, after: plan.after, auxiliary: plan.auxiliary })',
'JSON.stringify({ version: 1, transactionId: plan.transactionId, before: plan.before, after: plan.after, auxiliary: plan.auxiliary })')
s=once(s,"if (!record(v) || v.version !== 1 || !pairShape(v.before) || !pairShape(v.after) ||",
"if (!record(v) || v.version !== 1 || typeof v.transactionId !== 'string' ||\n        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.transactionId) ||\n        !pairShape(v.before) || !pairShape(v.after) ||")
s=once(s,"const marker = { version: 1 as const, before:", "const marker = { version: 1 as const, transactionId: v.transactionId, before:")
s=once(s,"  } catch { return { status: 'recovery-required', reason: 'rollback-storage-failed' }; }",
'''  } catch {
    // The last remove may have taken effect before an adapter reported failure.
    try {
      const final = port.observe();
      if (port.getMarker() === null && quiet(final) && auxiliaryEqual(final.auxiliary, marker.auxiliary) &&
          pairEqual(final.pair, marker.before)) return { status: 'rolled-back' };
    } catch { /* no verified postcondition */ }
    return { status: 'recovery-required', reason: 'rollback-storage-failed' };
  }''')
t=once(t,"  it('blocks stale recovery confirmation and duplicate execution; supports exact no-op', () => {",
'''  it('distinguishes two transactions with identical before/after bytes (ABA)', () => {
    const m=memory(), first=plan(m);
    expect(executeProfileReplacement(m.port,first,'replace').status).toBe('applied-pending-finalization');
    const old=m.port.getMarker()!;
    expect(rollbackProfileReplacement(m.port,old,'rollback').status).toBe('rolled-back');
    const second=plan(m);
    expect(second.transactionId).not.toBe(first.transactionId);
    expect(executeProfileReplacement(m.port,second,'replace').status).toBe('applied-pending-finalization');
    const count=m.calls.length;
    expect(rollbackProfileReplacement(m.port,old,'rollback').status).toBe('conflict');
    expect(m.calls).toHaveLength(count);
    expect(rollbackProfileReplacement(m.port,m.port.getMarker()!,'rollback').status).toBe('rolled-back');
    original(m);
  });
  it('verifies rollback even if final marker removal throws after its effect', () => {
    const m=memory(),p=plan(m);
    executeProfileReplacement(m.port,p,'replace');
    m.setFail((key,value)=>key===MARKER&&value===null?'after':undefined);
    expect(rollbackProfileReplacement(m.port,m.port.getMarker()!,'rollback').status).toBe('rolled-back');
    original(m);
  });
  it('blocks stale recovery confirmation and duplicate execution; supports exact no-op', () => {''')
for f,data in [(a/'profileReplacement.ts.initial',orig),(a/'profileReplacement.test.ts.initial',tests)]:
 with f.open('xb') as o: o.write(data)
assert p.read_bytes()==orig and q.read_bytes()==tests
p.write_bytes(s.encode());q.write_bytes(t.encode())
for f in (p,q):print(f,f.stat().st_size,sha256(f.read_bytes()).hexdigest())