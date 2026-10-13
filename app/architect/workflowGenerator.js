/* =========================================================
   workflowGenerator.js
   Converts natural language instructions into concrete, valid
   React Flow nodes and edges for GRA Agent Workbench.
   
   Reuses nodeCatalog, configSchemas, and getDefaultConfig.
   Strictly rejects arbitrary executable code or invalid schemas.
========================================================= */

import {
  catalogItemByType,
  configSchemas,
  getDefaultConfig,
  triggerTypes,
} from '../workflowCatalog.js';

export function createNode(id, type, name, x, y, customConfig = {}, description) {
  const item = catalogItemByType[type];
  if (!item) {
    throw new Error(`Invalid node type: "${type}". Only catalog nodes are supported.`);
  }

  const baseConfig = getDefaultConfig(type);
  const mergedConfig = { ...baseConfig, ...customConfig };

  return {
    id,
    type: 'workflowNode',
    position: { x, y },
    data: {
      name: name || item.label,
      description: description || item.description || '',
      nodeType: type,
      icon: item.icon || '?',
      shape: item.shape || 'rounded',
      group: item.group || 'Block',
      config: mergedConfig,
    },
  };
}

export function createEdge(source, target, sourceHandle = null, label = null) {
  return {
    id: `e-${source}-${target}${sourceHandle ? `-${sourceHandle}` : ''}`,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
    ...(label ? { label } : {}),
    style: { stroke: '#6a6a6a', strokeWidth: 2 },
    markerEnd: { type: 'arrowclosed', color: 'var(--text-muted)' },
  };
}

/* =========================================================
   NATURAL LANGUAGE BLUEPRINT GENERATOR
========================================================= */

export function buildBlueprintFromPrompt(prompt, currentNodes = [], currentEdges = []) {
  const lower = String(prompt || '').toLowerCase();
  const isModification = currentNodes.length > 0 && (
    lower.includes('add ') ||
    lower.includes('insert ') ||
    lower.includes('remove ') ||
    lower.includes('change ') ||
    lower.includes('update ') ||
    lower.includes('replace ')
  );

  if (isModification) {
    return handleWorkflowModification(lower, currentNodes, currentEdges);
  }

  return generateFreshWorkflow(lower, prompt);
}

