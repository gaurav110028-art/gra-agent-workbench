export const consentStates = ['Opted in', 'Unknown', 'Opted out'];
export const intervals = [1, 3, 5, 7];
const catalog = [
  ['reminder_rbf_huf', 3, true],
  ['reminder_bank_doc_percent', 4, true],
  ['reminder_bank_doc', 3, true],
  ['paymentreminder2', 3],
  ['gra_client_followup', 3],
  ['gra_document_reminder', 3],
  ['gra_client_clarification', 3],
];
export const templates = catalog.map(([name, count, pdf = false]) => ({
  name,
  count,
  pdf,
  language: 'Unconfirmed',
}));
export const contacts = [
  'Aster Studio',
  'Birch Trading',
  'Cedar Group',
  'Dove Textiles',
  'Elm Design',
  'Fern Books',
].map((name, i) => ({
  id: 'c' + i,
  name,
  phone: '+1202555010' + i,
  consent: consentStates[i < 4 ? 0 : i - 3],
  variables: {
    period: 'April',
    reference: 'DEMO-' + (101 + i),
    amount: String((i + 1) * 100),
  },
}));
export const campaigns = [
  {
    id: 'campaign-a',
    name: 'Quarterly document follow-up',
    template: catalog[2][0],
    status: 'Active sample',
    recipients: ['c0', 'c1', 'c2'],
  },
  {
    id: 'campaign-b',
    name: 'Payment reminder round',
    template: catalog[3][0],
    status: 'Draft',
    recipients: ['c1', 'c3'],
  },
];
export const reminders = [
  {
    id: 'reminder-a',
    name: 'Bank document follow-up',
    contact: 'c0',
    template: catalog[2][0],
    days: 3,
    status: 'Enabled',
    last: '2026-04-06T09:00:00Z',
    first: '2026-04-06T09:00:00Z',
  },
  {
    id: 'reminder-b',
    name: 'Payment check-in',
    contact: 'c1',
    template: catalog[3][0],
    days: 7,
    status: 'Enabled',
    last: null,
    first: '2026-04-10T10:00:00Z',
  },
];
export const logs = [
  {
    id: 'l1',
    contact: 'c0',
    template: catalog[2][0],
    time: '2026-04-06T09:00:00Z',
    result: 'Failed',
    error: 'Sample attachment unavailable',
    source: 'reminder-a',
  },
  {
    id: 'l2',
    contact: 'c1',
    template: catalog[2][0],
    time: '2026-04-05T12:00:00Z',
    result: 'Submitted',
    provider: 'sample-msg-002',
    source: 'campaign-a',
  },
  {
    id: 'l3',
    contact: 'c2',
    template: catalog[2][0],
    time: '2026-04-04T11:00:00Z',
    result: 'Submitted',
    provider: 'sample-msg-001',
    source: 'campaign-a',
  },
];
export function validateContact(contact, others) {
  if (!contact.name.trim()) return 'Enter a contact name.';
  if (!/^\+[1-9]\d{1,14}$/.test(contact.phone))
    return 'Enter an international phone number starting with + and up to 15 digits.';
  if (
    others.some(
      (item) => item.phone === contact.phone && item.id !== contact.id,
    )
  )
    return 'This phone number already exists.';
  if (!consentStates.includes(contact.consent))
    return 'Choose a valid consent status.';
  return '';
}

// CSV supports quoted cells, escaped quotes and CRLF. Reject ambiguous headers and malformed rows.
export function previewCsv(input, existing) {
  if (input.length > 100000) throw Error('CSV exceeds 100,000 characters.');
  const rows = [];
  let row = [],
    cell = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (input[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (ch === ',' || ch === '\n' || ch === '\r') {
      row.push(cell.trim());
      cell = '';
      closed = false;
      if (ch !== ',') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (ch === '\r' && input[i + 1] === '\n') i++;
      }
    } else if (ch === '"' && !closed && !cell) quoted = true;
    else if (closed || ch === '"') throw Error('Malformed CSV quoting.');
    else cell += ch;
  }
  if (quoted) throw Error('A quoted CSV field is incomplete.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift() || [];
  if (
    !['name', 'phone', 'consent'].every((key) => headers.includes(key)) ||
    new Set(headers).size !== headers.length ||
    headers.some(
      (key) =>
        !['name', 'phone', 'consent'].includes(key) &&
        !/^var_[a-zA-Z0-9_]+$/.test(key),
    )
  )
    throw Error('Use name,phone,consent and optional var_ columns.');
  if (!rows.length || rows.length > 500)
    throw Error('Provide between 1 and 500 contacts.');
  const seen = [...existing];
  return rows.map((values, index) => {
    const fields = Object.fromEntries(
      headers.map((h, i) => [h, values[i] || '']),
    );
    const { name, phone, consent } = fields;
    const variables = Object.fromEntries(
      headers
        .filter((h) => h.startsWith('var_'))
        .map((h) => [h.slice(4), fields[h]]),
    );
    const contact = { name, phone, consent, variables };
    const error =
      values.length !== headers.length
        ? 'Incorrect column count.'
        : validateContact(contact, seen);
    seen.push({ ...contact, id: 'csv-' + index });
    return { contact, error };
  });
}
export function campaignReview(draft, directory, template) {
  const issues = { mappings: [] };
  if (!draft.name.trim()) issues.name = 'Enter a campaign name.';
  if (!draft.recipients.length) issues.recipients = 'Select at least one recipient.';
  if (template.pdf) {
    try {
      const url = new URL(draft.pdf);
      if (url.protocol !== 'https:' || url.username || url.password ||
          !/\.pdf$/i.test(url.pathname))
        throw Error();
    } catch {
      issues.pdf = 'Provide an HTTPS PDF URL with a .pdf path and no embedded credentials.';
    }
  }
  const byId = new Map(directory.map((contact) => [contact.id, contact]));
  const rows = draft.recipients.map((id) => {
    const contact = byId.get(id);
    if (!contact || contact.consent !== 'Opted in')
      issues.recipients = 'Every recipient must have opted in.';
    const values = Array.from({ length: template.count }, (_, i) => {
      const key = draft.mapping[i];
      if (key === 'name' || key === 'phone') return contact?.[key];
      if (!key?.startsWith('var:') || !contact) return '';
      const variable = key.slice(4);
      return Object.hasOwn(contact.variables, variable) ? contact.variables[variable] : '';
    });
    values.forEach((value, index) => {
      if (typeof value === 'string' && value.trim()) return;
      issues.mappings[index] ??= draft.mapping[index]
        ? 'Missing a value for ' + (contact?.name || 'a selected recipient') + '.'
        : 'Choose a contact field.';
    });
    return { id, name: contact?.name || 'Missing contact', values };
  });
  const errors = [issues.name, issues.recipients, issues.pdf].filter(Boolean);
  if (issues.mappings.length) errors.push('Map every variable to a value for every recipient.');
  return { rows, errors, issues };
}
export function nextEligible(reminder) {
  if (reminder.status !== 'Enabled' || !intervals.includes(reminder.days))
    return null;
  return reminder.last
    ? new Date(
        Date.parse(reminder.last) + reminder.days * 86400000,
      ).toISOString()
    : reminder.first;
}
