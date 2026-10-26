import { S, elements, node, leaf, uniqueChildren, integer, decimal, boolean, fail, escapeXml } from './ooxml.mjs';

export const DEFAULT_STYLE = { font: { bold: false, italic: false, underline: false, size: 11, color: 'FF1F2937' }, fill: '', border: {}, align: {}, numFmt: 0 };
const BUILTIN_FORMATS = new Set([0, 1, 2, 3, 4, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 37, 38, 39, 40, 45, 46, 47, 48, 49]);
function rgb(element, fallback) {
  leaf(element, element.localName, ['rgb', 'theme', 'indexed', 'auto', 'tint']);
  const value = element.getAttribute('rgb');
  if (value) { if (!/^[a-f0-9]{8}$/i.test(value)) fail('Unsupported XLSX color.'); return value.toUpperCase(); }
  // Source font/theme/palette names never enter output; theme colors are normalized.
  if (element.hasAttribute('theme')) integer(element.getAttribute('theme'), 0, 11);
  if (element.hasAttribute('indexed')) integer(element.getAttribute('indexed'), 0, 65);
  if (element.hasAttribute('tint')) decimal(element.getAttribute('tint'), -1, 1);
  return fallback;
}
function font(element) {
  node(element, 'font');
  const props = uniqueChildren(element, ['name', 'sz', 'b', 'i', 'u', 'color', 'family', 'scheme', 'charset']);
  const result = { ...DEFAULT_STYLE.font };
  for (const [tag, child] of Object.entries(props)) {
    if (tag === 'color') { result.color = rgb(child, DEFAULT_STYLE.font.color); continue; }
    leaf(child, tag, ['val']);
    const val = child.getAttribute('val');
    if (tag === 'sz') result.size = decimal(val, 8, 72);
    if (tag === 'b') result.bold = boolean(val, true);
    if (tag === 'i') result.italic = boolean(val, true);
    if (tag === 'u') { if (val && !['single', 'none'].includes(val)) fail('Unsupported XLSX underline.'); result.underline = val !== 'none'; }
    // Source typeface names, character set labels and scheme names are discarded.
  }
  return result;
}
function fill(element) {
  node(element, 'fill');
  const props = uniqueChildren(element, ['patternFill']);
  if (!props.patternFill) fail('Gradient or missing XLSX fills are unsupported.');
  node(props.patternFill, 'patternFill', ['patternType']);
  const kind = props.patternFill.getAttribute('patternType') || 'none';
  if (!['none', 'gray125', 'solid'].includes(kind)) fail('Unsupported XLSX fill pattern.');
  const colors = uniqueChildren(props.patternFill, ['fgColor', 'bgColor']);
  if (colors.bgColor) rgb(colors.bgColor, 'FFFFFFFF');
  if (kind !== 'solid') { if (colors.fgColor) rgb(colors.fgColor, 'FFFFFFFF'); return ''; }
  if (!colors.fgColor) fail('Unsupported XLSX solid fill.');
  return rgb(colors.fgColor, 'FFFFFFFF');
}
function border(element) {
  node(element, 'border', ['diagonalUp', 'diagonalDown', 'outline']);
  if (boolean(element.getAttribute('diagonalUp')) || boolean(element.getAttribute('diagonalDown'))) fail('Diagonal XLSX borders are unsupported.');
  const props = uniqueChildren(element, ['left', 'right', 'top', 'bottom', 'diagonal', 'start', 'end']);
  const result = {};
  for (const [side, child] of Object.entries(props)) {
    node(child, side, ['style']);
    const style = child.getAttribute('style');
    const color = uniqueChildren(child, ['color']);
    if (style && (!['left', 'right', 'top', 'bottom'].includes(side) || !['thin', 'medium', 'thick', 'dashed', 'dotted', 'double', 'hair'].includes(style))) fail('Unsupported XLSX border.');
    const value = color.color ? rgb(color.color, DEFAULT_STYLE.font.color) : DEFAULT_STYLE.font.color;
    if (style) result[side] = { style, color: value };
  }
  return result;
}
function alignment(element) {
  leaf(element, 'alignment', ['horizontal', 'vertical', 'wrapText', 'textRotation', 'shrinkToFit', 'indent', 'relativeIndent', 'justifyLastLine', 'readingOrder']);
  for (const key of ['textRotation', 'indent', 'relativeIndent', 'readingOrder']) if (element.hasAttribute(key) && +element.getAttribute(key) !== 0) fail('Rotated, indented or RTL XLSX alignment is unsupported.');
  if (boolean(element.getAttribute('shrinkToFit')) || boolean(element.getAttribute('justifyLastLine'))) fail('Unsupported XLSX alignment option.');
  const result = {};
  const horizontal = element.getAttribute('horizontal'), vertical = element.getAttribute('vertical');
  if (horizontal) { if (!['general', 'left', 'center', 'right'].includes(horizontal)) fail('Unsupported XLSX horizontal alignment.'); result.horizontal = horizontal; }
  if (vertical) { if (!['top', 'center', 'bottom'].includes(vertical)) fail('Unsupported XLSX vertical alignment.'); result.vertical = vertical; }
  if (boolean(element.getAttribute('wrapText'))) result.wrap = true;
  return result;
}
function collection(root, tag, item, parse, maximum) {
  if (!root[tag]) return [];
  node(root[tag], tag, ['count']);
  const children = elements(root[tag]);
  if (children.length > maximum || (root[tag].hasAttribute('count') && integer(root[tag].getAttribute('count'), 0, maximum) !== children.length)) fail('XLSX style collection count is invalid.');
  return children.map(child => { if (child.namespaceURI !== S || child.localName !== item) fail('Unsupported XLSX style entry.'); return parse(child); });
}
export function readStyles(document) {
  if (!document) return [structuredClone(DEFAULT_STYLE)];
  const root = node(document.documentElement, 'styleSheet');
  const props = uniqueChildren(root, ['numFmts', 'fonts', 'fills', 'borders', 'cellStyleXfs', 'cellXfs', 'cellStyles', 'dxfs', 'tableStyles', 'colors']);
  if (props.numFmts && elements(props.numFmts).length) fail('Custom XLSX number formats are unsupported; they can hide or embed sensitive text.');
  if (props.dxfs && elements(props.dxfs).length) fail('Conditional XLSX formatting styles are unsupported.');
  if (props.colors) {
    node(props.colors, 'colors');
    const palette = uniqueChildren(props.colors, ['indexedColors']);
    if (palette.indexedColors) for (const color of elements(palette.indexedColors)) { leaf(color, 'rgbColor', ['rgb']); if (!/^[a-f0-9]{8}$/i.test(color.getAttribute('rgb') || '')) fail(); }
  }
  if (props.tableStyles) { leaf(props.tableStyles, 'tableStyles', ['count', 'defaultTableStyle', 'defaultPivotStyle']); if (+(props.tableStyles.getAttribute('count') || '0') !== 0) fail('XLSX table styles are unsupported.'); }
  const fonts = collection(props, 'fonts', 'font', font, 64);
  const fills = collection(props, 'fills', 'fill', fill, 64);
  const borders = collection(props, 'borders', 'border', border, 64);
  const bases = collection(props, 'cellStyleXfs', 'xf', child => {
    leaf(child, 'xf', ['numFmtId', 'fontId', 'fillId', 'borderId']);
    if (['numFmtId', 'fontId', 'fillId', 'borderId'].some(key => +(child.getAttribute(key) || '0') !== 0)) fail('Inherited XLSX named styles are unsupported.');
    return 0;
  }, 1);
  if (props.cellStyles) collection(props, 'cellStyles', 'cellStyle', child => { leaf(child, 'cellStyle', ['name', 'xfId', 'builtinId', 'hidden']); if (+(child.getAttribute('xfId') || '0') !== 0 || boolean(child.getAttribute('hidden'))) fail('Named or hidden XLSX styles are unsupported.'); }, 1);
  const styles = collection(props, 'cellXfs', 'xf', child => {
    node(child, 'xf', ['numFmtId', 'fontId', 'fillId', 'borderId', 'xfId', 'applyNumberFormat', 'applyFont', 'applyFill', 'applyBorder', 'applyAlignment', 'applyProtection', 'pivotButton', 'quotePrefix']);
    if (+(child.getAttribute('xfId') || '0') !== 0 || boolean(child.getAttribute('pivotButton'))) fail('Inherited/pivot XLSX cell styles are unsupported.');
    const extras = uniqueChildren(child, ['alignment', 'protection']);
    if (extras.protection) { leaf(extras.protection, 'protection', ['locked', 'hidden']); if (boolean(extras.protection.getAttribute('hidden'))) fail('Hidden XLSX formula styles are unsupported.'); }
    const numFmt = integer(child.getAttribute('numFmtId') || '0', 0, 49);
    if (!BUILTIN_FORMATS.has(numFmt)) fail('Unsupported XLSX number format.');
    const get = (key, values, fallback) => values[integer(child.getAttribute(key) || '0', 0, Math.max(0, values.length - 1))] || fallback;
    return { font: get('fontId', fonts, DEFAULT_STYLE.font), fill: get('fillId', fills, ''), border: get('borderId', borders, {}), align: extras.alignment ? alignment(extras.alignment) : {}, numFmt };
  }, 32);
  if (!bases.length && props.cellStyleXfs) fail();
  return styles.length ? styles : [structuredClone(DEFAULT_STYLE)];
}

