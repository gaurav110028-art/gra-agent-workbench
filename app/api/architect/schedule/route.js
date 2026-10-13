export const runtime = 'nodejs';

import {
  getAllSchedules,
  getAgentSchedule,
  setAgentSchedule,
  pauseAgentSchedule,
  resumeAgentSchedule,
  startBackgroundExecution,
  completeBackgroundExecution,
  cancelActiveExecution,
  getExecutionLogs,
} from '../../../architect/automationStore.js';

/* =========================================================
   24/7 AUTOMATION & SCHEDULE API
   Endpoint: /api/architect/schedule
   
   GET: Fetch registered schedules or logs
   POST: Register, update, pause, resume, trigger, or cancel runs
========================================================= */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const logsOnly = searchParams.get('logs') === 'true';

    if (logsOnly) {
      const logs = getExecutionLogs(50, agentId);
      return Response.json({ ok: true, logs });
    }

    if (agentId) {
      const schedule = getAgentSchedule(agentId);
      return Response.json({ ok: true, schedule });
    }

    const schedules = getAllSchedules();
    return Response.json({ ok: true, schedules });
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Failed to fetch automation schedule.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const action = String(payload.action || '').toUpperCase();
    const agentId = String(payload.agentId || '').trim();
    const agentName = String(payload.agentName || 'Agent').trim();

    if (!agentId && action !== 'GET_ALL') {
      return Response.json({ error: 'agentId is required.' }, { status: 400 });
    }

    switch (action) {
      case 'REGISTER_SCHEDULE': {
        const schedule = setAgentSchedule(agentId, {
          agentName,
          cronExpression: payload.cronExpression || '0 9 * * *',
          frequency: payload.frequency || 'Daily at 09:00 AM IST',
          workflowSnapshot: payload.workflowSnapshot || null,
          enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : true,
        });

        return Response.json({
          ok: true,
          message: `24/7 schedule registered for ${agentName}.`,
          schedule,
        });
      }

      case 'PAUSE_SCHEDULE': {
        const schedule = pauseAgentSchedule(agentId);
        return Response.json({
          ok: true,
          message: `Future scheduled runs paused for ${agentName}.`,
          schedule,
        });
      }

      case 'RESUME_SCHEDULE': {
        const schedule = resumeAgentSchedule(agentId);
        return Response.json({
          ok: true,
          message: `24/7 schedule resumed for ${agentName}.`,
          schedule,
        });
      }

      case 'TRIGGER_BACKGROUND_RUN': {
        const runId = `cron-run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const execution = startBackgroundExecution(runId, agentId, agentName, payload.triggerType || 'schedule');

        // Simulate background execution lifecycle (doesn't block the client)
        setTimeout(() => {
          completeBackgroundExecution(runId, 'completed');
        }, 1200);

        return Response.json({
          ok: true,
          message: `Background run initiated for ${agentName}. Execution is running in the background.`,
          execution,
        });
      }

      case 'CANCEL_ACTIVE_RUN': {
        const runId = String(payload.runId || '').trim();
        if (!runId) {
          return Response.json({ error: 'runId is required to cancel active execution.' }, { status: 400 });
        }

        const cancelled = cancelActiveExecution(runId, payload.reason || 'User requested cancellation');
        return Response.json({
          ok: true,
          message: `Active run ${runId} cancelled.`,
          execution: cancelled,
        });
      }

      default:
        return Response.json(
          { error: `Unknown automation action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Failed to process automation action.' },
      { status: 500 }
    );
  }
}
