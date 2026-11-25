import { STORAGE_KEY, PROFILE_BACKUP_KEY, PROFILE_REPLACEMENT_MARKER_KEY, parseProfile } from './progression';
import { MAX_PROGRESS_BACKUP_BYTES } from './progressBackupInspector';
import { inspectImportProfile, previewProgressImportJson } from './progressImportPreview';
import { previewReceiptMigration } from './receiptCompatibility';
import { PROFILE_EPOCH_KEY, validProfileEpoch } from './profileEpoch';

/**
 * BF-106 replacement core, NOT wired to the app or its storage hook yet.
 * Caller must acquire the existing exclusive profile lock and observe all
 * relevant stores under it. No browser-global storage or reward APIs here.
 * Until startup recovery and retention gates exist, use disposable QA only.
 */
export { PROFILE_REPLACEMENT_MARKER_KEY } from './progression';
type Raw = string | null;
export interface ProfilePair { readonly primary: Raw; readonly backup: Raw }
type Auxiliary = Readonly<Record<'avatarLook' | 'appearance' | 'manualSteps' | 'dailyPlan', Raw>>;
const AUX_KEYS = ['avatarLook', 'appearance', 'manualSteps', 'dailyPlan'] as const;

/** A read-back snapshot, not proof of consent. No omitted source is assumed empty. */
export interface ReplacementObservation {
  readonly pair: ProfilePair;
  readonly epoch: Raw;
  readonly auxiliary: Auxiliary;
  readonly sourcesReady: boolean;
  readonly pendingRecords: number;
  readonly durableRecords: number;
  readonly quarantineRecords: number;
}
export interface ReplacementPlan {
  readonly transactionId: string;
  readonly beforeEpoch: Raw;
  readonly before: ProfilePair;
  readonly after: ProfilePair;
  readonly auxiliary: Auxiliary;
}
// Revalidate raw strings on recovery: the marker survives a renderer restart.
function supportedProfile(raw: string) {
  const view = inspectImportProfile(raw);
  if (!view || !view.profile.profileId || view.receipts.length > 60) return null;
  const known = ['schemaVersion','xp','coins','workouts','game','profileId','creditedWorkoutIds','totals'];
  if (Object.keys(JSON.parse(raw)).some(key => !known.includes(key))) return null;
  if (view.ledgerEvidence !== 'stored-identities' &&
      (view.receipts.length || view.profile.totals?.workouts)) return null;
  return view.profile;
}

function safeTransition(before: ProfilePair, after: ProfilePair): boolean {
  if (!after.primary || (before.primary === null && before.backup !== null)) return false;
  const primary = supportedProfile(after.primary);
  if (!primary) return false;
  for (const slot of ['primary','backup'] as const) {
    const next = slot === 'primary' ? primary : after.backup && supportedProfile(after.backup);
    if (after[slot] !== null && (!next || next.profileId !== primary.profileId)) return false;
    const raw = before[slot];
    if (raw === null) continue;
    const prior = supportedProfile(raw);
    if (!prior || !next || prior.profileId !== next.profileId ||
        prior.game.highestClearedFloor > next.game.highestClearedFloor) return false;
    const ids = new Set(next.creditedWorkoutIds);
    if (prior.creditedWorkoutIds?.some(id => !ids.has(id))) return false;
    for (const [days, last] of [['claimedLoginDays','lastLoginDay'], ['claimedQuestDays','lastQuestClaimDay']] as const) {
      const claimed = new Set([...(next.game[days] ?? []), next.game[last]]);
      if ([...(prior.game[days] ?? []), prior.game[last]].some(day => day !== null && !claimed.has(day))) return false;
    }
  }
  return true;
}

export type PlanResult = { status: 'planned'; plan: ReplacementPlan } |
  { status: 'blocked'; reason: string };

const bytes = (raw: string) => new TextEncoder().encode(raw).byteLength;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const rawValue = (v: unknown): v is Raw => v === null || typeof v === 'string';
const pairEqual = (a: ProfilePair, b: ProfilePair) => a.primary === b.primary && a.backup === b.backup;
const auxiliaryEqual = (a: Auxiliary, b: Auxiliary) => AUX_KEYS.every(k => a[k] === b[k]);
function quiet(observed: ReplacementObservation): boolean {
  return observed.sourcesReady === true && (observed.epoch === null || validProfileEpoch(observed.epoch)) && observed.pendingRecords === 0 &&
    observed.durableRecords === 0 && observed.quarantineRecords === 0 &&
    AUX_KEYS.every(k => rawValue(observed.auxiliary[k]));
}
function blocked(reason: string): PlanResult { return { status: 'blocked', reason }; }

/** Deliberately narrow pilot: profile pair only, no journal/auxiliary merge.
 * Incoming and current sources with even settled journal records require a
 * separate replay-safe plan. Old records are never normalized before writing. */