function generateFreshWorkflow(lower, rawPrompt) {
  const nodes = [];
  const edges = [];
  let stepIndex = 0;
  const getX = () => 60 + (stepIndex++) * 300;
  const baseY = 220;

  // 1. TRIGGER
  let triggerId = 'n_trigger';
  if (lower.includes('morning') || lower.includes('daily') || lower.includes('every day') || lower.includes('schedule') || lower.includes('cron')) {
    nodes.push(
      createNode(triggerId, 'schedule', 'Daily Schedule Timer', getX(), baseY, {
        scheduleType: 'Daily',
        time: '09:00',
        timezone: 'Asia/Kolkata',
      }, 'Fires automatically every morning at 9:00 AM IST')
    );
  } else if (lower.includes('webhook') || lower.includes('http') || lower.includes('payload')) {
    nodes.push(
      createNode(triggerId, 'webhook', 'Webhook Intake', getX(), baseY, {
        method: 'POST',
      }, 'Triggers when client documents or data arrive via HTTP')
    );
  } else if (lower.includes('email received') || lower.includes('query')) {
    nodes.push(
      createNode(triggerId, 'emailTrigger', 'Client Query Intake', getX(), baseY, {}, 'Starts when a client query arrives')
    );
  } else {
    nodes.push(
      createNode(triggerId, 'trigger', 'Manual Trigger', getX(), baseY, {}, 'Can be started manually by team member')
    );
  }

  let lastNodeId = triggerId;

  // 2. DATA INTAKE / EXTRACTION
  if (lower.includes('pdf') || lower.includes('invoice') || lower.includes('bill')) {
    const pdfId = 'n_pdf';
    nodes.push(
      createNode(pdfId, 'pdfParser', 'Extract PDF Invoice', getX(), baseY, {
        documentType: 'Tax Invoice',
        fields: 'invoice_number, invoice_date, gstin, vendor, taxable_value, gst_amount, total',
      }, 'Parses line items, GSTIN, and taxable amounts from PDF')
    );
    edges.push(createEdge(lastNodeId, pdfId));
    lastNodeId = pdfId;
  } else if (lower.includes('gstr') || lower.includes('reconcil') || lower.includes('purchase')) {
    const sheetId = 'n_register';
    nodes.push(
      createNode(sheetId, 'googleSheets', 'Purchase Register & 2B', getX(), baseY, {
        operation: 'Read Rows',
        spreadsheet: 'GST Compliance Master',
        sheet: 'GSTR2B_Recon',
        columns: 'client_name, gstin, invoice_number, taxable_value, 2b_status, mismatch_flag',
      }, 'Ingests purchase register and GSTR-2B filing data')
    );
    edges.push(createEdge(lastNodeId, sheetId));
    lastNodeId = sheetId;
  } else {
    const sheetId = 'n_checklist';
    nodes.push(
      createNode(sheetId, 'googleSheets', 'Client Master List', getX(), baseY, {
        operation: 'Read Rows',
        spreadsheet: 'Client Compliance Master',
        sheet: 'Pending_Docs',
        columns: 'client_name, email, phone, missing_documents, due_date, partner',
      }, 'Reads pending document list and client contacts')
    );
    edges.push(createEdge(lastNodeId, sheetId));
    lastNodeId = sheetId;
  }

  // 3. AI REASONING / DRAFTING
  const aiId = 'n_ai_reasoning';
  nodes.push(
    createNode(aiId, 'aiAgent', 'AI Draft & Classify', getX(), baseY, {
      provider: 'Claude (Anthropic)',
      systemPrompt: 'You are an expert CA automation assistant. Draft professional, concise, polite compliance follow-ups with itemized missing items and due dates.',
      userPrompt: 'Draft itemized follow-up message for {{$item.client_name}} regarding pending documents: {{$item.missing_documents}}. Statutory deadline: {{$item.due_date}}.',
      outputFormat: 'Text',
    }, 'Drafts personalized client notices with compliance dates')
  );
  edges.push(createEdge(lastNodeId, aiId));
  lastNodeId = aiId;

  // 4. CONDITIONAL CHECK (IF applicable)
  if (lower.includes('if') || lower.includes('mismatch') || lower.includes('pending') || lower.includes('condition')) {
    const condId = 'n_condition';
    nodes.push(
      createNode(condId, 'condition', 'Check Pending Status', getX(), baseY, {
        operator: 'Not Empty',
        leftValue: '{{$item.missing_documents}}',
      }, 'Verifies whether pending documents exist before prompting')
    );
    edges.push(createEdge(lastNodeId, condId));
    lastNodeId = condId;
  }

  // 5. HUMAN-IN-THE-LOOP APPROVAL GATE (Always for CA Firm Safety)
  const approvalId = 'n_ca_approval';
  nodes.push(
    createNode(approvalId, 'approval', 'CA Partner Approval Gate', getX(), baseY, {
      approver: 'Senior CA Partner',
      message: 'Approve drafted client communications and compliance notices before sending.',
    }, 'Pauses execution in Approvals tab for partner verification')
  );
  edges.push(createEdge(lastNodeId, approvalId));
  lastNodeId = approvalId;

  // 6. OUTPUT ACTION
  if (lower.includes('whatsapp')) {
    const waId = 'n_whatsapp';
    nodes.push(
      createNode(waId, 'whatsappApi', 'Send WhatsApp Notice', getX(), baseY, {
        to: '{{$item.phone}}',
        templateName: 'compliance_reminder_v1',
        message: '{{$node.AI Draft & Classify.output.text}}',
      }, 'Dispatches instant reminder to client WhatsApp')
    );
    edges.push(createEdge(lastNodeId, waId));
  } else {
    const emailId = 'n_email';
    nodes.push(
      createNode(emailId, 'bulkEmail', 'Resend Email Dispatch', getX(), baseY, {
        dataSource: 'Previous Node Items',
        to: '{{$item.email}}',
        subject: 'Urgent: Pending Compliance Documents for {{$item.client_name}}',
        body: '{{$node.AI Draft & Classify.output.text}}',
        maxRecipients: '50',
      }, 'Sends personalized email per client with itemized requirements')
    );
    edges.push(createEdge(lastNodeId, emailId));
  }

  return {
    nodes,
    edges,
    summary: `${nodes.length} nodes, ${edges.length} connections created for workflow`,
    changeType: 'create',
  };
}

