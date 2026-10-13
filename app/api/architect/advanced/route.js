export const runtime = 'nodejs';

import {
  MCP_TOOLS_REGISTRY,
  executeMcpTool,
  CA_AGENT_TEMPLATES,
  getSystemAuditTrail,
} from '../../../architect/mcpAndTemplates.js';

import { debugAndRepairWorkflow } from '../../../architect/workflowDebugger.js';

/* =========================================================
   PHASE 6: ADVANCED ARCHITECT CAPABILITIES API
   Endpoint: /api/architect/advanced
   
   GET: Fetch MCP tools registry, CA agent templates, and audit trail
   POST: Execute MCP tool, run debugger, or repair workflow
========================================================= */

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'all';

    if (view === 'audit') {
      const auditTrail = getSystemAuditTrail(50);
      return Response.json({ ok: true, auditTrail });
    }

    if (view === 'templates') {
      return Response.json({ ok: true, templates: CA_AGENT_TEMPLATES });
    }

    if (view === 'tools') {
      const tools = Object.values(MCP_TOOLS_REGISTRY).map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
      return Response.json({ ok: true, tools });
    }

    return Response.json({
      ok: true,
      templates: CA_AGENT_TEMPLATES,
      tools: Object.values(MCP_TOOLS_REGISTRY).map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
      auditTrail: getSystemAuditTrail(20),
    });
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Failed to retrieve advanced architect data.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const action = String(payload.action || '').toUpperCase();

    switch (action) {
      case 'DEBUG_AND_REPAIR': {
        const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
        const edges = Array.isArray(payload.edges) ? payload.edges : [];
        const report = debugAndRepairWorkflow(nodes, edges);

        return Response.json({
          ok: true,
          report,
        });
      }

      case 'EXECUTE_MCP_TOOL': {
        const toolName = String(payload.toolName || '').trim();
        const params = payload.params || {};
        const user = payload.user || 'CA Partner';

        const result = executeMcpTool(toolName, params, user);

        return Response.json({
          ok: true,
          toolName,
          result,
        });
      }

      default:
        return Response.json(
          { error: `Unknown advanced action: "${action}".` },
          { status: 400 }
        );
    }
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Failed to process advanced request.' },
      { status: 500 }
    );
  }
}