export function planProfileReplacement(json: string, observed: ReplacementObservation): PlanResult {
  if (!quiet(observed)) return blocked('current-sources-not-quiet');
  const current = observed.pair.primary === null ? parseProfile(null) : (() => {
    const view = previewReceiptMigration(observed.pair.primary!);
    return view.status === 'preview-ready' ? view.profile : null;
  })();
  if (!current || (observed.pair.primary === null && observed.pair.backup !== null)) {
    return blocked('current-recovery-required');
  }
  const preview = previewProgressImportJson(json, current);
  if (preview.state !== 'preview-ready') return blocked('incoming-not-compatible');
  const data = JSON.parse(json) as Record<string, unknown>;
  if (preview.inspection.journalRecords || preview.inspection.durableRecords || preview.inspection.quarantineRecords ||
      data.pendingResult != null || (data.pendingResults !== undefined &&
        (!Array.isArray(data.pendingResults) || data.pendingResults.length))) return blocked('incoming-journal-not-empty');
  const aux = data.storedAuxiliaryRaw as Auxiliary;
  if (!auxiliaryEqual(observed.auxiliary, aux)) return blocked('auxiliary-replacement-unsupported');
  if (observed.pair.primary !== null && preview.identity !== 'same') return blocked('identity-not-confirmed');
  const after = { primary: data.storedProfileRaw as string, backup: data.storedBackupRaw as Raw };
  if (!safeTransition(observed.pair, after)) return blocked('history-or-identity-unsupported');
  let transactionId: string;
  try { transactionId = crypto.randomUUID(); } catch { return blocked('transaction-id-unavailable'); }
  const plan: ReplacementPlan = Object.freeze({
    transactionId, beforeEpoch: observed.epoch,
    before: Object.freeze({ primary: observed.pair.primary, backup: observed.pair.backup }), after: Object.freeze(after),
    auxiliary: Object.freeze(Object.fromEntries(AUX_KEYS.map(k => [k, aux[k]])) as Auxiliary),
  });
  if (transactionId === observed.epoch) return blocked('transaction-id-reused');
  if (bytes(markerFor(plan)) > MAX_PROGRESS_BACKUP_BYTES) return blocked('rollback-record-too-large');
  issuedPlans.add(plan);
  return { status: 'planned', plan };
}

const issuedPlans = new WeakSet<ReplacementPlan>();
interface ReplacementMarker {
  version: 1 | 2;
  transactionId: string;
  beforeEpoch?: Raw;
  before: ProfilePair;
  after: ProfilePair;
  auxiliary: Auxiliary;
}
function markerFor(plan: ReplacementPlan): string {
  return JSON.stringify({ version: 2, transactionId: plan.transactionId, beforeEpoch: plan.beforeEpoch, before: plan.before, after: plan.after, auxiliary: plan.auxiliary });
}
function pairShape(v: unknown): v is ProfilePair {
  return record(v) && Object.keys(v).length === 2 && rawValue(v.primary) && rawValue(v.backup);
}
function markerFrom(raw: string): ReplacementMarker | null {
  if (raw.length > MAX_PROGRESS_BACKUP_BYTES || bytes(raw) > MAX_PROGRESS_BACKUP_BYTES) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!record(v) || (v.version !== 1 && v.version !== 2) || !validProfileEpoch(v.transactionId) ||
        (v.version === 2 && (v.beforeEpoch !== null && !validProfileEpoch(v.beforeEpoch) || v.beforeEpoch === v.transactionId)) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.transactionId) ||
        !pairShape(v.before) || !pairShape(v.after) ||
        typeof v.after.primary !== 'string' || !record(v.auxiliary) ||
        !AUX_KEYS.every(k => rawValue((v.auxiliary as Record<string, unknown>)[k])) ||
        Object.keys(v.auxiliary).length !== AUX_KEYS.length) return null;
    const marker: ReplacementMarker = { version: v.version, transactionId: v.transactionId,
      ...(v.version === 2 ? { beforeEpoch: v.beforeEpoch as Raw } : {}),
      before: { primary: v.before.primary, backup: v.before.backup },
      after: { primary: v.after.primary, backup: v.after.backup },
      auxiliary: Object.fromEntries(AUX_KEYS.map(k => [k, (v.auxiliary as Record<string, unknown>)[k]])) as Auxiliary };
    // Only our exact canonical serialization; reject duplicate/injected fields.
    if (JSON.stringify(marker) !== raw) return null;
    return marker;
  } catch { return null; }
}

