import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';
import { mergeRanges } from './detect.mjs';
import { inspectArchive, verifyArchive } from './archive.mjs';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
export const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MAX_FILE = 5 * 1024 * 1024;
const MESSAGE = 'Unsupported DOCX structure. Use a plain text DOCX without tables, images, links, fields, revisions, comments, hidden text or headers/footers.';
const SOURCE_PARTS = new Set(['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/stylesWithEffects.xml', 'word/settings.xml', 'word/webSettings.xml', 'word/fontTable.xml', 'word/numbering.xml', 'word/theme/theme1.xml', 'docProps/core.xml', 'docProps/app.xml', 'docProps/custom.xml', 'docProps/thumbnail.jpeg']);
const fail = (message = MESSAGE) => { throw new Error(message); };
const children = (node) => Array.from(node.childNodes || []).filter(n => n.nodeType === 1);
const attr = (node, name) => node.getAttributeNS(W, name) || '';
const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

function xml(bytes) {
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('DOCX XML must use valid UTF-8.'); }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(source)) fail('Invalid XML characters in DOCX.');
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) fail('DTD and entity declarations are unsupported.');
  let document;
  try {
    document = new DOMParser({ onError: () => fail('Malformed XML in DOCX.') }).parseFromString(source, 'application/xml');
  } catch { fail('Malformed XML in DOCX.'); }
  let nodes = 0;
  const visit = (node, depth) => {
    if (++nodes > 50000 || depth > 40) fail('DOCX XML complexity limit exceeded.');
    for (const child of Array.from(node.childNodes || [])) visit(child, depth + 1);
  };
  visit(document, 0);
  return document;
}

export function readZip(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_FILE || bytes.length < 22 || bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4) fail('Invalid or oversized DOCX ZIP (maximum 5 MiB).');
  try {
    const records = inspectArchive(bytes);
    const files = unzipSync(bytes);
    verifyArchive(files, records);
    return files;
  } catch { fail('Malformed, encrypted or unsafe DOCX ZIP; archive limits may have been exceeded.'); }
}

function guard(node, allowed) {
  if (node.namespaceURI !== W || !allowed.includes(node.localName)) fail();
}
function noElements(node) { if (children(node).length) fail(); }

function relationships(path, document, files) {
  const ns = 'http://schemas.openxmlformats.org/package/2006/relationships';
  if (document.documentElement.namespaceURI !== ns || document.documentElement.localName !== 'Relationships') fail('Invalid DOCX relationships part.');
  const ids = new Set();
  let main = 0;
  for (const rel of children(document.documentElement)) {
    if (rel.namespaceURI !== ns || rel.localName !== 'Relationship' || children(rel).length) fail('Invalid DOCX relationship.');
    const target = rel.getAttribute('Target') || '';
    const mode = rel.getAttribute('TargetMode') || 'Internal';
    const type = rel.getAttribute('Type') || '';
    const id = rel.getAttribute('Id') || '';
    if (mode !== 'Internal' || !target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target) || /[\\%?#]/.test(target)) fail('External or unsafe document relationships are unsupported.');
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || ids.has(id)) fail('Duplicate or invalid DOCX relationship ID.');
    ids.add(id);
    if (!/^https?:\/\/(?:schemas\.openxmlformats\.org\/(?:officeDocument|package)\/2006\/relationships|schemas\.microsoft\.com\/office\/2007\/relationships)\/(?:officeDocument|styles|stylesWithEffects|settings|webSettings|fontTable|theme|numbering|extended-properties|metadata\/core-properties|custom-properties|metadata\/thumbnail)$/.test(type)) fail('Unsupported DOCX relationship type.');
    const resolved = new URL(target, path === '_rels/.rels' ? 'https://opc.invalid/' : 'https://opc.invalid/word/');
    if (resolved.origin !== 'https://opc.invalid' || !files[resolved.pathname.slice(1)]) fail('Broken or unsupported DOCX relationship target.');
    if (type.endsWith('/officeDocument')) {
      if (path !== '_rels/.rels' || resolved.pathname !== '/word/document.xml') fail('Unsupported DOCX main document relationship.');
      main++;
    }
  }
  if (path === '_rels/.rels' && main !== 1) fail('Missing or ambiguous DOCX main document relationship.');
}

