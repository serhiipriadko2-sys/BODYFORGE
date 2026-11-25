from pathlib import Path
from hashlib import sha256
p=Path('src/lib/receiptCompatibility.ts')
q=Path('src/lib/receiptCompatibility.test.ts')
a=Path('docs/audits/BF_105_RECEIPT_SCHEMA_20261124')
old=p.read_bytes(); oldtest=q.read_bytes()
assert sha256(old).hexdigest()=='d4086dee7d8b90b3e726ca402845beed8df4dbcf49a99235d51496749cb4f69e'
assert sha256(oldtest).hexdigest()=='584d5a8b0439b2c88e503062a3d44865a3d13d534fd6d1b333b4851cf1207d69'
assert sha256(Path('src/lib/workoutReceipt.ts').read_bytes()).hexdigest()=='0a4d55bc930aad4d0229b78ba351807838fc1beefb7d230e41a49b5d87b25a7f'
assert sha256(Path('src/lib/progression.ts').read_bytes()).hexdigest()=='666939a292869e188f9f64aad8ad4289c2a714594e1c2fa6a9e56249fa2934b1'
s=old.decode('utf-8').replace('\r\n','\n')
t=oldtest.decode('utf-8').replace('\r\n','\n')
def once(text,old,new):
    assert text.count(old)==1,old
    return text.replace(old,new)
s=once(s,"import { resultJournalEntry } from './workoutJournal';","import { resultJournalEntry } from './workoutJournal';\nimport { readWorkoutReceipt, type WorkoutReceipt as StoredWorkoutReceipt, type RewardGrant } from './workoutReceipt';")
start=s.index('export type WorkoutReceipt =')
end=s.index('\nfunction receiptId(',start)
s=s[:start]+"""// Read-only view of a completion, not another persisted schema.
// workoutReceipt.ts owns the actual versioned receipt and grant contract.
export type WorkoutReceiptView = Readonly<ReceiptCommon & CompletedUnits & (
  { provenance: 'legacy-v1'; completionReason: 'recorded-legacy'; recordedXp: number;
    receiptEvidence: 'missing'; recordedReceipt: null } |
  { provenance: 'profile-v1'; completionReason: 'recorded-legacy'; recordedXp: number;
    receiptEvidence: 'recognized' | 'opaque'; recordedReceipt: StoredWorkoutReceipt | null } |
  { provenance: 'journal-v1'; completionReason: 'target-reached'; recordedXp: null;
    receiptEvidence: 'unpaid-journal'; recordedReceipt: null }
)>;

/** Profile-scoped identity for reading evidence only; not an issuance ID. */
export function profileScopedGrantId(profileId: string | null, rewardId: string): string | null {
  return profileId === null ? null : JSON.stringify(['reward', profileId, rewardId]);
}
export interface RecordedGrantEvidence {
  readonly profileId: string | null;
  readonly scopedId: string | null;
  readonly provenance: 'local-profile-unverified';
  readonly grant: RewardGrant;
}
"""+s[end:]
s=once(s,'export function receiptFromJournal(input: unknown): WorkoutReceipt | null {','export function receiptFromJournal(input: unknown): WorkoutReceiptView | null {')
s=once(s,"  provenance: 'journal-v1', completionReason: 'target-reached', recordedXp: null };","  provenance: 'journal-v1', completionReason: 'target-reached', recordedXp: null,\n  receiptEvidence: 'unpaid-journal', recordedReceipt: null };")
s=once(s,'  readonly receipts: readonly WorkoutReceipt[];','  readonly receipts: readonly WorkoutReceiptView[];')
s=once(s,'  /** Old wallet is a balance, not a list of itemized grants. */\n  readonly grants: readonly [];','  /** Only explicitly recorded, recognized grant shapes in available history.\n   * A local file is not proof of a real workout or authority to award currency. */\n  readonly recordedGrants: readonly RecordedGrantEvidence[];')
s=once(s,'  const receipts: WorkoutReceipt[] = [];','  const receipts: WorkoutReceiptView[] = [];\n  const recordedGrants: RecordedGrantEvidence[] = [];')
s=once(s,"    receipts.push({ ...common(profileId, parsed.id, parsed.exerciseId ?? 'squat', parsed.mode ?? null, null,\n      parsed.durationMs, parsed.finishedAt, parsed.splitsMs), provenance: 'legacy-v1',\n    completionReason: 'recorded-legacy', recordedXp: parsed.xp });",
"""    const view = common(profileId, parsed.id, parsed.exerciseId ?? 'squat', parsed.mode ?? null, null,
      parsed.durationMs, parsed.finishedAt, parsed.splitsMs);
    const evidence = readWorkoutReceipt(parsed);
    if (own(rawWorkout, 'receipt')) {
      receipts.push({ ...view, provenance: 'profile-v1', completionReason: 'recorded-legacy',
        recordedXp: parsed.xp, receiptEvidence: evidence ? 'recognized' : 'opaque', recordedReceipt: evidence });
      for (const grant of evidence?.grants ?? []) recordedGrants.push({
        profileId, scopedId: profileScopedGrantId(profileId, grant.rewardId),
        provenance: 'local-profile-unverified', grant,
      });
    } else {
      receipts.push({ ...view, provenance: 'legacy-v1', completionReason: 'recorded-legacy',
        recordedXp: parsed.xp, receiptEvidence: 'missing', recordedReceipt: null });
    }""")
