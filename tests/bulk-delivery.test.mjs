import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeBulkDelivery } from '../lib/bulk-delivery.mjs';
test('partial delivery caused by rate limiting is a failed batch, never an all-sent result', () => {
  const result = summarizeBulkDelivery([{ to: 'one@example.test', status: 'sent', id: 'synthetic-id' }, { to: 'two@example.test', status: 'failed', error: 'Request limit reached.' }]);
  assert.equal(result.status, 'failed'); assert.equal(result.sent.length, 1); assert.equal(result.failed.length, 1); assert.match(result.error, /Request limit reached/);
});
test('empty and unconfirmed deliveries cannot report success; fully confirmed delivery can', () => {
  assert.equal(summarizeBulkDelivery([]).status, 'failed');
  assert.equal(summarizeBulkDelivery([{ status: 'unknown' }]).status, 'failed');
  assert.equal(summarizeBulkDelivery([{ status: 'sent' }, { status: 'sent' }]).status, 'sent');
});
