/* =========================================================
   MCP (MODEL CONTEXT PROTOCOL) & AGENT TEMPLATES ENGINE
   Provides:
   1. Restricted, secure MCP tools for agents (Calculator, Date Check, Schema Validator)
   2. Curated CA Agent Templates Library
   3. Multi-user Audit Trail tracking
========================================================= */

// In-memory audit trail for Phase 6
globalThis.__gra_audit_trail = globalThis.__gra_audit_trail || [];

/**
 * Restricted MCP Tools Registry
 * Safe execution environment without arbitrary code execution
 */
export const MCP_TOOLS_REGISTRY = {
  'tax_calculator': {
    name: 'tax_calculator',
    description: 'Computes GST, TDS, and surcharge amounts accurately based on Indian tax rules.',
    parameters: ['baseAmount', 'ratePercent', 'cessPercent'],
    execute: ({ baseAmount = 0, ratePercent = 18, cessPercent = 0 }) => {
      const base = Number(baseAmount) || 0;
      const rate = Number(ratePercent) || 0;
      const cess = Number(cessPercent) || 0;
      const tax = (base * rate) / 100;
      const cessAmount = (base * cess) / 100;
      return {
        baseAmount: base,
        taxAmount: tax,
        cessAmount,
        totalWithTax: base + tax + cessAmount,
      };
    },
  },
  'statutory_due_date_checker': {
    name: 'statutory_due_date_checker',
    description: 'Returns filing deadlines for GSTR-1, GSTR-3B, TDS quarterly returns, and Tax Audits.',
    parameters: ['complianceType', 'period'],
    execute: ({ complianceType = 'GSTR-3B', period = 'monthly' }) => {
      const map = {
        'GSTR-1': '11th of subsequent month',
        'GSTR-3B': '20th of subsequent month',
        'TDS-26Q': '31st of month following the quarter',
        'TAX-AUDIT': '30th September of Assessment Year',
        'ITR-NON-AUDIT': '31st July of Assessment Year',
      };
      return {
        complianceType,
        period,
        standardDeadline: map[complianceType.toUpperCase()] || '20th of next month',
      };
    },
  },
  'gstin_validator': {
    name: 'gstin_validator',
    description: 'Validates Indian GSTIN format and state code.',
    parameters: ['gstin'],
    execute: ({ gstin = '' }) => {
      const clean = String(gstin).trim().toUpperCase();
      const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      const isValid = regex.test(clean);
      return {
        gstin: clean,
        isValid,
        stateCode: isValid ? clean.slice(0, 2) : null,
        pan: isValid ? clean.slice(2, 12) : null,
      };
    },
  },
};

/**
 * Execute an MCP Tool safely
 */
export function executeMcpTool(toolName, params = {}, user = 'CA Partner') {
  const tool = MCP_TOOLS_REGISTRY[toolName];
  if (!tool) {
    throw new Error(`MCP Tool "${toolName}" is not registered or allowed.`);
  }

  const result = tool.execute(params);

  recordAuditTrail({
    action: 'MCP_TOOL_EXECUTION',
    toolName,
    params,
    result,
    user,
  });

  return result;
}

/**
 * Reusable CA Agent Templates
 */
export const CA_AGENT_TEMPLATES = [
  {
    id: 'tpl-gstr-mismatch-chaser',
    name: 'GSTR-2B vs 3B ITC Mismatch Chaser',
    category: 'GST Compliance',
    badge: 'High Value',
    description: 'Compares books with GSTR-2B, drafts vendor reminder letters for missing invoices, and pauses for partner sign-off.',
    tags: ['GSTR-2B', 'ITC', 'Vendor Chaser', 'Approval Gate'],
  },
  {
    id: 'tpl-itr-doc-tracker',
    name: 'ITR Filing Document Tracker',
    category: 'Income Tax',
    badge: 'Audit Season',
    description: 'Checks client portal for missing Form 16, AIS, and capital gains statements, preparing automated status digests.',
    tags: ['ITR', 'Form 16', 'AIS/TIS', 'Email Dispatch'],
  },
  {
    id: 'tpl-urgent-notice-triage',
    name: 'Statutory Notice Immediate Triage',
    category: 'Advisory & Litigation',
    badge: 'Urgent',
    description: 'Triggers upon receiving IT or GST notices, categorizes section 148 / DRC-01, extracts response deadline, and alerts partner.',
    tags: ['Notice 148', 'DRC-01', 'WhatsApp Alert', 'Partner Gate'],
  },
  {
    id: 'tpl-msme-payment-monitor',
    name: 'Section 43B(h) MSME Payment Monitor',
    category: 'Year-End Closing',
    badge: 'Mandatory',
    description: 'Monitors vendor aging against 45-day MSME deadline, flags disallowance risks, and alerts accounting team.',
    tags: ['Section 43B(h)', 'MSME', 'Aging', 'Compliance'],
  },
];

/**
 * Record an entry into the full system audit trail
 */
export function recordAuditTrail(entry) {
  const item = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };

  globalThis.__gra_audit_trail.unshift(item);
  if (globalThis.__gra_audit_trail.length > 500) {
    globalThis.__gra_audit_trail = globalThis.__gra_audit_trail.slice(0, 500);
  }

  return item;
}

/**
 * Retrieve system audit trail logs
 */
export function getSystemAuditTrail(limit = 50) {
  return globalThis.__gra_audit_trail.slice(0, limit);
}
