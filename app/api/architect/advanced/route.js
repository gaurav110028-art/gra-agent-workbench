import { secure } from '../../../../lib/security/route.mjs';
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

async function handleGET(request, principal) {
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

async function handlePOST(request, principal) {
  try {
    const payload = await request.json();
    const action = String(payload.action || '').toUpperCase();

    switch (action) {
      case 'DEBUG_AND_REPAIR': {
        const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
        const edges = Array.isArray(payload.edges) ? payload.edges : [];
        if (nodes.length > 500 || edges.length > 1000) return Response.json({ error: 'Workflow complexity limit exceeded.' }, { status: 400 });
        const report = debugAndRepairWorkflow(nodes, edges);

        return Response.json({
          ok: true,
          report,
        });
      }

      case 'EXECUTE_MCP_TOOL': {
        const toolName = String(payload.toolName || '').trim();
        const params = payload.params || {};
        const user = principal.name || principal.id;

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

export const GET = secure({"permission":"workbench:read","limit":60}, handleGET);

export const POST = secure({"permission":"workflow:write","limit":30}, handlePOST);
