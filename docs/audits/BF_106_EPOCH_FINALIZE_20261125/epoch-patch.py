from pathlib import Path
from hashlib import sha256
root=Path.cwd();a=root/'docs/audits/BF_106_EPOCH_FINALIZE_20261125'
expected={'src/lib/progression.ts':'506af091eaf3fac1c893e087926c4dd72a7b7e73345bbaa9605a3cf977353e34','src/lib/workoutJournal.ts':'77d4e32f79403f294a86f71378f6065d889e797a2c2ae98cb11b28dee2fefc70','src/lib/durableWorkout.ts':'ef70634a334699d18cf381ff118cb e5634f82b206e23da6ba7849a1a35696249'.replace(' ','')}
raw={p:(root/p).read_bytes() for p in expected}
for p,h in expected.items():assert sha256(raw[p]).hexdigest()==h,p
module='''/** Local workout lineage. Missing epoch preserves the entire legacy protocol.
 * Epoch activation belongs to explicit import finalization, never parsing.
 * It is not anti-cheat/authentication and must not be inferred from a timestamp.
 */
export const PROFILE_EPOCH_KEY = 'bodyforge:pilot:v1:epoch';
export function validProfileEpoch(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}
/** Throw on malformed/unreadable metadata; never silently reset its lineage. */
export function readProfileEpoch(): string | null {
  const raw = localStorage.getItem(PROFILE_EPOCH_KEY);
  if (raw !== null && !validProfileEpoch(raw)) throw Error('Invalid profile epoch');
  return raw;
}
export function sessionIdForEpoch(nonce: string, epoch: string | null): string {
  return epoch === null ? nonce : `epoch:${epoch}:${nonce}`;
}
/** Already-credited IDs are handled before this predicate, without new rewards. */
export function sessionMatchesEpoch(sessionId: string, epoch: string | null): boolean {
  if (epoch === null) return true;
  const prefix = `epoch:${epoch}:`;
  return sessionId.startsWith(prefix) && sessionId.length > prefix.length;
}
'''
new=root/'src/lib/profileEpoch.ts';assert not new.exists()
s={p:b.decode('utf-8').replace('\r\n','\n') for p,b in raw.items()}
def once(p,old,new):
 assert s[p].count(old)==1,(p,old)
 s[p]=s[p].replace(old,new)
p='src/lib/progression.ts'
once(p,"import { readWorkoutReceipt, recordWorkoutReceipt } from './workoutReceipt';","import { readWorkoutReceipt, recordWorkoutReceipt } from './workoutReceipt';\nimport { readProfileEpoch } from './profileEpoch';")
once(p,"function readUsablePrimary(): string | null {\n  if (profileReplacementPending()) throw Error('Replacement pending');","function readUsablePrimary(): string | null {\n  if (profileReplacementPending()) throw Error('Replacement pending');\n  readProfileEpoch(); // Corrupt lineage cannot authorize writes or rewards.")
p='src/lib/workoutJournal.ts'
once(p,"import { isExerciseId, type ExerciseId } from './trainingCatalog';","import { isExerciseId, type ExerciseId } from './trainingCatalog';\nimport { readProfileEpoch, sessionIdForEpoch, sessionMatchesEpoch } from './profileEpoch';")
once(p,"result.mode !== 'tower' || state.profile.game.highestClearedFloor + 1 === result.floor)) return { status: 'conflict', state };","(sessionMatchesEpoch(result.sessionId, readProfileEpoch()) &&\n            (result.mode !== 'tower' || state.profile.game.highestClearedFloor + 1 === result.floor)))) return { status: 'conflict', state };")
once(p,"  if (!state.profile.game.created || !['training', 'tower', 'ghost'].includes(mode)","  let epoch: string | null;\n  try { epoch = readProfileEpoch(); } catch { return { status: 'unavailable', state }; }\n  if (!state.profile.game.created || !['training', 'tower', 'ghost'].includes(mode)")
once(p,"sessionId: newId(), mode,","sessionId: sessionIdForEpoch(newId(), epoch), mode,")
once(p,"    if (!credited) {\n      if (r.mode === 'tower'", "    if (!credited) {\n      // Late pre-import results remain exact and exportable, but cannot refill\n      // a replaced wallet. Explicit quarantine may resolve that mismatch.\n      let epoch: string | null;\n      try { epoch = readProfileEpoch(); } catch { return { status: 'unavailable', state: current }; }\n      if (!sessionMatchesEpoch(r.sessionId, epoch)) { issue = 'mismatch'; continue; }\n      if (r.mode === 'tower'")
p='src/lib/durableWorkout.ts'
once(p,"import { loadProfileState, type ProfileLoadResult } from './progression';","import { loadProfileState, type ProfileLoadResult } from './progression';\nimport { readProfileEpoch, sessionMatchesEpoch } from './profileEpoch';")
once(p,"loadProfileState().profile.profileId !== result.profileId || credited(loadProfileState(), result))) continue;","loadProfileState().profile.profileId !== result.profileId || credited(loadProfileState(), result) ||\n          !sessionMatchesEpoch(result.sessionId, readProfileEpoch()))) continue;")
once(p,"(credited(state, result) || result.mode !== 'tower' || state.profile.game.highestClearedFloor + 1 === result.floor))) return failed('conflict');","(credited(state, result) || (sessionMatchesEpoch(result.sessionId, readProfileEpoch()) &&\n        (result.mode !== 'tower' || state.profile.game.highestClearedFloor + 1 === result.floor))))) return failed('conflict');")
for p,b in raw.items():assert (root/p).read_bytes()==b,p
with new.open('x',encoding='utf-8',newline='\n') as f:f.write(module)
for p,text in s.items():(root/p).write_bytes(text.encode('utf-8'))
for p in [*s,'src/lib/profileEpoch.ts']:
 f=root/p;print(p,f.stat().st_size,sha256(f.read_bytes()).hexdigest())