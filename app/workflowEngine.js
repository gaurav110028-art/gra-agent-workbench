import { splitColumns, triggerTypes } from './workflowCatalog';

/* =========================================================
   CSV / JSON INPUT
========================================================= */

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  const source = String(text || '').replace(/\r\n?/g, '\n');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const nonEmpty = rows.filter((item) =>
    item.some((value) => String(value).trim() !== '')
  );

  if (nonEmpty.length === 0) {
    return { columns: [], rows: [] };
  }

  const columns = nonEmpty[0].map((value, index) =>
    String(value).trim() || `column_${index + 1}`
  );

  const data = nonEmpty.slice(1).map((values) =>
    Object.fromEntries(
      columns.map((column, index) => [
        column,
        String(values[index] ?? '').trim(),
      ])
    )
  );

  return { columns, rows: data };
}

export function parseRowsInput(text) {
  const trimmed = String(text || '').trim();

  if (!trimmed) return { columns: [], rows: [] };

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.rows)
          ? parsed.rows
          : [parsed];

      const columns = [
        ...new Set(list.flatMap((item) => Object.keys(item || {}))),
      ];

      return { columns, rows: list };
    } catch {
      return parseCsv(trimmed);
    }
  }

  return parseCsv(trimmed);
}

/* =========================================================
   SAMPLE DATA  (used by Test Run so templates never run empty)
========================================================= */

const sampleClients = [
  {
    client_name: 'Sharma Traders Pvt Ltd',
    email: 'accounts@sharmatraders.in',
    phone: '+919812345601',
    gstin: '27AABCS1234A1Z5',
    pan: 'AABCS1234A',
    firm: 'Sharma Traders Pvt Ltd',
    partner: 'CA Gaurav Sharma',
    service: 'GST Advisory',
    period: 'Sep 2026',
    purchase_data_received: 'No',
    gstr2b_matched: 'No',
    days_left: '3',
    missing_documents: 'Form 16, HDFC bank statement (Apr-Mar), 26AS',
    due_date: '2026-10-20',
    assessment_year: 'AY 2026-27',
    engagement_type: 'Tax Audit',
    compliance: 'TDS',
    form: '24Q',
    fromName: 'Rakesh Sharma',
  },
  {
    client_name: 'Mehta & Sons',
    email: 'finance@mehtasons.co.in',
    phone: '+919812345602',
    gstin: '07AAEFM4321B1Z2',
    pan: 'AAEFM4321B',
    firm: 'Mehta & Sons',
    partner: 'CA Priya Iyer',
    service: 'ROC Filing',
    period: 'Sep 2026',
    purchase_data_received: 'Yes',
    gstr2b_matched: 'Yes',
    days_left: '9',
    missing_documents: '',
    due_date: '2026-10-29',
    assessment_year: 'AY 2026-27',
    engagement_type: 'ITR-3',
    compliance: 'ROC',
    form: 'AOC-4',
    fromName: 'Anil Mehta',
  },
  {
    client_name: 'Verma Textiles LLP',
    email: 'cfo@vermatextiles.com',
    phone: '+919812345603',
    gstin: '09AAIFV5678C1Z9',
    pan: 'AAIFV5678C',
    firm: 'Verma Textiles LLP',
    partner: 'CA Gaurav Sharma',
    service: 'Virtual CFO',
    period: 'Sep 2026',
    purchase_data_received: 'No',
    gstr2b_matched: 'Partial',
    days_left: '2',
    missing_documents: 'Capital gains statement (Zerodha), Form 16A',
    due_date: '2026-10-15',
    assessment_year: 'AY 2026-27',
    engagement_type: 'ITR-2',
    compliance: 'MCA',
    form: 'DIR-3 KYC',
    fromName: 'Sunita Verma',
  },
  {
    client_name: 'Iyer Consultants',
    email: 'hello@iyerconsultants.in',
    phone: '+919812345604',
    gstin: '33AACFI9012D1Z1',
    pan: 'AACFI9012D',
    firm: 'Iyer Consultants',
    partner: 'CA Priya Iyer',
    service: 'Tax Audit',
    period: 'Sep 2026',
    purchase_data_received: 'No',
    gstr2b_matched: 'No',
    days_left: '12',
    missing_documents: 'Fixed asset register',
    due_date: '2026-11-07',
    assessment_year: 'AY 2026-27',
    engagement_type: 'ITR-1',
    compliance: 'TDS',
    form: '26Q',
    fromName: 'Karthik Iyer',
  },
];

