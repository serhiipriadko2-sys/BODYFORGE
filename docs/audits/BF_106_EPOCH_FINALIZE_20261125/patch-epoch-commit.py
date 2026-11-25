from pathlib import Path
from hashlib import sha256
a=Path('docs/audits/BF_106_EPOCH_FINALIZE_20261125')
paths=['src/lib/profileReplacement.ts','src/lib/profileReplacement.test.ts','src/lib/profileReplacementRecovery.ts','src/lib/profileReplacementRecovery.test.ts','qa/profile-replacement-e2e.mjs','qa/journal-gate-e2e.mjs']
known=['9ccd04d940b231cc59a5a09b03a363d6d78d367cc1e3154830b71f82229855b0','cd2437229f579a99bdaec08889967d1bcb82212cf8932009aded113049041001','a9ba8af214f95edda9ad3a49fed90e1d97971a46e97d9bbdad8e0c717a103b8e','c37e1bdfa47e94b3417349f141399fba889d824d88bbd7bad2c8c10044adefae']
old={f:Path(f).read_bytes() for f in paths}
for f,h in zip(paths,known):assert sha256(old[f]).hexdigest()==h,f
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
s=old[paths[0]].decode().replace('\r\n','\n')
s=once(s,"import { previewReceiptMigration } from './receiptCompatibility';","import { previewReceiptMigration } from './receiptCompatibility';\nimport { PROFILE_EPOCH_KEY, validProfileEpoch } from './profileEpoch';")
s=once(s,"  readonly pair: ProfilePair;\n  readonly auxiliary:", "  readonly pair: ProfilePair;\n  readonly epoch: Raw;\n  readonly auxiliary:")
s=once(s,"  readonly transactionId: string;\n  readonly before:", "  readonly transactionId: string;\n  readonly beforeEpoch: Raw;\n  readonly before:")
s=once(s,"return observed.sourcesReady === true && observed.pendingRecords === 0 &&", "return observed.sourcesReady === true && (observed.epoch === null || validProfileEpoch(observed.epoch)) && observed.pendingRecords === 0 &&")
s=once(s,"    transactionId,\n    before:", "    transactionId, beforeEpoch: observed.epoch,\n    before:")
s=once(s,"  if (bytes(markerFor(plan))", "  if (transactionId === observed.epoch) return blocked('transaction-id-reused');\n  if (bytes(markerFor(plan))")
s=once(s,"  version: 1;\n  transactionId: string;", "  version: 1 | 2;\n  transactionId: string;\n  beforeEpoch?: Raw;")
s=once(s,"return JSON.stringify({ version: 1, transactionId: plan.transactionId, before: plan.before, after: plan.after, auxiliary: plan.auxiliary });","return JSON.stringify({ version: 2, transactionId: plan.transactionId, beforeEpoch: plan.beforeEpoch, before: plan.before, after: plan.after, auxiliary: plan.auxiliary });")
s=once(s,"!record(v) || v.version !== 1 || typeof v.transactionId !== 'string' ||", "!record(v) || (v.version !== 1 && v.version !== 2) || !validProfileEpoch(v.transactionId) ||\n        (v.version === 2 && (v.beforeEpoch !== null && !validProfileEpoch(v.beforeEpoch) || v.beforeEpoch === v.transactionId)) ||")
s=once(s,"    const marker = { version: 1 as const, transactionId: v.transactionId, before: { primary: v.before.primary, backup: v.before.backup },", "    const marker: ReplacementMarker = { version: v.version, transactionId: v.transactionId,\n      ...(v.version === 2 ? { beforeEpoch: v.beforeEpoch as Raw } : {}),\n      before: { primary: v.before.primary, backup: v.before.backup },")
s=once(s,"type Key = typeof STORAGE_KEY | typeof PROFILE_BACKUP_KEY | typeof PROFILE_REPLACEMENT_MARKER_KEY;", "type Key = typeof STORAGE_KEY | typeof PROFILE_BACKUP_KEY | typeof PROFILE_REPLACEMENT_MARKER_KEY | typeof PROFILE_EPOCH_KEY;")
s=once(s,"function observeSafe(port: ReplacementPort, marker: ReplacementMarker, raw: string): ProfilePair | null {", """function originalEpoch(marker: ReplacementMarker): Raw { return marker.beforeEpoch ?? null; }
function matchingEpoch(observed: ReplacementObservation, marker: ReplacementMarker): boolean {
  return observed.epoch === originalEpoch(marker) ||
    (marker.version === 2 && observed.epoch === marker.transactionId && pairEqual(observed.pair, marker.after));
}
function observeSafe(port: ReplacementPort, marker: ReplacementMarker, raw: string): ProfilePair | null {""")
s=once(s,"    && matchingPrefix(observed.pair, marker) ? observed.pair : null;", "    && matchingPrefix(observed.pair, marker) && matchingEpoch(observed, marker) ? observed.pair : null;")
s=once(s,"    if (pair.primary !== marker.before.primary) {", """    if (port.observe().epoch !== originalEpoch(marker)) {
      port.set(PROFILE_EPOCH_KEY, originalEpoch(marker));
      pair = observeSafe(port, marker, raw);
      if (!pair || port.observe().epoch !== originalEpoch(marker)) return { status: 'recovery-required', reason: 'rollback-epoch' };
    }
    if (pair.primary !== marker.before.primary) {""")
