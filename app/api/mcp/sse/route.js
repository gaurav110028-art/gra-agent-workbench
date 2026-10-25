import { mcpStream } from '../../../../lib/security/sse.mjs';
import { secure } from '../../../../lib/security/route.mjs';
export const runtime = 'nodejs';
export const maxDuration = 60;

import {
  getAllSchedules,
  setAgentSchedule,
  startBackgroundExecution,
  completeBackgroundExecution,
  cancelActiveExecution,
  getExecutionLogs,
} from '../../../architect/automationStore.js';

import {
  executeMcpTool,
  CA_AGENT_TEMPLATES,
} from '../../../architect/mcpAndTemplates.js';

const CORS_HEADERS = {};

async function handleOPTIONS(request, principal) {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

async function handleGET(request) { return mcpStream(request); }

export const GET = secure({"permission":"mcp:read","limit":6}, handleGET);

export const OPTIONS = secure({"preflight":true}, handleOPTIONS);
