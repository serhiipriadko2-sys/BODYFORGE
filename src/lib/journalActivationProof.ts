import type { DurableJournalEntry } from './durableJournal';
import { loadProfileState, profileReplacementPending } from './progression';
import { readProfileEpoch } from './profileEpoch';
import { createProgressExport } from './progressExport';
import { readProfileQuarantine } from './profileQuarantineExport';
import { previewProgressImportJson, inspectImportProfile } from './progressImportPreview';
import { MAX_PROGRESS_BACKUP_BYTES } from './progressBackupInspector';
import { coversPaidHistory, matchesExportedHistory, snapshotSettledHistory } from './settledImportHistory';

/** A short-lived, in-memory proof of exact local evidence. Not a signature,
 * a disk-download receipt, a field-device approval or a reward authority. */
export interface JournalActivationProof {
  readonly rows: ReadonlyMap<string, DurableJournalEntry>;
  readonly bytes: number;
  matchesLocal(): boolean;
}
type ProofResult = { status: 'ready'; proof: JournalActivationProof } |
  { status: 'blocked'; reason: 'local-not-quiet' | 'backup-invalid' | 'backup-differs' | 'paid-history-unproven' };

function localSnapshot() {
  try {
    const epoch = readProfileEpoch();
    const state = loadProfileState();
    if (profileReplacementPending() || state.status !== 'ready' || state.revision === null ||
        !state.profile.profileId || !state.profile.game.created) return null;
    const local = createProgressExport(state.profile, null);
    const quarantine = readProfileQuarantine();
    if (local.storageReadStatus !== 'ready' || local.journalReadStatus !== 'ready' ||
        local.quarantineReadStatus !== 'ready' || quarantine.status !== 'ready' ||
        !Object.values(local.auxiliaryReadStatus).every(status => status === 'ready') ||
        local.pendingResultOriginals.length || local.quarantinedResults.length || quarantine.entries.length ||
        local.storedProfileRaw !== state.revision || local.storedBackupRaw === null ||
        profileReplacementPending() || readProfileEpoch() !== epoch) return null;
    const signature = JSON.stringify([epoch, local.storedProfileRaw, local.storedBackupRaw, local.storedAuxiliaryRaw]);
    return { profile: state.profile, local, signature };
  } catch { return null; }
}
const emptyArray = (value: unknown) => Array.isArray(value) && value.length === 0;
const blocked = (reason: Extract<ProofResult,{status:'blocked'}>['reason']): ProofResult => ({status:'blocked',reason});

export async function proveJournalActivation(json: string, signal?: AbortSignal): Promise<ProofResult> {
  const snapshot = localSnapshot();
  if (!snapshot) return blocked('local-not-quiet');
  if (signal?.aborted || typeof json !== 'string' || json.length > MAX_PROGRESS_BACKUP_BYTES ||
      new Blob([json]).size > MAX_PROGRESS_BACKUP_BYTES) return blocked('backup-invalid');
  const preview = previewProgressImportJson(json,snapshot.profile);
  if (preview.state !== 'preview-ready' || preview.inspection.state !== 'readable' ||
      preview.identity !== 'same') return blocked('backup-invalid');
  const data = JSON.parse(json) as Record<string,unknown>;
  const local = snapshot.local;
  if (data.pendingResult !== null || !emptyArray(data.pendingResults) || !emptyArray(data.pendingResultOriginals) ||
      !emptyArray(data.quarantinedResults) || !emptyArray(data.storedProfileQuarantineRaw)) return blocked('backup-invalid');
  if (data.storedProfileRaw !== local.storedProfileRaw || data.storedBackupRaw !== local.storedBackupRaw ||
      !inspectImportProfile(local.storedBackupRaw)) return blocked('backup-differs');
  const auxiliary = data.storedAuxiliaryRaw as Record<string,unknown>;
  if (Object.keys(auxiliary).length !== Object.keys(local.storedAuxiliaryRaw).length ||
      !Object.entries(local.storedAuxiliaryRaw).every(([key,value]) => auxiliary[key] === value)) return blocked('backup-differs');
  // The strict preview validates the input shape. The paid-history adapter
  // checks canonical result identity, exact fields, and consistency with paid IDs.
  const entries = data.durableResults as DurableJournalEntry[];
  const history = await snapshotSettledHistory(entries);
  if ((entries.length && !history) || !matchesExportedHistory(entries,history) ||
      !coversPaidHistory(local.storedProfileRaw,history)) return blocked('paid-history-unproven');
  const matchesLocal = () => localSnapshot()?.signature === snapshot.signature;
  if (signal?.aborted || !matchesLocal()) return blocked('local-not-quiet');
  return {status:'ready',proof:{rows:history?.rows ?? new Map(),bytes:new Blob([json]).size,matchesLocal}};
}