s=once(s,"      pairEqual(final.pair, marker.before)\n      ?", "      pairEqual(final.pair, marker.before) && final.epoch === originalEpoch(marker)\n      ?")
s=once(s,"          pairEqual(final.pair, marker.before)) return { status: 'rolled-back' };", "          pairEqual(final.pair, marker.before) && final.epoch === originalEpoch(marker)) return { status: 'rolled-back' };")
s=once(s,"    if (!quiet(current) || !pairEqual(current.pair, marker.before) ||", "    if (!quiet(current) || current.epoch !== originalEpoch(marker) || !pairEqual(current.pair, marker.before) ||")
s=once(s,"      if (found === null && quiet(current) && pairEqual(current.pair, marker.before) &&", "      if (found === null && quiet(current) && current.epoch === originalEpoch(marker) && pairEqual(current.pair, marker.before) &&")
s=once(s,"    if (!marker || !safeTransition(marker.before, marker.after))", "    if (!marker || marker.version !== 2 || !safeTransition(marker.before, marker.after))")
s=once(s,"    try { port.set(PROFILE_REPLACEMENT_MARKER_KEY, null); }", """    // Commit generation first, keeping the exact marker until read-back.
    // If interrupted, the applied pair + transaction epoch is a known prefix.
    if (port.observe().epoch !== marker.transactionId) {
      try { port.set(PROFILE_EPOCH_KEY, marker.transactionId); }
      catch { /* Check whether the operation took effect. */ }
      const rotated = observeSafe(port, marker, expectedMarker);
      if (!rotated || !pairEqual(rotated, marker.after) || port.observe().epoch !== marker.transactionId)
        return { status: 'recovery-required', reason: 'epoch-readback' };
    }
    try { port.set(PROFILE_REPLACEMENT_MARKER_KEY, null); }""")
s=once(s,"if (port.getMarker() === null && quiet(final) && pairEqual(final.pair, marker.after) &&", "if (port.getMarker() === null && quiet(final) && final.epoch === marker.transactionId && pairEqual(final.pair, marker.after) &&")
# Prior marker version never contains enough information for forward acceptance.
s=once(s,"    return pairEqual(pair, marker.after) ? 'applied' : 'staged';", "    return marker.version === 2 && pairEqual(pair, marker.after) ? 'applied' : 'staged';")
t=old[paths[1]].decode().replace('\r\n','\n')
t=once(t,"import { freshGame } from './game';","import { freshGame } from './game';\nimport { PROFILE_EPOCH_KEY as EPOCH } from './profileEpoch';")
t=once(t,"observe: () => ({ ...source, pair:", "observe: () => ({ ...source, epoch: values.get(EPOCH) ?? null, pair:")
t=once(t,"accepts a fully applied pair after reload, deleting only the exact marker","accepts a fully applied pair after reload, verifying epoch before deleting the marker")
t=once(t,"    expect(m.calls).toEqual([[MARKER, null]]);","    expect(m.values.get(EPOCH)).toBe(JSON.parse(marker).transactionId);\n    expect(m.calls).toEqual([[EPOCH, JSON.parse(marker).transactionId], [MARKER, null]]);")
t=once(t,"  it.each([\n    { ...initial, creditedWorkoutIds:", """  it('resumes interrupted epoch commit or restores the exact old epoch on rollback', () => {
    const oldEpoch = '11111111-1111-4111-8111-111111111111';
    for (const decision of ['keep','rollback'] as const) {
      const m=memory();m.values.set(EPOCH,oldEpoch);
      executeProfileReplacement(m.port,plan(m),'replace');
      const marker=m.port.getMarker()!;
      m.setFail((key)=>key===MARKER?'before':undefined);
      expect(finalizeProfileReplacement(m.port,marker,'keep').status).toBe('recovery-required');
      expect(m.port.getMarker()).toBe(marker);
      expect(m.values.get(EPOCH)).toBe(JSON.parse(marker).transactionId);
      expect(inspectProfileReplacement(m.port)).toBe('applied');
      m.setFail(()=>undefined);
      if(decision==='keep'){
        expect(finalizeProfileReplacement(m.port,marker,'keep').status).toBe('finalized');
        expect(m.values.get(EPOCH)).toBe(JSON.parse(marker).transactionId);
      }else{
        expect(rollbackProfileReplacement(m.port,marker,'rollback').status).toBe('rolled-back');
        original(m);expect(m.values.get(EPOCH)).toBe(oldEpoch);
      }
    }
  });
  it('never clears marker before confirmed epoch; stale or corrupt epoch blocks writes', () => {
    for (const bad of ['22222222-2222-4222-8222-222222222222','broken']) {
      const m=memory();executeProfileReplacement(m.port,plan(m),'replace');
      const marker=m.port.getMarker()!;m.values.set(EPOCH,bad);m.calls.length=0;
      expect(finalizeProfileReplacement(m.port,marker,'keep').status).not.toBe('finalized');
      expect(rollbackProfileReplacement(m.port,marker,'rollback').status).not.toBe('rolled-back');
      expect(m.calls).toHaveLength(0);expect(m.port.getMarker()).toBe(marker);
    }
  });
  it('old v1 marker remains rollback-only; no new lineage is inferred', () => {
    const m=memory();executeProfileReplacement(m.port,plan(m),'replace');
    const marker=JSON.parse(m.port.getMarker()!);
    marker.version=1;delete marker.beforeEpoch;
    const raw=JSON.stringify(marker);m.values.set(MARKER,raw);m.calls.length=0;
    expect(inspectProfileReplacement(m.port)).toBe('staged');
    expect(finalizeProfileReplacement(m.port,raw,'keep').status).toBe('blocked');
    expect(m.calls).toHaveLength(0);
    expect(rollbackProfileReplacement(m.port,raw,'rollback').status).toBe('rolled-back');original(m);
  });
  it.each([
    { ...initial, creditedWorkoutIds:""")