function properties(node, paragraph = false) {
  const result = {};
  for (const child of children(node)) {
    guard(child, paragraph ? ['jc', 'pStyle', 'spacing', 'ind', 'keepNext', 'keepLines', 'widowControl', 'rPr'] : ['b', 'i', 'u', 'sz', 'szCs', 'rFonts', 'color', 'lang', 'bCs', 'iCs']);
    if (paragraph && child.localName === 'rPr') { properties(child); continue; }
    noElements(child);
    const value = attr(child, 'val');
    if (['b', 'i'].includes(child.localName)) {
      if (value && !['0', '1', 'true', 'false', 'on', 'off'].includes(value)) fail();
      if (!['0', 'false', 'off'].includes(value)) result[child.localName] = true;
    }
    if (child.localName === 'u') {
      if (!['', 'single', 'none'].includes(value)) fail();
      if (value !== 'none') result.u = true;
    }
    if (child.localName === 'sz') {
      if (!/^\d{1,3}$/.test(value) || +value < 8 || +value > 144) fail();
      result.sz = +value;
    }
    if (child.localName === 'jc') {
      if (!['left', 'center', 'right', 'both'].includes(value)) fail();
      result.jc = value;
    }
  }
  return result;
}

function section(node) {
  const result = {};
  for (const child of children(node)) {
    guard(child, ['pgSz', 'pgMar', 'cols', 'docGrid']);
    noElements(child);
    if (['pgSz', 'pgMar'].includes(child.localName)) {
      const values = {};
      for (const key of child.localName === 'pgSz' ? ['w', 'h'] : ['top', 'right', 'bottom', 'left']) {
        const value = attr(child, key);
        if (!/^\d{1,5}$/.test(value) || +value > 31680) fail();
        values[key] = +value;
      }
      result[child.localName] = values;
    }
  }
  return result;
}

