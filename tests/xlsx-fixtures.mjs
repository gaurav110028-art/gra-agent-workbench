import { packageXlsx } from '../lib/redactor/xlsx.mjs';
import { DEFAULT_STYLE } from '../lib/redactor/xlsx-styles.mjs';
import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate';

export function workbookModel() {
  const cell = (ref, value, kind = 'text', style = 0) => ({ ref, value, kind, style, formula: null, rowHidden: false, columnHidden: false });
  return {
    date1904: false, blocked: [],
    styles: [structuredClone(DEFAULT_STYLE), { ...structuredClone(DEFAULT_STYLE), font: { ...DEFAULT_STYLE.font, bold: true, italic: true, color: 'FF123456', size: 14 }, fill: 'FFFFEEAA', align: { horizontal: 'center', wrap: true }, border: { bottom: { style: 'thin', color: 'FF112233' } }, numFmt: 2 }],
    sheets: [
      { name: 'SYNTHETIC_PRIVATE_TAB', state: 'visible', rows: [{ index: 1, height: 24, hidden: false }, { index: 2, height: 18, hidden: true }], columns: [{ min: 1, max: 1, width: 25, hidden: false }, { min: 2, max: 2, width: 18, hidden: true }], cells: [cell('A1', 'PAN ABCDE1234F', 'text', 1), cell('B1', 'client@example.test'), cell('A2', 'Aurora Advisory'), cell('B2', '0011223344556677')] },
      { name: 'Hidden source', state: 'hidden', rows: [{ index: 1, height: null, hidden: false }], columns: [], cells: [cell('A1', 'GSTIN 27ABCDE1234F1Z5'), cell('B1', '42.5', 'number', 1), cell('C1', 'TRUE', 'boolean')] },
      { name: 'Very hidden source', state: 'veryHidden', rows: [{ index: 1, height: null, hidden: false }], columns: [], cells: [cell('A1', 'TAN ABCD12345E IFSC HDFC0001234 Aadhaar 2345 6789 0123 Phone +91 98765 43210')] },
    ],
  };
}
export const workbookBytes = () => packageXlsx(workbookModel());
export function changeZip(bytes, transform) { const files = unzipSync(bytes); transform(files); return zipSync(files); }
export function changePart(bytes, path, transform) { return changeZip(bytes, files => { files[path] = strToU8(transform(strFromU8(files[path]))); }); }
export function sharedStringFixture() {
  return changeZip(workbookBytes(), files => {
    files['xl/sharedStrings.xml'] = strToU8('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2"><si><t>PAN ABCDE1234F</t></si><si><t>SYNTHETIC_ORPHAN_SECRET</t></si></sst>');
    files['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(files['xl/worksheets/sheet1.xml']).replace('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">PAN ABCDE1234F</t></is></c>', '<c r="A1" s="1" t="s"><v>0</v></c>'));
    files['[Content_Types].xml'] = strToU8(strFromU8(files['[Content_Types].xml']).replace('</Types>', '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'));
    files['xl/_rels/workbook.xml.rels'] = strToU8(strFromU8(files['xl/_rels/workbook.xml.rels']).replace('</Relationships>', '<Relationship Id="sst" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'));
  });
}
export function formulaFixture() {
  return changePart(workbookBytes(), 'xl/worksheets/sheet2.xml', xml => xml.replace('<c r="B1" s="1"><v>42.5</v></c>', '<c r="B1" s="1" t="str"><f>"ABCDE1234F"</f><v>cached@example.test</v></c>'));
}