u=old[paths[2]].decode().replace('\r\n','\n')
u=once(u,"import { withProfileWriteLock } from './profileLock';","import { withProfileWriteLock } from './profileLock';\nimport { PROFILE_EPOCH_KEY } from './profileEpoch';")
u=once(u,"    pair: { primary: localStorage.getItem(STORAGE_KEY),", "    epoch: localStorage.getItem(PROFILE_EPOCH_KEY),\n    pair: { primary: localStorage.getItem(STORAGE_KEY),")
u=once(u,"key !== STORAGE_KEY && key !== PROFILE_BACKUP_KEY && key !== PROFILE_REPLACEMENT_MARKER_KEY", "key !== STORAGE_KEY && key !== PROFILE_BACKUP_KEY && key !== PROFILE_REPLACEMENT_MARKER_KEY && key !== PROFILE_EPOCH_KEY")
v=old[paths[3]].decode().replace('\r\n','\n')
v=once(v,"import { freshGame } from './game';","import { freshGame } from './game';\nimport { PROFILE_EPOCH_KEY as EPOCH } from './profileEpoch';")
v=once(v,"observe:()=>({pair:", "observe:()=>({epoch:values.get(EPOCH)??null,pair:")
v=once(v,"  it('rejects a stale confirmation before touching durable storage',async()=>{", """  it('keeps the new profile only after writing its epoch inside both exclusive locks',async()=>{
    const marker=stage();const tx=JSON.parse(marker).transactionId;
    expect(await restoreInterruptedReplacement(marker,'keep')).toEqual({status:'finalized'});
    expect(values.get(EPOCH)).toBe(tx);expect(values.has(MARKER)).toBe(false);
    expect(write.mock.calls.map(c=>c[0])).toEqual([EPOCH,MARKER]);
  });
  it('rejects a stale confirmation before touching durable storage',async()=>{""")
q=old[paths[4]].decode().replace('\r\n','\n')
q=once(q,"          pair:{primary:localStorage.getItem(p.STORAGE_KEY)", "          epoch:localStorage.getItem('bodyforge:pilot:v1:epoch'),\n          pair:{primary:localStorage.getItem(p.STORAGE_KEY)")
q=once(q,"    'accepted profile and fallback survive reload byte-for-byte without additional reward');", """    'accepted profile and fallback survive reload byte-for-byte without additional reward');
  check(await ev("localStorage.getItem('bodyforge:pilot:v1:epoch')")===JSON.parse(keepFixture.afterMarker).transactionId,
    'actual UI acceptance persists the exact new generation before reopening');""")
j=old[paths[5]].decode().replace('\r\n','\n')
j=once(j,"observe:()=>({pair:{primary:localStorage.getItem(p.STORAGE_KEY)", "observe:()=>({epoch:localStorage.getItem('bodyforge:pilot:v1:epoch'),pair:{primary:localStorage.getItem(p.STORAGE_KEY)")
updated=[s,t,u,v,q,j]
for f,data in old.items():
 with (a/(Path(f).name+'.before-epoch-commit')).open('xb') as out:out.write(data)
for f,data in old.items():assert Path(f).read_bytes()==data,f
for f,s in zip(paths,updated):
 p=Path(f);p.write_bytes(s.encode());print(f,p.stat().st_size,sha256(p.read_bytes()).hexdigest())