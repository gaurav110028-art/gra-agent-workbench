import { canonicalJson, isRecord, legacyId, MAX_IMPORT_BYTES, MAX_IMPORT_RECORDS, validImportPayload, validLegacySource } from '../../../lib/migration/legacy-schema.mjs';

const hasFields = (...fields) => value => isRecord(value) && fields.every(field => typeof value[field] === 'string');
const definitions = [
  { id: 'agents', label: 'Agents', key: 'gra-agents', shape: 'list', disposition: 'candidate' },
  { id: 'versions', label: 'Workflow versions', prefix: 'gra-workflow-version-', shape: 'record', disposition: 'candidate' },
  { id: 'workflows', label: 'Workflow graphs', prefix: 'gra-workflow-', shape: 'record', disposition: 'candidate' },
  { id: 'runs', label: 'Run history', key: 'gra-run-history', shape: 'list', validate: value => hasFields('id', 'status', 'startedAt')(value) && Array.isArray(value.steps) },
  { id: 'approvals', label: 'Approvals', key: 'gra-approval-queue', shape: 'list', validate: hasFields('id', 'status', 'requestedAt') },
  { id: 'queries', label: 'Query Inbox', key: 'gra-query-inbox', shape: 'list', validate: hasFields('id', 'message', 'status', 'receivedAt') },
  { id: 'team', label: 'Team directory', key: 'gra-team-members', shape: 'list', validate: hasFields('id', 'name', 'role') },
  { id: 'tasks', label: 'Calendar tasks', key: 'gra-calendar-tasks', shape: 'list', validate: hasFields('id', 'date', 'status') },
  { id: 'entities', label: 'Calendar entities', key: 'gra-calendar-entities', shape: 'list', validate: value => typeof value === 'string' && value.trim().length > 0 },
  { id: 'notes', label: 'Calendar notes', key: 'gra-calendar-notes', shape: 'list', validate: hasFields('id', 'date', 'content') },
  { id: 'posts', label: 'Social calendar', key: 'gra-instagram-posts', shape: 'list', validate: value => hasFields('id', 'calendarDate', 'platform')(value) && Array.isArray(value.weeklyCheckins) },
  { id: 'architect', label: 'AI Architect history', prefix: 'gra-gaurav-history-', shape: 'list', validate: hasFields('id', 'sender', 'content', 'timestamp') },
  { id: 'identity', label: 'Legacy identity keys', keys: ['gra-auth-users', 'gra-auth-session'] },
  { id: 'preferences', label: 'Preferences and runtime markers', keys: ['gra-theme', 'gra-sidebar-collapsed', 'gra-agents-seeded', 'gra-queries-cleared-time'] },
];

export async function previewLegacyStorage(storage, database) {
  const categories = definitions.map(({ id, label, disposition, keys }) => ({
    id, label, disposition: disposition || (keys ? 'excluded' : 'deferred'),
    valid: 0, invalid: 0, unreadable: 0, excluded: 0,
  }));
  const summaries = new Map(categories.map(summary => [summary.id, summary]));
  const candidates = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key) continue;
    const definition = definitions.find(item => item.key === key || item.keys?.includes(key) || (item.prefix && key.startsWith(item.prefix)));
    if (!definition) continue;
    const summary = summaries.get(definition.id);
    if (definition.keys) { summary.excluded++; continue; }
    let data;
    try {
      const stored = storage.getItem(key);
      if (stored === null || stored.length > 5 * MAX_IMPORT_BYTES) throw new TypeError();
      data = JSON.parse(stored);
      if (definition.shape === 'list' && !Array.isArray(data)) throw new TypeError();
    } catch {
      summary.unreadable++;
      continue;
    }
    const values = definition.shape === 'list' ? data : [data];
    for (const value of values) {
      if (summary.disposition !== 'candidate') {
        if (definition.validate(value)) summary.valid++;
        else summary.invalid++;
        continue;
      }
      const id = definition.prefix ? key.slice(definition.prefix.length) : legacyId(value?.id);
      if (!validImportPayload(definition.id, id, value)) { summary.invalid++; continue; }
      try {
        const canonical = canonicalJson(value);
        candidates.push({ kind: definition.id, id, canonical });
      } catch { summary.invalid++; }
    }
  }

  const identities = new Map();
  const conflicts = new Set();
  for (const { kind, id, canonical } of candidates) {
    const identity = kind + '/' + id;
    if (identities.has(identity) && identities.get(identity) !== canonical) conflicts.add(identity);
    else identities.set(identity, canonical);
  }
  let candidateBytes = 0;
  for (const { kind, id, canonical } of candidates) {
    const summary = summaries.get(kind);
    const agent = 'agents/' + id;
    if (!identities.has(agent) || conflicts.has(agent) || conflicts.has(kind + '/' + id)) summary.invalid++;
    else {
      summary.valid++;
      candidateBytes += new TextEncoder().encode(canonical).length;
    }
  }

  const sources = { id: 'sources', label: 'Source files', disposition: 'deferred', valid: 0, invalid: 0, unreadable: 0, excluded: 0 };
  categories.push(sources);
  try {
    await inspectSources(database, value => {
      if (validLegacySource(value)) sources.valid++;
      else sources.invalid++;
    });
  } catch {
    sources.unreadable++;
  }
  return {
    categories,
    exceedsBatchLimits: candidates.length > MAX_IMPORT_RECORDS || candidateBytes > MAX_IMPORT_BYTES,
  };
}

async function inspectSources(database, inspect) {
  if (typeof database?.databases !== 'function') throw new Error('Source inventory unavailable.');
  const name = 'gra-agent-workbench';
  if (!(await database.databases()).some(entry => entry.name === name)) return;
  const db = await new Promise((resolve, reject) => {
    const request = database.open(name);
    request.onupgradeneeded = () => request.transaction.abort(); // A concurrently removed database must stay absent.
    request.onerror = () => reject(new Error('Source inventory unavailable.'));
    request.onsuccess = () => resolve(request.result);
  });
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('sources', 'readonly');
      const cursor = transaction.objectStore('sources').openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        inspect(row.value);
        row.continue();
      };
      transaction.oncomplete = resolve;
      transaction.onabort = transaction.onerror = () => reject(new Error('Source inventory unavailable.'));
    });
  } finally {
    db.close();
  }
}
