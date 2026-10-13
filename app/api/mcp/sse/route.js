export const runtime = 'edge';

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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, mcp-session-id, mcp-protocol-version',
  'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request) {
  const encoder = new TextEncoder();
  let timer;

  const stream = new ReadableStream({
    start(controller) {
      // Send standard initial endpoint event pointing to the POST handler
      const endpointEvent = `event: endpoint\ndata: https://gra-agent-workbench.vercel.app/api/mcp\n\n`;
      controller.enqueue(encoder.encode(endpointEvent));

      // Periodic keep-alive ping
      timer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch {
          clearInterval(timer);
        }
      }, 10000);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
