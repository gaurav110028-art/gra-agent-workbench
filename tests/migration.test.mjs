import assert from 'node:assert/strict';
import test from 'node:test';
import { previewLegacyStorage } from '../app/workspace/migration/legacy-preview.mjs';
import { createMigrationService, migrationFingerprint } from '../lib/migration/repository.mjs';

const agent = { kind: 'agents', id: '1', payload: { id: 1, name: 'SYNTHETIC_PRIVATE_AGENT', status: 'paused' } };
const graph = { kind: 'workflows', id: '1', payload: { nodes: [], edges: [] } };
const savedAt = '2026-01-01T00:00:00.000Z';
const versions = { kind: 'versions', id: '1', payload: {
  agentId: 1, draftVersion: 1, publishedVersion: null, isDirty: true,
  draft: { ...graph.payload, savedAt }, published: null, lastPublishedAt: null,
} };
const approved = records => ({ version: 1, records, approval: { confirmed: true, fingerprint: migrationFingerprint(records) } });
const actor = 'synthetic-admin';
const noSources = { databases: async () => [], open: () => assert.fail('An absent database must stay absent') };

function browserStorage(values, reads = []) {
  const keys = Object.keys(values);
  return {
    length: keys.length,
    key: index => keys[index],
    getItem: key => { reads.push(key); return values[key]; },
    setItem: () => assert.fail('Migration preview must not write'),
    removeItem: () => assert.fail('Migration preview must not delete'),
  };
}

test('preview is empty for an unused profile and does not create IndexedDB', async () => {
  const report = await previewLegacyStorage(browserStorage({}), noSources);
  assert(!report.exceedsBatchLimits);
  assert(report.categories.every(row => row.valid === 0 && row.invalid === 0 && row.unreadable === 0 && row.excluded === 0));
});

test('preview classifies valid, malformed, conflicting and unsupported records without exposing values', async () => {
  const reads = [];
  const report = await previewLegacyStorage(browserStorage({
    'gra-agents': JSON.stringify([agent.payload, { id: 2 }, { ...agent.payload, id: 3 }, { ...agent.payload, id: 3, status: 'running' }]),
    'gra-workflow-1': JSON.stringify(graph.payload),
    'gra-workflow-404': JSON.stringify(graph.payload),
    'gra-workflow-version-1': JSON.stringify(versions.payload),
    'gra-workflow-version-9': '{ broken',
    'gra-run-history': JSON.stringify([{ id: 'synthetic-run', status: 'Completed', startedAt: savedAt, steps: [] }]),
    'gra-auth-users': 'SYNTHETIC_HASH',
    'unknown-key': 'SYNTHETIC_UNKNOWN',
  }, reads), noSources);
  const get = id => report.categories.find(row => row.id === id);
  assert.deepEqual([get('agents').valid, get('agents').invalid], [1, 3]);
  assert.deepEqual([get('workflows').valid, get('workflows').invalid], [1, 1]);
  assert.deepEqual([get('versions').valid, get('versions').unreadable], [1, 1]);
  assert.equal(get('runs').disposition, 'deferred');
  assert.equal(get('runs').valid, 1);
  assert.equal(get('identity').excluded, 1);
  assert(!reads.includes('gra-auth-users') && !reads.includes('unknown-key'));
  assert(!JSON.stringify(report).includes('SYNTHETIC_'));
  assert.equal((await previewLegacyStorage(browserStorage({}), {})).categories.find(row => row.id === 'sources').unreadable, 1);
});

// A transactional test double only. This deliberately does not implement durable storage.
function testRepository() {
  let records = new Map();
  let receipts = new Map();
  const behavior = { corrupt: false, failReceipt: false, dropReceipt: false, loseCommitResponse: false, transactions: 0 };
  return {
    behavior,
    state: () => ({ records: structuredClone(records), receipts: structuredClone(receipts) }),
    forgetRecord: key => records.delete(key),
    async transaction(work) {
      behavior.transactions++;
      const pending = structuredClone(records);
      const pendingReceipts = structuredClone(receipts);
      const result = await work({
        async insertIfAbsent(row) {
          const key = row.kind + '/' + row.id;
          if (pending.has(key)) return false;
          pending.set(key, structuredClone(row));
          return true;
        },
        async readRecord(kind, id) {
          const row = structuredClone(pending.get(kind + '/' + id));
          if (behavior.corrupt && kind === 'workflows') row.payload = { ...row.payload, unexpected: 'SYNTHETIC_CORRUPTION' };
          return row;
        },
        async recordBatch(receipt) {
          if (behavior.failReceipt) throw new Error('SYNTHETIC_CONFIDENTIAL_DATABASE_ERROR');
          if (pendingReceipts.has(receipt.fingerprint)) return false;
          if (!behavior.dropReceipt) pendingReceipts.set(receipt.fingerprint, receipt);
          return true;
        },
        async readBatch(fingerprint) {
          return structuredClone(pendingReceipts.get(fingerprint));
        },
      });
      records = pending;
      receipts = pendingReceipts;
      if (behavior.loseCommitResponse) throw new Error('SYNTHETIC_CONFIDENTIAL_CONNECTION_ERROR');
      return result;
    },
  };
}

