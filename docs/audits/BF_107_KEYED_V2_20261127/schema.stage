/** Version 1 remains the default for new databases. Version 2 keeps original
 * result keys and a revision marker. Opening is not permission to upgrade. */
export const DURABLE_JOURNAL_DATABASE = 'bodyforge:durable-results:v1';
export const DURABLE_RESULT_STORE = 'results';
export const DURABLE_META_STORE = 'journal-meta';
export const DURABLE_COMPACT_VERSION = 2;
export function isVersionedJournalLayout(db: IDBDatabase): boolean {
  return db.name === DURABLE_JOURNAL_DATABASE && db.version === DURABLE_COMPACT_VERSION &&
    db.objectStoreNames.length === 2 && db.objectStoreNames.contains(DURABLE_RESULT_STORE) &&
    db.objectStoreNames.contains(DURABLE_META_STORE);
}
