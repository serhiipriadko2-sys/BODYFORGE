from pathlib import Path
from hashlib import sha256
a=Path('docs/audits/BF_107_HISTORY_RETENTION_20261125')
p=Path('src/lib/progression.ts')
r=Path('src/lib/profileReplacement.ts')
h=Path('src/lib/settledImportHistory.ts')
expected={p:'867842538d7ae45e8dcde484ebdacc74de0567f9bbff398ae94340d9e657ff94',
r:'6f9615cfbecc39a2c67fcb20e1d5469a614cbb20b4bcb02d680035642dc26ad2',
h:'8613771e5a00c0cc6bb5274cef213ddc2c3ced0e0a67a80e9873cbdb0b406ae0'}
old={f:f.read_bytes() for f in expected}
for f,sha in expected.items():assert sha256(old[f]).hexdigest()==sha,f
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
s=old[p].decode('utf-8').replace('\r\n','\n')
anchor='/** Acknowledges only this write'
idx=s.index(anchor)
s=s[:idx]+r'''
/** JSON structural equality: stored object field order is not a workout fact. */
function sameStoredValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) &&
    a.length === b.length && a.every((value, i) => sameStoredValue(value, b[i]));
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  return Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every(key => Object.prototype.hasOwnProperty.call(right, key) &&
      sameStoredValue(left[key], right[key]));
}

/** File replacement must not erase or rewrite any available original record.
 * Callers validate both full profile strings before using this predicate. */
export function preservesStoredWorkoutHistory(beforeRaw: string, afterRaw: string): boolean {
  try {
    const before: unknown = JSON.parse(beforeRaw), after: unknown = JSON.parse(afterRaw);
    if (!validProfileRoot(before) || !validProfileRoot(after)) return false;
    const next = new Map(after.workouts.map(row => [row.id, row]));
    return next.size === after.workouts.length && before.workouts.every(row =>
      validWorkoutId(row.id) && next.has(row.id) && sameStoredValue(row, next.get(row.id)));
  } catch { return false; }
}

/** Last 60 is a view limit, not a license to delete detailed originals.
 * When a write would cross the cap, keep the same v1 stored shape with an
 * uncapped array. The existing quota/read-back checks remain the hard boundary.
 * Never invent an old date, reissue a grant or adopt another fighter's rows. */
function prepareStoredProfile(profile: Profile, raw: string | null): { next: string; retained: boolean } | null {
  const normalized = parseProfile(profile);
  const prior: unknown = raw === null ? null : JSON.parse(raw);
  if (raw !== null && !validProfileRoot(prior)) return null;
  const priorRows = validProfileRoot(prior) ? prior.workouts : [];
  const recentIds = new Set(normalized.workouts.map(row => row.id));
  const retentionNeeded = profile.workouts.length > 60 || priorRows.length > 60 ||
    (priorRows.length === 60 && priorRows.some(row => !row || !recentIds.has(row.id)));
  if (!retentionNeeded) return { next: JSON.stringify(normalized), retained: false };
  if (validProfileRoot(prior) && 'profileId' in prior && prior.profileId !== undefined &&
      prior.profileId !== normalized.profileId) return null;

  const originals = new Map<string, { original: Workout; normalized: Workout }>();
  // Prior rows own their original metadata; the proposed view may have
  // normalized optional fields but cannot change facts under an existing ID.
  for (const source of [priorRows, profile.workouts]) {
    const seen = new Set<string>();
    for (const row of source) {
      const parsed = parseProfile({ xp: 0, coins: 0, workouts: [row] }).workouts[0];
      if (!parsed || !validWorkoutId(parsed.id) || seen.has(parsed.id)) return null;
      seen.add(parsed.id);
      const known = originals.get(parsed.id);
      if (known && !sameStoredValue(known.normalized, parsed)) return null;
      if (!known) originals.set(parsed.id, { original: row, normalized: parsed });
    }
  }

  // Keep recent order identical to the intended display and the remaining
  // supplied/prior order stable. Preserve original objects, including receipts.
  const ordered = new Set([...normalized.workouts.map(row => row.id),
    ...profile.workouts.map(row => row.id), ...priorRows.map(row => row.id)]);
  const workouts = Array.from(ordered, id => originals.get(id)!.original);
  const retained = { ...normalized, workouts };
  // A missing identity, lowered total or changed visible order must block.
  // Do not let the compatibility reader silently rebuild an authorization.
  if (!sameStoredValue(parseProfile(retained), normalized)) return null;
  return { next: JSON.stringify(retained), retained: true };
}
'''+s[idx:]
s=once(s,'    const next = JSON.stringify(parseProfile(profile));',"""    const prepared = prepareStoredProfile(profile, raw);
    if (!prepared) return { status: 'recovery-required' };
    const { next, retained } = prepared;""")
