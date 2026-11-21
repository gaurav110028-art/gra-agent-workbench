import { approvedDatabaseOptions, createDatabasePool, inTransaction, SCHEMA_VERSION, verifyDatabaseIdentity, WORKSPACE_ID } from './connection.mjs';

export function createPostgresRepository(pool, workspaceId = WORKSPACE_ID, expected) {
  return {
    transaction(work) {
      return inTransaction(pool, async client => {
        await client.query("SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '10s'; SET LOCAL idle_in_transaction_session_timeout = '15s'");
        const schema = await client.query('SELECT max(version) AS version FROM gra.schema_migrations');
        if (schema.rows[0]?.version !== SCHEMA_VERSION) throw new Error('Unsupported private database schema version.');
        if (expected) {
          const identity = await client.query(`SELECT current_database() AS database, session_user AS session_role, current_user AS active_role,
            (rolsuper OR rolcreaterole OR rolcreatedb OR has_database_privilege(current_database(), 'CREATE')
             OR has_schema_privilege('gra', 'CREATE')) AS can_create
            FROM pg_roles WHERE rolname = current_user`);
          verifyDatabaseIdentity(identity.rows[0], expected);
          if (identity.rows[0].can_create !== false) throw new Error('The PostgreSQL runtime role is too privileged.');
        }
        // Use a transaction lock so pooled sessions never retain an import lock after commit or rollback.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('gra:archive:' || $1, 0))", [workspaceId]);
        return work({
          async insertIfAbsent({ kind, id, payload, fingerprint }) {
            const result = await client.query(
              `INSERT INTO gra.legacy_import_records (workspace_id, kind, legacy_id, payload, fingerprint)
               VALUES ($1, $2, $3, $4::jsonb, $5)
               ON CONFLICT (workspace_id, kind, legacy_id) DO NOTHING`,
              [workspaceId, kind, id, JSON.stringify(payload), fingerprint],
            );
            return result.rowCount === 1;
          },
          async readRecord(kind, id) {
            const result = await client.query(
              `SELECT payload, fingerprint FROM gra.legacy_import_records
               WHERE workspace_id = $1 AND kind = $2 AND legacy_id = $3`,
              [workspaceId, kind, id],
            );
            return result.rows[0];
          },
          async recordBatch({ fingerprint, actorId, version, inserted, alreadyPresent, entries }) {
            const batch = await client.query(
              `INSERT INTO gra.legacy_import_batches (workspace_id, fingerprint, actor_id, format_version, inserted_count, existing_count)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (workspace_id, fingerprint) DO NOTHING`,
              [workspaceId, fingerprint, actorId, version, inserted, alreadyPresent],
            );
            if (batch.rowCount === 0) return false;
            await client.query(
              `INSERT INTO gra.legacy_import_entries (workspace_id, batch_fingerprint, kind, legacy_id, record_fingerprint, inserted)
               SELECT $1, $2, kind, id, fingerprint, inserted
               FROM jsonb_to_recordset($3::jsonb) AS entry(kind text, id text, fingerprint text, inserted boolean)`,
              [workspaceId, fingerprint, JSON.stringify(entries)],
            );
            await client.query(
              `INSERT INTO gra.admin_audit_events (workspace_id, actor_id, event_type, batch_fingerprint, inserted_count, existing_count)
               VALUES ($1, $2, 'legacy_import', $3, $4, $5)`,
              [workspaceId, actorId, fingerprint, inserted, alreadyPresent],
            );
            return true;
          },
          async readBatch(fingerprint) {
            const batch = await client.query(
              `SELECT b.fingerprint, b.actor_id AS "actorId", b.format_version AS version,
                      b.inserted_count AS inserted, b.existing_count AS "alreadyPresent"
               FROM gra.legacy_import_batches b JOIN gra.admin_audit_events a
                 ON a.workspace_id = b.workspace_id AND a.batch_fingerprint = b.fingerprint
                 AND a.actor_id = b.actor_id AND a.inserted_count = b.inserted_count AND a.existing_count = b.existing_count
                 AND a.event_type = 'legacy_import'
               WHERE b.workspace_id = $1 AND b.fingerprint = $2`,
              [workspaceId, fingerprint],
            );
            if (!batch.rows[0]) return undefined;
            const entries = await client.query(
              `SELECT kind, legacy_id AS id, record_fingerprint AS fingerprint, inserted
               FROM gra.legacy_import_entries WHERE workspace_id = $1 AND batch_fingerprint = $2`,
              [workspaceId, fingerprint],
            );
            return { ...batch.rows[0], entries: entries.rows };
          },
        });
      });
    },
  };
}

let repository;

export function getConfiguredPostgresRepository() {
  if (process.env.GRA_ENABLE_LEGACY_IMPORT !== 'true' || !process.env.DATABASE_URL) return null;
  if (!repository) {
    const options = approvedDatabaseOptions(process.env.DATABASE_URL, process.env.GRA_DATABASE_APPROVED_TARGET, {
      vercel: Boolean(process.env.VERCEL),
    });
    repository = createPostgresRepository(createDatabasePool(options), WORKSPACE_ID, options);
  }
  return repository;
}