export function sampleRows(columns, count = 4) {
  const keys = columns.length ? columns : ['client_name', 'email'];

  return Array.from({ length: Math.min(count, sampleClients.length) }).map(
    (_, index) => {
      const base = sampleClients[index];

      return Object.fromEntries(
        keys.map((key) => {
          const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          const value =
            base[normalized] ??
            base[key] ??
            `${key} ${index + 1}`;

          return [key, value];
        })
      );
    }
  );
}

/* =========================================================
   VARIABLE RESOLUTION
   {{$node.Node Name.data.path}}  {{$item.field}}  {{$json.field}}
========================================================= */

export function getValueAtPath(target, path) {
  if (!path) return target;

  const segments = String(path)
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);

  let current = target;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    current = current[segment];
  }

  return current;
}

export function resolveExpression(expression, ctx) {
  const expr = String(expression || '').trim();

  if (expr.startsWith('$node.')) {
    const rest = expr.slice(6);
    const dataIndex = rest.indexOf('.data');

    const nodeName = dataIndex >= 0 ? rest.slice(0, dataIndex) : rest;
    const path = dataIndex >= 0 ? rest.slice(dataIndex + 5).replace(/^\./, '') : '';

    const data = ctx.outputs?.[nodeName.trim()];

    return getValueAtPath(data, path);
  }

  if (expr === '$item') return ctx.item;

  if (expr.startsWith('$item.')) {
    return getValueAtPath(ctx.item, expr.slice(6));
  }

  if (expr === '$json') return ctx.prev;

  if (expr.startsWith('$json.')) {
    return getValueAtPath(ctx.prev, expr.slice(6));
  }

  if (expr === '$items') return ctx.items;

  if (expr === '$now') return new Date().toISOString();

  const fromItem = getValueAtPath(ctx.item, expr);
  if (fromItem !== undefined) return fromItem;

  return getValueAtPath(ctx.prev, expr);
}

function stringify(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const TEMPLATE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

export function resolveTemplate(text, ctx) {
  const source = String(text ?? '');

  return source.replace(TEMPLATE_PATTERN, (_, expression) =>
    stringify(resolveExpression(expression, ctx))
  );
}

/* Returns the raw value when the whole string is one expression. */
export function resolveValue(text, ctx) {
  const source = String(text ?? '').trim();
  const single = source.match(/^\{\{\s*([^}]+?)\s*\}\}$/);

  if (single) return resolveExpression(single[1], ctx);

  return resolveTemplate(source, ctx);
}

export function extractExpressions(text) {
  return [...String(text || '').matchAll(TEMPLATE_PATTERN)].map((m) => m[1]);
}

/* =========================================================
   OPERATORS
========================================================= */

export function evaluateOperator(left, operator, right) {
  const l = left;
  const r = right;

  const lNumber = Number(l);
  const rNumber = Number(r);

  const bothNumeric =
    l !== '' && r !== '' && !Number.isNaN(lNumber) && !Number.isNaN(rNumber);

  switch (operator) {
    case 'Equals':
      return bothNumeric
        ? lNumber === rNumber
        : stringify(l).toLowerCase() === stringify(r).toLowerCase();
    case 'Not Equals':
      return bothNumeric
        ? lNumber !== rNumber
        : stringify(l).toLowerCase() !== stringify(r).toLowerCase();
    case 'Contains':
      return stringify(l).toLowerCase().includes(stringify(r).toLowerCase());
    case 'Greater Than':
      return bothNumeric ? lNumber > rNumber : stringify(l) > stringify(r);
    case 'Less Than':
      return bothNumeric ? lNumber < rNumber : stringify(l) < stringify(r);
    case 'Is Empty':
      return (
        l === null ||
        l === undefined ||
        stringify(l).trim() === '' ||
        (Array.isArray(l) && l.length === 0)
      );
    case 'Is Not Empty':
      return !(
        l === null ||
        l === undefined ||
        stringify(l).trim() === '' ||
        (Array.isArray(l) && l.length === 0)
      );
    default:
      return Boolean(l);
  }
}

/* =========================================================
   GRAPH HELPERS
========================================================= */

export function buildGraph(nodes, edges) {
  const incoming = {};
  const outgoing = {};

  nodes.forEach((item) => {
    incoming[item.id] = [];
    outgoing[item.id] = [];
  });

  edges.forEach((item) => {
    if (outgoing[item.source]) outgoing[item.source].push(item);
    if (incoming[item.target]) incoming[item.target].push(item);
  });

  return { incoming, outgoing };
}

