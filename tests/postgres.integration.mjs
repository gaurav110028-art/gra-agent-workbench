import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createDatabasePool, databaseOptions } from '../lib/database/connection.mjs';
import { createPostgresRepository } from '../lib/database/postgres-repository.mjs';
import { createMigrationService, migrationFingerprint } from '../lib/migration/repository.mjs';
import { hashPassword } from '../lib/security/auth.mjs';
import { applyMigrations } from '../scripts/db-migrate.mjs';

const exec = promisify(execFile);
const host = '127.0.0.1';
const owner = 'gra_test_owner';
const runtimeUser = 'gra_test_runtime';
const ownerPassword = randomBytes(24).toString('hex');
const runtimePassword = randomBytes(24).toString('hex');
const sqlEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)));
const agent = (id, name = 'Synthetic test agent') => ({ kind: 'agents', id, payload: { id, name, status: 'paused' } });
const graph = id => ({ kind: 'workflows', id, payload: { nodes: [], edges: [] } });
const approved = records => ({ version: 1, records, approval: { confirmed: true, fingerprint: migrationFingerprint(records) } });
const records = [agent('fixture'), graph('fixture'), {
  kind: 'versions', id: 'fixture',
  payload: { agentId: 'fixture', draftVersion: 1, publishedVersion: null, isDirty: true,
    draft: { nodes: [], edges: [], savedAt: '2026-01-01T00:00:00.000Z' }, published: null, lastPublishedAt: null },
}];

async function freePort() {
  const server = createServer().listen({ host, port: 0 });
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((done, fail) => server.close(error => error ? fail(error) : done()));
  return port;
}

async function checkHttp(runtimeUrl, approvedTarget, readCounts) {
  const port = await freePort();
  const origin = `http://${host}:${port}`;
  const password = 'synthetic-postgres-http-password';
  const passwordHash = await hashPassword(password);
  const users = [
    { id: 'admin', email: 'postgres-admin@example.test', role: 'admin' },
    { id: 'other', email: 'postgres-other@example.test', role: 'admin' },
  ].map(user => ({ ...user, name: user.id, version: 1, passwordHash }));
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', host], {
    windowsHide: true, stdio: 'ignore', env: {
      ...process.env, VERCEL: '', NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
      GRA_APP_ORIGIN: origin, GRA_SECURITY_STORE: 'memory', GRA_WHATSAPP_ADMIN_ID: 'admin',
      GRA_AUTH_USERS_JSON: JSON.stringify(users), GRA_SESSION_PASSWORD: randomBytes(48).toString('base64url'),
      GRA_SERVICE_TOKENS_JSON: '', GRA_ENABLE_LEGACY_IMPORT: 'true', DATABASE_URL: runtimeUrl, DATABASE_URL_UNPOOLED: '',
      GRA_DATABASE_APPROVED_TARGET: approvedTarget,
      GRA_ENABLE_SYNTHETIC_AUDIT: 'false', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '',
      GROQ_API_KEY: '', OPENROUTER_API_KEY: '', RESEND_API_KEY: '',
    },
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80 && child.exitCode === null; attempt++) {
      try { if ((await fetch(origin + '/login')).ok) { ready = true; break; } } catch { /* Starting up. */ }
      await new Promise(done => setTimeout(done, 250));
    }
    assert(ready, 'Built local server did not become ready');
    const post = (path, payload, cookie) => fetch(origin + path, {
      method: 'POST', body: JSON.stringify(payload),
      headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    });
    const signIn = async email => {
      const response = await post('/api/auth/login', { email, password });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const path = '/api/workspace/migration';
    const batch = approved([agent('http')]);
    const before = await readCounts();
    assert.equal((await fetch(origin)).status, 200);
    assert.equal((await post(path, batch)).status, 401);
    assert.equal((await post(path, batch, await signIn(users[1].email))).status, 403);
    assert.deepEqual(await readCounts(), before);
    const cookie = await signIn(users[0].email);
    const response = await post(path, batch, cookie);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { inserted: 1, alreadyPresent: 0, duplicatesInBatch: 0 });
    const retry = await post(path, batch, cookie);
    assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), { inserted: 0, alreadyPresent: 1, duplicatesInBatch: 0 });
    assert.equal((await post('/api/auth/logout', {}, cookie)).status, 200);
    assert.equal((await post(path, batch, cookie)).status, 401);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const finished = once(child, 'exit');
      child.kill();
      await finished;
    }
  }
}

let phase = 'test configuration';

