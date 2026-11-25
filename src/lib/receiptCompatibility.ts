/**
 * BF-105: versioned, read-only receipt compatibility boundary.
 * No persistence, reward mutation, or reconstruction of a historical grant.
 */
import { getProfileTotals, hasAmbiguousWorkoutIds, parseProfile, TARGET_REPS, type Profile, type Workout } from './progression';
import { type WorkoutMode } from './game';
import { type ExerciseId } from './trainingCatalog';
import { resultJournalEntry } from './workoutJournal';
import { readWorkoutReceipt, type WorkoutReceipt as StoredWorkoutReceipt, type RewardGrant } from './workoutReceipt';
import { MAX_PROGRESS_BACKUP_BYTES } from './progressBackupInspector';

export const RECEIPT_SCHEMA_VERSION = 1 as const;
export const RECEIPT_PREVIEW_VERSION = 2 as const;

type CompletedUnits = { unit: 'reps'; target: 20; completedUnits: 20 } |
  { unit: 'seconds'; target: 30; completedUnits: 30 };

interface ReceiptCommon {
  readonly schemaVersion: typeof RECEIPT_SCHEMA_VERSION;
  readonly id: string;
  readonly sessionId: string;
  readonly profileId: string | null;
  readonly exerciseId: ExerciseId;
  readonly mode: WorkoutMode | null;
  readonly floor: number | null;
  readonly finishedAt: string;
  /** Legacy saves don't contain a trustworthy start timestamp or active time. */
  readonly startedAt: null;
  readonly activeMs: null;
  readonly durationMs: number;
  readonly validatorVersion: null;
  readonly rewardPolicyVersion: null;
  readonly splitsMs?: readonly number[];
}

// Read-only view of a completion, not another persisted schema.
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

function receiptId(profileId: string | null, sessionId: string): string {
  return JSON.stringify(['workout', profileId, sessionId]);
}

function units(exerciseId: ExerciseId): CompletedUnits {
  return exerciseId === 'plank'
    ? { unit: 'seconds', target: 30, completedUnits: 30 }
    : { unit: 'reps', target: TARGET_REPS, completedUnits: TARGET_REPS };
}

function common(profileId: string | null, sessionId: string, exerciseId: ExerciseId,
  mode: WorkoutMode | null, floor: number | null, durationMs: number, finishedAt: string,
  splitsMs?: readonly number[]): ReceiptCommon & CompletedUnits {
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION, id: receiptId(profileId, sessionId), sessionId, profileId,
    exerciseId, mode, floor, durationMs, finishedAt, ...units(exerciseId),
    startedAt: null, activeMs: null, validatorVersion: null, rewardPolicyVersion: null,
    ...(splitsMs === undefined ? {} : { splitsMs: [...splitsMs] }),
  };
}

