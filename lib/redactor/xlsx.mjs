import { zipSync, strToU8 } from 'fflate';
import { mergeRanges } from './detect.mjs';
import { readStyles, writeStyles } from './xlsx-styles.mjs';
import { S, R, P, C, fail, elements, escapeXml, parseXml, readWorkbookZip, node, leaf, uniqueChildren, integer, decimal, boolean, plainText, encodeString, canonical, decodeString } from './ooxml.mjs';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAIN = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
const TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';
const SOURCE_PART = /^(?:\[Content_Types\]\.xml|_rels\/\.rels|docProps\/(?:core|app|custom)\.xml|docProps\/thumbnail\.jpeg|xl\/(?:workbook|styles|sharedStrings)\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/theme\/theme1\.xml|xl\/worksheets\/sheet[1-9]\d*\.xml|xl\/worksheets\/_rels\/sheet[1-9]\d*\.xml\.rels)$/;
const ROOT_TYPES = new Map([
  [`${R}/officeDocument`, 'xl/workbook.xml'],
  ['http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'],
  [`${R}/extended-properties`, 'docProps/app.xml'], [`${R}/custom-properties`, 'docProps/custom.xml'],
  ['http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail', 'docProps/thumbnail.jpeg'],
]);
const BLOCKED_WORKBOOK = ['definedNames', 'externalReferences', 'pivotCaches', 'workbookProtection', 'fileSharing', 'extLst', 'webPublishing', 'webPublishObjects', 'functionGroups', 'customWorkbookViews', 'oleSize', 'smartTagPr', 'smartTagTypes', 'fileRecoveryPr'];
const BLOCKED_SHEET = ['mergeCells', 'hyperlinks', 'sheetProtection', 'protectedRanges', 'autoFilter', 'sortState', 'conditionalFormatting', 'dataValidations', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'picture', 'oleObjects', 'controls', 'tableParts', 'extLst', 'sheetCalcPr', 'scenarios', 'customSheetViews', 'headerFooter', 'rowBreaks', 'colBreaks', 'dataConsolidate', 'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'phoneticPr'];
const addBlock = (blocked, message) => { if (!blocked.includes(message)) blocked.push(message); };
const noText = element => { if (Array.from(element.childNodes || []).some(child => child.nodeType === 3 && child.nodeValue.trim())) fail('Unexpected XLSX text outside a value.'); };

export function cellAddress(ref) {
  const match = /^([A-Z]{1,3})([1-9]\d{0,4})$/.exec(ref || '');
  if (!match) fail('Invalid XLSX cell address.');
  const column = [...match[1]].reduce((value, c) => value * 26 + c.charCodeAt(0) - 64, 0);
  const row = +match[2];
  if (column > 256 || row > 10000) fail('XLSX exceeds the supported 256 columns / 10,000 rows.');
  return { row, column };
}
function rels(path, document, files) {
  const root = node(document.documentElement, 'Relationships', [], P);
  const result = new Map();
  for (const rel of elements(root)) {
    leaf(rel, 'Relationship', ['Id', 'Type', 'Target', 'TargetMode'], P);
    const id = rel.getAttribute('Id') || '', type = rel.getAttribute('Type') || '', target = rel.getAttribute('Target') || '';
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || result.has(id)) fail('Duplicate or invalid XLSX relationship ID.');
    if (!target || (rel.getAttribute('TargetMode') && rel.getAttribute('TargetMode') !== 'Internal') || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target) || /[\\%?#]/.test(target)) fail('External or unsafe XLSX relationships are unsupported.');
    const resolved = new URL(target, path === '_rels/.rels' ? 'https://opc.invalid/' : path === 'xl/_rels/workbook.xml.rels' ? 'https://opc.invalid/xl/' : 'https://opc.invalid/xl/worksheets/');
    const part = resolved.pathname.slice(1);
    if (resolved.origin !== 'https://opc.invalid' || !Object.hasOwn(files, part)) fail('Broken XLSX relationship target.');
    if (path === '_rels/.rels') { if (ROOT_TYPES.get(type) !== part) fail('Unsupported XLSX root relationship.'); }
    else if (path === 'xl/_rels/workbook.xml.rels') {
      if (!((type === `${R}/worksheet` && /^xl\/worksheets\/sheet[1-9]\d*\.xml$/.test(part)) || (type === `${R}/styles` && part === 'xl/styles.xml') || (type === `${R}/sharedStrings` && part === 'xl/sharedStrings.xml') || (type === `${R}/theme` && part === 'xl/theme/theme1.xml'))) fail('Unsupported XLSX workbook relationship or embedded content.');
    } else fail('Worksheet relationships (including comments and hyperlinks) are unsupported.');
    if ([...result.values()].some(item => item.part === part || (item.type === type && type !== `${R}/worksheet`))) fail('Ambiguous XLSX relationships.');
    result.set(id, { type, part });
  }
  if (path === '_rels/.rels' && ![...result.values()].some(rel => rel.type === `${R}/officeDocument` && rel.part === 'xl/workbook.xml')) fail('Missing XLSX main document relationship.');
  return result;
}
function types(document, files) {
  node(document.documentElement, 'Types', [], C);
  const names = new Set(), defaults = new Set();
  let main = false;
  for (const child of elements(document.documentElement)) {
    if (child.localName === 'Default') {
      leaf(child, 'Default', ['Extension', 'ContentType'], C);
      const ext = child.getAttribute('Extension');
      if (defaults.has(ext) || !['xml', 'rels', 'jpeg', 'jpg'].includes(ext)) fail('Unsupported XLSX default content type.');
      defaults.add(ext);
      if (!['application/xml', 'application/vnd.openxmlformats-package.relationships+xml', 'image/jpeg'].includes(child.getAttribute('ContentType'))) fail('Unsupported XLSX content type.');
    } else {
      leaf(child, 'Override', ['PartName', 'ContentType'], C);
      const name = child.getAttribute('PartName') || '', type = child.getAttribute('ContentType') || '';
      if (!name.startsWith('/') || names.has(name) || !Object.hasOwn(files, name.slice(1))) fail('Ambiguous or broken XLSX content-type declaration.');
      names.add(name);
      const expected = name === '/xl/workbook.xml' ? MAIN : /^\/xl\/worksheets\/sheet[1-9]\d*\.xml$/.test(name) ? `${TYPE}worksheet+xml` : name === '/xl/styles.xml' ? `${TYPE}styles+xml` : name === '/xl/sharedStrings.xml' ? `${TYPE}sharedStrings+xml` : name === '/xl/theme/theme1.xml' ? 'application/vnd.openxmlformats-officedocument.theme+xml' : name === '/docProps/core.xml' ? 'application/vnd.openxmlformats-package.core-properties+xml' : name === '/docProps/app.xml' ? 'application/vnd.openxmlformats-officedocument.extended-properties+xml' : name === '/docProps/custom.xml' ? 'application/vnd.openxmlformats-officedocument.custom-properties+xml' : '';
      if (!expected || type !== expected) fail('Unsupported XLSX content type, including macro-enabled workbooks.');
      if (name === '/xl/workbook.xml') main = true;
    }
  }
  if (!main) fail('Missing XLSX workbook content type.');
  for (const path of Object.keys(files)) if (/^xl\/.*\.xml$/.test(path) && !names.has('/' + path)) fail('XLSX part has no explicit supported content-type declaration.');
}
function stringItem(element, tag) {
  node(element, tag);
  const children = uniqueChildren(element, ['t']);
  if (!children.t || elements(element).length !== 1) fail('Rich-text or phonetic XLSX strings are unsupported.');
  return plainText(children.t, 't');
}
function sharedStrings(document) {
  if (!document) return [];
  const root = node(document.documentElement, 'sst', ['count', 'uniqueCount']);
  const items = elements(root);
  if (items.length > 10000) fail('XLSX shared-string limit exceeded.');
  if (root.hasAttribute('uniqueCount') && integer(root.getAttribute('uniqueCount'), 0, 10000) !== items.length) fail('Invalid XLSX shared-string count.');
  return items.map(item => stringItem(item, 'si'));
}
function worksheet(document, styleCount, strings, blocked, budget) {
  node(document.documentElement, 'worksheet');
  const props = uniqueChildren(document.documentElement, ['sheetPr', 'dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'printOptions', 'pageMargins', 'pageSetup', ...BLOCKED_SHEET]);
  for (const feature of BLOCKED_SHEET) if (props[feature]) addBlock(blocked, 'Unsupported worksheet features are present (for example merges, links, tables, protection, validation or drawings).');
  if (props.dimension) { leaf(props.dimension, 'dimension', ['ref']); for (const ref of (props.dimension.getAttribute('ref') || '').split(':')) cellAddress(ref); }
  if (props.sheetPr) {
    node(props.sheetPr, 'sheetPr');
    const options = uniqueChildren(props.sheetPr, ['outlinePr', 'pageSetUpPr']);
    if (options.outlinePr) leaf(options.outlinePr, 'outlinePr', ['applyStyles', 'summaryBelow', 'summaryRight', 'showOutlineSymbols']);
    if (options.pageSetUpPr) leaf(options.pageSetUpPr, 'pageSetUpPr', ['autoPageBreaks', 'fitToPage']);
  }
  if (props.sheetViews) {
    node(props.sheetViews, 'sheetViews');
    if (elements(props.sheetViews).length !== 1) fail('Multiple XLSX sheet views are unsupported.');
    const view = node(elements(props.sheetViews)[0], 'sheetView', ['workbookViewId', 'tabSelected', 'showGridLines', 'showRowColHeaders', 'showZeros', 'rightToLeft', 'zoomScale', 'zoomScaleNormal', 'zoomScalePageLayoutView', 'view', 'topLeftCell', 'colorId', 'defaultGridColor', 'windowProtection', 'showOutlineSymbols']);
    if (boolean(view.getAttribute('rightToLeft')) || view.hasAttribute('showZeros') && !boolean(view.getAttribute('showZeros'), true)) addBlock(blocked, 'RTL or value-hiding sheet views are unsupported.');
    for (const child of elements(view)) {
      if (child.localName !== 'selection') { addBlock(blocked, 'Panes and custom worksheet views are unsupported.'); continue; }
      leaf(child, 'selection', ['activeCell', 'sqref', 'pane', 'activeCellId']);
    }
  }
  if (props.sheetFormatPr) {
    leaf(props.sheetFormatPr, 'sheetFormatPr', ['baseColWidth', 'defaultColWidth', 'defaultRowHeight', 'customHeight', 'zeroHeight', 'thickTop', 'thickBottom', 'outlineLevelRow', 'outlineLevelCol']);
    if (boolean(props.sheetFormatPr.getAttribute('zeroHeight')) || +(props.sheetFormatPr.getAttribute('outlineLevelRow') || 0) || +(props.sheetFormatPr.getAttribute('outlineLevelCol') || 0)) addBlock(blocked, 'Global row hiding and grouped outlines are unsupported.');
  }
  if (props.printOptions) leaf(props.printOptions, 'printOptions', ['horizontalCentered', 'verticalCentered', 'headings', 'gridLines', 'gridLinesSet']);
  if (props.pageMargins) leaf(props.pageMargins, 'pageMargins', ['left', 'right', 'top', 'bottom', 'header', 'footer']);
  if (props.pageSetup) { leaf(props.pageSetup, 'pageSetup', ['paperSize', 'orientation', 'scale', 'fitToWidth', 'fitToHeight', 'firstPageNumber', 'useFirstPageNumber', 'usePrinterDefaults', 'blackAndWhite', 'draft', 'cellComments', 'errors', 'horizontalDpi', 'verticalDpi', 'copies']); }
  const columns = [];
  if (props.cols) {
    node(props.cols, 'cols');
    let last = 0;
    for (const col of elements(props.cols)) {
      leaf(col, 'col', ['min', 'max', 'width', 'hidden', 'bestFit', 'customWidth', 'style', 'outlineLevel', 'collapsed']);
      const min = integer(col.getAttribute('min'), 1, 256), max = integer(col.getAttribute('max'), min, 256);
      if (min <= last) fail('Overlapping XLSX column definitions are unsupported.'); last = max;
      if (+(col.getAttribute('style') || 0) !== 0 || +(col.getAttribute('outlineLevel') || 0) || boolean(col.getAttribute('collapsed'))) addBlock(blocked, 'Inherited column styles and grouped columns are unsupported.');
      const width = col.hasAttribute('width') ? decimal(col.getAttribute('width'), 0, 100) : 13;
      columns.push({ min, max, width, hidden: boolean(col.getAttribute('hidden')) || width === 0 });
    }
  }
  if (!props.sheetData) fail('Missing XLSX sheetData.');
  node(props.sheetData, 'sheetData');
  const rows = [], cells = [];
  let lastRow = 0;
  for (const row of elements(props.sheetData)) {
    node(row, 'row', ['r', 'spans', 's', 'customFormat', 'ht', 'customHeight', 'hidden', 'outlineLevel', 'collapsed', 'thickTop', 'thickBot', 'ph']);
    noText(row);
    const index = integer(row.getAttribute('r'), 1, 10000);
    if (index <= lastRow) fail('Duplicate or unordered XLSX rows.'); lastRow = index;
    if (+(row.getAttribute('s') || 0) !== 0 || boolean(row.getAttribute('customFormat')) || +(row.getAttribute('outlineLevel') || 0) || boolean(row.getAttribute('collapsed'))) addBlock(blocked, 'Inherited row styles and grouped rows are unsupported.');
    const height = row.hasAttribute('ht') ? decimal(row.getAttribute('ht'), 0, 150) : null;
    const hidden = boolean(row.getAttribute('hidden')) || height === 0;
    rows.push({ index, height, hidden });
    let lastColumn = 0;
    for (const cell of elements(row)) {
      node(cell, 'c', ['r', 's', 't']); noText(cell);
      if (++budget.cells > 10000) fail('XLSX exceeds 10,000 stored cells.');
      const ref = cell.getAttribute('r'), address = cellAddress(ref);
      if (address.row !== index || address.column <= lastColumn) fail('Duplicate, unordered or mismatched XLSX cell addresses.'); lastColumn = address.column;
      const style = integer(cell.getAttribute('s') || '0', 0, styleCount - 1);
      const type = cell.getAttribute('t') || 'n';
      if (!['n', 's', 'inlineStr', 'b', 'str', 'e'].includes(type)) fail('Unsupported XLSX cell type.');
      const children = uniqueChildren(cell, ['v', 'is', 'f']);
      let formula = null;
      if (children.f) {
        leaf(children.f, 'f', ['t', 'ref', 'si', 'aca', 'ca', 'bx', 'dt2D', 'dtr', 'del1', 'del2', 'r1', 'r2']);
        formula = children.f.textContent;
        addBlock(blocked, 'Formulas are present. Formula expressions and cached values can be reviewed, but formula workbooks cannot be exported in this increment.');
      }
      let value = '', kind = 'blank';
      if (children.v) leaf(children.v, 'v');
      if (type === 'inlineStr') {
        if (children.v || children.f) fail('Invalid XLSX inline string cell.');
        if (children.is) { value = stringItem(children.is, 'is'); kind = 'text'; }
      } else {
        if (children.is) fail('Invalid XLSX value cell.');
        if (children.v) {
          const source = children.v.textContent;
          if (type === 's') { const id = integer(source, 0, strings.length - 1); value = strings[id]; kind = 'text'; }
          else if (type === 'b') { if (!['0', '1'].includes(source)) fail('Invalid XLSX Boolean cell.'); value = source === '1' ? 'TRUE' : 'FALSE'; kind = 'boolean'; }
          else if (['str', 'e'].includes(type)) { value = decodeString(source); kind = 'text'; if (type === 'e') addBlock(blocked, 'Error cells are unsupported.'); if (type === 'str' && formula === null) addBlock(blocked, 'Formula-result string cells without formulas are unsupported.'); }
          else if (source !== '') {
            if (!/^-?\d+(?:\.\d+)?$/.test(source) || source.replace(/[-.]/g, '').replace(/^0+/, '').length > 15 || !Number.isFinite(+source)) fail('Numeric XLSX cells require plain decimal values with at most 15 significant digits. Store long identifiers as text.');
            value = String(+source); kind = 'number';
          }
        }
      }
      budget.text += value.length + (formula?.length || 0);
      if (value.length > 32767 || (formula?.length || 0) > 32767 || budget.text > 100000) fail('XLSX exceeds the supported text limit (100,000 total / 32,767 per cell).');
      cells.push({ ref, kind, value, formula, style, rowHidden: hidden, columnHidden: columns.some(col => address.column >= col.min && address.column <= col.max && col.hidden) });
    }
  }
  return { rows, columns, cells };
}

export function inspectXlsx(bytes, name, mime = '') {
  if (!/\.xlsx$/i.test(name)) fail('Only XLSX is supported. Macro-enabled, binary and legacy spreadsheet formats are rejected.');
  if (mime && ![XLSX_MIME, 'application/octet-stream', 'application/zip'].includes(mime)) fail('File MIME type does not match XLSX.');
  const files = readWorkbookZip(bytes);
  const documents = {};
  for (const [path, data] of Object.entries(files)) {
    if (!SOURCE_PART.test(path) && !(path.endsWith('/') && !data.length && ['_rels/', 'docProps/', 'xl/', 'xl/_rels/', 'xl/worksheets/', 'xl/worksheets/_rels/', 'xl/theme/'].includes(path))) fail('Unsupported XLSX package component: comments/notes, hyperlinks, drawings, embedded objects, macros, connections, custom XML and other extra parts are blocked.');
    if (/\.(xml|rels)$/.test(path)) documents[path] = parseXml(data);
  }
  for (const required of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels']) if (!documents[required]) fail('Missing required XLSX package part.');
  types(documents['[Content_Types].xml'], files);
  const relationships = {};
  for (const path of Object.keys(documents).filter(path => path.endsWith('.rels'))) relationships[path] = rels(path, documents[path], files);
  const workbookRels = relationships['xl/_rels/workbook.xml.rels'];
  for (const part of ['xl/styles.xml', 'xl/sharedStrings.xml', 'xl/theme/theme1.xml']) if (files[part] && ![...workbookRels.values()].some(rel => rel.part === part)) fail('Unreferenced XLSX workbook component.');
  const styles = readStyles(documents['xl/styles.xml']);
  const strings = sharedStrings(documents['xl/sharedStrings.xml']);
  const root = node(documents['xl/workbook.xml'].documentElement, 'workbook', ['conformance']);
  if (root.hasAttribute('conformance') && root.getAttribute('conformance') !== 'transitional') fail('Strict OOXML XLSX workbooks are unsupported.');
  const props = uniqueChildren(root, ['fileVersion', 'workbookPr', 'bookViews', 'sheets', 'calcPr', ...BLOCKED_WORKBOOK]);
  const blocked = [], warnings = ['Output sheet names become Sheet1, Sheet2, etc. All sheets, rows and columns are made visible.', 'Metadata, source font/theme names and print/view settings are not retained. Basic direct formatting is rebuilt.', 'Patterns are heuristic. Review every sheet and cell; bank-account candidates can include ordinary numbers.'];
  for (const feature of BLOCKED_WORKBOOK) if (props[feature]) {
    if (feature === 'definedNames' && !elements(props[feature]).length) { leaf(props[feature], feature); continue; }
    if (feature === 'workbookProtection') {
      leaf(props[feature], feature, ['lockStructure', 'lockWindows', 'lockRevision']);
      if (!['lockStructure', 'lockWindows', 'lockRevision'].some(key => boolean(props[feature].getAttribute(key)))) continue;
    }
    addBlock(blocked, 'Defined names, external references, protection, extensions or other unsupported workbook features are present.');
  }
  if (props.fileVersion) leaf(props.fileVersion, 'fileVersion', ['appName', 'lastEdited', 'lowestEdited', 'rupBuild', 'codeName']);
  let date1904 = false;
  if (props.workbookPr) {
    leaf(props.workbookPr, 'workbookPr', ['date1904', 'showObjects', 'showBorderUnselectedTables', 'filterPrivacy', 'checkCompatibility', 'defaultThemeVersion', 'backupFile', 'saveExternalLinkValues', 'updateLinks', 'codeName']);
    date1904 = boolean(props.workbookPr.getAttribute('date1904'));
    if (props.workbookPr.hasAttribute('codeName')) addBlock(blocked, 'Workbook code names are unsupported.');
  }
  if (props.bookViews) {
    node(props.bookViews, 'bookViews');
    for (const view of elements(props.bookViews)) leaf(view, 'workbookView', ['visibility', 'minimized', 'showHorizontalScroll', 'showVerticalScroll', 'showSheetTabs', 'xWindow', 'yWindow', 'windowWidth', 'windowHeight', 'tabRatio', 'firstSheet', 'activeTab', 'autoFilterDateGrouping']);
  }
  if (props.calcPr) leaf(props.calcPr, 'calcPr', ['calcId', 'calcMode', 'fullCalcOnLoad', 'forceFullCalc', 'iterate', 'iterateCount', 'iterateDelta', 'fullPrecision', 'refMode', 'calcOnSave', 'concurrentCalc', 'concurrentManualCount']);
  if (!props.sheets) fail('Missing XLSX sheets.');
  node(props.sheets, 'sheets');
  const sheetNodes = elements(props.sheets);
  if (!sheetNodes.length || sheetNodes.length > 20) fail('XLSX supports 1–20 worksheets.');
  const used = new Set(), ids = new Set(), names = new Set(), budget = { cells: 0, text: 0 };
  const sheets = sheetNodes.map(sheet => {
    leaf(sheet, 'sheet', ['name', 'sheetId', 'state', 'r:id']);
    const id = sheet.getAttributeNS(R, 'id'), rel = workbookRels.get(id);
    const sourceName = decodeString(sheet.getAttribute('name') || '');
    const sheetId = integer(sheet.getAttribute('sheetId'), 1, 65535);
    const state = sheet.getAttribute('state') || 'visible';
    if (!sourceName || sourceName.length > 31 || /[\\/*?:\[\]]/.test(sourceName) || names.has(sourceName.toLowerCase()) || ids.has(sheetId) || !['visible', 'hidden', 'veryHidden'].includes(state) || !rel || rel.type !== `${R}/worksheet` || used.has(rel.part)) fail('Invalid or ambiguous XLSX sheet definition.');
    names.add(sourceName.toLowerCase()); ids.add(sheetId); used.add(rel.part);
    return { name: sourceName, state, ...worksheet(documents[rel.part], styles.length, strings, blocked, budget) };
  });
  if (Object.keys(files).some(path => /^xl\/worksheets\/sheet[1-9]\d*\.xml$/.test(path) && !used.has(path)) || [...workbookRels.values()].some(rel => rel.type === `${R}/worksheet` && !used.has(rel.part))) fail('Unreferenced XLSX worksheet data.');
  if (!sheets.some(sheet => sheet.state === 'visible')) fail('XLSX must have at least one visible worksheet.');
  if (!budget.cells) fail('XLSX has no supported stored cells to review.');
  const model = { date1904, styles, sheets, blocked };
  return { model, sheets, blocked, warnings };
}

export { detectXlsx } from './xlsx-detect.mjs';
function outputModel(model) {
  const copy = structuredClone(model);
  copy.blocked = [];
  // Drop unused source styles as well as the entire source style XML/package.
  const usedStyles = [...new Set(copy.sheets.flatMap(sheet => sheet.cells.map(cell => cell.style)))].sort((a, b) => a - b);
  const styleMap = new Map(usedStyles.map((source, target) => [source, target]));
  copy.styles = usedStyles.map(index => copy.styles[index]);
  for (const [index, sheet] of copy.sheets.entries()) {
    sheet.name = `Sheet${index + 1}`; sheet.state = 'visible';
    sheet.rows = sheet.rows.map(row => ({ ...row, hidden: false, height: row.height === 0 ? null : row.height }));
    sheet.columns = sheet.columns.map(col => ({ ...col, hidden: false, width: col.width === 0 ? 13 : col.width }));
    sheet.cells = sheet.cells.map(cell => ({ ...cell, style: styleMap.get(cell.style), rowHidden: false, columnHidden: false }));
  }
  return copy;
}
export function packageXlsx(model) {
  const files = {};
  const put = (path, text) => { files[path] = strToU8('<?xml version="1.0" encoding="UTF-8"?>' + text); };
  put('[Content_Types].xml', `<Types xmlns="${C}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${MAIN}"/><Override PartName="/xl/styles.xml" ContentType="${TYPE}styles+xml"/>${model.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${TYPE}worksheet+xml"/>`).join('')}</Types>`);
  put('_rels/.rels', `<Relationships xmlns="${P}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  put('xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><workbookPr date1904="${model.date1904 ? 1 : 0}"/><sheets>${model.sheets.map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" state="${sheet.state}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  put('xl/_rels/workbook.xml.rels', `<Relationships xmlns="${P}">${model.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="styles" Type="${R}/styles" Target="styles.xml"/></Relationships>`);
  put('xl/styles.xml', writeStyles(model.styles));
  for (const [index, sheet] of model.sheets.entries()) {
    const cellsByRow = new Map();
    for (const cell of sheet.cells) { const row = cellAddress(cell.ref).row; if (!cellsByRow.has(row)) cellsByRow.set(row, []); cellsByRow.get(row).push(cell); }
    const cols = sheet.columns.length ? `<cols>${sheet.columns.map(col => `<col min="${col.min}" max="${col.max}" width="${col.width}" customWidth="1"${col.hidden ? ' hidden="1"' : ''}/>`).join('')}</cols>` : '';
    const rows = sheet.rows.map(row => `<row r="${row.index}"${row.height !== null ? ` ht="${row.height}" customHeight="1"` : ''}${row.hidden ? ' hidden="1"' : ''}>${(cellsByRow.get(row.index) || []).map(cell => {
      const formula = cell.formula === null ? '' : `<f>${escapeXml(cell.formula)}</f>`;
      if (cell.kind === 'text') return `<c r="${cell.ref}" s="${cell.style}" t="inlineStr"><is><t xml:space="preserve">${encodeString(cell.value)}</t></is></c>`;
      return `<c r="${cell.ref}" s="${cell.style}"${cell.kind === 'boolean' ? ' t="b"' : ''}>${formula}${cell.kind === 'blank' ? '' : `<v>${cell.kind === 'boolean' ? cell.value === 'TRUE' ? 1 : 0 : escapeXml(cell.value)}</v>`}</c>`;
    }).join('')}</row>`).join('');
    put(`xl/worksheets/sheet${index + 1}.xml`, `<worksheet xmlns="${S}">${cols}<sheetData>${rows}</sheetData></worksheet>`);
  }
  return zipSync(files, { level: 6 });
}
export function verifyXlsxExport(bytes, expected, removed) {
  const files = readWorkbookZip(bytes);
  const names = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', ...expected.sheets.map((_, index) => `xl/worksheets/sheet${index + 1}.xml`)];
  if (JSON.stringify(Object.keys(files).sort()) !== JSON.stringify(names.sort())) fail('Verification failed: unexpected XLSX output parts.');
  const output = inspectXlsx(bytes, 'redacted.xlsx');
  if (output.blocked.length || JSON.stringify(canonical(output.model)) !== JSON.stringify(canonical(expected))) fail('Verification failed: XLSX text, structure or formatting differs from the reviewed model.');
  const extracted = [...Object.values(files).map(data => new TextDecoder('utf-8', { fatal: true }).decode(data)), ...output.sheets.map(sheet => sheet.name), ...output.sheets.flatMap(sheet => sheet.cells.map(cell => cell.value))];
  for (const value of removed) if (extracted.some(text => text.includes(value) || text.includes(escapeXml(value)) || text.includes(encodeString(value)))) fail('Verification failed: a selected XLSX value survives. Select every occurrence or a wider range.');
  return output;
}
export function redactXlsx(model, selections, reviewed) {
  if (reviewed !== true) fail('Human review of every worksheet and selection is required.');
  if (model.blocked.length || model.sheets.some(sheet => sheet.cells.some(cell => cell.formula !== null))) fail('XLSX export is blocked by unsupported features or formulas.');
  if (!Array.isArray(selections) || !selections.length || selections.length > 2000) fail('Select 1–2,000 XLSX redactions.');
  const groups = new Map();
  for (const selection of selections) {
    const cell = model.sheets[selection.sheet]?.cells.find(cell => cell.ref === selection.ref);
    if (!Number.isInteger(selection.sheet) || !cell || selection.field !== 'value') fail('Invalid XLSX redaction location.');
    const key = `${selection.sheet}:${selection.ref}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(selection);
  }
  const expected = outputModel(model), removed = [];
  for (const [key, selections] of groups) {
    const [sheetIndex, ref] = key.split(':');
    const cell = expected.sheets[+sheetIndex].cells.find(cell => cell.ref === ref);
    const ranges = mergeRanges(cell.value, selections);
    let end = 0, value = '';
    for (const range of ranges) { value += cell.value.slice(end, range.start) + '[REDACTED]'; removed.push(cell.value.slice(range.start, range.end)); end = range.end; }
    cell.value = value + cell.value.slice(end); cell.kind = 'text';
  }
  const bytes = packageXlsx(expected);
  verifyXlsxExport(bytes, expected, removed);
  return bytes;
}