async function run() {
  assert(process.env.GRA_TEST_POSTGRES_BIN, 'Set GRA_TEST_POSTGRES_BIN to a local PostgreSQL bin directory.');
  const bin = resolve(process.env.GRA_TEST_POSTGRES_BIN);
  const extension = process.platform === 'win32' ? '.exe' : '';
  const command = (name, args, env = sqlEnvironment) =>
    exec(join(bin, name + extension), args, { env, windowsHide: true, timeout: 60000 });
  const tempRoot = resolve(tmpdir());
  const fixture = await mkdtemp(join(tempRoot, 'gra-private-db-test-'));
  const data = join(fixture, 'data');
  const passwordFile = join(fixture, 'password.txt');
  const dump = join(fixture, 'synthetic.dump');
  const pools = [];
  let launchAttempted = false;
  try {
    phase = 'disposable PostgreSQL startup';
    const port = await freePort();
    await writeFile(passwordFile, ownerPassword + '\n', { mode: 0o600 });
    await command('initdb', ['-D', data, '-U', owner, '--auth=scram-sha-256', '--no-locale', '-E', 'UTF8', '--pwfile', passwordFile]);
    await rm(passwordFile);
    launchAttempted = true;
    await command('pg_ctl', ['-D', data, '-l', join(fixture, 'postgres.log'), '-o', `-h ${host} -p ${port}`, '-w', 'start']);
    const url = (database, user = owner, password = ownerPassword) => `postgresql://${user}:${password}@${host}:${port}/${database}?sslmode=disable`;
    const poolFor = (value, max) => {
      const pool = createDatabasePool(databaseOptions(value), max);
      pools.push(pool);
      return pool;
    };
    const cluster = poolFor(url('postgres'));
    await cluster.query('CREATE DATABASE gra_test_import');
    await cluster.query('CREATE DATABASE gra_test_restore');
    const roleSql = await cluster.query("SELECT format('CREATE ROLE gra_test_runtime LOGIN PASSWORD %L', $1::text) AS command", [runtimePassword]);
    await cluster.query(roleSql.rows[0].command);
    const admin = poolFor(url('gra_test_import'));
    const approvedTarget = JSON.stringify({ directHost: host, port, database: 'gra_test_import', runtimeRole: runtimeUser, migrationRole: owner });

    phase = 'schema creation and repeat migration';
    const migrate = target => exec(process.execPath, ['scripts/db-migrate.mjs', '--target', target], {
      windowsHide: true, timeout: 60000,
      env: { ...sqlEnvironment, VERCEL: '', NODE_ENV: 'test', DATABASE_URL_UNPOOLED: url('gra_test_import'), GRA_DATABASE_APPROVED_TARGET: approvedTarget },
    });
    await assert.rejects(migrate(`${host}:${port}/wrong_target`));
    assert.match((await migrate(`${host}:${port}/gra_test_import`)).stdout, /Applied migrations: 1/);
    assert.deepEqual(await applyMigrations(admin), { version: 1, applied: 0 });
    await admin.query(`GRANT USAGE ON SCHEMA gra TO gra_test_runtime;
      GRANT SELECT ON gra.schema_migrations TO gra_test_runtime;
      GRANT SELECT, INSERT ON gra.legacy_import_records, gra.legacy_import_batches,
        gra.legacy_import_entries, gra.admin_audit_events TO gra_test_runtime`);
    const runtimeUrl = url('gra_test_import', runtimeUser, runtimePassword);
    const pool = poolFor(runtimeUrl);
    const repository = createPostgresRepository(pool);
    const service = createMigrationService(repository);
    await assert.rejects(applyMigrations(pool), { code: '42501' });
    await assert.rejects(pool.query('CREATE TABLE gra.runtime_must_not_create (id integer)'), { code: '42501' });
    await assert.rejects(pool.query('SELECT * FROM gra.contacts'), { code: '42501' });
    await assert.rejects(pool.query('DELETE FROM gra.legacy_import_records'), { code: '42501' });

    phase = 'concurrent imports and receipt integrity';
    const results = await Promise.all([service.importBatch(approved(records), 'admin'), service.importBatch(approved(records), 'admin')]);
    assert.deepEqual(results.map(result => result.inserted).sort(), [0, 3]);
    const retry = await service.importBatch(approved(records), 'admin');
    assert.equal(retry.alreadyPresent, 3);
    const counts = async database => (await database.query(`SELECT
      (SELECT count(*)::int FROM gra.legacy_import_records) AS records,
      (SELECT count(*)::int FROM gra.legacy_import_batches) AS batches,
      (SELECT count(*)::int FROM gra.legacy_import_entries) AS entries,
      (SELECT count(*)::int FROM gra.admin_audit_events) AS audit`)).rows[0];
    assert.deepEqual(await counts(admin), { records: 3, batches: 1, entries: 3, audit: 1 });
    await assert.rejects(service.importBatch(approved([agent('added'), agent('fixture', 'Conflicting synthetic name')]), 'admin'), { code: 'MIGRATION_CONFLICT' });
    const corrupt = createMigrationService({
      transaction: work => repository.transaction(tx => work({
        ...tx, readRecord: async (kind, id) => ({ ...await tx.readRecord(kind, id), fingerprint: '0'.repeat(64) }),
      })),
    });
    await assert.rejects(corrupt.importBatch(approved([agent('corrupt')]), 'admin'), { code: 'MIGRATION_INTEGRITY_FAILED' });
    assert.deepEqual(await counts(admin), { records: 3, batches: 1, entries: 3, audit: 1 });

    phase = 'disconnected transaction rollback and retry';
    const disconnected = createMigrationService({
      transaction: work => repository.transaction(tx => work({
        ...tx, recordBatch: async receipt => {
          await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND usename = $1 AND state = 'idle in transaction'", [runtimeUser]);
          return tx.recordBatch(receipt);
        },
      })),
    });
    const interrupted = approved([agent('interrupted')]);
    await assert.rejects(disconnected.importBatch(interrupted, 'admin'), { code: 'MIGRATION_STORAGE_ERROR' });
    assert.equal((await counts(admin)).records, 3);
    assert.equal((await service.importBatch(interrupted, 'admin')).inserted, 1);

    phase = 'WhatsApp future schema constraints';
    await admin.query("INSERT INTO gra.workspaces (id) VALUES ('other')");
    const contact = (await admin.query(`INSERT INTO gra.contacts (workspace_id, name, phone_e164, country_calling_code, created_by)
      VALUES ('gra', 'Synthetic Contact', '+12025550101', '1', 'admin') RETURNING id`)).rows[0];
    const template = (await admin.query(`INSERT INTO gra.whatsapp_templates (workspace_id, provider_name, language, version, created_by)
      VALUES ('gra', 'synthetic_template', 'en', 1, 'admin') RETURNING id`)).rows[0];
    const campaign = (await admin.query(`INSERT INTO gra.whatsapp_campaigns (workspace_id, template_id, name, created_by)
      VALUES ('gra', $1, 'Synthetic campaign', 'admin') RETURNING id`, [template.id])).rows[0];
    await admin.query("INSERT INTO gra.whatsapp_campaign_recipients (workspace_id, campaign_id, contact_id) VALUES ('gra', $1, $2)", [campaign.id, contact.id]);
    await assert.rejects(admin.query("INSERT INTO gra.whatsapp_campaign_recipients (workspace_id, campaign_id, contact_id) VALUES ('other', $1, $2)", [campaign.id, contact.id]), { code: '23503' });
    await admin.query(`INSERT INTO gra.whatsapp_reminders (workspace_id, contact_id, template_id, interval_seconds, created_by)
      VALUES ('gra', $1, $2, 3600, 'admin')`, [contact.id, template.id]);
    const attempt = `INSERT INTO gra.whatsapp_message_attempts (workspace_id, contact_id, template_id, campaign_id, idempotency_key, status, created_by)
      VALUES ('gra', $1, $2, $3, 'synthetic-only-attempt', 'pending', 'admin')`;
    await admin.query(attempt, [contact.id, template.id, campaign.id]);
    await assert.rejects(admin.query(attempt, [contact.id, template.id, campaign.id]), { code: '23505' });

    phase = 'authoritative HTTP migration path';
    const overprivileged = createMigrationService(createPostgresRepository(admin, 'gra', { database: 'gra_test_import', user: owner }));
    await assert.rejects(overprivileged.importBatch(approved([agent('excess-privilege')]), 'admin'), { code: 'MIGRATION_STORAGE_ERROR' });
    await checkHttp(runtimeUrl, approvedTarget, () => counts(admin));

    phase = 'disposable backup and restore';
    const toolsEnv = { ...sqlEnvironment, PGHOST: host, PGPORT: String(port), PGUSER: owner, PGPASSWORD: ownerPassword, PGSSLMODE: 'disable' };
    await command('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', dump, 'gra_test_import'], toolsEnv);
    await command('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '--dbname', 'gra_test_restore', dump], toolsEnv);
    const restored = poolFor(url('gra_test_restore'));
    assert.deepEqual(await applyMigrations(restored), { version: 1, applied: 0 });
    assert.deepEqual(await counts(restored), await counts(admin));
    const archived = createMigrationService(createPostgresRepository(restored));
    assert.equal((await archived.importBatch(approved(records), 'admin')).alreadyPresent, 3);
    assert.equal((await restored.query('SELECT count(*)::int AS total FROM gra.whatsapp_message_attempts')).rows[0].total, 1);
  } finally {
    await Promise.all(pools.map(pool => pool.end()));
    if (launchAttempted && await access(join(data, 'postmaster.pid')).then(() => true, error => {
      if (error.code === 'ENOENT') return false;
      throw error;
    })) await command('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    if (dirname(fixture) === tempRoot && basename(fixture).startsWith('gra-private-db-test-')) {
      await rm(fixture, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
    }
  }
  console.log('PASS: real disposable PostgreSQL schema, least-privilege role, concurrent import, verified receipt, rollback, disconnect/retry, HTTP authorization, WhatsApp constraints and backup/restore.');
}

run().catch(error => {
  const code = String(error.code || '');
  console.error(`PostgreSQL test failed during ${phase}${/^[A-Z0-9_]+$/.test(code) ? ' (' + code + ')' : ''}.`);
  process.exitCode = 1;
});
