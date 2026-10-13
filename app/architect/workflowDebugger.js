/* =========================================================
   WORKFLOW DEBUGGER & AUTO-REPAIR ENGINE
   Inspects React Flow workflows for structural, logical, and
   configuration defects, and proposes auto-repaired blueprints.
========================================================= */

import { catalogItemByType, configSchemas, triggerTypes } from '../workflowCatalog.js';
import { createEdge, createNode } from './workflowGenerator.js';

export function debugAndRepairWorkflow(nodes = [], edges = []) {
  const issues = [];
  const repairs = [];
  let repairedNodes = JSON.parse(JSON.stringify(nodes || []));
  let repairedEdges = JSON.parse(JSON.stringify(edges || []));

  if (repairedNodes.length === 0) {
    return {
      hasErrors: true,
      issues: ['Workflow canvas is empty. No steps found to debug.'],
      repairs: ['Create a new workflow starting with a Trigger.'],
      repairedBlueprint: null,
    };
  }

  // 1. Missing Trigger Check & Repair
  const triggers = repairedNodes.filter((n) => triggerTypes.includes(n.data?.nodeType));
  if (triggers.length === 0) {
    issues.push('Missing Trigger: The workflow cannot start without an entry trigger node.');
    
    // Auto-repair: Insert a Manual Trigger at the front
    const firstNode = repairedNodes[0];
    const triggerId = `trigger_auto_${Date.now()}`;
    const triggerNode = createNode(
      triggerId,
      'trigger',
      'Manual Trigger (Auto-Repaired)',
      Math.max(40, (firstNode.position?.x || 100) - 250),
      firstNode.position?.y || 200,
      {},
      'Starts the execution pipeline'
    );

    repairedNodes.unshift(triggerNode);
    repairedEdges.unshift(createEdge(triggerId, firstNode.id));
    repairs.push('Added missing Manual Trigger and linked it to the first step.');
  }

  // 2. Disconnected Nodes Check & Auto-stitch
  const connectedTargets = new Set(repairedEdges.map((e) => e.target));
  const connectedSources = new Set(repairedEdges.map((e) => e.source));

  repairedNodes.forEach((node, index) => {
    const isTrigger = triggerTypes.includes(node.data?.nodeType);

    // Orphan node (no incoming edges and not a trigger)
    if (!isTrigger && !connectedTargets.has(node.id)) {
      issues.push(`Disconnected Node: "${node.data?.name}" is not connected to any prior step.`);

      // Auto-repair: Connect from previous node
      const prevNode = repairedNodes[index - 1];
      if (prevNode && prevNode.id !== node.id) {
        repairedEdges.push(createEdge(prevNode.id, node.id));
        repairs.push(`Auto-stitched connection from "${prevNode.data?.name}" to "${node.data?.name}".`);
      }
    }

    // Dead-end non-terminal node (e.g., condition without 2 branches)
    if (node.data?.nodeType === 'condition') {
      const outEdges = repairedEdges.filter((e) => e.source === node.id);
      if (outEdges.length < 2) {
        issues.push(`Incomplete Condition: "${node.data?.name}" requires both True and False branches.`);
      }
    }
  });

  // 3. Human Approval Gate Verification (CA Firm Non-Negotiable Rule)
  const hasDispatches = repairedNodes.some((n) => ['bulkEmail', 'email', 'whatsappApi'].includes(n.data?.nodeType));
  const hasApproval = repairedNodes.some((n) => n.data?.nodeType === 'approval');

  if (hasDispatches && !hasApproval) {
    issues.push('Missing Human Gate: An external message/email dispatch exists without a CA Partner Approval Gate.');

    // Auto-repair: Insert Approval Gate right before the dispatch
    const dispatchIdx = repairedNodes.findIndex((n) => ['bulkEmail', 'email', 'whatsappApi'].includes(n.data?.nodeType));
    if (dispatchIdx >= 0) {
      const dispatchNode = repairedNodes[dispatchIdx];
      const approvalId = `approval_auto_${Date.now()}`;
      const approvalNode = createNode(
        approvalId,
        'approval',
        'CA Partner Sign-Off Gate',
        dispatchNode.position?.x - 150,
        dispatchNode.position?.y,
        { approver: 'Senior Partner', message: 'Review draft before sending to client' },
        'Pauses execution for mandatory CA partner verification'
      );

      // Re-route incoming edges from dispatch to approval
      repairedEdges.forEach((e) => {
        if (e.target === dispatchNode.id) e.target = approvalId;
      });

      // Connect approval to dispatch
      repairedEdges.push(createEdge(approvalId, dispatchNode.id));
      repairedNodes.splice(dispatchIdx, 0, approvalNode);
      repairs.push(`Inserted mandatory CA Partner Approval Gate before "${dispatchNode.data?.name}".`);
    }
  }

  // 4. Missing required configurations auto-fill
  repairedNodes.forEach((node) => {
    const type = node.data?.nodeType;
    const schema = configSchemas[type] || [];
    const config = node.data?.config || {};

    schema.forEach((field) => {
      if (field.required && (config[field.key] === undefined || config[field.key] === '')) {
        issues.push(`Missing Config: "${node.data?.name}" is missing required field "${field.label}".`);
        
        // Auto-fill default sensible value
        if (field.defaultValue !== undefined) {
          config[field.key] = field.defaultValue;
          repairs.push(`Filled default value for "${field.label}" on "${node.data?.name}".`);
        } else if (field.type === 'text') {
          config[field.key] = `Default ${field.label}`;
          repairs.push(`Auto-populated placeholder for "${field.label}" on "${node.data?.name}".`);
        }
      }
    });
  });

  const hasErrors = issues.length > 0;

  return {
    hasErrors,
    issues,
    repairs,
    repairedBlueprint: hasErrors ? {
      nodes: repairedNodes,
      edges: repairedEdges,
      summary: `Auto-repaired workflow: ${repairs.length} fix${repairs.length === 1 ? '' : 'es'} applied`,
    } : null,
  };
}