type Key = typeof STORAGE_KEY | typeof PROFILE_BACKUP_KEY | typeof PROFILE_REPLACEMENT_MARKER_KEY | typeof PROFILE_EPOCH_KEY;
export interface ReplacementPort {
  /** Must be called inside the same exclusive lock for the entire operation. */
  observe(): ReplacementObservation;
  getMarker(): Raw;
  set(key: Key, value: Raw): void;
}
export type ReplacementResult =
  | { status: 'cancelled' | 'unchanged' | 'applied-pending-finalization' | 'rolled-back' | 'finalized' }
  | { status: 'blocked' | 'conflict' | 'recovery-required' | 'unavailable'; reason: string };

function intermediate(m: ReplacementMarker): ProfilePair {
  return { primary: m.before.primary, backup: m.after.backup };
}
function matchingPrefix(pair: ProfilePair, m: ReplacementMarker): boolean {
  return pairEqual(pair, m.before) || pairEqual(pair, intermediate(m)) || pairEqual(pair, m.after);
}
function originalEpoch(marker: ReplacementMarker): Raw { return marker.beforeEpoch ?? null; }
function matchingEpoch(observed: ReplacementObservation, marker: ReplacementMarker): boolean {
  return observed.epoch === originalEpoch(marker) ||
    (marker.version === 2 && observed.epoch === marker.transactionId && pairEqual(observed.pair, marker.after));
}
function observeSafe(port: ReplacementPort, marker: ReplacementMarker, raw: string): ProfilePair | null {
  const observed = port.observe();
  return port.getMarker() === raw && quiet(observed) && auxiliaryEqual(observed.auxiliary, marker.auxiliary)
    && matchingPrefix(observed.pair, marker) && matchingEpoch(observed, marker) ? observed.pair : null;
}

/** Exact reverse-order rollback, including interrupted rollback. Never overwrite
 * an unrelated revision, never discard the marker before original read-back. */
function rollback(port: ReplacementPort, marker: ReplacementMarker, raw: string): ReplacementResult {
  try {
    let pair = observeSafe(port, marker, raw);
    if (!pair) return { status: 'recovery-required', reason: 'rollback-conflict' };
    if (port.observe().epoch !== originalEpoch(marker)) {
      port.set(PROFILE_EPOCH_KEY, originalEpoch(marker));
      pair = observeSafe(port, marker, raw);
      if (!pair || port.observe().epoch !== originalEpoch(marker)) return { status: 'recovery-required', reason: 'rollback-epoch' };
    }
    if (pair.primary !== marker.before.primary) {
      port.set(STORAGE_KEY, marker.before.primary);
      pair = observeSafe(port, marker, raw);
      if (!pair || pair.primary !== marker.before.primary) return { status: 'recovery-required', reason: 'rollback-primary' };
    }
    if (pair.backup !== marker.before.backup) port.set(PROFILE_BACKUP_KEY, marker.before.backup);
    pair = observeSafe(port, marker, raw);
    if (!pair || !pairEqual(pair, marker.before)) return { status: 'recovery-required', reason: 'rollback-readback' };
    port.set(PROFILE_REPLACEMENT_MARKER_KEY, null);
    const final = port.observe();
    return port.getMarker() === null && quiet(final) && auxiliaryEqual(final.auxiliary, marker.auxiliary) &&
      pairEqual(final.pair, marker.before) && final.epoch === originalEpoch(marker)
      ? { status: 'rolled-back' } : { status: 'recovery-required', reason: 'rollback-final-readback' };
  } catch {
    // The last remove may have taken effect before an adapter reported failure.
    try {
      const final = port.observe();
      if (port.getMarker() === null && quiet(final) && auxiliaryEqual(final.auxiliary, marker.auxiliary) &&
          pairEqual(final.pair, marker.before) && final.epoch === originalEpoch(marker)) return { status: 'rolled-back' };
    } catch { /* no verified postcondition */ }
    return { status: 'recovery-required', reason: 'rollback-storage-failed' };
  }
}

/** Explicit decision is mandatory; this parameter is not a UI permission
 * boundary. It is only tested in isolation until app integration exists.
 * Success retains the exact rollback record; normal app writes must NOT run
 * until a future startup/finalization gate has resolved it. */
