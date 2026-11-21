export const importKinds = ['agents', 'workflows', 'versions'];
export const MAX_IMPORT_BYTES = 1024 * 1024;
export const MAX_IMPORT_RECORDS = 250;

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

export function legacyId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : null;
}

const text = value => typeof value === 'string' && value.trim().length > 0;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));

function isGraph(value) {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)
    || value.nodes.length > 500 || value.edges.length > 2000) return false;
  const nodes = new Set();
  for (const node of value.nodes) {
    if (!isRecord(node) || typeof node.id !== 'string' || !legacyId(node.id) || nodes.has(node.id)
      || !isRecord(node.position) || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)
      || !isRecord(node.data) || !text(node.data.name) || !text(node.data.nodeType)
      || (node.data.config !== undefined && !isRecord(node.data.config))) return false;
    nodes.add(node.id);
  }
  const edges = new Set();
  for (const edge of value.edges) {
    if (!isRecord(edge) || typeof edge.id !== 'string' || !legacyId(edge.id) || edges.has(edge.id)
      || !nodes.has(edge.source) || !nodes.has(edge.target)) return false;
    edges.add(edge.id);
  }
  return true;
}

export function validImportPayload(kind, id, value) {
  if (!legacyId(id) || !isRecord(value)) return false;
  switch (kind) {
    case 'agents':
      return legacyId(value.id) === id && text(value.name) && ['paused', 'running'].includes(value.status)
        && [value.templateId, value.category].every(field => field === undefined || typeof field === 'string');
    case 'workflows':
      return isGraph(value);
    case 'versions': {
      if (legacyId(value.agentId) !== id || !Number.isSafeInteger(value.draftVersion) || value.draftVersion < 1
        || typeof value.isDirty !== 'boolean' || !isGraph(value.draft) || !timestamp(value.draft.savedAt)) return false;
      if (value.published === null) return value.publishedVersion === null && value.lastPublishedAt === null && value.isDirty;
      return isGraph(value.published) && timestamp(value.published.savedAt) && timestamp(value.published.publishedAt)
        && value.lastPublishedAt === value.published.publishedAt
        && Number.isSafeInteger(value.publishedVersion) && value.publishedVersion > 0
        && value.publishedVersion <= value.draftVersion && value.publishedVersion === value.published.version
        && (value.isDirty || value.publishedVersion === value.draftVersion);
    }
    default:
      return false;
  }
}

// Stable JSON for approval, deduplication and read-back verification. Preserve extension fields as inert data.
export function canonicalJson(value) {
  function encode(item, depth) {
    if (depth > 40) throw new TypeError('Invalid record structure.');
    if (Array.isArray(item)) return '[' + item.map(entry => encode(entry, depth + 1)).join(',') + ']';
    if (isRecord(item)) {
      return '{' + Object.keys(item).sort().map(key => {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new TypeError('Invalid record structure.');
        return encode(key, depth + 1) + ':' + encode(item[key], depth + 1);
      }).join(',') + '}';
    }
    if (typeof item === 'string' && !item.includes('\0') && item.isWellFormed()) return JSON.stringify(item);
    if (item === null || typeof item === 'boolean'
      || (typeof item === 'number' && Number.isFinite(item))) return JSON.stringify(item);
    throw new TypeError('Invalid record structure.');
  }
  return encode(value, 0);
}

export function validLegacySource(value) {
  return isRecord(value) && legacyId(value.id) && legacyId(value.agentId)
    && text(value.name) && text(value.mimeType) && text(value.category) && timestamp(value.uploadedAt)
    && Number.isSafeInteger(value.size) && value.size >= 0 && value.file instanceof Blob && value.file.size === value.size;
}