s=once(s,'    grants: [], grantsComplete: false, activationAuthorized: false,','    recordedGrants, grantsComplete: false, activationAuthorized: false,')
t=once(t,"import { legacySourceFromPreview, previewReceiptMigration, receiptFromJournal, rewardGrantId } from './receiptCompatibility';","import { legacySourceFromPreview, previewReceiptMigration, receiptFromJournal, profileScopedGrantId } from './receiptCompatibility';\nimport { readWorkoutReceipt } from './workoutReceipt';")
t=once(t,"afterEach(() => vi.unstubAllGlobals());","""function legacyRow(row: Profile['workouts'][number]) {
  const copy = { ...row };
  delete copy.receipt;
  return copy;
}
afterEach(() => vi.unstubAllGlobals());""")
t=once(t,"    expect(result.grants).toEqual([]);\n    expect(result.grantsComplete)","    expect(result.recordedGrants.map(e => e.grant)).toEqual(p.workouts.flatMap(w => readWorkoutReceipt(w)?.grants ?? []));\n    expect(result.recordedGrants.every(e => e.provenance === 'local-profile-unverified' && e.profileId === 'qa')).toBe(true);\n    expect(result.grantsComplete)")
t=once(t,"({ ...p.workouts[0], id: 'old-' + i })","({ ...legacyRow(p.workouts[0]), id: 'old-' + i })")
t=once(t,"    expect(result.grants).toEqual([]);\n    expect(result.receipts[0])","    expect(result.recordedGrants).toEqual([]);\n    expect(result.receipts[0])")
t=once(t,"completedUnits: 30, recordedXp: null, rewardPolicyVersion: null","completedUnits: 30, recordedXp: null, rewardPolicyVersion: null, receiptEvidence: 'unpaid-journal', recordedReceipt: null")
t=once(t,"ids.map(id => ({ ...p.workouts[0], id }))","ids.map(id => ({ ...legacyRow(p.workouts[0]), id }))")
t=once(t,"    expect(new Set(ids.flatMap(id => ['workout-base', 'tower', 'quest', 'login'].map(kind =>\n      rewardGrantId('qa', kind as 'workout-base' | 'tower' | 'quest' | 'login', id)))).size).toBe(ids.length * 4);\n    expect(rewardGrantId('a:b', 'tower', 'c')).not.toBe(rewardGrantId('a', 'tower', 'b:c'));",
"""    expect(new Set(ids.flatMap(id => ['workout-base', 'tower-first-clear'].map(kind =>
      profileScopedGrantId('qa', kind + ':' + id)))).size).toBe(ids.length * 2);
    expect(profileScopedGrantId('a:b', 'workout-base:c')).not.toBe(profileScopedGrantId('a', 'workout-base:b:c'));
    expect(profileScopedGrantId(null, 'workout-base:c')).toBeNull();""")
t=once(t,"[{ ...p.workouts[0], id: '__proto__' }]","[{ ...legacyRow(p.workouts[0]), id: '__proto__' }]")
t=once(t,"      expect(result.grants).toEqual([]);","      expect(result.recordedGrants.map(e => e.grant)).toEqual(p.workouts.flatMap(w => readWorkoutReceipt(w)?.grants ?? []));\n      expect(result.grantsComplete).toBe(false);")
t=once(t,"  it('deterministic property sweep:", """  it('projects only supported recorded receipts and keeps missing or opaque receipts reversible', () => {
    const p = paid(4);
    const rows = [p.workouts[0], legacyRow(p.workouts[1]),
      { ...p.workouts[2], receipt: { schemaVersion: 99, unknown: ['future'] } },
      { ...p.workouts[3], receipt: { schemaVersion: 1, workoutId: 'wrong' } }];
    const raw = JSON.stringify({ ...p, workouts: rows });
    const result = previewReceiptMigration(raw);
    if (result.status !== 'preview-ready') throw Error(result.reason);
    expect(result.receipts.map(r => r.receiptEvidence)).toEqual(['recognized', 'missing', 'opaque', 'opaque']);
    expect(result.recordedGrants.map(e => e.grant)).toEqual(readWorkoutReceipt(rows[0])!.grants);
    expect(result.recordedGrants.every(e => e.scopedId !== null && e.provenance === 'local-profile-unverified')).toBe(true);
    expect(result.profile.workouts).toEqual(rows);
    expect(legacySourceFromPreview(result)).toBe(raw);
    expect(result.activationAuthorized).toBe(false);
  });

  it('keeps both actual tower grants with no inferred historic payments', () => {
    const p = paid(1);
    const raw = JSON.stringify(p);
    const result = previewReceiptMigration(raw);
    if (result.status !== 'preview-ready') throw Error(result.reason);
    expect(result.recordedGrants.map(e => e.grant.sourceType)).toEqual(['workout-base', 'tower-first-clear']);
    expect(new Set(result.recordedGrants.map(e => e.scopedId)).size).toBe(2);
    expect(result.recordedGrants.map(e => [e.grant.xpDelta, e.grant.coinDelta])).toEqual([[120,35],[65,30]]);
    expect(result.grantsComplete).toBe(false);
    expect(result.activationAuthorized).toBe(false);
  });

  it('deterministic property sweep:""")
for file,data in [(a/'receiptCompatibility.ts.pre-consolidation',old),(a/'receiptCompatibility.test.ts.pre-consolidation',oldtest)]:
    with file.open('xb') as f: f.write(data)
assert p.read_bytes()==old and q.read_bytes()==oldtest
p.write_bytes(s.encode());q.write_bytes(t.encode())
for f in (p,q): print(f,f.stat().st_size,sha256(f.read_bytes()).hexdigest())