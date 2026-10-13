/* =========================================================
   gauravStore.js
   State management and persistence for GAURAV: Your AI Automation Architect.
   Handles message history, suggestion prompts, and conversation state.
========================================================= */

const CHAT_STORAGE_PREFIX = 'gra-gaurav-history-';

export const GAURAV_SUGGESTIONS = [
  {
    id: 'pending-docs',
    title: 'Client Document Chaser',
    prompt:
      'Create an agent that checks pending client documents every morning, drafts reminder emails, requests my approval and sends via Resend.',
    badge: 'Daily Cron',
  },
  {
    id: 'gst-reconcile',
    title: 'GSTR-2B Reconciliation',
    prompt:
      'Build a workflow that ingests purchase register data, compares with GSTR-2B, identifies mismatches, and pauses for senior CA review.',
    badge: 'GST Advisory',
  },
  {
    id: 'tax-notice',
    title: 'Urgent Tax Notice Alert',
    prompt:
      'Build a workflow that triggers on incoming high-priority tax notices, classifies the section (148/143/24Q), and sends an immediate alert.',
    badge: 'Compliance',
  },
  {
    id: 'invoice-extract',
    title: 'Vendor Invoice Parser',
    prompt:
      'Extract invoice fields from uploaded PDF invoices, validate GSTIN and taxable amount, and request approval before logging.',
    badge: 'PDF / OCR',
  },
];

export function getInitialMessages(agentName = 'Agent') {
  return [
    {
      id: 'init-1',
      sender: 'assistant',
      timestamp: new Date().toISOString(),
      content: `Hello Gaurav! I am **GAURAV**, your **AI Automation Architect**.\n\nTell me what automation you need for **${agentName}** in plain English. For example:\n* *"Check pending client documents every morning and draft reminder emails."*\n* *"Extract invoice line items and pause for CA partner approval."*\n\nI will design the workflow architecture, select the right nodes, and prepare everything for your visual canvas.`,
      pipelinePreview: null,
    },
  ];
}

export function getGauravHistory(agentId, agentName = 'Agent') {
  if (typeof window === 'undefined') return getInitialMessages(agentName);
  const key = `${CHAT_STORAGE_PREFIX}${agentId || 'global'}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    /* fallback to initial on parse error */
  }
  return getInitialMessages(agentName);
}

export function saveGauravHistory(agentId, messages) {
  if (typeof window === 'undefined') return;
  const key = `${CHAT_STORAGE_PREFIX}${agentId || 'global'}`;
  try {
    localStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    console.error('Failed to save GAURAV chat history:', error);
  }
}

export function clearGauravHistory(agentId, agentName = 'Agent') {
  if (typeof window === 'undefined') return getInitialMessages(agentName);
  const key = `${CHAT_STORAGE_PREFIX}${agentId || 'global'}`;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  return getInitialMessages(agentName);
}
