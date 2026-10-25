import { mcpStream } from '../../../lib/security/sse.mjs';
import { can } from '../../../lib/security/auth.mjs';
import { after } from 'next/server';
import { secure } from '../../../lib/security/route.mjs';
export const runtime = 'nodejs';
export const maxDuration = 60;

import {
  getAllSchedules,
  setAgentSchedule,
  startBackgroundExecution,
  completeBackgroundExecution,
  cancelActiveExecution,
  getExecutionLogs,
} from '../../architect/automationStore.js';

import {
  executeMcpTool,
  MCP_TOOLS_REGISTRY,
  CA_AGENT_TEMPLATES,
} from '../../architect/mcpAndTemplates.js';

/* =========================================================
   OPENAI PLUGIN / MCP SERVER ENDPOINT
   Endpoint: /api/mcp
   Specification: Model Context Protocol (MCP) JSON-RPC 2.0
   
   Supports:
   - initialize: MCP server handshake
   - notifications/initialized: MCP lifecycle confirmation
   - tools/list: Exposes tools to ChatGPT
   - tools/call: Executes tools invoked by ChatGPT
   - resources/list: Exposes agent templates and recent logs
========================================================= */

const CORS_HEADERS = {};

async function handleOPTIONS(request, principal) {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Available MCP tools exposed to ChatGPT
const EXPOSED_TOOLS = [
  {
    name: 'gra_trigger_agent',
    description: 'Triggers an automation agent execution (ITR Chaser, GST Reco, Tax Notice Alert) on GRA Workbench in test or live mode.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID of the agent to execute' },
        agentName: { type: 'string', description: 'Display name of the agent' },
        mode: { type: 'string', enum: ['test', 'live'], description: 'Execution mode. Default is test.' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'gra_get_agent_status',
    description: 'Retrieves current execution status, recent runs, and 24/7 schedule for a specific agent on GRA Workbench.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID of the agent to check' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'gra_schedule_agent',
    description: 'Schedules an agent to run 24/7 automatically (e.g. Daily at 09:00 AM IST) without requiring an open browser.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ID of the agent to schedule' },
        agentName: { type: 'string', description: 'Agent name' },
        frequency: { type: 'string', description: 'Human readable frequency like Daily at 09:00 AM IST' },
        cronExpression: { type: 'string', description: 'Standard 5-part cron expression' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'gra_cancel_execution',
    description: 'Aborts and cancels an active running execution pipeline on GRA Workbench.',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Run ID to abort' },
        reason: { type: 'string', description: 'Cancellation reason' },
      },
      required: ['runId'],
    },
  },
  {
    name: 'gra_calculate_indian_tax',
    description: 'Calculates Indian GST, TDS, cess, and total invoice amounts accurately based on statutory rates.',
    inputSchema: {
      type: 'object',
      properties: {
        baseAmount: { type: 'number', description: 'Taxable value in INR' },
        ratePercent: { type: 'number', description: 'GST or TDS rate percent (e.g. 18, 5, 2)' },
        cessPercent: { type: 'number', description: 'Cess percentage if applicable' },
      },
      required: ['baseAmount', 'ratePercent'],
    },
  },
  {
    name: 'gra_validate_gstin',
    description: 'Validates Indian GSTIN format (15 characters) and extracts state code and PAN.',
    inputSchema: {
      type: 'object',
      properties: {
        gstin: { type: 'string', description: '15-character Indian GST identification number' },
      },
      required: ['gstin'],
    },
  },
  {
    name: 'gra_list_templates',
    description: 'Lists curated CA compliance automation templates (GSTR-2B vs 3B Chaser, ITR Tracker, 148 Notice Alert, MSME Monitor).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

async function handleGET(request, principal) {
  const acceptHeader = request?.headers?.get('accept') || '';

  // If OpenAI / client requests SSE stream (standard MCP SSE transport)
  if (acceptHeader.includes('text/event-stream')) return mcpStream(request);

  // Standard JSON response
  return Response.json(
    {
      name: 'gra-agent-workbench-mcp',
      version: '1.0.0',
      status: 'active',
      description: 'GRA Agent Workbench Model Context Protocol (MCP) Server for ChatGPT and Codex plugins',
      toolsCount: EXPOSED_TOOLS.length,
      protocolVersion: '2024-11-05',
    },
    { headers: CORS_HEADERS }
  );
}

async function handlePOST(request, principal) {
  try {
    let body = {};
    const text = await request.text();
    if (text && text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
    }
    const { method, params = {}, id = 1 } = body;

    // Maintain session ID header
    const suppliedSession = request.headers.get('mcp-session-id');
    const sessionId = /^[a-zA-Z0-9_-]{1,128}$/.test(suppliedSession || '') ? suppliedSession : `gra-session-${crypto.randomUUID()}`;
    const responseHeaders = {
      ...CORS_HEADERS,
      'mcp-session-id': sessionId,
      'mcp-protocol-version': '2024-11-05',
    };

    if (method === 'tools/call' && ['gra_trigger_agent', 'gra_schedule_agent', 'gra_cancel_execution'].includes(params.name) && !can(principal, 'mcp:write')) return Response.json({ error: 'MCP write scope is required.' }, { status: 403 });

    switch (method) {
      // 1. MCP Initialization
      case 'initialize':
        return Response.json(
          {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: {
                name: 'gra-agent-workbench',
                version: '1.0.0',
              },
              capabilities: {
                tools: {
                  listChanged: false,
                },
                resources: {},
              },
            },
          },
          { headers: responseHeaders }
        );

      // 2. MCP Client Initialized Notification
      case 'notifications/initialized':
      case 'initialized':
        return Response.json(
          {
            jsonrpc: '2.0',
            result: { status: 'acknowledged' },
          },
          { headers: responseHeaders }
        );

      // 3. List Available Tools to ChatGPT
      case 'tools/list':
        return Response.json(
          {
            jsonrpc: '2.0',
            id,
            result: {
              tools: EXPOSED_TOOLS,
            },
          },
          { headers: responseHeaders }
        );

      // 4. Ping probe
      case 'ping':
        return Response.json(
          {
            jsonrpc: '2.0',
            id,
            result: {},
          },
          { headers: responseHeaders }
        );

      // 5. Execute Tool Call Invoked by ChatGPT
      case 'tools/call': {
        const { name, arguments: args = {} } = params;
        if (!args || typeof args !== 'object' || Array.isArray(args)) return Response.json({ error: 'MCP arguments must be an object.' }, { status: 400 });
        const validIdentifier = value => /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(String(value || '')) && !['constructor', 'prototype', '__proto__'].includes(String(value));
        if (['gra_trigger_agent', 'gra_get_agent_status', 'gra_schedule_agent'].includes(name) && !validIdentifier(args.agentId)) return Response.json({ error: 'A valid agentId is required.' }, { status: 400 });
        if (name === 'gra_cancel_execution' && !validIdentifier(args.runId)) return Response.json({ error: 'A valid runId is required.' }, { status: 400 });
        let contentResult = null;

        if (name === 'gra_trigger_agent') {
          const runId = `chatgpt-run-${Date.now()}`;
          startBackgroundExecution(
            runId,
            args.agentId,
            args.agentName || 'Agent',
            'chatgpt-plugin'
          );

          // Simulated safe execution cycle
          after(async () => {
            await new Promise(resolve => setTimeout(resolve, 800));
            completeBackgroundExecution(runId, 'completed');
          });

          contentResult = {
            message: `Agent ${args.agentName || args.agentId} triggered successfully from ChatGPT.`,
            runId,
            mode: args.mode || 'test',
            status: 'running',
          };
        } else if (name === 'gra_get_agent_status') {
          const logs = getExecutionLogs(5, args.agentId);
          const schedules = getAllSchedules();
          const sched = schedules.find((s) => s.agentId === args.agentId);

          contentResult = {
            agentId: args.agentId,
            isScheduled: Boolean(sched && sched.enabled),
            scheduleFrequency: sched?.frequency || 'None',
            recentRunsCount: logs.length,
            lastStatus: sched?.lastStatus || 'idle',
            recentLogs: logs,
          };
        } else if (name === 'gra_schedule_agent') {
          const schedule = setAgentSchedule(args.agentId, {
            agentName: args.agentName || 'Agent',
            frequency: args.frequency || 'Daily at 09:00 AM IST',
            cronExpression: args.cronExpression || '0 9 * * *',
          });

          contentResult = {
            message: `Demo schedule stored for ${args.agentName || args.agentId}; durable 24/7 execution is not configured.`,
            schedule,
          };
        } else if (name === 'gra_cancel_execution') {
          const cancelled = cancelActiveExecution(args.runId, args.reason || 'Cancelled via ChatGPT plugin');
          contentResult = {
            message: `Execution ${args.runId} cancelled safely.`,
            execution: cancelled,
          };
        } else if (name === 'gra_calculate_indian_tax') {
          contentResult = executeMcpTool('tax_calculator', args, 'ChatGPT User');
        } else if (name === 'gra_validate_gstin') {
          contentResult = executeMcpTool('gstin_validator', args, 'ChatGPT User');
        } else if (name === 'gra_list_templates') {
          contentResult = { templates: CA_AGENT_TEMPLATES };
        } else {
          return Response.json(
            {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32601,
                message: `Tool "${name}" not found on GRA Workbench MCP Server.`,
              },
            },
            { status: 404, headers: responseHeaders }
          );
        }

        return Response.json(
          {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(contentResult, null, 2),
                },
              ],
            },
          },
          { headers: responseHeaders }
        );
      }

      default:
        return Response.json(
          {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method "${method}" is not supported.`,
            },
          },
          { status: 400, headers: responseHeaders }
        );
    }
  } catch (error) {
    return Response.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: error?.message || 'Internal MCP server error.',
        },
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export const GET = secure({"permission":"mcp:read","limit":20}, handleGET);

export const POST = secure({"permission":"mcp:read","limit":60}, handlePOST);

export const OPTIONS = secure({"preflight":true}, handleOPTIONS);