function handleWorkflowModification(lower, currentNodes, currentEdges) {
  const newNodes = [...currentNodes];
  const newEdges = [...currentEdges];
  const summaryItems = [];

  // 1. Add approval gate if requested
  if ((lower.includes('add approval') || lower.includes('add gate') || lower.includes('add review')) &&
      !newNodes.some((n) => n.data.nodeType === 'approval')) {
    const maxX = Math.max(...newNodes.map((n) => n.position.x), 100);
    const actionNode = newNodes.find((n) => ['bulkEmail', 'email', 'whatsappApi', 'whatsapp', 'api'].includes(n.data.nodeType));

    const approvalId = `n_approval_${Date.now()}`;
    const approvalX = actionNode ? actionNode.position.x - 120 : maxX + 260;
    const approvalNode = createNode(approvalId, 'approval', 'CA Partner Approval Gate', approvalX, 220, {
      approver: 'Senior CA Partner',
      message: 'Approve execution before sending communications.',
    }, 'Pauses execution for partner sign-off');

    newNodes.push(approvalNode);

    if (actionNode) {
      // Find incoming edges to action node and reroute through approval
      const incoming = newEdges.filter((e) => e.target === actionNode.id);
      incoming.forEach((edge) => {
        edge.target = approvalId;
      });
      newEdges.push(createEdge(approvalId, actionNode.id));
    }

    summaryItems.push('Added CA Partner Approval Gate');
  }

  // 2. Change / Add WhatsApp
  if (lower.includes('add whatsapp') || lower.includes('change to whatsapp') || lower.includes('use whatsapp')) {
    const existingActionIndex = newNodes.findIndex((n) => ['bulkEmail', 'email'].includes(n.data.nodeType));
    const waId = `n_wa_${Date.now()}`;

    if (existingActionIndex >= 0 && lower.includes('change to whatsapp')) {
      const oldNode = newNodes[existingActionIndex];
      const waNode = createNode(waId, 'whatsappApi', 'WhatsApp Business Notice', oldNode.position.x, oldNode.position.y, {
        to: '{{$item.phone}}',
        message: 'Dear Client, please provide pending documents.',
      });
      newNodes[existingActionIndex] = waNode;

      newEdges.forEach((edge) => {
        if (edge.target === oldNode.id) edge.target = waId;
        if (edge.source === oldNode.id) edge.source = waId;
      });
      summaryItems.push('Replaced Email with WhatsApp Business API');
    } else {
      const maxX = Math.max(...newNodes.map((n) => n.position.x), 100);
      const waNode = createNode(waId, 'whatsappApi', 'WhatsApp Business Notice', maxX + 300, 220, {
        to: '{{$item.phone}}',
        message: 'Dear Client, please provide pending documents.',
      });
      newNodes.push(waNode);
      const lastNode = newNodes[newNodes.length - 2];
      if (lastNode) newEdges.push(createEdge(lastNode.id, waId));
      summaryItems.push('Added WhatsApp Business API action');
    }
  }

  // 3. Change trigger to schedule
  if (lower.includes('change trigger to schedule') || lower.includes('schedule every morning') || lower.includes('change to cron')) {
    const triggerIndex = newNodes.findIndex((n) => triggerTypes.includes(n.data.nodeType));
    const schedId = `n_sched_${Date.now()}`;
    const schedNode = createNode(schedId, 'schedule', 'Daily Schedule Timer', 60, 220, {
      scheduleType: 'Daily',
      time: '09:00',
      timezone: 'Asia/Kolkata',
    }, 'Fires automatically every morning at 9:00 AM IST');

    if (triggerIndex >= 0) {
      const oldTrigger = newNodes[triggerIndex];
      newNodes[triggerIndex] = schedNode;
      newEdges.forEach((edge) => {
        if (edge.source === oldTrigger.id) edge.source = schedId;
      });
      summaryItems.push('Changed trigger to Daily Schedule Timer');
    }
  }

  return {
    nodes: newNodes,
    edges: newEdges,
    summary: summaryItems.length ? summaryItems.join(' · ') : `Modified workflow (${newNodes.length} nodes)`,
    changeType: 'modify',
  };
}

/* =========================================================
   VALIDATION LAYER
========================================================= */

export function validateWorkflowBlueprint(blueprint) {
  const issues = [];
  const nodes = Array.isArray(blueprint?.nodes) ? blueprint.nodes : [];
  const edges = Array.isArray(blueprint?.edges) ? blueprint.edges : [];

  if (nodes.length === 0) {
    issues.push('Workflow has no nodes.');
    return { isValid: false, issues, nodes, edges };
  }

  const triggers = nodes.filter((n) => triggerTypes.includes(n.data?.nodeType));
  if (triggers.length === 0) {
    issues.push('Workflow must contain at least one trigger node.');
  }

  const nodeIds = new Set(nodes.map((n) => n.id));

  // Check valid node types
  nodes.forEach((n) => {
    if (!catalogItemByType[n.data?.nodeType]) {
      issues.push(`Node "${n.data?.name}" has unsupported type: "${n.data?.nodeType}".`);
    }
  });

  // Check valid edge connections
  edges.forEach((e) => {
    if (!nodeIds.has(e.source)) {
      issues.push(`Edge connects from missing node ID: "${e.source}".`);
    }
    if (!nodeIds.has(e.target)) {
      issues.push(`Edge connects to missing node ID: "${e.target}".`);
    }
  });

  return {
    isValid: issues.length === 0,
    issues,
    nodes,
    edges,
  };
}