export function inspectDocx(bytes, name, mime = '') {
  if (!/\.docx$/i.test(name)) fail(/\.pdf$/i.test(name) ? 'PDF and scanned PDF redaction are unsupported in this increment.' : /\.xlsx$/i.test(name) ? 'XLSX redaction is unsupported, including hidden sheets and formula caches.' : 'Only plain text DOCX files are supported in this increment.');
  if (mime && ![MIME, 'application/octet-stream', 'application/zip'].includes(mime)) fail('File MIME type does not match DOCX.');
  const files = readZip(bytes);
  if (!files['[Content_Types].xml'] || !files['_rels/.rels'] || !files['word/document.xml'] || files['word/document.xml'].length > 1024 * 1024) fail('Missing or oversized Word document XML.');
  const types = xml(files['[Content_Types].xml']);
  const overrides = Array.from(types.getElementsByTagNameNS('http://schemas.openxmlformats.org/package/2006/content-types', 'Override'));
  if (new Set(overrides.map(n => n.getAttribute('PartName'))).size !== overrides.length || overrides.filter(n => n.getAttribute('PartName') === '/word/document.xml' && n.getAttribute('ContentType') === MAIN).length !== 1) fail('Not a supported unambiguous Word DOCX content type.');
  for (const [path, data] of Object.entries(files)) {
    if (/customXml\//i.test(path)) fail('Unsupported DOCX: custom XML parts are present, including possible template bibliography data.');
    if (/word\/(?:header|footer|footnotes|endnotes|comments|media\/|embeddings\/|activeX\/)|vbaProject|_xmlsignatures\//i.test(path)) fail('Unsupported DOCX: images, embedded content, signatures, comments or secondary document stories are present.');
    if (!SOURCE_PARTS.has(path) && !(path.endsWith('/') && !data.length && ['word/', '_rels/', 'word/_rels/', 'word/theme/', 'docProps/'].includes(path))) fail('Unsupported DOCX: an unexpected package component is present.');
    if (/\.(?:xml|rels)$/i.test(path)) {
      const doc = xml(data);
      if (doc.getElementsByTagNameNS(W, 'vanish').length || doc.getElementsByTagNameNS(W, 'webHidden').length) fail('Hidden text or hidden styles are unsupported.');
      if (path.endsWith('.rels')) relationships(path, doc, files);
    }
  }
  const document = xml(files['word/document.xml']);
  const root = document.documentElement;
  guard(root, ['document']);
  if (children(root).length !== 1) fail();
  const body = children(root)[0];
  guard(body, ['body']);
  const model = { paragraphs: [], section: {} };
  const bodyChildren = children(body);
  for (const [index, p] of bodyChildren.entries()) {
    guard(p, ['p', 'sectPr']);
    if (p.localName === 'sectPr') {
      if (index !== bodyChildren.length - 1) fail();
      model.section = section(p); continue;
    }
    const paragraph = { props: {}, runs: [] };
    for (const r of children(p)) {
      guard(r, ['pPr', 'r']);
      if (r.localName === 'pPr') { paragraph.props = properties(r, true); continue; }
      const run = { props: {}, text: '' };
      for (const t of children(r)) {
        guard(t, ['rPr', 't']);
        if (t.localName === 'rPr') run.props = properties(t);
        else { noElements(t); run.text += t.textContent; }
      }
      paragraph.runs.push(run);
    }
    model.paragraphs.push(paragraph);
  }
  const text = extractText(model);
  if (!text.trim() || text.length > 100000) fail('DOCX must contain 1–100,000 characters of supported text. Image-only/scanned documents are unsupported.');
  return { model, text };
}

export function extractText(model) { return model.paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n'); }

function propsXml(props, paragraph = false) {
  const content = paragraph ? (props.jc ? `<w:jc w:val="${props.jc}"/>` : '') : `${props.b ? '<w:b/>' : ''}${props.i ? '<w:i/>' : ''}${props.u ? '<w:u w:val="single"/>' : ''}${props.sz ? `<w:sz w:val="${props.sz}"/>` : ''}`;
  return content ? `<w:${paragraph ? 'pPr' : 'rPr'}>${content}</w:${paragraph ? 'pPr' : 'rPr'}>` : '';
}

export function packageDocx(model) {
  const body = model.paragraphs.map(p => `<w:p>${propsXml(p.props, true)}${p.runs.map(r => `<w:r>${propsXml(r.props)}<w:t xml:space="preserve">${escape(r.text)}</w:t></w:r>`).join('')}</w:p>`).join('');
  const sect = Object.entries(model.section).map(([tag, values]) => `<w:${tag} ${Object.entries(values).map(([key, value]) => `w:${key}="${value}"`).join(' ')}/>`).join('');
  return zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${MAIN}"/></Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr>${sect}</w:sectPr></w:body></w:document>`),
  }, { level: 6 });
}

export function verifyExport(bytes, expected, removed) {
  const files = readZip(bytes);
  if (Object.keys(files).sort().join('|') !== '[Content_Types].xml|_rels/.rels|word/document.xml') fail('Verification failed: unexpected output parts.');
  const output = inspectDocx(bytes, 'redacted.docx');
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  if (JSON.stringify(canonical(output.model)) !== JSON.stringify(canonical(expected))) fail('Verification failed: exported text or formatting differs.');
  const raw = Object.values(files).map(data => strFromU8(data)).join('\n');
  for (const value of removed) {
    if (output.text.includes(value) || raw.includes(value) || raw.includes(escape(value))) fail('Verification failed: a selected value remains. Select every occurrence, or adjust the range.');
  }
  return output;
}

export function redactDocx(model, selections, reviewed) {
  if (reviewed !== true) fail('Human review is required before export.');
  const source = extractText(model);
  const ranges = mergeRanges(source, selections);
  if (!ranges.length) fail('Select at least one redaction.');
  const expected = structuredClone(model);
  let offset = 0;
  let rangeIndex = 0;
  for (const p of expected.paragraphs) {
    for (const r of p.runs) {
      const start = offset;
      offset += r.text.length;
      let text = '';
      for (let i = 0; i < r.text.length; i++) {
        const absolute = start + i;
        while (rangeIndex < ranges.length && ranges[rangeIndex].end <= absolute) rangeIndex++;
        const candidate = ranges[rangeIndex];
        const range = candidate && absolute >= candidate.start ? candidate : null;
        if (!range) text += r.text[i];
        else if (absolute === range.start || (absolute === start && absolute > range.start && source.slice(range.start, absolute).endsWith('\n'))) text += '[REDACTED]';
      }
      r.text = text;
    }
    offset++; // paragraph separator is structural, never copied as secret data
  }
  const bytes = packageDocx(expected);
  verifyExport(bytes, expected, ranges.map(r => source.slice(r.start, r.end)));
  return bytes;
}
