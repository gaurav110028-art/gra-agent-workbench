/* =========================================================
   NODE PALETTE  (n8n / Make.com style, grouped)
========================================================= */

export const nodeCatalog = [
  {
    group: 'Triggers',
    items: [
      {
        type: 'webhook',
        label: 'Webhook Trigger',
        icon: '>',
        description: 'Start when an HTTP request arrives',
        shape: 'circle',
      },
      {
        type: 'schedule',
        label: 'Cron / Schedule Timer',
        icon: 'T',
        description: 'Run on a fixed schedule',
        shape: 'circle',
      },
      {
        type: 'sheetsTrigger',
        label: 'Google Sheets Row Added',
        icon: '#',
        description: 'Start when a new row is added',
        shape: 'circle',
      },
      {
        type: 'emailTrigger',
        label: 'Email / Query Received',
        icon: '@',
        description: 'Start when a client email arrives',
        shape: 'circle',
      },
      {
        type: 'trigger',
        label: 'Manual Trigger',
        icon: '>',
        description: 'Start workflow by hand',
        shape: 'circle',
      },
    ],
  },
  {
    group: 'Flow Logic',
    items: [
      {
        type: 'condition',
        label: 'IF / Else Condition',
        icon: '?',
        description: 'Branch on true or false',
        shape: 'diamond',
      },
      {
        type: 'router',
        label: 'Switch Router',
        icon: 'Y',
        description: 'Route by a field value',
        shape: 'diamond',
      },
      {
        type: 'loop',
        label: 'Loop Over Items',
        icon: '~',
        description: 'Repeat for each item',
        shape: 'square',
      },
      {
        type: 'delay',
        label: 'Wait / Delay',
        icon: 'T',
        description: 'Pause before continuing',
        shape: 'square',
      },
      {
        type: 'merge',
        label: 'Merge Data',
        icon: '>>',
        description: 'Combine branches or lists',
        shape: 'diamond',
      },
      {
        type: 'filter',
        label: 'Filter',
        icon: 'fx',
        description: 'Keep only matching items',
        shape: 'square',
      },
      {
        type: 'stop',
        label: 'Stop Workflow',
        icon: 'S',
        description: 'End this path',
        shape: 'square',
      },
    ],
  },
  {
    group: 'Actions & Connectors',
    items: [
      {
        type: 'bulkEmail',
        label: 'Resend Bulk Email',
        icon: '@',
        description: 'Personalised email per row',
        shape: 'rounded',
      },
      {
        type: 'whatsappApi',
        label: 'WhatsApp Business API',
        icon: '*',
        description: 'Send a template message',
        shape: 'rounded',
      },
      {
        type: 'googleSheets',
        label: 'Google Sheets',
        icon: '#',
        description: 'Read, append or update rows',
        shape: 'rounded',
      },
      {
        type: 'aiAgent',
        label: 'AI Agent',
        icon: 'AI',
        description: 'OpenAI / Claude with system prompt',
        shape: 'hex',
      },
      {
        type: 'api',
        label: 'HTTP Request / cURL',
        icon: '{}',
        description: 'Call any REST endpoint',
        shape: 'rounded',
      },
      {
        type: 'pdfParser',
        label: 'PDF / Invoice Parser',
        icon: '#',
        description: 'Extract fields from a PDF',
        shape: 'hex',
      },
      {
        type: 'approval',
        label: 'Approval Gate',
        icon: 'OK',
        description: 'Pause in Approvals before sending',
        shape: 'pill',
      },
    ],
  },
  {
    group: 'AI Helpers',
    items: [
      {
        type: 'aiPrompt',
        label: 'AI Prompt',
        icon: 'AI',
        description: 'Ask AI to process information',
        shape: 'hex',
      },
      {
        type: 'extract',
        label: 'Extract Data',
        icon: '#',
        description: 'Extract structured fields',
        shape: 'hex',
      },
      {
        type: 'classify',
        label: 'Classify',
        icon: '#',
        description: 'Categorise information',
        shape: 'hex',
      },
      {
        type: 'summarize',
        label: 'Summarise',
        icon: '=',
        description: 'Create a short summary',
        shape: 'hex',
      },
    ],
  },
  {
    group: 'Outputs & Other Apps',
    items: [
      {
        type: 'email',
        label: 'Send Email',
        icon: '@',
        description: 'Single email via Resend',
        shape: 'square',
      },
      {
        type: 'whatsapp',
        label: 'Send WhatsApp',
        icon: '*',
        description: 'Single WhatsApp message',
        shape: 'square',
      },
      {
        type: 'notification',
        label: 'Notification',
        icon: '!',
        description: 'Create an internal alert',
        shape: 'square',
      },
      {
        type: 'file',
        label: 'Create File',
        icon: '+',
        description: 'Generate an output file',
        shape: 'square',
      },
      {
        type: 'review',
        label: 'Review Task',
        icon: 'U',
        description: 'Send something for review',
        shape: 'pill',
      },
      {
        type: 'connector',
        label: 'App Connector',
        icon: 'O',
        description: 'Tally / Outlook / GST software',
        shape: 'rounded',
      },
      {
        type: 'plugin',
        label: 'Plugin Action',
        icon: '+',
        description: 'Use a connected plugin',
        shape: 'rounded',
      },
      {
        type: 'database',
        label: 'Database',
        icon: '=',
        description: 'Read or write structured data',
        shape: 'rounded',
      },
      {
        type: 'spreadsheet',
        label: 'Spreadsheet (Source)',
        icon: '#',
        description: 'Excel / CSV from Sources',
        shape: 'rounded',
      },
      {
        type: 'fileStorage',
        label: 'File Storage',
        icon: 'D',
        description: 'Read or save files',
        shape: 'rounded',
      },
    ],
  },
];