export function orderFromTrigger(nodes, edges) {
  const trigger = nodes.find((item) =>
    triggerTypes.includes(item.data.nodeType)
  );

  if (!trigger) return [];

  const { outgoing } = buildGraph(nodes, edges);
  const map = Object.fromEntries(nodes.map((item) => [item.id, item]));

  const queue = [trigger.id];
  const visited = new Set();
  const ordered = [];

  while (queue.length > 0) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);

    if (map[id]) ordered.push(map[id]);

    (outgoing[id] || []).forEach((edge) => {
      if (!visited.has(edge.target)) queue.push(edge.target);
    });
  }

  return ordered;
}

export function getUpstreamNodes(nodeId, nodes, edges) {
  const { incoming } = buildGraph(nodes, edges);
  const map = Object.fromEntries(nodes.map((item) => [item.id, item]));

  const result = [];
  const visited = new Set([nodeId]);
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift();

    (incoming[current] || []).forEach((edge) => {
      if (visited.has(edge.source)) return;
      visited.add(edge.source);

      if (map[edge.source]) {
        result.push(map[edge.source]);
        queue.push(edge.source);
      }
    });
  }

  return result;
}

/* =========================================================
   NODE EXECUTION
   ctx = { outputs, item, items, prev, mode }
   returns { output, note, items?, branches? }
========================================================= */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sampleAiJson(keys, ctx, config) {
  const item = ctx.item || ctx.items?.[0] || {};
  const prev = ctx.prev || {};
  const subjectHint = prev.subject || item.subject || '';

  const values = {
    subject: `Documents pending for ${item.client_name || 'your return'} - ${item.assessment_year || 'AY 2026-27'}`,
    body: `Dear ${item.client_name || 'Client'},\n\nWe are preparing your ${item.engagement_type || 'return'} for ${item.assessment_year || 'AY 2026-27'} and are still awaiting:\n${splitColumns(item.missing_documents || 'Form 16, Bank statement').map((d) => `- ${d}`).join('\n')}\n\nKindly share these by ${item.due_date || 'the due date'}.\n\nRegards,\nGRA Advisory`,
    category: /gst|gstr/i.test(subjectHint) ? 'GST' : /roc|mca|din/i.test(subjectHint) ? 'ROC/MCA' : 'Income Tax',
    urgency: /notice|urgent|penalty|today|tomorrow/i.test(`${subjectHint} ${prev.body || ''}`) ? 'High' : 'Medium',
    summary: `Client asks about ${subjectHint || 'a compliance matter'}.`,
    draft_reply: `Dear ${prev.fromName || item.client_name || 'Client'},\n\nThank you for your email regarding ${subjectHint || 'your query'}. We have reviewed it and will revert with the required details by the next working day.\n\nRegards,\nGRA Advisory`,
  };

  return Object.fromEntries(
    keys.map((key) => [key, values[key] ?? `Sample ${key}`])
  );
}

function resolveList(value, ctx) {
  const resolved = resolveValue(value, ctx);

  if (Array.isArray(resolved)) return resolved;
  if (resolved && typeof resolved === 'object' && Array.isArray(resolved.rows)) {
    return resolved.rows;
  }

  return null;
}

function itemsFromConfig(config) {
  if (Array.isArray(config.csvRows) && config.csvRows.length) {
    return config.csvRows;
  }
  return null;
}

async function forEachItem(items, handler, limit = Infinity) {
  const results = [];
  const list = Array.isArray(items) ? items.slice(0, limit) : [];

  for (let index = 0; index < list.length; index += 1) {
    results.push(await handler(list[index], index));
  }

  return results;
}

