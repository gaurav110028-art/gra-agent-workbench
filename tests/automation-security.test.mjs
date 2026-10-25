import test from 'node:test';
import assert from 'node:assert/strict';
import { setAgentSchedule, getAgentSchedule, startBackgroundExecution, cancelActiveExecution, completeBackgroundExecution } from '../app/architect/automationStore.js';
import { executeMcpTool, getSystemAuditTrail } from '../app/architect/mcpAndTemplates.js';
test('prototype keys cannot read or mutate automation state or invoke inherited MCP properties', () => {
  for (const id of ['__proto__', 'constructor', 'prototype']) {
    assert.throws(() => setAgentSchedule(id, {}));
    assert.throws(() => getAgentSchedule(id));
    assert.throws(() => startBackgroundExecution(id, 'synthetic', 'Synthetic'));
    assert.throws(() => executeMcpTool(id, {}));
  }
  assert.equal(Object.getPrototypeOf(globalThis.__gra_schedules), null);
});
test('ordinary schedule and cancellation features remain available with explicit non-durable status', () => {
  const schedule = setAgentSchedule('synthetic-agent', { agentName: 'Synthetic' });
  assert.equal(schedule.durable, false);
  const run = startBackgroundExecution('synthetic-run', 'synthetic-agent', 'Synthetic');
  assert.equal(run.executionMode, 'simulation');
  assert.equal(cancelActiveExecution('synthetic-run').status, 'cancelled');
  assert.equal(completeBackgroundExecution('synthetic-run').status, 'cancelled', 'A late completion callback cannot undo cancellation');
});
test('MCP audit records retain action metadata without business input/result values', () => {
  const result = executeMcpTool('tax_calculator', { baseAmount: 12345, ratePercent: 18, SYNTHETIC_PRIVATE_KEY: 'SYNTHETIC_PRIVATE_VALUE' }, 'Synthetic Reviewer');
  assert(result);
  const records = JSON.stringify(getSystemAuditTrail());
  assert(!records.includes('SYNTHETIC_PRIVATE_VALUE') && !records.includes('SYNTHETIC_PRIVATE_KEY'));
  assert(!records.includes('12345'));
  assert(records.includes('MCP_TOOL_EXECUTION'));
});
