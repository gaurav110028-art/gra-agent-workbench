import { unzipSync } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';
import { inspectArchive, verifyArchive } from './archive.mjs';

export const MAX_UPLOAD = 5 * 1024 * 1024;
export const fail = (message = 'Unsupported XLSX structure. No export was created.') => { throw new Error(message); };
export const elements = node => Array.from(node.childNodes || []).filter(n => n.nodeType === 1);
export const escapeXml = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export function parseXml(bytes) {
  if (bytes.length > 1024 * 1024) fail('XLSX XML part exceeds the 1 MiB limit.');
  let source, document;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('XLSX XML must be valid UTF-8.'); }
  if (/<!DOCTYPE|<!ENTITY/i.test(source) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(source)) fail('XLSX contains forbidden XML declarations or characters.');
  try { document = new DOMParser({ onError: () => fail() }).parseFromString(source, 'application/xml'); } catch { fail('Malformed XLSX XML.'); }
  let count = 0;
  const visit = (node, depth) => {
    if (++count > 50000 || depth > 40) fail('XLSX XML complexity limit exceeded.');
    for (const child of Array.from(node.childNodes || [])) visit(child, depth + 1);
  };
  visit(document, 0);
  return document;
}
export function readWorkbookZip(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_UPLOAD || bytes.length < 22) fail('Invalid or oversized XLSX file (maximum 5 MiB).');
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) fail('Encrypted or legacy Office containers are unsupported.');
  if (bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4) fail('Invalid XLSX ZIP signature. Encrypted and legacy files are unsupported.');
  try { const records = inspectArchive(bytes); const files = unzipSync(bytes); verifyArchive(files, records); return files; }
  catch { fail('Malformed, encrypted or unsafe XLSX ZIP; archive limits or checksums failed.'); }
}
export const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const P = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const C = 'http://schemas.openxmlformats.org/package/2006/content-types';
export function attributes(node, allowed = []) {
  for (const attribute of Array.from(node.attributes || [])) {
    if (attribute.namespaceURI === 'http://www.w3.org/2000/xmlns/') continue;
    const key = attribute.namespaceURI === R ? `r:${attribute.localName}` : attribute.namespaceURI === 'http://www.w3.org/XML/1998/namespace' ? `xml:${attribute.localName}` : attribute.namespaceURI ? `foreign:${attribute.localName}` : attribute.localName;
    if (!allowed.includes(key)) fail('Unsupported XLSX attribute or extension.');
  }
}
export function node(node, tag, attrs = [], namespace = S) {
  if (node.namespaceURI !== namespace || node.localName !== tag) fail('Unsupported XLSX element or namespace.');
  attributes(node, attrs);
  if (!['t', 'v', 'f'].includes(tag) && Array.from(node.childNodes || []).some(child => [3, 4].includes(child.nodeType) && child.nodeValue.trim())) fail('Unexpected text in an XLSX structural element.');
  return node;
}
export function leaf(element, tag, attrs = [], namespace = S) {
  node(element, tag, attrs, namespace);
  if (elements(element).length) fail('Unsupported nested XLSX content.');
  return element;
}
export function uniqueChildren(parent, allowed, namespace = S) {
  const result = {};
  for (const child of elements(parent)) {
    if (child.namespaceURI !== namespace || !allowed.includes(child.localName) || Object.hasOwn(result, child.localName)) fail('Unsupported or duplicate XLSX component.');
    result[child.localName] = child;
  }
  return result;
}
export function integer(value, min, max) {
  if (!/^\d+$/.test(String(value)) || +value < min || +value > max) fail('XLSX integer value exceeds supported bounds.');
  return +value;
}
export function decimal(value, min, max) {
  if (!/^-?\d+(?:\.\d+)?$/.test(String(value)) || !Number.isFinite(+value) || +value < min || +value > max) fail('XLSX numeric property exceeds supported bounds.');
  return +value;
}
export function boolean(value, fallback = false) {
  if (value === null || value === '') return fallback;
  if (!['0', '1', 'true', 'false'].includes(value)) fail('Invalid XLSX Boolean.');
  return value === '1' || value === 'true';
}
export function decodeString(value) {
  const text = value.replace(/_x([0-9a-f]{4})_/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
  if (text.length > 32767) fail('XLSX cell strings must not exceed 32,767 characters.');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(text) || /[\uD800-\uDFFF]/u.test(text)) fail('XLSX text contains unsupported controls or invalid Unicode.');
  return text;
}
export function encodeString(text) {
  return escapeXml(text.replace(/_x[0-9a-f]{4}_/gi, match => '_x005F_' + match.slice(1)).replaceAll('\r', '_x000D_'));
}
export function plainText(element, tag) {
  leaf(element, tag, ['xml:space']);
  return decodeString(element.textContent);
}
export const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