export const catalogItemByType = Object.fromEntries(
  nodeCatalog.flatMap((group) =>
    group.items.map((item) => [
      item.type,
      { ...item, group: group.group },
    ])
  )
);

/* =========================================================
   CONFIGURATION SCHEMAS
   field.type: text | textarea | select | number | time |
               source | csv | json | variable (text w/ picker)
   field.dynamic: true  -> show the {{ }} variable picker
========================================================= */

export const configSchemas = {
  trigger: [],

  schedule: [
    {
      key: 'frequency',
      label: 'Frequency',
      type: 'select',
      required: true,
      options: ['Every Hour', 'Daily', 'Weekdays', 'Weekly', 'Monthly'],
    },
    { key: 'time', label: 'Run Time', type: 'time', required: true },
    {
      key: 'cron',
      label: 'Cron Expression (optional)',
      type: 'text',
      placeholder: '0 9 * * 1-5',
    },
  ],

  webhook: [
    {
      key: 'method',
      label: 'Method',
      type: 'select',
      required: true,
      options: ['POST', 'GET'],
    },
    {
      key: 'path',
      label: 'Webhook Path',
      type: 'text',
      required: true,
      placeholder: '/gst-upload',
    },
    {
      key: 'samplePayload',
      label: 'Sample Payload (JSON)',
      type: 'json',
      placeholder: '{ "client_name": "Sharma Traders", "email": "a@b.com" }',
    },
  ],

  sheetsTrigger: [
    {
      key: 'spreadsheet',
      label: 'Spreadsheet',
      type: 'text',
      required: true,
      placeholder: 'Client Master 2026-27',
    },
    {
      key: 'sheet',
      label: 'Sheet / Tab',
      type: 'text',
      required: true,
      placeholder: 'Sheet1',
    },
    {
      key: 'columns',
      label: 'Columns (comma separated)',
      type: 'text',
      required: true,
      placeholder: 'client_name, email, gstin',
    },
  ],

  emailTrigger: [
    {
      key: 'mailbox',
      label: 'Mailbox',
      type: 'text',
      required: true,
      placeholder: 'accounts@firm.com',
    },
    {
      key: 'subjectContains',
      label: 'Subject Contains',
      type: 'text',
      placeholder: 'GST documents',
    },
  ],

  condition: [
    {
      key: 'field',
      label: 'Field',
      type: 'text',
      dynamic: true,
      required: true,
      placeholder: '{{$item.days_left}}',
    },
    {
      key: 'operator',
      label: 'Operator',
      type: 'select',
      required: true,
      options: [
        'Equals',
        'Not Equals',
        'Contains',
        'Greater Than',
        'Less Than',
        'Is Empty',
        'Is Not Empty',
      ],
    },
    {
      key: 'value',
      label: 'Value',
      type: 'text',
      dynamic: true,
      placeholder: '5',
    },
  ],

  router: [
    {
      key: 'field',
      label: 'Route By Field',
      type: 'text',
      dynamic: true,
      required: true,
      placeholder: '{{$item.compliance}}',
    },
    {
      key: 'routes',
      label: 'Routes (one per line)',
      type: 'textarea',
      required: true,
      placeholder: 'TDS\nROC\nMCA',
    },
  ],

  merge: [
    {
      key: 'mode',
      label: 'Merge Mode',
      type: 'select',
      required: true,
      options: ['Wait for All', 'Continue on First', 'Append Lists'],
    },
  ],

  delay: [
    {
      key: 'amount',
      label: 'Delay',
      type: 'number',
      required: true,
      placeholder: '10',
    },
    {
      key: 'unit',
      label: 'Unit',
      type: 'select',
      required: true,
      options: ['Seconds', 'Minutes', 'Hours', 'Days'],
    },
  ],

  loop: [
    {
      key: 'source',
      label: 'Items Source',
      type: 'text',
      dynamic: true,
      required: true,
      placeholder: '{{$node.Google Sheets.data.rows}}',
    },
    {
      key: 'batchSize',
      label: 'Batch Size',
      type: 'number',
      placeholder: '1',
    },
  ],

  filter: [
    {
      key: 'field',
      label: 'Field (per item)',
      type: 'text',
      dynamic: true,
      required: true,
      placeholder: '{{$item.purchase_data_received}}',
    },
    {
      key: 'operator',
      label: 'Operator',
      type: 'select',
      required: true,
      options: [
        'Equals',
        'Not Equals',
        'Contains',
        'Greater Than',
        'Less Than',
        'Is Empty',
        'Is Not Empty',
      ],
    },
    {
      key: 'value',
      label: 'Value',
      type: 'text',
      dynamic: true,
      placeholder: 'No',
    },
  ],

  stop: [
    {
      key: 'reason',
      label: 'Reason',
      type: 'text',
      placeholder: 'Workflow complete',
    },
  ],

  bulkEmail: [
    {
      key: 'dataSource',
      label: 'Recipient Data',
      type: 'select',
      required: true,
      options: ['Previous Node Items', 'Uploaded CSV / JSON'],
    },
    { key: 'csv', label: 'Upload CSV or paste JSON', type: 'csv' },
    {
      key: 'to',
      label: 'To',
      type: 'text',
      dynamic: true,
      required: true,
      placeholder: '{{$item.email}}',
    },
    {
      key: 'subject',
      label: 'Subject',
      type: 'text',
      dynamic: true,
      required: true,
      placeholder: 'GST data pending for {{$item.period}}',
    },
    {
      key: 'body',
      label: 'Body',
      type: 'textarea',
      dynamic: true,
      required: true,
      placeholder: 'Dear {{$item.client_name}},\n\n...',
    },
    {
      key: 'maxRecipients',
      label: 'Max Recipients per Run',
      type: 'number',
      placeholder: '50',
    },
  ],

  whatsappApi: [
    {
      key: 'to',
      label: 'Phone (E.164)',
      type: 'text',
      dynamic: true,
      required: true,
      placeholder: '{{$item.phone}}',
    },
    {
      key: 'templateName',
      label: 'Template Name',
      type: 'text',
      required: true,
      placeholder: 'gst_reminder_v1',
    },
    {
      key: 'message',
      label: 'Message / Template Body',
      type: 'textarea',
      dynamic: true,
      required: true,
      placeholder: 'Namaste {{$item.client_name}}, your GSTR-3B for {{$item.period}} is due.',
    },
  ],

  googleSheets: [
    {
      key: 'operation',
      label: 'Operation',
      type: 'select',
      required: true,
      options: ['Read Rows', 'Append Row', 'Update Row'],
    },
    {
      key: 'spreadsheet',
      label: 'Spreadsheet',
      type: 'text',
      required: true,
      placeholder: 'GST Tracker FY 2026-27',
    },
    {
      key: 'sheet',
      label: 'Sheet / Tab',
      type: 'text',
      required: true,
      placeholder: 'Sheet1',
    },
    {
      key: 'columns',
      label: 'Columns (comma separated)',
      type: 'text',
      required: true,
      placeholder: 'client_name, email, gstin, period',
    },
    {
      key: 'rowValues',
      label: 'Row Values (Append / Update)',
      type: 'textarea',
      dynamic: true,
      placeholder: '{{$item.client_name}}, Sent, {{$node.Resend Bulk Email.data.sent}}',
    },
    { key: 'csv', label: 'Sample rows for Test Run (CSV / JSON)', type: 'csv' },
  ],

  aiAgent: [
    {
      key: 'provider',
      label: 'Provider',
      type: 'select',
      required: true,
      options: ['Claude (Anthropic)', 'OpenAI'],
    },
    {
      key: 'systemPrompt',
      label: 'System Prompt',
      type: 'textarea',
      required: true,
      placeholder: 'You are a senior CA assistant...',
    },
    {
      key: 'userPrompt',
      label: 'User Prompt',
      type: 'textarea',
      dynamic: true,
      required: true,
      placeholder: 'Client: {{$item.client_name}}\nQuery: {{$node.Email Received.data.body}}',
    },
    {
      key: 'outputFormat',
      label: 'Output Format',
      type: 'select',
      required: true,
      options: ['Text', 'JSON'],
    },
    {
      key: 'jsonSchema',
      label: 'JSON Keys (when JSON)',
      type: 'text',
      placeholder: 'category, urgency, draft_reply',
    },
  ],

  api: [
    {
      key: 'method',
      label: 'Method',
      type: 'select',
      required: true,
      options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    },
    {
      key: 'url',
      label: 'URL',
      type: 'text',
      dynamic: true,
      required: true,
      placeholder: 'https://api.example.com/gstin/{{$item.gstin}}',
    },
    {
      key: 'headers',
      label: 'Headers (one per line)',
      type: 'textarea',
      placeholder: 'Content-Type: application/json',
    },
    {
      key: 'body',
      label: 'Request Body',
      type: 'textarea',
      dynamic: true,
      placeholder: '{ "gstin": "{{$item.gstin}}" }',
    },
  ],

  pdfParser: [
    {
      key: 'sourceId',
      label: 'PDF Source File',
      type: 'source',
    },
    {
      key: 'documentType',
      label: 'Document Type',
      type: 'select',
      required: true,
      options: ['Tax Invoice', 'Bank Statement', 'Form 16', 'GSTR-2B', 'Generic'],
    },
    {
      key: 'fields',
      label: 'Fields to Extract',
      type: 'textarea',
      required: true,
      placeholder: 'invoice_number\ninvoice_date\ngstin\ntaxable_value\ngst_amount\ntotal',
    },
  ],

  approval: [
    {
      key: 'approver',
      label: 'Approver',
      type: 'text',
      required: true,
      placeholder: 'Senior CA',
    },
    {
      key: 'message',
      label: 'Approval Message',
      type: 'textarea',
      dynamic: true,
      placeholder: 'Approve sending {{$node.Google Sheets.data.rowCount}} reminders?',
    },
  ],

  aiPrompt: [
    {
      key: 'prompt',
      label: 'Prompt',
      type: 'textarea',
      dynamic: true,
      required: true,
      placeholder: 'Analyse the following information...',
    },
    {
      key: 'outputFormat',
      label: 'Output Format',
      type: 'select',
      required: true,
      options: ['Text', 'JSON', 'Table'],
    },
  ],

  extract: [
    {
      key: 'fields',
      label: 'Fields to Extract',
      type: 'textarea',
      required: true,
      placeholder: 'Invoice No\nDate\nGSTIN\nTaxable Value',
    },
  ],

  classify: [
    {
      key: 'categories',
      label: 'Categories',
      type: 'textarea',
      required: true,
      placeholder: 'Purchase\nSales\nBank\nExpense',
    },
  ],

  summarize: [
    {
      key: 'instructions',
      label: 'Summary Instructions',
      type: 'textarea',
      dynamic: true,
      required: true,
      placeholder: 'Summarise key issues and exceptions...',
    },
  ],

  connector: [
    {
      key: 'application',
      label: 'Application',
      type: 'text',
      required: true,
      placeholder: 'Tally / Outlook / GST Software',
    },
    {
      key: 'action',
      label: 'Action',
      type: 'text',
      required: true,
      placeholder: 'Create voucher',
    },
  ],

  plugin: [
    {
      key: 'plugin',
      label: 'Plugin',
      type: 'text',
      required: true,
      placeholder: 'Gmail / Drive / CRM',
    },
    {
      key: 'action',
      label: 'Action',
      type: 'text',
      required: true,
      placeholder: 'Search emails',
    },
  ],

  database: [
    {
      key: 'connection',
      label: 'Connection',
      type: 'text',
      required: true,
      placeholder: 'Firm Database',
    },
    {
      key: 'operation',
      label: 'Operation',
      type: 'select',
      required: true,
      options: ['Read', 'Create', 'Update', 'Delete'],
    },
  ],

  spreadsheet: [
    { key: 'sourceId', label: 'Source File', type: 'source', required: true },
    {
      key: 'sheet',
      label: 'Sheet',
      type: 'text',
      required: true,
      placeholder: 'Reconciliation',
    },
    {
      key: 'operation',
      label: 'Operation',
      type: 'select',
      required: true,
      options: ['Read Rows', 'Add Row', 'Update Row', 'Create Sheet'],
    },
  ],

  fileStorage: [
    { key: 'sourceId', label: 'Source File', type: 'source' },
    {
      key: 'location',
      label: 'Folder / Location',
      type: 'text',
      required: true,
      placeholder: 'Client/GST/FY2026',
    },
    {
      key: 'operation',
      label: 'Operation',
      type: 'select',
      required: true,
      options: ['Read File', 'Save File', 'Move File', 'Rename File'],
    },
  ],

  review: [
    {
      key: 'assignee',
      label: 'Reviewer',
      type: 'text',
      required: true,
      placeholder: 'Team Member',
    },
    {
      key: 'instructions',
      label: 'Review Instructions',
      type: 'textarea',
    },
  ],

  email: [
    {
      key: 'to',
      label: 'To',
      type: 'text',
      dynamic: true,
      required: true,
      placeholder: 'client@example.com',
    },
    {
      key: 'subject',
      label: 'Subject',
      type: 'text',
      dynamic: true,
      required: true,
    },
    {
      key: 'body',
      label: 'Body',
      type: 'textarea',
      dynamic: true,
      required: true,
    },
  ],

  whatsapp: [
    {
      key: 'to',
      label: 'Recipient',
      type: 'text',
      dynamic: true,
      required: true,
    },
    {
      key: 'message',
      label: 'Message',
      type: 'textarea',
      dynamic: true,
      required: true,
    },
  ],

  notification: [
    { key: 'recipient', label: 'Recipient', type: 'text', required: true },
    {
      key: 'message',
      label: 'Message',
      type: 'textarea',
      dynamic: true,
      required: true,
    },
  ],

  file: [
    {
      key: 'fileName',
      label: 'File Name',
      type: 'text',
      dynamic: true,
      required: true,
      placeholder: 'GST Review Pack',
    },
    {
      key: 'format',
      label: 'Format',
      type: 'select',
      required: true,
      options: ['PDF', 'Excel', 'CSV', 'Word'],
    },
  ],
};

