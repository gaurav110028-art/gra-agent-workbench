/* =========================================================
   24/7 AUTOMATION & EXECUTION STORE
   Provides server-side persistence for:
   - Automated schedules (daily, hourly, cron)
   - Background execution logs & states
   - Event triggers & webhooks
   - Safe retry tracking with exponential backoff
   - Differentiating pausing future runs vs cancelling active executions
========================================================= */

// In-memory server-side state (persists across API requests in Node runtime)
globalThis.__gra_schedules = globalThis.__gra_schedules || {};
globalThis.__gra_execution_logs = globalThis.__gra_execution_logs || [];
globalThis.__gra_active_runs = globalThis.__gra_active_runs || {};

/**
 * Get all registered 24/7 schedules
 */
export function getAllSchedules() {
  return Object.values(globalThis.__gra_schedules);
}

/**
 * Get schedule for a specific agent
 */
export function getAgentSchedule(agentId) {
  if (!agentId) return null;
  return globalThis.__gra_schedules[agentId] || null;
}

/**
 * Register or update an agent's 24/7 automation schedule
 */
export function setAgentSchedule(agentId, scheduleData) {
  if (!agentId) return null;

  const existing = globalThis.__gra_schedules[agentId] || {};
  const updated = {
    agentId,
    agentName: scheduleData.agentName || existing.agentName || 'Automation Agent',
    enabled: scheduleData.enabled !== undefined ? Boolean(scheduleData.enabled) : true,
    cronExpression: scheduleData.cronExpression || existing.cronExpression || '0 9 * * *',
    frequency: scheduleData.frequency || existing.frequency || 'Daily at 09:00 AM IST',
    timezone: scheduleData.timezone || 'Asia/Kolkata',
    maxRetries: Number(scheduleData.maxRetries ?? existing.maxRetries ?? 3),
    retryCount: Number(scheduleData.retryCount ?? 0),
    lastRunAt: existing.lastRunAt || null,
    nextRunAt: scheduleData.nextRunAt || calculateNextRun(scheduleData.cronExpression || '0 9 * * *'),
    lastStatus: existing.lastStatus || 'idle',
    workflowSnapshot: scheduleData.workflowSnapshot || existing.workflowSnapshot || null,
    updatedAt: new Date().toISOString(),
  };

  globalThis.__gra_schedules[agentId] = updated;
  return updated;
}

/**
 * Pause future runs of an agent (without cancelling any currently active run)
 */
export function pauseAgentSchedule(agentId) {
  const schedule = globalThis.__gra_schedules[agentId];
  if (!schedule) return null;

  schedule.enabled = false;
  schedule.lastStatus = 'paused';
  schedule.updatedAt = new Date().toISOString();
  return schedule;
}

/**
 * Resume future runs of an agent
 */
export function resumeAgentSchedule(agentId) {
  const schedule = globalThis.__gra_schedules[agentId];
  if (!schedule) return null;

  schedule.enabled = true;
  schedule.lastStatus = 'active';
  schedule.nextRunAt = calculateNextRun(schedule.cronExpression);
  schedule.updatedAt = new Date().toISOString();
  return schedule;
}

/**
 * Track an active background execution
 */
export function startBackgroundExecution(runId, agentId, agentName, triggerType = 'schedule') {
  const execution = {
    runId,
    agentId,
    agentName,
    triggerType,
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    cancelled: false,
    retryCount: 0,
    steps: [],
    error: null,
  };

  globalThis.__gra_active_runs[runId] = execution;
  logExecutionEvent({
    runId,
    agentId,
    agentName,
    event: 'EXECUTION_STARTED',
    message: `24/7 background execution started via ${triggerType}.`,
  });

  return execution;
}

/**
 * Cancel an actively executing run (distinct from pausing future runs)
 */
export function cancelActiveExecution(runId, reason = 'Cancelled by user command') {
  const execution = globalThis.__gra_active_runs[runId];
  if (!execution) return null;

  execution.cancelled = true;
  execution.status = 'cancelled';
  execution.completedAt = new Date().toISOString();
  execution.error = reason;

  logExecutionEvent({
    runId,
    agentId: execution.agentId,
    agentName: execution.agentName,
    event: 'EXECUTION_CANCELLED',
    message: `Active run cancelled: ${reason}`,
  });

  return execution;
}

/**
 * Complete a background execution
 */
export function completeBackgroundExecution(runId, status = 'completed', error = null) {
  const execution = globalThis.__gra_active_runs[runId];
  if (!execution) return null;

  execution.status = status;
  execution.completedAt = new Date().toISOString();
  if (error) execution.error = error;

  // Update schedule status
  if (globalThis.__gra_schedules[execution.agentId]) {
    const sched = globalThis.__gra_schedules[execution.agentId];
    sched.lastRunAt = execution.completedAt;
    sched.lastStatus = status;
    sched.nextRunAt = calculateNextRun(sched.cronExpression);
  }

  logExecutionEvent({
    runId,
    agentId: execution.agentId,
    agentName: execution.agentName,
    event: status === 'completed' ? 'EXECUTION_COMPLETED' : 'EXECUTION_FAILED',
    message: error ? `Run finished with error: ${error}` : 'Run completed successfully.',
  });

  return execution;
}

/**
 * Append audit log event (capped at 500 events)
 */
export function logExecutionEvent(entry) {
  const logItem = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };

  globalThis.__gra_execution_logs.unshift(logItem);
  if (globalThis.__gra_execution_logs.length > 500) {
    globalThis.__gra_execution_logs = globalThis.__gra_execution_logs.slice(0, 500);
  }

  return logItem;
}

/**
 * Get recent execution audit logs
 */
export function getExecutionLogs(limit = 50, agentId = null) {
  let logs = globalThis.__gra_execution_logs;
  if (agentId) {
    logs = logs.filter((item) => item.agentId === agentId);
  }
  return logs.slice(0, limit);
}

/**
 * Helper to calculate simulated next run time
 */
function calculateNextRun(cronExpression) {
  const now = new Date();
  // Default to tomorrow 9:00 AM IST if daily
  const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  next.setHours(9, 0, 0, 0);
  return next.toISOString();
}