export async function executeNode({ node, ctx, mode, services = {} }) {
  const type = node.data.nodeType;
  const config = node.data.config || {};
  const live = mode === 'live';

  const item = ctx.item || ctx.items?.[0] || null;
  const local = { ...ctx, item };

  const resolve = (text, scope = local) => resolveTemplate(text, scope);

  switch (type) {
    /* ---------- Triggers ---------- */
    case 'trigger':
      return {
        output: {
          triggeredBy: 'user',
          triggeredAt: new Date().toISOString(),
          mode,
        },
        note: live ? 'Started manually (live run).' : 'Started manually (test run).',
      };

    case 'schedule': {
      const now = new Date();
      return {
        output: {
          scheduledAt: now.toISOString(),
          runDate: now.toISOString().slice(0, 10),
          frequency: config.frequency,
          cron: config.cron || null,
        },
        note: `${config.frequency || 'Scheduled'} at ${config.time || '--:--'}${config.cron ? ` (${config.cron})` : ''}.`,
      };
    }

    case 'webhook': {
      let payload = {};
      try {
        payload = JSON.parse(config.samplePayload || '{}');
      } catch {
        payload = { raw: config.samplePayload };
      }

      const items = Array.isArray(payload) ? payload : [payload];

      return {
        output: {
          method: config.method,
          path: config.path,
          payload,
          receivedAt: new Date().toISOString(),
        },
        items,
        note: `Sample ${config.method || 'POST'} payload received at ${config.path || '/webhook'}.`,
      };
    }

    case 'sheetsTrigger': {
      const columns = splitColumns(config.columns);
      const row = sampleRows(columns, 1)[0] || {};

      return {
        output: { row, rowNumber: 2, spreadsheet: config.spreadsheet, sheet: config.sheet },
        items: [row],
        note: `New row detected in ${config.spreadsheet || 'spreadsheet'} / ${config.sheet || 'Sheet1'}.`,
      };
    }

    case 'emailTrigger': {
      const sample = {
        from: 'rakesh@sharmatraders.in',
        fromName: 'Rakesh Sharma',
        subject: `${config.subjectContains || 'GST notice received'} - need urgent help`,
        body:
          'Hello team, we received a GST ASMT-10 notice today asking for reconciliation of ITC claimed in GSTR-3B vs GSTR-2B for Apr-Jun 2026. Reply due in 7 days. Please advise what documents you need from us.',
        receivedAt: new Date().toISOString(),
        attachments: ['ASMT-10_notice.pdf'],
      };

      return {
        output: sample,
        items: [sample],
        note: `Sample email received in ${config.mailbox || 'mailbox'}.`,
      };
    }

    /* ---------- Flow logic ---------- */
    case 'condition': {
      const evaluate = (scope) => {
        const left = resolveValue(config.field, scope);
        const right = resolveValue(config.value, scope);
        return {
          result: evaluateOperator(left, config.operator, right),
          left,
          right,
        };
      };

      if (Array.isArray(ctx.items) && ctx.items.length > 0) {
        const trueItems = [];
        const falseItems = [];

        ctx.items.forEach((entry) => {
          const { result } = evaluate({ ...ctx, item: entry });
          (result ? trueItems : falseItems).push(entry);
        });

        return {
          output: {
            result: trueItems.length > 0,
            trueCount: trueItems.length,
            falseCount: falseItems.length,
            operator: config.operator,
          },
          branches: {
            true: { active: trueItems.length > 0, items: trueItems },
            false: { active: falseItems.length > 0, items: falseItems },
          },
          note: `${trueItems.length} item(s) matched, ${falseItems.length} did not.`,
        };
      }

      const { result, left, right } = evaluate(local);

      return {
        output: { result, leftValue: left, rightValue: right, operator: config.operator },
        branches: {
          true: { active: result, items: ctx.items },
          false: { active: !result, items: ctx.items },
        },
        note: `${stringify(left) || '(empty)'} ${config.operator} ${stringify(right)} → ${result ? 'TRUE' : 'FALSE'}`,
      };
    }

    case 'router': {
      const routes = splitColumns(config.routes);
      const branches = {};
      routes.forEach((_, index) => {
        branches[`route-${index}`] = { active: false, items: [] };
      });

      const routeOf = (scope) => {
        const value = stringify(resolveValue(config.field, scope)).trim().toLowerCase();
        const index = routes.findIndex((r) => r.toLowerCase() === value);
        return { value, index };
      };

      if (Array.isArray(ctx.items) && ctx.items.length > 0) {
        ctx.items.forEach((entry) => {
          const { index } = routeOf({ ...ctx, item: entry });
          if (index >= 0) {
            branches[`route-${index}`].active = true;
            branches[`route-${index}`].items.push(entry);
          }
        });

        const summary = routes
          .map((r, i) => `${r}: ${branches[`route-${i}`].items.length}`)
          .join(', ');

        return {
          output: {
            routes,
            counts: Object.fromEntries(routes.map((r, i) => [r, branches[`route-${i}`].items.length])),
          },
          branches,
          note: `Routed items → ${summary}.`,
        };
      }

      const { value, index } = routeOf(local);
      if (index >= 0) branches[`route-${index}`] = { active: true, items: ctx.items };

      return {
        output: { route: routes[index] || null, value },
        branches,
        note: index >= 0 ? `Value "${value}" → ${routes[index]}.` : `Value "${value}" matched no route.`,
      };
    }

    case 'filter': {
      const source = Array.isArray(ctx.items) ? ctx.items : [];
      const kept = source.filter((entry) => {
        const scope = { ...ctx, item: entry };
        return evaluateOperator(
          resolveValue(config.field, scope),
          config.operator,
          resolveValue(config.value, scope)
        );
      });

      return {
        output: { items: kept, count: kept.length, removed: source.length - kept.length },
        items: kept,
        note: `Kept ${kept.length} of ${source.length} item(s).`,
      };
    }

    case 'loop': {
      const list = resolveList(config.source, local) || ctx.items || [];
      const batch = Number(config.batchSize) || 1;

      return {
        output: {
          items: list,
          count: list.length,
          item: list[0] || null,
          index: 0,
          batchSize: batch,
        },
        items: list,
        note: `Iterating ${list.length} item(s)${batch > 1 ? ` in batches of ${batch}` : ''}.`,
      };
    }

    case 'merge': {
      const list = Array.isArray(ctx.items) ? ctx.items : [];
      return {
        output: { items: list, count: list.length, mode: config.mode, branches: ctx.branchCount || 1 },
        items: list,
        note: `${config.mode || 'Merged'} — ${list.length} item(s) from ${ctx.branchCount || 1} branch(es).`,
      };
    }

    case 'delay': {
      const multiplier = { Seconds: 1000, Minutes: 60000, Hours: 3600000, Days: 86400000 }[config.unit] || 1000;
      const requestedMs = Number(config.amount || 0) * multiplier;
      const simulatedMs = Math.min(requestedMs, live ? 3000 : 600);

      if (simulatedMs > 0) await sleep(simulatedMs);

      return {
        output: { waitedMs: requestedMs, actualMs: simulatedMs, resumedAt: new Date().toISOString() },
        note: `Wait ${config.amount || 0} ${config.unit || ''} (fast-forwarded in ${simulatedMs} ms).`,
      };
    }

    case 'stop':
      return {
        output: { stopped: true, reason: config.reason || 'Workflow complete' },
        note: config.reason || 'Workflow stopped.',
      };

    /* ---------- Actions & connectors ---------- */
    case 'googleSheets': {
      const columns = splitColumns(config.columns);

      if (config.operation === 'Read Rows') {
        const rows = itemsFromConfig(config) || sampleRows(columns);
        return {
          output: { rows, rowCount: rows.length, spreadsheet: config.spreadsheet, sheet: config.sheet, columns },
          items: rows,
          note: `${config.csvRows?.length ? 'Loaded' : 'Sample'} ${rows.length} row(s) from ${config.spreadsheet || 'spreadsheet'} / ${config.sheet || 'Sheet1'}.`,
        };
      }

      const list = Array.isArray(ctx.items) && ctx.items.length ? ctx.items : [item || {}];
      const written = list.map((entry) =>
        splitColumns(resolve(config.rowValues, { ...ctx, item: entry }))
      );

      return {
        output: { operation: config.operation, written, rowCount: written.length, spreadsheet: config.spreadsheet, sheet: config.sheet },
        items: ctx.items,
        note: `${config.operation} × ${written.length} in ${config.sheet || 'Sheet1'} (${live ? 'connector not linked — logged only' : 'simulated'}).`,
      };
    }

    case 'bulkEmail': {
      const rows =
        config.dataSource === 'Uploaded CSV / JSON'
          ? itemsFromConfig(config) || []
          : Array.isArray(ctx.items) && ctx.items.length
            ? ctx.items
            : itemsFromConfig(config) || (item ? [item] : []);

      const limit = Number(config.maxRecipients) || 50;

      const messages = rows.slice(0, limit).map((entry) => {
        const scope = { ...ctx, item: entry };
        return {
          to: resolve(config.to, scope),
          subject: resolve(config.subject, scope),
          body: resolve(config.body, scope),
        };
      });

      if (!live || !services.sendEmail) {
        return {
          output: {
            sent: messages.length,
            failed: 0,
            recipients: messages.map((m) => m.to),
            messages,
            provider: 'Resend (simulated)',
          },
          items: rows,
          note: `${messages.length} personalised email(s) rendered. Nothing sent in Test Run.`,
        };
      }

      const results = await forEachItem(messages, (message) => services.sendEmail(message));
      const sent = results.filter((r) => r.status === 'sent');
      const failed = results.filter((r) => r.status !== 'sent');

      return {
        output: {
          sent: sent.length,
          failed: failed.length,
          recipients: messages.map((m) => m.to),
          messages: results,
          provider: 'Resend',
        },
        items: rows,
        error: failed.length === messages.length && messages.length > 0 ? failed[0]?.error : null,
        note: `Resend: ${sent.length} sent, ${failed.length} failed.`,
      };
    }

    case 'email': {
      const message = {
        to: resolve(config.to),
        subject: resolve(config.subject),
        body: resolve(config.body),
      };

      if (!live || !services.sendEmail) {
        return {
          output: { ...message, status: 'rendered', provider: 'Resend (simulated)' },
          note: `Email to ${message.to || '(no recipient)'} rendered. Nothing sent in Test Run.`,
        };
      }

      const result = await services.sendEmail(message);

      return {
        output: { ...message, ...result },
        error: result.status === 'sent' ? null : result.error,
        note:
          result.status === 'sent'
            ? `Email sent via Resend to ${message.to}. ID ${result.id || 'received'}.`
            : `Resend failed: ${result.error}`,
      };
    }

    case 'whatsappApi':
    case 'whatsapp': {
      const list = Array.isArray(ctx.items) && ctx.items.length ? ctx.items : [item || {}];
      const messages = list.map((entry) => {
        const scope = { ...ctx, item: entry };
        return {
          to: resolve(config.to, scope),
          template: config.templateName || null,
          message: resolve(config.message, scope),
          status: 'queued',
          messageId: `wamid.${Math.random().toString(36).slice(2, 12)}`,
        };
      });

      return {
        output: {
          messageId: messages[0]?.messageId,
          status: 'queued',
          to: messages[0]?.to,
          messages,
          count: messages.length,
        },
        items: ctx.items,
        note: `${messages.length} WhatsApp message(s) prepared${live ? ' — Business API credentials not linked, queued only.' : ' (simulated).'}`,
      };
    }

    case 'aiAgent': {
      const keys = splitColumns(config.jsonSchema);
      const wantsJson = config.outputFormat === 'JSON';
      const list = Array.isArray(ctx.items) && ctx.items.length ? ctx.items : [item];
      const liveLimit = 5;

      const runOne = async (entry) => {
        const scope = { ...ctx, item: entry };
        const prompt = resolve(config.userPrompt, scope);

        if (live && services.callAi) {
          const result = await services.callAi({
            provider: config.provider,
            systemPrompt: config.systemPrompt,
            userPrompt: prompt,
            outputFormat: config.outputFormat,
            jsonKeys: keys,
          });
          return { prompt, ...result };
        }

        const json = wantsJson ? sampleAiJson(keys, scope, config) : null;
        return {
          prompt,
          text: wantsJson ? JSON.stringify(json, null, 2) : `Simulated ${config.provider || 'AI'} response for: ${prompt.slice(0, 80)}...`,
          json,
          model: config.provider?.includes('OpenAI') ? 'gpt-4o-mini (simulated)' : 'claude-haiku-4-5 (simulated)',
          tokens: { input: Math.round(prompt.length / 4), output: 180 },
        };
      };

      const results = await forEachItem(list, runOne, live ? liveLimit : Infinity);
      const first = results[0] || {};
      const failed = results.find((r) => r.error);

      const enrichedItems = Array.isArray(ctx.items)
        ? ctx.items.map((entry, index) => ({ ...entry, ai: results[index]?.json || results[index]?.text || null }))
        : ctx.items;

      return {
        output: {
          text: first.text,
          json: first.json,
          model: first.model,
          tokens: first.tokens,
          prompt: first.prompt,
          results: results.length > 1 ? results : undefined,
        },
        items: enrichedItems,
        error: failed?.error || null,
        note: failed
          ? `AI call failed: ${failed.error}`
          : `${results.length} completion(s) via ${first.model || 'model'}${live && list.length > liveLimit ? ` (live limit ${liveLimit})` : ''}.`,
      };
    }

    case 'api': {
      const request = {
        method: config.method,
        url: resolve(config.url),
        headers: Object.fromEntries(
          String(config.headers || '')
            .split('\n')
            .map((line) => line.split(/:(.*)/s))
            .filter((parts) => parts[0]?.trim())
            .map((parts) => [parts[0].trim(), (parts[1] || '').trim()])
        ),
        body: resolve(config.body),
      };

      if (live && services.httpRequest) {
        const result = await services.httpRequest(request);
        return {
          output: { request, ...result },
          error: result.error || null,
          note: result.error ? `HTTP failed: ${result.error}` : `${request.method} ${request.url} → ${result.status} in ${result.durationMs} ms.`,
        };
      }

      return {
        output: { request, status: 200, body: { ok: true, simulated: true }, headers: { 'content-type': 'application/json' }, durationMs: 0 },
        note: `${request.method} ${request.url} simulated (200).`,
      };
    }

    case 'pdfParser': {
      const fields = splitColumns(config.fields);
      const defaults = {
        invoice_number: 'INV/2026-27/0142',
        invoice_date: '2026-09-18',
        gstin: item?.gstin || '27AABCS1234A1Z5',
        vendor: item?.client_name || 'Sharma Traders Pvt Ltd',
        taxable_value: '1,25,000',
        gst_amount: '22,500',
        total: '1,47,500',
        hsn: '8471',
        place_of_supply: 'Maharashtra',
      };

      const extracted = Object.fromEntries(
        fields.map((f) => [f, defaults[f.toLowerCase().replace(/[^a-z0-9]+/g, '_')] ?? `Sample ${f}`])
      );

      return {
        output: { fields: extracted, documentType: config.documentType, pages: 2, confidence: 0.93, sourceId: config.sourceId || null },
        note: `Parsed ${fields.length} field(s) from ${config.documentType || 'document'}${live ? ' (OCR engine not linked — sample values)' : ' (simulated)'}.`,
      };
    }

    case 'approval':
    case 'review':
      return {
        output: {
          approver: config.approver || config.assignee || 'Reviewer',
          message: resolve(config.message || config.instructions || ''),
          decision: 'Pending',
        },
        items: ctx.items,
        pause: true,
        note: `Waiting for ${config.approver || config.assignee || 'reviewer'} in the Approvals tab.`,
      };

    /* ---------- AI helpers / legacy ---------- */
    case 'aiPrompt':
    case 'summarize':
      return {
        output: {
          text: `Simulated AI output for: ${resolve(config.prompt || config.instructions || '').slice(0, 120)}`,
          model: 'simulated',
        },
        items: ctx.items,
        note: 'AI step simulated. No model was called.',
      };

    case 'extract': {
      const fields = splitColumns(config.fields);
      return {
        output: { fields: Object.fromEntries(fields.map((f) => [f, `Sample ${f}`])) },
        items: ctx.items,
        note: `${fields.length} field(s) extracted (simulated).`,
      };
    }

    case 'classify': {
      const categories = splitColumns(config.categories);
      return {
        output: { category: categories[0] || 'Uncategorised', confidence: 0.88 },
        items: ctx.items,
        note: `Classified as ${categories[0] || 'Uncategorised'} (simulated).`,
      };
    }

    case 'notification':
      return {
        output: { recipient: config.recipient, message: resolve(config.message), status: 'created' },
        note: `Internal alert for ${config.recipient || 'team'} created (simulated).`,
      };

    case 'file':
      return {
        output: { fileName: `${resolve(config.fileName)}.${(config.format || 'pdf').toLowerCase()}`, format: config.format, url: null },
        note: `${config.format || 'File'} generated (simulated).`,
      };

    default:
      return {
        output: { simulated: true, config },
        items: ctx.items,
        note: 'External action simulated. Nothing was sent or changed.',
      };
  }
}