/** A valid journal envelope proves shape, not payment or physical accuracy. */
export function receiptFromJournal(input: unknown): WorkoutReceiptView | null {
  const result = resultJournalEntry(input)?.result;
  if (!result) return null;
  return { ...common(result.profileId, result.sessionId, result.exerciseId ?? 'squat', result.mode,
    result.floor, result.durationMs, result.finishedAt, result.splitsMs),
  provenance: 'journal-v1', completionReason: 'target-reached', recordedXp: null,
  receiptEvidence: 'unpaid-journal', recordedReceipt: null };
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const nonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

// Bound work before invoking legacy normalization or recursive comparison.
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

/** Compare supplied JSON fields without requiring newly introduced defaults.
 * This flags data that the legacy reader would normalize/drop. */
function preservesSupplied(raw: unknown, viewed: unknown): boolean {
  if (Array.isArray(raw)) return Array.isArray(viewed) && raw.length === viewed.length &&
    raw.every((v, i) => preservesSupplied(v, viewed[i]));
  if (record(raw)) return record(viewed) && Object.keys(raw).every(k =>
    own(viewed, k) && preservesSupplied(raw[k], viewed[k]));
  return raw === viewed;
}

export interface ReceiptMigrationPreview {
  readonly schemaVersion: typeof RECEIPT_PREVIEW_VERSION;
  readonly status: 'preview-ready';
  readonly sourceRaw: string;
  /** The existing v1 reader's display view, never a new authoritative ledger. */
  readonly profile: Profile;
  /** Exact explicitly stored identities, null if the old source had none. */
  readonly storedCreditedWorkoutIds: readonly string[] | null;
  readonly receipts: readonly WorkoutReceiptView[];
  readonly ledgerEvidence: 'stored-identities' | 'legacy-unproven';
  /** Only explicitly recorded, recognized grant shapes in available history.
   * A local file is not proof of a real workout or authority to award currency. */
  readonly recordedGrants: readonly RecordedGrantEvidence[];
  readonly grantsComplete: false;
  readonly activationAuthorized: false;
}
export interface BlockedReceiptMigration {
  readonly schemaVersion: typeof RECEIPT_PREVIEW_VERSION;
  readonly status: 'invalid' | 'unsupported' | 'recovery-required';
  readonly reason: string;
  readonly activationAuthorized: false;
}
export type ReceiptMigrationResult = ReceiptMigrationPreview | BlockedReceiptMigration;

function blocked(status: BlockedReceiptMigration['status'], reason: string): BlockedReceiptMigration {
  return { schemaVersion: RECEIPT_PREVIEW_VERSION, status, reason, activationAuthorized: false };
}

/** Pure projection. The original raw string stays authoritative and reversible.
 * Available receipt history is not truncated. The v1 display view may seed
 * known legacy IDs, but storedCreditedWorkoutIds records only source evidence. */
export function previewReceiptMigration(raw: string): ReceiptMigrationResult {
  if (typeof raw !== 'string' || raw.length > MAX_PROGRESS_BACKUP_BYTES ||
      new TextEncoder().encode(raw).byteLength > MAX_PROGRESS_BACKUP_BYTES) {
    return blocked('invalid', 'source-size');
  }
  let source: unknown;
  try { source = JSON.parse(raw); }
  catch { return blocked('invalid', 'source-json'); }
  if (!boundedJsonTree(source)) return blocked('invalid', 'source-complexity');
  if (!record(source) || !nonNegative(source.xp) || !nonNegative(source.coins) || !Array.isArray(source.workouts)) {
    return blocked('invalid', 'source-shape');
  }
  if (own(source, 'schemaVersion') && source.schemaVersion !== 1) return blocked('unsupported', 'source-version');
  if (own(source, 'profileId') && !validId(source.profileId)) return blocked('recovery-required', 'profile-identity');
  if (hasAmbiguousWorkoutIds(source)) return blocked('recovery-required', 'reward-identities');

  const ledger = source.creditedWorkoutIds;
  const storedIds = Array.isArray(ledger) ? new Set(ledger) : null;
  if (storedIds && storedIds.size !== (ledger as unknown[]).length) {
    return blocked('recovery-required', 'duplicate-ledger');
  }
  const ids = new Set<string>();
  const receipts: WorkoutReceiptView[] = [];
  const recordedGrants: RecordedGrantEvidence[] = [];
  const profileId = validId(source.profileId) ? source.profileId : null;
  for (const rawWorkout of source.workouts) {
    if (!record(rawWorkout) || !validId(rawWorkout.id) || ids.has(rawWorkout.id)) {
      return blocked('recovery-required', 'workout-identity');
    }
    // Use the existing legacy reader, without its last-60 cap on this projection.
    const parsed: Workout | undefined = parseProfile({ xp: 0, coins: 0, workouts: [rawWorkout] }).workouts[0];
    if (!parsed || !preservesSupplied(rawWorkout, parsed)) return blocked('recovery-required', 'workout-shape');
    if (storedIds && !storedIds.has(parsed.id)) return blocked('recovery-required', 'ledger-missing-workout');
    ids.add(parsed.id);
    const view = common(profileId, parsed.id, parsed.exerciseId ?? 'squat', parsed.mode ?? null, null,
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
    }
  }
  const profile = parseProfile(source);
  const totals = getProfileTotals(profile);
  if ((own(source, 'game') && (!record(source.game) || !preservesSupplied(source.game, profile.game))) ||
      (own(source, 'totals') && (!record(source.totals) || !preservesSupplied(source.totals, totals)))) {
    return blocked('recovery-required', 'normalized-critical-fields');
  }
  if (Array.isArray(ledger) && ledger.length < totals.workouts) return blocked('recovery-required', 'ledger-history-gap');
  if (Array.isArray(ledger) && !preservesSupplied(ledger, profile.creditedWorkoutIds)) {
    return blocked('recovery-required', 'ledger-normalization');
  }
  return {
    schemaVersion: RECEIPT_PREVIEW_VERSION, status: 'preview-ready', sourceRaw: raw, profile, receipts,
    storedCreditedWorkoutIds: Array.isArray(ledger) ? [...ledger] as string[] : null,
    ledgerEvidence: Array.isArray(ledger) ? 'stored-identities' : 'legacy-unproven',
    recordedGrants, grantsComplete: false, activationAuthorized: false,
  };
}

/** Export/rollback candidate only; never writes localStorage or IndexedDB. */
export function legacySourceFromPreview(preview: ReceiptMigrationPreview): string {
  return preview.sourceRaw;
}