export const triggerTypes = [
  'trigger',
  'schedule',
  'webhook',
  'emailTrigger',
  'sheetsTrigger',
];

export const terminalTypes = [
  'stop',
  'email',
  'whatsapp',
  'notification',
  'file',
  'bulkEmail',
  'whatsappApi',
];

/* Nodes that expose named output handles. */
export const branchHandles = {
  condition: ['true', 'false'],
};

export function getTheme(type) {
  const themes = {
    trigger: '#f97316',
    schedule: '#a855f7',
    webhook: '#3b82f6',
    emailTrigger: '#eab308',
    sheetsTrigger: '#16a34a',
    condition: '#22c55e',
    router: '#06b6d4',
    merge: '#14b8a6',
    delay: '#eab308',
    loop: '#0ea5e9',
    filter: '#38bdf8',
    stop: '#ef4444',
    bulkEmail: '#f59e0b',
    whatsappApi: '#25d366',
    googleSheets: '#16a34a',
    aiAgent: '#8b5cf6',
    api: '#3b82f6',
    pdfParser: '#ec4899',
    approval: '#f97316',
    aiPrompt: '#8b5cf6',
    extract: '#ec4899',
    classify: '#6366f1',
    summarize: '#a855f7',
    connector: '#10b981',
    plugin: '#14b8a6',
    database: '#64748b',
    spreadsheet: '#16a34a',
    fileStorage: '#64748b',
    review: '#f43f5e',
    email: '#eab308',
    whatsapp: '#22c55e',
    notification: '#06b6d4',
    file: '#94a3b8',
  };

  return themes[type] || '#777';
}