/* =========================================================
   RUNNER  — executes the graph with branch pruning, per-edge
   item passing, and pause/resume at Approval Gates.
========================================================= */

export function createRunner({ nodes, edges, mode = 'test', services = {}, hooks = {} }) {
  const ordered = orderFromTrigger(nodes, edges);
  const { incoming, outgoing } = buildGraph(nodes, edges);

  const state = {
    done: new Set(),
    edgeState: {},
    outputs: {},
    outputsById: {},
    pausedNodeId: null,
    pausedCtx: null,
    status: 'idle',
  };

  const isReady = (node) =>
    !state.done.has(node.id) &&
    (incoming[node.id] || []).every((edge) => state.done.has(edge.source));

  const contextFor = (node) => {
    const activeEdges = (incoming[node.id] || []).filter(
      (edge) => state.edgeState[edge.id]?.active
    );

    const isTrigger = triggerTypes.includes(node.data.nodeType);

    if (!isTrigger && activeEdges.length === 0) return null;

    const itemLists = activeEdges
      .map((edge) => state.edgeState[edge.id]?.items)
      .filter((list) => Array.isArray(list));

    const items =
      itemLists.length === 0
        ? null
        : itemLists.length === 1 || node.data.nodeType !== 'merge'
          ? itemLists[0]
          : itemLists.flat();

    const prevEdge = activeEdges[0];
    const prev = prevEdge ? state.outputsById[prevEdge.source] : null;

    return {
      outputs: state.outputs,
      prev,
      items,
      item: items?.[0] || null,
      branchCount: activeEdges.length,
      mode,
    };
  };

  const publish = (node, result, ctx) => {
    state.outputs[node.data.name] = result.output;
    state.outputsById[node.id] = result.output;

    (outgoing[node.id] || []).forEach((edge) => {
      const handle = edge.sourceHandle || null;
      const branch = result.branches?.[handle];

      state.edgeState[edge.id] = branch
        ? { active: Boolean(branch.active), items: branch.items ?? null }
        : {
            // Edge drawn from the generic handle of a branching node:
            // follow it when any branch is live (keeps legacy workflows running).
            active: result.branches
              ? Object.values(result.branches).some((b) => b.active)
              : true,
            items: result.items !== undefined ? result.items : ctx.items,
          };
    });
  };

  const runNode = async (node, ctx) => {
    const started = performance.now();
    hooks.onStart?.(node, { items: ctx.items, item: ctx.item, prev: ctx.prev });

    try {
      const result = await executeNode({ node, ctx, mode, services });
      const durationMs = Math.round(performance.now() - started);

      if (result.pause) {
        state.pausedNodeId = node.id;
        state.pausedCtx = ctx;
        state.pausedResult = result;
        state.status = 'paused';
        hooks.onPause?.(node, result, durationMs, ctx);
        return 'paused';
      }

      publish(node, result, ctx);
      state.done.add(node.id);

      if (result.error) {
        hooks.onError?.(node, result, durationMs);
        state.status = 'failed';
        return 'failed';
      }

      hooks.onSuccess?.(node, result, durationMs);
      return 'ok';
    } catch (error) {
      const durationMs = Math.round(performance.now() - started);
      state.done.add(node.id);
      state.status = 'failed';
      hooks.onError?.(node, { output: null, error: error?.message || 'Step failed', note: error?.message }, durationMs);
      return 'failed';
    }
  };

  const drain = async () => {
    state.status = 'running';

    let progressed = true;

    while (progressed) {
      progressed = false;

      for (const node of ordered) {
        if (!isReady(node)) continue;

        progressed = true;

        const ctx = contextFor(node);

        if (!ctx) {
          state.done.add(node.id);
          (outgoing[node.id] || []).forEach((edge) => {
            state.edgeState[edge.id] = { active: false, items: null };
          });
          hooks.onSkip?.(node);
          continue;
        }

        const outcome = await runNode(node, ctx);

        if (outcome === 'paused') return 'paused';
        if (outcome === 'failed') {
          ordered.forEach((rest) => {
            if (!state.done.has(rest.id)) hooks.onSkip?.(rest, 'Skipped because an earlier step failed.');
          });
          return 'failed';
        }

        break;
      }
    }

    state.status = 'completed';
    return 'completed';
  };

  return {
    ordered,
    state,
    start: drain,
    resume: async (decision) => {
      const node = nodes.find((item) => item.id === state.pausedNodeId);
      if (!node) return 'failed';

      const result = {
        ...state.pausedResult,
        output: { ...state.pausedResult.output, ...decision },
      };

      publish(node, result, state.pausedCtx);
      state.done.add(node.id);
      state.pausedNodeId = null;

      return drain();
    },
    rejectPaused: () => {
      const node = nodes.find((item) => item.id === state.pausedNodeId);
      if (node) state.done.add(node.id);
      state.status = 'rejected';
      ordered.forEach((rest) => {
        if (!state.done.has(rest.id)) hooks.onSkip?.(rest, 'Skipped because approval was rejected.');
      });
    },
  };
}