s=once(s,"    if (previous && JSON.stringify(previous) === next && decodeStoredProfile(localStorage.getItem(PROFILE_BACKUP_KEY))) {","""    const unchanged = previous && (retained && raw !== null
      ? sameStoredValue(JSON.parse(raw), JSON.parse(next))
      : JSON.stringify(previous) === next);
    if (unchanged && decodeStoredProfile(localStorage.getItem(PROFILE_BACKUP_KEY))) {""")
s=once(s,"      return raw === next || writeVerified(STORAGE_KEY, next)","""      if (retained && raw !== null) return { status: 'saved', revision: raw };
      return raw === next || writeVerified(STORAGE_KEY, next)""")
s=once(s,'    const backup = previous ? JSON.stringify(previous) : next;',"""    const backup = previous ? retained && raw !== null ? raw : JSON.stringify(previous) : next;""")
s=once(s,"    if (!writeVerified(STORAGE_KEY, JSON.stringify(restored))) return { ...state, status: 'unavailable' };","""    // Preserve uncapped originals on explicit restore, not merely the display view.
    const restoredRaw = source === 'backup' && backupRaw !== null &&
      JSON.parse(backupRaw).workouts.length > 60 ? backupRaw : JSON.stringify(restored);
    if (!writeVerified(STORAGE_KEY, restoredRaw)) return { ...state, status: 'unavailable' };""")
t=old[r].decode('utf-8').replace('\r\n','\n')
t=once(t,"PROFILE_REPLACEMENT_MARKER_KEY, parseProfile }", "PROFILE_REPLACEMENT_MARKER_KEY, parseProfile, preservesStoredWorkoutHistory }")
t=once(t,"if (!view || !view.profile.profileId || view.receipts.length > 60) return null;","if (!view || !view.profile.profileId) return null;")
t=once(t,"    if (!prior || !next || prior.profileId !== next.profileId ||\n        prior.game.highestClearedFloor > next.game.highestClearedFloor) return false;","""    if (!prior || !next || prior.profileId !== next.profileId ||
        prior.game.highestClearedFloor > next.game.highestClearedFloor ||
        after[slot] === null || !preservesStoredWorkoutHistory(raw, after[slot]!)) return false;""")
u=old[h].decode('utf-8').replace('\r\n','\n')
u=once(u,"const visible = new Map(view.profile.workouts.map(w => [w.id, w]));","const available = new Map(view.receipts.map(w => [w.sessionId, w]));")
u=once(u,"    const workout = visible.get(id);","    const workout = available.get(id);")
u=once(u,"    if (workout.durationMs !== result.durationMs || workout.repetitions !== result.repetitions ||\n        Date.parse(workout.finishedAt) !== Date.parse(result.finishedAt) ||\n        (workout.exerciseId ?? 'squat') !== (result.exerciseId ?? 'squat') ||\n        (workout.mode !== undefined && workout.mode !== result.mode) || workout.holdSeconds !== result.holdSeconds ||", """    if (workout.durationMs !== result.durationMs ||
        (workout.unit === 'reps' ? workout.completedUnits : 0) !== result.repetitions ||
        Date.parse(workout.finishedAt) !== Date.parse(result.finishedAt) ||
        workout.exerciseId !== (result.exerciseId ?? 'squat') ||
        (workout.mode !== null && workout.mode !== result.mode) ||
        (workout.unit === 'seconds' ? workout.completedUnits : undefined) !== result.holdSeconds ||""")
for f,b in old.items():
 with (a/(f.name+'.before')).open('xb') as out:out.write(b)
for f,b in old.items():assert f.read_bytes()==b
for f,content in [(p,s),(r,t),(h,u)]:
 f.write_bytes(content.encode('utf-8'));print(f,f.stat().st_size,sha256(f.read_bytes()).hexdigest())