export function getDefaultConfig(type) {
  const fields = configSchemas[type] || [];
  const config = {};

  fields.forEach((field) => {
    config[field.key] =
      field.type === 'select' ? field.options?.[0] || '' : '';
  });

  return config;
}

export function splitColumns(value) {
  return String(value || '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/* =========================================================
   OUTPUT FIELDS  (drives the {{ }} variable picker)
========================================================= */

export function getNodeOutputFields(node, upstreamColumns = []) {
  const type = node?.data?.nodeType;
  const config = node?.data?.config || {};

  const csvColumns = Array.isArray(config.csvColumns)
    ? config.csvColumns
    : [];

  switch (type) {
    case 'trigger':
      return ['triggeredBy', 'triggeredAt'];
    case 'schedule':
      return ['scheduledAt', 'frequency', 'runDate'];
    case 'webhook': {
      let keys = [];
      try {
        const parsed = JSON.parse(config.samplePayload || '{}');
        keys = Object.keys(parsed || {}).map((key) => `payload.${key}`);
      } catch {
        keys = [];
      }
      return ['payload', ...keys, 'receivedAt', 'method'];
    }
    case 'sheetsTrigger':
      return ['row', ...splitColumns(config.columns).map((c) => `row.${c}`), 'rowNumber'];
    case 'emailTrigger':
      return ['from', 'fromName', 'subject', 'body', 'receivedAt', 'attachments'];
    case 'condition':
      return ['result', 'leftValue', 'rightValue'];
    case 'router':
      return ['route', 'value'];
    case 'loop':
      return ['items', 'count', 'item', 'index', ...upstreamColumns.map((c) => `item.${c}`)];
    case 'delay':
      return ['waitedMs', 'resumedAt'];
    case 'merge':
      return ['items', 'count', 'branches'];
    case 'filter':
      return ['items', 'count', 'removed', ...upstreamColumns.map((c) => `items[0].${c}`)];
    case 'bulkEmail':
      return ['sent', 'failed', 'recipients', 'messages', ...csvColumns.map((c) => `rows[0].${c}`)];
    case 'whatsappApi':
      return ['messageId', 'status', 'to'];
    case 'googleSheets': {
      const columns = splitColumns(config.columns);
      const extra = csvColumns.length ? csvColumns : columns;
      return ['rows', 'rowCount', 'spreadsheet', ...extra.map((c) => `rows[0].${c}`)];
    }
    case 'aiAgent': {
      const keys = splitColumns(config.jsonSchema).map((k) => `json.${k}`);
      return ['text', 'json', ...keys, 'model', 'tokens'];
    }
    case 'api':
      return ['status', 'body', 'headers', 'durationMs'];
    case 'pdfParser':
      return ['fields', ...splitColumns(config.fields).map((f) => `fields.${f}`), 'pages', 'confidence'];
    case 'approval':
      return ['decision', 'approvedBy', 'decidedAt'];
    case 'email':
      return ['messageId', 'status', 'to'];
    case 'whatsapp':
      return ['messageId', 'status'];
    case 'aiPrompt':
    case 'summarize':
      return ['text', 'model'];
    case 'extract':
      return ['fields', ...splitColumns(config.fields).map((f) => `fields.${f}`)];
    case 'classify':
      return ['category', 'confidence'];
    case 'spreadsheet':
      return ['rows', 'rowCount'];
    case 'notification':
      return ['status'];
    case 'file':
      return ['fileName', 'url'];
    default:
      return ['result'];
  }
}

/* Columns that flow "per item" out of a node (for $item.* suggestions). */
export function getNodeItemColumns(node, upstreamColumns = []) {
  const type = node?.data?.nodeType;
  const config = node?.data?.config || {};

  const csvColumns = Array.isArray(config.csvColumns)
    ? config.csvColumns
    : [];

  if (type === 'googleSheets' || type === 'sheetsTrigger') {
    return csvColumns.length ? csvColumns : splitColumns(config.columns);
  }

  if (type === 'bulkEmail' && csvColumns.length) {
    return csvColumns;
  }

  if (type === 'webhook') {
    try {
      return Object.keys(JSON.parse(config.samplePayload || '{}'));
    } catch {
      return upstreamColumns;
    }
  }

  return upstreamColumns;
}
