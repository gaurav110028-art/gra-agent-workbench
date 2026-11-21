import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { approvedDatabaseOptions, databaseOptions, inTransaction, verifyDatabaseIdentity } from '../lib/database/connection.mjs';

const pooled = 'postgresql://synthetic:synthetic%40test@ep-test-pooler.region.aws.neon.tech/example?sslmode=require&channel_binding=require';
const direct = pooled.replace('-pooler', '');

test('staging pin rejects another Neon project, database, port and privileged runtime credentials', () => {
  const pin = JSON.stringify({ directHost: 'ep-test.region.aws.neon.tech', port: 5432, database: 'example', runtimeRole: 'synthetic', migrationRole: 'schema_owner' });
  assert.equal(approvedDatabaseOptions(pooled, pin).user, 'synthetic');
  assert.equal(approvedDatabaseOptions(direct.replace('synthetic:', 'schema_owner:'), pin, { direct: true }).user, 'schema_owner');
  for (const value of [direct, pooled.replace('ep-test', 'ep-unrelated'), pooled.replace('/example', '/unrelated'), pooled.replace('.tech/', '.tech:5433/'), pooled.replace('synthetic:', 'schema_owner:')]) {
    assert.throws(() => approvedDatabaseOptions(value, pin), /approved target/);
  }
  assert.throws(() => approvedDatabaseOptions(pooled, JSON.stringify({ ...JSON.parse(pin), migrationRole: 'synthetic' })), /approved target/);
  assert.throws(() => approvedDatabaseOptions(pooled, ''), /approved target/);
  assert.throws(() => verifyDatabaseIdentity({ database: 'example', session_role: 'owner', active_role: 'synthetic' }, { database: 'example', user: 'synthetic' }), /approved target/);
});

test('Vercel uses pooled Neon with verified TLS and the schema operator uses a direct connection', () => {
  assert.deepEqual(databaseOptions(pooled, { vercel: true }), {
    host: 'ep-test-pooler.region.aws.neon.tech', port: 5432, database: 'example', user: 'synthetic',
    password: 'synthetic@test', ssl: { rejectUnauthorized: true }, enableChannelBinding: true,
  });
  assert(databaseOptions(direct, { direct: true }).ssl.rejectUnauthorized);
  assert.throws(() => databaseOptions(pooled, { direct: true }));
  assert.throws(() => databaseOptions(direct, { vercel: true }));
});

test('only local fixtures may disable TLS and invalid configuration does not echo credentials', () => {
  const local = 'postgres://test:secret-marker@127.0.0.1:55321/fixture?sslmode=disable';
  assert.equal(databaseOptions(local).ssl, false);
  for (const invalid of [local.replace('127.0.0.1', 'example.test'), local + '&host=example.test', local + '&sslmode=require', local + '#secret-marker', 'secret-marker']) {
    assert.throws(() => databaseOptions(invalid), error => !error.message.includes('secret-marker'));
  }
  assert.throws(() => databaseOptions(local, { vercel: true }));
});

test('transaction uses one connection, commits verified work and rolls back before reuse on failure', async () => {
  const client = new EventEmitter();
  const calls = [];
  client.query = async statement => calls.push(statement);
  client.release = discard => calls.push(discard);
  const pool = { connect: async () => client };
  assert.equal(await inTransaction(pool, async pinned => {
    assert.equal(pinned, client);
    return 'verified';
  }), 'verified');
  assert.deepEqual(calls.splice(0), ['BEGIN ISOLATION LEVEL READ COMMITTED', 'COMMIT', false]);
  await assert.rejects(inTransaction(pool, async () => { throw new Error('verification failed'); }), /verification failed/);
  assert.deepEqual(calls.splice(0), ['BEGIN ISOLATION LEVEL READ COMMITTED', 'ROLLBACK', false]);
  await assert.rejects(inTransaction(pool, async pinned => {
    pinned.emit('error', new Error('disconnected'));
    throw new Error('verify failed');
  }), /verify failed/);
  assert.deepEqual(calls, ['BEGIN ISOLATION LEVEL READ COMMITTED', 'ROLLBACK', true]);
});
