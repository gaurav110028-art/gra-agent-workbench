import { createHash } from 'node:crypto';
import { SecurityError } from '../security/errors.mjs';
import { canonicalJson, importKinds, isRecord, legacyId, MAX_IMPORT_BYTES, MAX_IMPORT_RECORDS, validImportPayload } from './legacy-schema.mjs';

const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const invalid = () => new SecurityError(400, 'The import batch contains unsupported or invalid records.', 'INVALID_MIGRATION_BATCH');
class MigrationTransactionError extends SecurityError {}
const integrity = () => new MigrationTransactionError(503, 'Import verification failed. The batch was not confirmed.', 'MIGRATION_INTEGRITY_FAILED');

function prepareBatch(records) {
  if (!Array.isArray(records) || !records.length || records.length > MAX_IMPORT_RECORDS) throw invalid();
  const unique = new Map();
  let bytes = 0;
  for (const entry of records) {
    if (!isRecord(entry) || !importKinds.includes(entry.kind) || typeof entry.id !== 'string'
      || !validImportPayload(entry.kind, entry.id, entry.payload)) throw invalid();
    let canonical;
    try { canonical = canonicalJson(entry.payload); } catch { throw invalid(); }
    bytes += Buffer.byteLength(canonical);
    if (bytes > MAX_IMPORT_BYTES) throw invalid();
    const key = entry.kind + '/' + entry.id;
    const previous = unique.get(key);
    if (previous && previous.canonical !== canonical) {
      throw new SecurityError(409, 'The batch contains a conflicting record identity.', 'MIGRATION_CONFLICT');
    }
    if (!previous) unique.set(key, { kind: entry.kind, id: entry.id, canonical, fingerprint: digest(canonical) });
  }
  for (const row of unique.values()) {
    if (!unique.has('agents/' + row.id)) throw invalid();
  }
  const rows = [...unique.keys()].sort().map(key => unique.get(key));
  const manifest = rows.map(({ kind, id, fingerprint }) => ({ kind, id, fingerprint }));
  const fingerprint = digest(canonicalJson({ version: 1, manifest }));
  return { rows, fingerprint, duplicatesInBatch: records.length - rows.length };
}

// An approval binds to an immutable, order-independent manifest of record content in this schema version.
export function migrationFingerprint(records) {
  return prepareBatch(records).fingerprint;
}

/**
 * Server-only repository contract, scoped to a server-selected workspace:
 * transaction(callback) pins one connection and commits only if callback resolves.
 * tx.insertIfAbsent(row) returns a boolean and never updates an existing row.
 * tx.readRecord(kind, id) returns the persisted JSON payload and its fingerprint.
 * tx.recordBatch(receipt) inserts one immutable receipt with its entries per batch fingerprint and returns whether it inserted.
 * tx.readBatch(fingerprint) returns that receipt with its original membership.
 * All operations, including verification and the receipt, share the transaction.
 */
export function createMigrationService(repository = null) {
  function requireRepository() {
    if (!repository || typeof repository.transaction !== 'function') {
      throw new SecurityError(503, 'Private storage is unavailable. Use the read-only preview.', 'MIGRATION_STORAGE_UNAVAILABLE');
    }
  }

  async function importBatch(request, actorId) {
    requireRepository();
    if (!isRecord(request) || request.version !== 1 || !legacyId(actorId)) throw invalid();
    const { rows, fingerprint, duplicatesInBatch } = prepareBatch(request.records);
    if (request.approval?.confirmed !== true || request.approval.fingerprint !== fingerprint) {
      throw new SecurityError(400, 'Administrator approval must match the exact batch contents.', 'MIGRATION_APPROVAL_REQUIRED');
    }

    try {
      const counts = await repository.transaction(async tx => {
        const entries = [];
        for (const { kind, id, canonical, fingerprint: expected } of rows) {
          const created = await tx.insertIfAbsent({ kind, id, fingerprint: expected, payload: JSON.parse(canonical) });
          const stored = await tx.readRecord(kind, id);
          if (typeof created !== 'boolean' || !stored || !validImportPayload(kind, id, stored.payload)) throw integrity();
          let committedValue;
          try { committedValue = canonicalJson(stored.payload); } catch { throw integrity(); }
          if (digest(committedValue) !== stored.fingerprint) throw integrity();
          if (committedValue !== canonical) {
            if (created) throw integrity();
            throw new MigrationTransactionError(409, 'An existing record has different contents. Review the conflict before retrying.', 'MIGRATION_CONFLICT');
          }
          entries.push({ kind, id, fingerprint: expected, inserted: created });
        }
        const inserted = entries.filter(entry => entry.inserted).length;
        const result = { inserted, alreadyPresent: rows.length - inserted };
        const newReceipt = await tx.recordBatch({ fingerprint, actorId, version: 1, ...result, entries });
        if (typeof newReceipt !== 'boolean' || (!newReceipt && inserted)) throw integrity();
        const receipt = await tx.readBatch(fingerprint);
        if (receipt?.fingerprint !== fingerprint || receipt.version !== 1 || !legacyId(receipt.actorId)
          || !Array.isArray(receipt.entries) || receipt.entries.length !== rows.length) throw integrity();
        const recorded = new Map(receipt.entries.map(entry => [entry?.kind + '/' + entry?.id, entry]));
        if (newReceipt && receipt.actorId !== actorId) throw integrity();
        for (const { kind, id, fingerprint: expected, inserted: entryInserted } of entries) {
          const entry = recorded.get(kind + '/' + id);
          if (entry?.fingerprint !== expected || typeof entry.inserted !== 'boolean' || (newReceipt && entry.inserted !== entryInserted)) throw integrity();
        }
        const recordedInserted = receipt.entries.filter(entry => entry.inserted).length;
        if (receipt.inserted !== recordedInserted || receipt.alreadyPresent !== rows.length - recordedInserted) throw integrity();
        return result;
      });
      return { ...counts, duplicatesInBatch };
    } catch (error) {
      if (error instanceof MigrationTransactionError) throw error;
      throw new SecurityError(503, 'Import could not be confirmed. Keep the originals and retry the same batch after storage recovers.', 'MIGRATION_STORAGE_ERROR');
    }
  }
  return { requireRepository, importBatch };
}