export function writeStyles(styles) {
  const fonts = styles.map(({ font: f }) => `<font><name val="Calibri"/><sz val="${f.size}"/>${f.bold ? '<b/>' : ''}${f.italic ? '<i/>' : ''}${f.underline ? '<u val="single"/>' : ''}<color rgb="${f.color}"/></font>`).join('');
  const fills = '<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' + styles.map(s => s.fill ? `<fill><patternFill patternType="solid"><fgColor rgb="${s.fill}"/><bgColor indexed="64"/></patternFill></fill>` : '<fill><patternFill patternType="none"/></fill>').join('');
  const borders = styles.map(s => `<border>${['left', 'right', 'top', 'bottom'].map(side => s.border[side] ? `<${side} style="${s.border[side].style}"><color rgb="${s.border[side].color}"/></${side}>` : `<${side}/>`).join('')}<diagonal/></border>`).join('');
  const xfs = styles.map((s, i) => `<xf numFmtId="${s.numFmt}" fontId="${i}" fillId="${i + 2}" borderId="${i}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"${Object.keys(s.align).length ? ' applyAlignment="1"' : ''}>${Object.keys(s.align).length ? `<alignment ${Object.entries(s.align).map(([key, value]) => `${key === 'wrap' ? 'wrapText' : key}="${value === true ? '1' : escapeXml(value)}"`).join(' ')}/>` : ''}</xf>`).join('');
  return `<styleSheet xmlns="${S}"><fonts count="${styles.length}">${fonts}</fonts><fills count="${styles.length + 2}">${fills}</fills><borders count="${styles.length}">${borders}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