export function executeProfileReplacement(port: ReplacementPort, plan: ReplacementPlan,
  decision: 'replace' | 'cancel'): ReplacementResult {
  if (decision !== 'replace') return { status: 'cancelled' };
  if (!issuedPlans.has(plan)) return { status: 'blocked', reason: 'unissued-plan' };
  const raw = markerFor(plan), marker = markerFrom(raw);
  if (!marker) return { status: 'blocked', reason: 'marker-invalid' };
  let attemptedStage = false;
  try {
    if (port.getMarker() !== null) return { status: 'recovery-required', reason: 'existing-marker' };
    const current = port.observe();
    if (!quiet(current) || current.epoch !== originalEpoch(marker) || !pairEqual(current.pair, marker.before) ||
        !auxiliaryEqual(current.auxiliary, marker.auxiliary)) return { status: 'conflict', reason: 'stale-observation' };
    if (pairEqual(marker.before, marker.after)) return { status: 'unchanged' };
    attemptedStage = true;
    port.set(PROFILE_REPLACEMENT_MARKER_KEY, raw);
    let pair = observeSafe(port, marker, raw);
    if (!pair || !pairEqual(pair, marker.before)) throw Error('stage-readback');
    if (pair.backup !== marker.after.backup) port.set(PROFILE_BACKUP_KEY, marker.after.backup);
    pair = observeSafe(port, marker, raw);
    if (!pair || !pairEqual(pair, intermediate(marker))) throw Error('backup-readback');
    if (pair.primary !== marker.after.primary) port.set(STORAGE_KEY, marker.after.primary);
    pair = observeSafe(port, marker, raw);
    if (!pair || !pairEqual(pair, marker.after)) throw Error('primary-readback');
    return { status: 'applied-pending-finalization' };
  } catch {
    // A write may have succeeded despite the caller observing a failure.
    // Inspect exact marker and observed pair; never assume failure = no effect.
    if (!attemptedStage) return { status: 'unavailable', reason: 'preflight-read-failed' };
    try {
      const found = port.getMarker();
      if (found === raw) return rollback(port, marker, raw);
      const current = port.observe();
      if (found === null && quiet(current) && current.epoch === originalEpoch(marker) && pairEqual(current.pair, marker.before) &&
          auxiliaryEqual(current.auxiliary, marker.auxiliary)) return { status: 'unavailable', reason: 'stage-not-written' };
    } catch { /* uncertainty remains explicit */ }
    return { status: 'recovery-required', reason: 'stage-or-state-unknown' };
  }
}

export type ReplacementState = 'none' | 'staged' | 'applied' | 'conflict' | 'unavailable';
export function inspectProfileReplacement(port: ReplacementPort): ReplacementState {
  try {
    const raw = port.getMarker();
    if (raw === null) return 'none';
    const marker = markerFrom(raw);
    if (!marker) return 'conflict';
    const pair = observeSafe(port, marker, raw);
    if (!pair) return 'conflict';
    return marker.version === 2 && pairEqual(pair, marker.after) ? 'applied' : 'staged';
  } catch { return 'unavailable'; }
}

export function finalizeProfileReplacement(port: ReplacementPort, expectedMarker: string,
  decision: 'keep' | 'cancel'): ReplacementResult {
  if (decision !== 'keep') return { status: 'cancelled' };
  try {
    if (port.getMarker() !== expectedMarker) return { status: 'conflict', reason: 'marker-changed' };
    const marker = markerFrom(expectedMarker);
    if (!marker || marker.version !== 2 || !safeTransition(marker.before, marker.after)) return { status: 'blocked', reason: 'unsafe-history' };
    const pair = observeSafe(port, marker, expectedMarker);
    if (!pair || !pairEqual(pair, marker.after)) return { status: 'conflict', reason: 'incomplete-or-changed' };
    // Commit generation first, keeping the exact marker until read-back.
    // If interrupted, the applied pair + transaction epoch is a known prefix.
    if (port.observe().epoch !== marker.transactionId) {
      try { port.set(PROFILE_EPOCH_KEY, marker.transactionId); }
      catch { /* Check whether the operation took effect. */ }
      const rotated = observeSafe(port, marker, expectedMarker);
      if (!rotated || !pairEqual(rotated, marker.after) || port.observe().epoch !== marker.transactionId)
        return { status: 'recovery-required', reason: 'epoch-readback' };
    }
    try { port.set(PROFILE_REPLACEMENT_MARKER_KEY, null); }
    catch { /* A failing adapter may already have removed the marker. Verify. */ }
    const final = port.observe();
    if (port.getMarker() === null && quiet(final) && final.epoch === marker.transactionId && pairEqual(final.pair, marker.after) &&
        auxiliaryEqual(final.auxiliary, marker.auxiliary)) return { status: 'finalized' };
  } catch { /* A verified read-back is required for success. */ }
  return { status: 'recovery-required', reason: 'finalization-readback' };
}

/** Explicit recovery only. No startup auto-restore. Exact marker identity is
 * required so a stale confirmation cannot roll back a subsequent transaction. */
export function rollbackProfileReplacement(port: ReplacementPort, expectedMarker: string,
  decision: 'rollback' | 'cancel'): ReplacementResult {
  if (decision !== 'rollback') return { status: 'cancelled' };
  try {
    if (port.getMarker() !== expectedMarker) return { status: 'conflict', reason: 'marker-changed' };
    const marker = markerFrom(expectedMarker);
    if (!marker) return { status: 'recovery-required', reason: 'marker-invalid' };
    return rollback(port, marker, expectedMarker);
  } catch { return { status: 'unavailable', reason: 'marker-read-failed' }; }
}