test('approval is order-independent and duplicate imports never overwrite or add duplicate receipts', async () => {
  const repository = testRepository();
  const service = createMigrationService(repository);
  const records = [agent, graph, agent, versions];
  const request = approved(records);
  assert.equal(request.approval.fingerprint, migrationFingerprint([versions, graph, agent]));
  assert.deepEqual(await service.importBatch(request, actor), { inserted: 3, alreadyPresent: 0, duplicatesInBatch: 1 });
  assert.deepEqual(await service.importBatch(approved([versions, agent, graph]), actor), { inserted: 0, alreadyPresent: 3, duplicatesInBatch: 0 });
  const stored = repository.state();
  assert.equal(stored.records.size, 3);
  assert.deepEqual(stored.records.get('versions/1').payload, versions.payload);
  assert.equal(stored.receipts.size, 1);
  assert.equal([...stored.receipts.values()][0].actorId, actor);
  assert([...stored.receipts.values()][0].entries.every(entry => entry.inserted));
  assert(!JSON.stringify([...stored.receipts.values()]).includes(agent.payload.name));
});

test('missing storage, bad approvals, unsafe JSON, dangling edges and missing agents prevent writes', async () => {
  const repository = testRepository();
  const service = createMigrationService(repository);
  await assert.rejects(createMigrationService().importBatch(approved([agent]), actor), { code: 'MIGRATION_STORAGE_UNAVAILABLE' });
  await assert.rejects(service.importBatch({ ...approved([agent]), approval: {} }, actor), { code: 'MIGRATION_APPROVAL_REQUIRED' });
  const changedAgent = { ...agent, payload: { ...agent.payload, name: 'changed' } };
  await assert.rejects(service.importBatch({ ...approved([agent]), records: [changedAgent] }, actor), { code: 'MIGRATION_APPROVAL_REQUIRED' });
  const malformed = [
    [], [graph], [{ ...agent, kind: 'contacts' }], [{ ...agent, id: 'different' }],
    [agent, { ...graph, payload: { nodes: [], edges: [{ id: '3', source: '1', target: '2' }] } }],
    [agent, { ...versions, payload: { ...versions.payload, draftVersion: -1 } }],
    [{ ...agent, payload: JSON.parse('{"id":1,"name":"Synthetic","status":"paused","__proto__":{}}') }],
    [{ ...agent, payload: { ...agent.payload, name: 'a'.repeat(1024 * 1024) } }],
  ];
  for (const records of malformed) {
    await assert.rejects(service.importBatch({ version: 1, records, approval: {} }, actor), { code: 'INVALID_MIGRATION_BATCH' });
  }
  await assert.rejects(service.importBatch({ version: 1, records: [agent, changedAgent] }, actor), { code: 'MIGRATION_CONFLICT' });
  assert.equal(repository.behavior.transactions, 0);
});

test('existing conflicting data and failed read-back roll back the entire batch', async () => {
  const repository = testRepository();
  const service = createMigrationService(repository);
  await service.importBatch(approved([agent]), actor);
  const before = repository.state();
  const added = { ...agent, id: '0', payload: { ...agent.payload, id: 0 } };
  const conflict = { ...agent, payload: { ...agent.payload, name: 'different' } };
  await assert.rejects(service.importBatch(approved([added, conflict]), actor), { code: 'MIGRATION_CONFLICT' });
  assert.deepEqual(repository.state(), before);
  repository.behavior.corrupt = true;
  await assert.rejects(service.importBatch(approved([agent, graph]), actor), { code: 'MIGRATION_INTEGRITY_FAILED' });
  assert.deepEqual(repository.state(), before);
});

test('failed receipts roll back and an indeterminate commit can be retried without duplicates', async () => {
  const repository = testRepository();
  const service = createMigrationService(repository);
  const request = approved([agent, graph]);
  const safeError = error => error.code === 'MIGRATION_STORAGE_ERROR' && !error.message.includes('CONFIDENTIAL');
  repository.behavior.failReceipt = true;
  await assert.rejects(service.importBatch(request, actor), safeError);
  assert.equal(repository.state().records.size, 0);
  repository.behavior.failReceipt = false;
  repository.behavior.dropReceipt = true;
  await assert.rejects(service.importBatch(request, actor), { code: 'MIGRATION_INTEGRITY_FAILED' });
  assert.equal(repository.state().records.size, 0);
  repository.behavior.dropReceipt = false;
  repository.behavior.loseCommitResponse = true;
  await assert.rejects(service.importBatch(request, actor), safeError);
  repository.behavior.loseCommitResponse = false;
  assert.deepEqual(await service.importBatch(request, actor), { inserted: 0, alreadyPresent: 2, duplicatesInBatch: 0 });
  assert.equal(repository.state().receipts.size, 1);
  repository.forgetRecord('workflows/1');
  await assert.rejects(service.importBatch(request, actor), { code: 'MIGRATION_INTEGRITY_FAILED' });
  assert.equal(repository.state().records.size, 1);
});
