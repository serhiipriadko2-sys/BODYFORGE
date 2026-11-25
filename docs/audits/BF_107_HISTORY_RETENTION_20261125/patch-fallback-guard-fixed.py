from pathlib import Path
from hashlib import sha256
a=Path('docs/audits/BF_107_HISTORY_RETENTION_20261125')
p=Path('src/lib/progression.ts')
old=p.read_bytes()
assert sha256(old).hexdigest()=='1083bc29f8621ebc598c2918f87df2d1eb47e3b0928a8943910014213c453c31'
s=old.decode('utf-8').replace('\r\n','\n')
def once(x,y):
 global s
 assert s.count(x)==1,x
 s=s.replace(x,y)
once("""    const next = new Map(after.workouts.map(row => [row.id, row]));
    return next.size === after.workouts.length && before.workouts.every(row =>
      validWorkoutId(row.id) && next.has(row.id) && sameStoredValue(row, next.get(row.id)));""","""    const next = new Map(after.workouts.map(row => [row.id, row]));
    const seen = new Set<string>();
    return next.size === after.workouts.length && before.workouts.every(row => {
      if (!row || !validWorkoutId(row.id) || seen.has(row.id)) return false;
      seen.add(row.id);
      return next.has(row.id) && sameStoredValue(row, next.get(row.id));
    });""")
once("""    (priorRows.length === 60 && priorRows.some(row => !row || !recentIds.has(row.id)));""","""    ((priorRows.length === 60 || normalized.workouts.length === 60) &&
      priorRows.some(row => !row || !recentIds.has(row.id)));""")
once("""function writeVerified(key: string, raw: string): boolean {
  localStorage.setItem(key, raw);
  return localStorage.getItem(key) === raw;
}""","""function writeVerified(key: string, raw: string): boolean {
  localStorage.setItem(key, raw);
  return localStorage.getItem(key) === raw;
}

/** Opaque recovery evidence; never merged into a current wallet. */
function preserveProfileOriginal(raw: string): boolean {
  for (let index = 0; index < 1000; index += 1) {
    const key = QUARANTINE_PREFIX + index;
    const existing = localStorage.getItem(key);
    if (existing === raw) return true;
    if (existing === null) return writeVerified(key, raw);
  }
  return false;
}

function hasDetailedHistory(raw: string | null): raw is string {
  if (raw === null) return false;
  try {
    const value: unknown = JSON.parse(raw);
    return validProfileRoot(value) && value.workouts.length >= 60;
  } catch { return false; }
}""")
once("""    const backup = previous ? retained && raw !== null ? raw : JSON.stringify(previous) : next;
    // Preserve a validated fallback before touching the primary; quota/no-op failures fail closed.
    if (!writeVerified(PROFILE_BACKUP_KEY, backup)) return { status: 'unavailable' };""","""    const backup = previous ? (retained && raw !== null ? raw : JSON.stringify(previous)) : next;
    const oldBackup = localStorage.getItem(PROFILE_BACKUP_KEY);
    // An older fallback may be the last surviving copy of dates/receipts.
    // Preserve its exact bytes separately rather than adopting stale balances.
    if (hasDetailedHistory(oldBackup) && oldBackup !== backup &&
        !preservesStoredWorkoutHistory(oldBackup, backup) &&
        !preservesStoredWorkoutHistory(oldBackup, next) &&
        !preserveProfileOriginal(oldBackup)) return { status: 'unavailable' };
    if (readUsablePrimary() !== raw || localStorage.getItem(PROFILE_BACKUP_KEY) !== oldBackup)
      return { status: 'conflict' };
    // Preserve a validated fallback before touching the primary; quota/no-op failures fail closed.
    if (!writeVerified(PROFILE_BACKUP_KEY, backup)) return { status: 'unavailable' };""")
once("""    if (original !== null) {
      let preserved = false;
      for (let index = 0; index < 1000; index += 1) {
        const key = `${QUARANTINE_PREFIX}${index}`;
        const existing = localStorage.getItem(key);
        if (existing === original) { preserved = true; break; }
        if (existing === null) { preserved = writeVerified(key, original); break; }
      }
      if (!preserved) return { ...state, status: 'unavailable' };
    }""","""    if (original !== null && !preserveProfileOriginal(original))
      return { ...state, status: 'unavailable' };
    if (source === 'empty' && hasDetailedHistory(backupRaw) && backupRaw !== original &&
        !preserveProfileOriginal(backupRaw)) return { ...state, status: 'unavailable' };""")
once("""    if (readUsablePrimary() !== raw) return loadProfileState();
    // Preserve uncapped originals""","""    if (readUsablePrimary() !== raw || localStorage.getItem(PROFILE_BACKUP_KEY) !== backupRaw)
      return loadProfileState();
    // Preserve uncapped originals""")
with (a/'progression.ts.before-fallback-guard').open('xb') as f:f.write(old)
assert p.read_bytes()==old
p.write_bytes(s.encode())
print(p,p.stat().st_size,sha256(p.read_bytes()).hexdigest())
with (a/'ADR.md').open('a',encoding='utf-8') as f:
 f.write('\nAmendment: if rotation would erase a detailed fallback (60 or more rows) that is not retained in either new slot, preserve the exact original in the existing exportable profile quarantine first. If that fails, do not rotate or save. Explicit fresh start retains a distinct detailed fallback as well. No automatic merge. This protection is not recovery of dates already absent from every available source.\n')