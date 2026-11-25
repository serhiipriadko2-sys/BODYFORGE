/** Local workout lineage. Missing epoch preserves the entire legacy protocol.
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
