import {
  catalogItemByType,
  getDefaultConfig,
} from './workflowCatalog';

/* =========================================================
   TEMPLATE BUILDER HELPERS
========================================================= */

function node(id, type, name, x, y, config = {}, description) {
  const item = catalogItemByType[type];

  return {
    id,
    type: 'workflowNode',
    position: { x, y },
    data: {
      name,
      description: description || item?.description || '',
      nodeType: type,
      icon: item?.icon || '?',
      shape: item?.shape || 'rounded',
      group: item?.group || 'Block',
      config: { ...getDefaultConfig(type), ...config },
    },
  };
}

function edge(source, target, sourceHandle, label) {
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
   TEMPLATE DEFINITIONS
========================================================= */

const templates = {
  'bulk-email-outreach': {
    id: 'bulk-email-outreach',
    name: 'Bulk Personalized Email Outreach',
    short: 'Resend + CSV / Sheet',
    category: 'Client Communication',
    accent: '#f59e0b',
    icon: '@',
    description:
      'Read a client list from Google Sheets or an uploaded CSV, pause for partner approval, then send one personalised Resend email per row using {{$item.*}} tags.',
    tags: ['Resend', 'Google Sheets', 'CSV', 'Approval Gate'],
    build: () => {
      const nodes = [
        node('t1', 'trigger', 'Manual Trigger', 60, 220, {}, 'Started by a team member'),
        node(
          's1',
          'googleSheets',
          'Client List',
          340,
          220,
          {
            operation: 'Read Rows',
            spreadsheet: 'Client Master FY 2026-27',
            sheet: 'Outreach',
            columns: 'client_name, email, firm, service, partner',
          },
          'Read rows from the outreach sheet'
        ),
        node(
          'a1',
          'approval',
          'Partner Approval',
          640,
          220,
          {
            approver: 'Senior CA',
            message:
              'Approve sending {{$node.Client List.data.rowCount}} personalised outreach emails?',
          },
          'Routes to Approvals before sending'
        ),
        node(
          'b1',
          'bulkEmail',
          'Resend Bulk Email',
          940,
          220,
          {
            dataSource: 'Previous Node Items',
            to: '{{$item.email}}',
            subject: '{{$item.service}} update for {{$item.firm}}',
            body:
              'Dear {{$item.client_name}},\n\nGreetings from the firm. This is a quick update regarding {{$item.service}} for {{$item.firm}}. Your engagement partner {{$item.partner}} will be in touch with the next steps.\n\nPlease reply to this email with any documents or questions.\n\nWarm regards,\nGRA Advisory Team',
            maxRecipients: '50',
          },
          'One personalised email per row'
        ),
      ];

      const edges = [
        edge('t1', 's1'),
        edge('s1', 'a1'),
        edge('a1', 'b1'),
      ];

      return { nodes, edges };
    },
  },

  'gst-pending-chaser': {
    id: 'gst-pending-chaser',
    name: 'GST Return & GSTR-2B Pending Data Chaser',
    short: 'Monthly GST follow-ups',
    category: 'GST Compliance',
    accent: '#16a34a',
    icon: '#',
    description:
      'Every month, read the GST tracker, filter clients whose purchase data or GSTR-2B reconciliation is pending, escalate urgent ones over WhatsApp and send chaser emails to the rest.',
    tags: ['Cron', 'Google Sheets', 'Filter', 'IF / Else', 'WhatsApp', 'Resend'],
    build: () => {
      const nodes = [
        node(
          'c1',
          'schedule',
          'Monthly on 8th',
          40,
          260,
          { frequency: 'Monthly', time: '09:30', cron: '30 9 8 * *' },
          'Runs before the GSTR-3B window'
        ),
        node(
          's1',
          'googleSheets',
          'GST Tracker',
          320,
          260,
          {
            operation: 'Read Rows',
            spreadsheet: 'GST Tracker FY 2026-27',
            sheet: 'Monthly Status',
            columns:
              'client_name, email, phone, gstin, period, purchase_data_received, gstr2b_matched, days_left',
          },
          'Read monthly GST status per client'
        ),
        node(
          'f1',
          'filter',
          'Pending Data Only',
          600,
          260,
          {
            field: '{{$item.purchase_data_received}}',
            operator: 'Equals',
            value: 'No',
          },
          'Keep clients who have not sent data'
        ),
        node(
          'i1',
          'condition',
          'Due in < 5 days?',
          880,
          260,
          {
            field: '{{$item.days_left}}',
            operator: 'Less Than',
            value: '5',
          },
          'Escalate when the deadline is close'
        ),
        node(
          'w1',
          'whatsappApi',
          'WhatsApp Escalation',
          1180,
          120,
          {
            to: '{{$item.phone}}',
            templateName: 'gst_urgent_reminder',
            message:
              'Namaste {{$item.client_name}}, your GSTR-3B for {{$item.period}} is due in {{$item.days_left}} days and purchase data is still pending. Please share invoices today. - GRA Advisory',
          },
          'Urgent WhatsApp nudge'
        ),
        node(
          'b1',
          'bulkEmail',
          'Urgent Chaser Email',
          1480,
          120,
          {
            dataSource: 'Previous Node Items',
            to: '{{$item.email}}',
            subject: 'URGENT: GST data pending for {{$item.period}} ({{$item.gstin}})',
            body:
              'Dear {{$item.client_name}},\n\nYour GSTR-3B for {{$item.period}} is due in {{$item.days_left}} days. We have not yet received your purchase data, and the GSTR-2B reconciliation cannot be completed without it.\n\nPlease share purchase invoices / purchase register today to avoid late fees and interest.\n\nRegards,\nGST Compliance Desk, GRA Advisory',
          },
          'Email with urgent subject'
        ),
        node(
          'b2',
          'bulkEmail',
          'Standard Chaser Email',
          1180,
          400,
          {
            dataSource: 'Previous Node Items',
            to: '{{$item.email}}',
            subject: 'GST data request for {{$item.period}}',
            body:
              'Dear {{$item.client_name}},\n\nThis is a gentle reminder to share your purchase data for {{$item.period}} so that we can complete GSTR-2B matching and file GSTR-3B on time.\n\nRegards,\nGST Compliance Desk, GRA Advisory',
          },
          'Normal reminder'
        ),
      ];

      const edges = [
        edge('c1', 's1'),
        edge('s1', 'f1'),
        edge('f1', 'i1'),
        edge('i1', 'w1', 'true', 'true'),
        edge('w1', 'b1'),
        edge('i1', 'b2', 'false', 'false'),
      ];

      return { nodes, edges };
    },
  },

  'itr-missing-docs': {
    id: 'itr-missing-docs',
    name: 'ITR & Tax Audit Missing Document Reminder',
    short: 'Weekly document chasers',
    category: 'Income Tax',
    accent: '#8b5cf6',
    icon: 'AI',
    description:
      'Weekly, read the ITR / Tax Audit document tracker, filter clients with missing documents, let an AI Agent draft a polite itemised reminder, route it through Approval and send via Resend.',
    tags: ['Cron', 'Google Sheets', 'Filter', 'AI Agent', 'Approval Gate', 'Resend'],
    build: () => {
      const nodes = [
        node(
          'c1',
          'schedule',
          'Every Monday 10:00',
          40,
          220,
          { frequency: 'Weekly', time: '10:00', cron: '0 10 * * 1' },
          'Weekly document chase'
        ),
        node(
          's1',
          'googleSheets',
          'ITR Document Tracker',
          320,
          220,
          {
            operation: 'Read Rows',
            spreadsheet: 'ITR & Tax Audit Tracker AY 2026-27',
            sheet: 'Documents',
            columns:
              'client_name, email, pan, assessment_year, missing_documents, due_date, engagement_type',
          },
          'Read missing-document status'
        ),
        node(
          'f1',
          'filter',
          'Has Missing Documents',
          600,
          220,
          {
            field: '{{$item.missing_documents}}',
            operator: 'Is Not Empty',
            value: '',
          },
          'Skip clients who are complete'
        ),
        node(
          'ai1',
          'aiAgent',
          'Draft Reminder',
          880,
          220,
          {
            provider: 'Claude (Anthropic)',
            systemPrompt:
              'You are an assistant at an Indian Chartered Accountancy firm. Write concise, courteous reminder emails to clients about documents still pending for Income Tax Return filing or Tax Audit (Form 3CD). Use Indian terminology (AY, PAN, Form 16, 26AS, AIS). Never invent facts.',
            userPrompt:
              'Client: {{$item.client_name}}\nPAN: {{$item.pan}}\nEngagement: {{$item.engagement_type}} for {{$item.assessment_year}}\nMissing documents: {{$item.missing_documents}}\nDue date: {{$item.due_date}}\n\nWrite the email body only, with a bullet list of the missing documents.',
            outputFormat: 'JSON',
            jsonSchema: 'subject, body',
          },
          'Personalised itemised reminder'
        ),
        node(
          'a1',
          'approval',
          'Manager Review',
          1160,
          220,
          {
            approver: 'Tax Manager',
            message:
              'Review AI-drafted reminders for {{$node.Has Missing Documents.data.count}} clients before sending.',
          },
          'Routes drafts to Approvals'
        ),
        node(
          'b1',
          'bulkEmail',
          'Send Reminders',
          1440,
          220,
          {
            dataSource: 'Previous Node Items',
            to: '{{$item.email}}',
            subject: '{{$node.Draft Reminder.data.json.subject}}',
            body: '{{$node.Draft Reminder.data.json.body}}',
          },
          'Send approved drafts via Resend'
        ),
      ];

      const edges = [
        edge('c1', 's1'),
        edge('s1', 'f1'),
        edge('f1', 'ai1'),
        edge('ai1', 'a1'),
        edge('a1', 'b1'),
      ];

      return { nodes, edges };
    },
  },

  'statutory-due-date-alert': {
    id: 'statutory-due-date-alert',
    name: 'Statutory Due Date Alert (TDS / ROC / MCA)',
    short: 'Daily compliance alerts',
    category: 'Compliance Calendar',
    accent: '#06b6d4',
    icon: 'Y',
    description:
      'Every morning read the compliance calendar, route each upcoming item by type (TDS, ROC, MCA) to the right message, merge the results and log what was sent back to the sheet.',
    tags: ['Cron', 'Google Sheets', 'Switch Router', 'WhatsApp', 'Merge', 'Sheets Append'],
    build: () => {
      const nodes = [
        node(
          'c1',
          'schedule',
          'Daily 08:30',
          40,
          300,
          { frequency: 'Daily', time: '08:30', cron: '30 8 * * *' },
          'Morning compliance sweep'
        ),
        node(
          's1',
          'googleSheets',
          'Compliance Calendar',
          320,
          300,
          {
            operation: 'Read Rows',
            spreadsheet: 'Statutory Calendar FY 2026-27',
            sheet: 'Upcoming',
            columns:
              'client_name, email, phone, compliance, form, period, due_date, days_left',
          },
          'Read upcoming due dates'
        ),
        node(
          'f1',
          'filter',
          'Due Within 7 Days',
          600,
          300,
          {
            field: '{{$item.days_left}}',
            operator: 'Less Than',
            value: '8',
          },
          'Only near-term items'
        ),
        node(
          'r1',
          'router',
          'Route by Compliance',
          880,
          300,
          {
            field: '{{$item.compliance}}',
            routes: 'TDS\nROC\nMCA',
          },
          'TDS / ROC / MCA branches'
        ),
        node(
          'w1',
          'whatsappApi',
          'TDS Alert',
          1180,
          80,
          {
            to: '{{$item.phone}}',
            templateName: 'tds_due_alert',
            message:
              'Reminder: TDS {{$item.form}} for {{$item.period}} is due on {{$item.due_date}} ({{$item.days_left}} days). Please ensure challans are paid. - GRA Advisory',
          },
          'TDS payment / return alert'
        ),
        node(
          'b1',
          'bulkEmail',
          'ROC Alert',
          1180,
          300,
          {
            dataSource: 'Previous Node Items',
            to: '{{$item.email}}',
            subject: 'ROC filing due: {{$item.form}} by {{$item.due_date}}',
            body:
              'Dear {{$item.client_name}},\n\nThis is a reminder that {{$item.form}} for {{$item.period}} must be filed with the Registrar of Companies by {{$item.due_date}}. Please share the signed documents and DSC availability.\n\nRegards,\nCorporate Compliance Desk',
          },
          'ROC annual filing reminder'
        ),
        node(
          'b2',
          'bulkEmail',
          'MCA Alert',
          1180,
          520,
          {
            dataSource: 'Previous Node Items',
            to: '{{$item.email}}',
            subject: 'MCA compliance due: {{$item.form}} ({{$item.days_left}} days left)',
            body:
              'Dear {{$item.client_name}},\n\n{{$item.form}} for {{$item.period}} is due on {{$item.due_date}}. Kindly confirm director KYC / board resolutions so we can file on time.\n\nRegards,\nCorporate Compliance Desk',
          },
          'MCA event-based filing reminder'
        ),
        node(
          'm1',
          'merge',
          'Merge Results',
          1480,
          300,
          { mode: 'Append Lists' },
          'Combine all alert branches'
        ),
        node(
          's2',
          'googleSheets',
          'Log Alerts Sent',
          1760,
          300,
          {
            operation: 'Append Row',
            spreadsheet: 'Statutory Calendar FY 2026-27',
            sheet: 'Alert Log',
            columns: 'sent_at, client_name, compliance, channel, status',
            rowValues:
              '{{$node.Daily 08:30.data.scheduledAt}}, {{$item.client_name}}, {{$item.compliance}}, auto, sent',
          },
          'Audit trail in the sheet'
        ),
      ];

      const edges = [
        edge('c1', 's1'),
        edge('s1', 'f1'),
        edge('f1', 'r1'),
        edge('r1', 'w1', 'route-0', 'TDS'),
        edge('r1', 'b1', 'route-1', 'ROC'),
        edge('r1', 'b2', 'route-2', 'MCA'),
        edge('w1', 'm1'),
        edge('b1', 'm1'),
        edge('b2', 'm1'),
        edge('m1', 's2'),
      ];

      return { nodes, edges };
    },
  },

  'client-query-classifier': {
    id: 'client-query-classifier',
    name: 'Client Query Auto-Classifier & Draft Reply',
    short: 'Inbox triage with AI',
    category: 'Client Service',
    accent: '#6366f1',
    icon: '@',
    description:
      'When a client email arrives, an AI Agent classifies it (GST / Income Tax / ROC / Billing), scores urgency and drafts a reply. Urgent queries alert the partner on WhatsApp; every reply waits at an Approval Gate before Resend sends it.',
    tags: ['Email Trigger', 'AI Agent', 'IF / Else', 'WhatsApp', 'Approval Gate', 'Resend'],
    build: () => {
      const nodes = [
        node(
          'e1',
          'emailTrigger',
          'Client Email Received',
          40,
          260,
          { mailbox: 'queries@gra-advisory.in', subjectContains: '' },
          'Fires on each inbound client email'
        ),
        node(
          'ai1',
          'aiAgent',
          'Classify & Draft',
          320,
          260,
          {
            provider: 'Claude (Anthropic)',
            systemPrompt:
              'You triage emails for an Indian CA firm. Classify each query into exactly one category: GST, Income Tax, ROC/MCA, Audit, Billing, Other. Score urgency as High, Medium or Low (High = statutory deadline within 3 days, notices, penalties). Draft a professional reply that acknowledges the query and states the next step. Return strict JSON.',
            userPrompt:
              'From: {{$node.Client Email Received.data.fromName}} <{{$node.Client Email Received.data.from}}>\nSubject: {{$node.Client Email Received.data.subject}}\n\n{{$node.Client Email Received.data.body}}',
            outputFormat: 'JSON',
            jsonSchema: 'category, urgency, summary, draft_reply',
          },
          'Category, urgency and draft reply'
        ),
        node(
          'i1',
          'condition',
          'Urgent?',
          620,
          260,
          {
            field: '{{$node.Classify & Draft.data.json.urgency}}',
            operator: 'Equals',
            value: 'High',
          },
          'Escalate high-urgency queries'
        ),
        node(
          'w1',
          'whatsappApi',
          'Alert Partner',
          900,
          110,
          {
            to: '+919876543210',
            templateName: 'urgent_query_alert',
            message:
              'Urgent {{$node.Classify & Draft.data.json.category}} query from {{$node.Client Email Received.data.fromName}}: {{$node.Classify & Draft.data.json.summary}}',
          },
          'WhatsApp heads-up to partner'
        ),
        node(
          'a1',
          'approval',
          'Approve Urgent Reply',
          1180,
          110,
          {
            approver: 'Partner',
            message:
              'Urgent {{$node.Classify & Draft.data.json.category}} query. Review the AI draft before it is sent.',
          },
          'Partner approves urgent replies'
        ),
        node(
          'm1',
          'email',
          'Send Urgent Reply',
          1460,
          110,
          {
            to: '{{$node.Client Email Received.data.from}}',
            subject: 'Re: {{$node.Client Email Received.data.subject}}',
            body: '{{$node.Classify & Draft.data.json.draft_reply}}',
          },
          'Reply via Resend'
        ),
        node(
          'a2',
          'approval',
          'Approve Reply',
          900,
          410,
          {
            approver: 'Query Desk Manager',
            message:
              '{{$node.Classify & Draft.data.json.category}} query ({{$node.Classify & Draft.data.json.urgency}}). Review the drafted reply.',
          },
          'Manager approves standard replies'
        ),
        node(
          'm2',
          'email',
          'Send Reply',
          1180,
          410,
          {
            to: '{{$node.Client Email Received.data.from}}',
            subject: 'Re: {{$node.Client Email Received.data.subject}}',
            body: '{{$node.Classify & Draft.data.json.draft_reply}}',
          },
          'Reply via Resend'
        ),
      ];

      const edges = [
        edge('e1', 'ai1'),
        edge('ai1', 'i1'),
        edge('i1', 'w1', 'true', 'true'),
        edge('w1', 'a1'),
        edge('a1', 'm1'),
        edge('i1', 'a2', 'false', 'false'),
        edge('a2', 'm2'),
      ];

      return { nodes, edges };
    },
  },
};

export const agentTemplates = Object.values(templates).map(
  ({ build, ...meta }) => meta
);

export function getTemplate(templateId) {
  return templates[templateId] || null;
}

/* Returns { nodes, edges } with ids made unique per agent. */
export function materializeTemplate(templateId, agentId) {
  const template = templates[templateId];

  if (!template) return { nodes: [], edges: [] };

  const { nodes, edges } = template.build();
  const prefix = `${templateId}-${agentId}`;

  const idMap = Object.fromEntries(
    nodes.map((item) => [item.id, `${prefix}-${item.id}`])
  );

  return {
    nodes: nodes.map((item) => ({ ...item, id: idMap[item.id] })),
    edges: edges.map((item) => ({
      ...item,
      id: `${prefix}-${item.id}`,
      source: idMap[item.source],
      target: idMap[item.target],
    })),
  };
}

export function seedAgentWorkflow(templateId, agentId) {
  if (typeof window === 'undefined') return;

  const workflow = materializeTemplate(templateId, agentId);

  localStorage.setItem(
    `gra-workflow-${agentId}`,
    JSON.stringify(workflow)
  );
}
