import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupArchiveError, decodeBackupBytes, MAX_ARCHIVE_SOURCE_BYTES, prepareBackupArchive } from './backupArchive';
import { MAX_PROGRESS_BACKUP_BYTES } from './progressBackupInspector';

afterEach(() => vi.unstubAllGlobals());
async function gzip(text: string) {
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
}
describe('BF-107 lossless bounded gzip backup', () => {
  it('retains exact opaque strings, Unicode and escaped lone surrogates in a compact archive', async () => {
    const json = JSON.stringify({ original: '{"future":"Боец 😀"}\r\n', damaged: '\ud800', history: 'old raw '.repeat(3000) });
    const result = await prepareBackupArchive(json, 'bodyforge-backup.json');
    if (result.status !== 'ready') throw Error(result.status);
    expect(result.filename).toBe('bodyforge-backup.json.gz');
    expect(result.blob.type).toBe('application/gzip');
    expect(result.blob.size).toBeLessThan(result.sourceBytes / 4);
    expect(result.inspectableSize).toBe(true);
    expect(await decodeBackupBytes(await result.blob.arrayBuffer())).toBe(json);
    expect(await decodeBackupBytes(new TextEncoder().encode(json).buffer as ArrayBuffer)).toBe(json);
  });
  it('rejects a corrupt checksum or truncated stream, never returning partial JSON', async () => {
    const bytes = new Uint8Array(await gzip('{"history":"' + 'a'.repeat(3000) + '"}'));
    const corrupt = bytes.slice(); corrupt[corrupt.length - 8] ^= 1;
    await expect(decodeBackupBytes(corrupt.buffer)).rejects.toThrow();
    await expect(decodeBackupBytes(bytes.slice(0, -4).buffer)).rejects.toThrow();
  });
  it('does not let a tiny gzip bypass the decoded size limit', async () => {
    const json = 'я'.repeat(MAX_PROGRESS_BACKUP_BYTES / 2 + 1);
    const packed = await gzip(json);
    expect(packed.byteLength).toBeLessThan(MAX_PROGRESS_BACKUP_BYTES / 100);
    await expect(decodeBackupBytes(packed)).rejects.toMatchObject({ code: 'limit' });
    const evidence = await prepareBackupArchive(json, 'bodyforge-backup-evidence.json');
    if (evidence.status !== 'ready') throw Error(evidence.status);
    expect(evidence.inspectableSize).toBe(false);
    expect(evidence.blob.size).toBeLessThan(evidence.sourceBytes);
  });
  it('accepts the exact inflated byte boundary, rejects the compressed input boundary before decode', async () => {
    const exact = 'x'.repeat(MAX_PROGRESS_BACKUP_BYTES);
    expect((await decodeBackupBytes(await gzip(exact))).length).toBe(exact.length);
    await expect(decodeBackupBytes(new ArrayBuffer(MAX_PROGRESS_BACKUP_BYTES + 1))).rejects.toBeInstanceOf(BackupArchiveError);
  });
  it('keeps plain JSON usable when gzip support is missing or the source is too big', async () => {
    const packed = await gzip('{"hello":1}');
    vi.stubGlobal('DecompressionStream', undefined);
    expect(await prepareBackupArchive('{"hello":1}', 'backup.json')).toEqual({ status: 'unsupported' });
    await expect(decodeBackupBytes(packed)).rejects.toMatchObject({ code: 'unsupported' });
    expect(await decodeBackupBytes(new TextEncoder().encode('{}').buffer as ArrayBuffer)).toBe('{}');
    vi.unstubAllGlobals();
    expect(await prepareBackupArchive('x'.repeat(MAX_ARCHIVE_SOURCE_BYTES + 1), 'backup.json')).toEqual({ status: 'too-large' });
    expect(await prepareBackupArchive('{}', 'backup.json')).toEqual({ status: 'not-smaller' });
  });
  it('cancels before and during stream work without producing a downloadable result', async () => {
    const signal = new AbortController();
    signal.abort();
    expect(await prepareBackupArchive('abc'.repeat(5000), 'backup.json', signal.signal)).toEqual({ status: 'cancelled' });
    await expect(decodeBackupBytes(await gzip('{}'), signal.signal)).rejects.toMatchObject({ code: 'cancelled' });
    const later = new AbortController();
    const pending = prepareBackupArchive('abc'.repeat(500000), 'backup.json', later.signal);
    later.abort();
    expect(await pending).toEqual({ status: 'cancelled' });
  });
  it('does not read storage or call network for archival operations', async () => {
    const forbidden = vi.fn(() => { throw Error('forbidden'); });
    vi.stubGlobal('localStorage', { getItem: forbidden, setItem: forbidden });
    vi.stubGlobal('indexedDB', { open: forbidden });
    vi.stubGlobal('fetch', forbidden);
    const archive = await prepareBackupArchive('{"x":"' + 'repeat'.repeat(5000) + '"}', 'backup.json');
    expect(archive.status).toBe('ready');
    expect(forbidden).not.toHaveBeenCalled();
  });
});
