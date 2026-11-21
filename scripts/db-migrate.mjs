import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { approvedDatabaseOptions, createDatabasePool, inTransaction, verifyDatabaseIdentity } from '../lib/database/connection.mjs';

const directory = new URL('../db/migrations/', import.meta.url);

export async function applyMigrations(pool, expected) {
  const names = (await readdir(directory)).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const migrations = await Promise.all(names.map(async (name, index) => {
    const version = Number(name.slice(0, 3));
    if (version !== index + 1) throw new Error('Database migration versions must be consecutive.');
    const sql = await readFile(new URL(name, directory), 'utf8');
    const checksum = createHash('sha256').update(sql.replaceAll('\r\n', '\n')).digest('hex');
    return { version, name, sql, checksum };
  }));
  if (!migrations.length) throw new Error('No schema migrations are present.');
  return inTransaction(pool, async client => {
    await client.query("SET LOCAL lock_timeout = '10s'; SET LOCAL statement_timeout = '60s'");
    if (expected) {
      const identity = await client.query('SELECT current_database() AS database, session_user AS session_role, current_user AS active_role');
      verifyDatabaseIdentity(identity.rows[0], expected);
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('gra:schema', 0))");
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS gra;
      REVOKE ALL ON SCHEMA gra FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS gra.schema_migrations (
        version integer PRIMARY KEY CHECK (version > 0),
        name text NOT NULL UNIQUE,
        checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = await client.query('SELECT version, name, checksum FROM gra.schema_migrations ORDER BY version');
    if (applied.rows.some((row, index) => {
      const migration = migrations[index];
      return !migration || row.version !== migration.version || row.name !== migration.name || row.checksum !== migration.checksum;
    })) throw new Error('Database schema history does not match the migration files.');
    for (const { version, name, sql, checksum } of migrations.slice(applied.rowCount)) {
      await client.query(sql);
      await client.query('INSERT INTO gra.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [version, name, checksum]);
    }
    return { version: migrations.at(-1).version, applied: migrations.length - applied.rowCount };
  });
}

async function main() {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error();
  const approvedTarget = process.env.GRA_DATABASE_APPROVED_TARGET;
  const options = approvedDatabaseOptions(process.env.DATABASE_URL_UNPOOLED, approvedTarget, { direct: true });
  if (process.argv.length === 3 && process.argv[2] === '--check-targets') {
    approvedDatabaseOptions(process.env.DATABASE_URL, approvedTarget);
    console.log('Pooled and direct settings match the approved target. No database connection was opened.');
    return;
  }
  if (['127.0.0.1', '::1'].includes(options.host)
    && (process.env.NODE_ENV !== 'test' || !options.database.startsWith('gra_test_'))) throw new Error();
  const target = options.host + ':' + options.port + '/' + options.database;
  if (process.argv.length !== 4 || process.argv[2] !== '--target' || process.argv[3] !== target) throw new Error();
  const pool = createDatabasePool(options, 1);
  try {
    const result = await applyMigrations(pool, options);
    console.log(`Private schema version ${result.version}. Applied migrations: ${result.applied}.`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Schema migration failed. Verify the explicit non-production direct target, database permissions, and schema history.');
    process.exitCode = 1;
  });
}
