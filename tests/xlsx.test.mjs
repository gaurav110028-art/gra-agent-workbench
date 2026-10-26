import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strToU8, strFromU8, zipSync } from 'fflate';
import { inspectXlsx, redactXlsx, detectXlsx, packageXlsx, verifyXlsxExport, XLSX_MIME } from '../lib/redactor/xlsx.mjs';
import { decodeString, encodeString } from '../lib/redactor/ooxml.mjs';
import { workbookModel, workbookBytes, changeZip, changePart, sharedStringFixture, formulaFixture } from './xlsx-fixtures.mjs';

const inspect = bytes => inspectXlsx(bytes, 'synthetic.xlsx', XLSX_MIME);
test('XLSX imports multiple sheets and identifies hidden/veryHidden sheets, rows and columns', () => {
  const result = inspect(workbookBytes());
  assert.deepEqual(result.sheets.map(s => s.state), ['visible', 'hidden', 'veryHidden']);
  assert(result.sheets[0].cells.find(c => c.ref === 'A2').rowHidden);
  assert(result.sheets[0].cells.find(c => c.ref === 'B1').columnHidden);
  assert.equal(result.sheets[1].cells[1].kind, 'number');
  assert.equal(result.sheets[1].cells[2].value, 'TRUE');
  assert.equal(result.blocked.length, 0);
});
test('all required identifiers and custom terms are detected with exact cell locations', () => {
  const result = inspect(workbookBytes());
  const matches = detectXlsx(result.sheets, ['Aurora Advisory']);
  for (const kind of ['PAN', 'Aadhaar', 'GSTIN', 'TAN', 'IFSC', 'Email', 'Phone', 'Bank account candidate', 'Custom term']) assert(matches.some(m => m.kind === kind), kind);
  assert(matches.some(m => m.kind === 'Custom term' && m.sheet === 0 && m.ref === 'A2'));
});
test('verified XLSX export removes approved text, unhides all data and preserves supported formatting/geometry/types', () => {
  const input = inspect(workbookBytes());
  const bytes = redactXlsx(input.model, detectXlsx(input.sheets, ['Aurora Advisory']), true);
  const output = inspect(bytes);
  assert.deepEqual(output.sheets.map(s => s.name), ['Sheet1', 'Sheet2', 'Sheet3']);
  assert(output.sheets.every(s => s.state === 'visible' && s.rows.every(r => !r.hidden) && s.columns.every(c => !c.hidden)));
  assert.equal(output.sheets[0].cells[0].value, 'PAN [REDACTED]');
  assert.equal(output.sheets[0].cells[2].value, '[REDACTED]');
  assert.equal(output.sheets[0].columns[0].width, 25);
  assert.equal(output.sheets[0].rows[0].height, 24);
  assert.deepEqual(output.model.styles, input.model.styles);
  assert.equal(output.sheets[1].cells[1].value, '42.5');
  assert.equal(output.sheets[1].cells[2].kind, 'boolean');
  for (const data of Object.values(unzipSync(bytes))) for (const secret of ['ABCDE1234F', 'client@example.test', 'Aurora Advisory', 'SYNTHETIC_PRIVATE_TAB']) assert(!strFromU8(data).includes(secret));
});
test('shared strings are resolved per cell; unused original shared strings never enter the rebuilt archive', () => {
  const input = inspect(sharedStringFixture());
  assert.equal(input.sheets[0].cells[0].value, 'PAN ABCDE1234F');
  const bytes = redactXlsx(input.model, detectXlsx(input.sheets), true);
  const files = unzipSync(bytes);
  assert(!files['xl/sharedStrings.xml']);
  assert(!Object.values(files).some(data => strFromU8(data).includes('SYNTHETIC_ORPHAN_SECRET')));
});
test('formula expressions and cached values are inspected and detected, but export is blocked', () => {
  const input = inspect(formulaFixture());
  const matches = detectXlsx(input.sheets);
  assert(matches.some(m => m.ref === 'B1' && m.sheet === 1 && m.field === 'formula' && m.kind === 'PAN'));
  assert(matches.some(m => m.ref === 'B1' && m.sheet === 1 && m.field === 'value' && m.kind === 'Email'));
  assert(input.blocked.some(message => message.includes('Formulas')));
  assert.throws(() => redactXlsx(input.model, matches.filter(m => m.field === 'value'), true), /blocked/);
  const spoof = structuredClone(input.model); spoof.blocked = [];
  assert.throws(() => redactXlsx(spoof, matches.filter(m => m.field === 'value'), true), /blocked/);
});
test('defined names, merge regions, links, validation and protection block export', () => {
  for (const [path, closing, feature] of [
    ['xl/workbook.xml', '</workbook>', '<definedNames><definedName name="Private">"ABCDE1234F"</definedName></definedNames>'],
    ...['mergeCells', 'hyperlinks', 'dataValidations', 'sheetProtection', 'conditionalFormatting', 'autoFilter'].map(tag => ['xl/worksheets/sheet1.xml', '</worksheet>', `<${tag}/>`]),
  ]) {
    const input = inspect(changePart(workbookBytes(), path, xml => xml.replace(closing, feature + closing)));
    assert(input.blocked.length);
    assert.throws(() => redactXlsx(input.model, detectXlsx(input.sheets), true), /blocked/);
  }
});
test('comments, notes, drawings, embedded files, macros, external links and unknown package parts are rejected', () => {
  for (const path of ['xl/comments/comment1.xml', 'xl/threadedComments/threadedComment1.xml', 'xl/drawings/drawing1.xml', 'xl/embeddings/object.bin', 'xl/vbaProject.bin', 'xl/externalLinks/externalLink1.xml', 'xl/connections.xml', 'customXml/item1.xml', 'xl/calcChain.xml', 'private.bin']) {
    assert.throws(() => inspect(changeZip(workbookBytes(), files => { files[path] = strToU8('<synthetic/>'); })), /Unsupported XLSX package/);
  }
});
test('external, ambiguous and broken relationship targets cannot enter the supported model', () => {
  for (const target of ['https://example.test/private', 'file:///secret', '//private/share', '..\\private', 'worksheets/missing.xml', 'worksheets/sheet1.xml#fragment']) assert.throws(() => inspect(changePart(workbookBytes(), 'xl/_rels/workbook.xml.rels', xml => xml.replace('Target="worksheets/sheet1.xml"', `Target="${target}"`))));
  assert.throws(() => inspect(changePart(workbookBytes(), '_rels/.rels', xml => xml.replace('Target="xl/workbook.xml"', 'Target="xl/workbook.xml" TargetMode="External"'))), /External/);
});
test('metadata is discarded instead of copied and surviving values fail export verification', () => {
  const input = inspect(changeZip(workbookBytes(), files => { files['docProps/core.xml'] = strToU8('<properties><author>SYNTHETIC_PRIVATE_AUTHOR</author></properties>'); }));
  const bytes = redactXlsx(input.model, detectXlsx(input.sheets), true);
  assert(!unzipSync(bytes)['docProps/core.xml']);
  const duplicate = workbookModel(); duplicate.sheets[1].cells[0].value = 'ABCDE1234F';
  const model = inspect(packageXlsx(duplicate)).model;
  assert.throws(() => redactXlsx(model, [{ sheet: 0, ref: 'A1', field: 'value', start: 4, end: 14 }], true), /survives/);
});
test('manual ranges, Unicode, literal custom terms and numeric-to-text redaction are safe', () => {
  const model = workbookModel();
  model.sheets[0].cells[0].value = '😀 Client (A+B)';
  model.sheets[1].cells[1].value = '123456789012';
  const input = inspect(packageXlsx(model));
  const matches = detectXlsx(input.sheets, ['Client (A+B)']);
  const output = inspect(redactXlsx(input.model, matches, true));
  assert.equal(output.sheets[0].cells[0].value, '😀 [REDACTED]');
  assert.equal(output.sheets[1].cells[1].kind, 'text');
  assert.equal(output.sheets[1].cells[1].value, '[REDACTED]');
  assert.throws(() => redactXlsx(input.model, [{ sheet: 0, ref: 'A1', field: 'value', start: 1, end: 2 }], true), /Unicode/);
});
test('XLSX string escapes cannot disguise identifiers or inject formulas', () => {
  assert.equal(decodeString('_x0041_BCDE1234F'), 'ABCDE1234F');
  assert.equal(decodeString('_x005F_x0041_'), '_x0041_');
  assert.equal(decodeString(encodeString('_x0041_\r')).replaceAll('&amp;', '&'), '_x0041_\r');
  assert.throws(() => decodeString('_x0000_'));
  const encoded = changePart(workbookBytes(), 'xl/worksheets/sheet1.xml', xml => xml.replace('ABCDE1234F', '_x0041_BCDE1234F'));
  const input = inspect(encoded);
  assert(detectXlsx(input.sheets).some(match => match.kind === 'PAN'));
  const formulaLike = workbookModel(); formulaLike.sheets[0].cells[0].value = '=HYPERLINK("https://example.test","ABCDE1234F")';
  const result = inspect(packageXlsx(formulaLike));
  assert.equal(result.sheets[0].cells[0].formula, null);
  const exported = redactXlsx(result.model, detectXlsx(result.sheets), true);
  assert(!Object.values(unzipSync(exported)).some(data => strFromU8(data).includes('<f>')));
});
test('human review, valid locations and valid nonempty ranges are mandatory', () => {
  const input = inspect(workbookBytes());
  assert.throws(() => redactXlsx(input.model, detectXlsx(input.sheets), false), /Human review/);
  assert.throws(() => redactXlsx(input.model, [], true));
  for (const range of [{ sheet: -1, ref: 'A1', field: 'value', start: 0, end: 1 }, { sheet: 0, ref: 'XFD1', field: 'value', start: 0, end: 1 }, { sheet: 0, ref: 'A1', field: 'formula', start: 0, end: 1 }, { sheet: 0, ref: 'A1', field: 'value', start: 0, end: 999 }]) assert.throws(() => redactXlsx(input.model, [range], true));
});
test('verification refuses modified values, styles or unexpected hidden output parts', () => {
  const input = inspect(workbookBytes());
  const bytes = redactXlsx(input.model, detectXlsx(input.sheets), true);
  const expected = inspect(bytes).model;
  assert.throws(() => verifyXlsxExport(changePart(bytes, 'xl/worksheets/sheet1.xml', xml => xml.replace('[REDACTED]', 'unapproved')), expected, []), /Verification failed/);
  assert.throws(() => verifyXlsxExport(changeZip(bytes, files => { files['docProps/core.xml'] = strToU8('<secret/>'); }), expected, []), /unexpected/);
});
test('wrong type, macros, encryption, malformed ZIP/XML, bad indexes and unsafe archive bounds are rejected', () => {
  const bytes = workbookBytes();
  for (const name of ['synthetic.xlsm', 'synthetic.xlsb', 'synthetic.xls', 'synthetic.xltm']) assert.throws(() => inspectXlsx(bytes, name));
  assert.throws(() => inspectXlsx(bytes, 'synthetic.xlsx', 'application/pdf'), /MIME/);
  assert.throws(() => inspect(Uint8Array.from([0xd0, 0xcf, ...Array(30).fill(0)])), /Encrypted/);
  assert.throws(() => inspect(bytes.subarray(0, bytes.length - 12)));
  assert.throws(() => inspect(new Uint8Array(5 * 1024 * 1024 + 1)));
  const encrypted = bytes.slice(); encrypted[6] |= 1; assert.throws(() => inspect(encrypted));
  const corrupt = bytes.slice(); corrupt[14] ^= 1; assert.throws(() => inspect(corrupt));
  assert.throws(() => inspect(changePart(bytes, 'xl/workbook.xml', xml => '<!DOCTYPE x>' + xml)));
  assert.throws(() => inspect(changePart(bytes, 'xl/worksheets/sheet1.xml', xml => xml.replace('</row>', '</c>'))));
  assert.throws(() => inspect(changePart(sharedStringFixture(), 'xl/worksheets/sheet1.xml', xml => xml.replace('<v>0</v>', '<v>999</v>'))));
  assert.throws(() => inspect(changeZip(bytes, files => { files['xl/large.xml'] = new Uint8Array(2 * 1024 * 1024 + 1); })));
});
test('rich strings, custom formats, numeric precision overflow and duplicate cells are rejected', () => {
  assert.throws(() => inspect(changePart(workbookBytes(), 'xl/worksheets/sheet1.xml', xml => xml.replace('<is><t xml:space="preserve">PAN ABCDE1234F</t></is>', '<is><r><t>private</t></r></is>'))));
  assert.throws(() => inspect(changePart(workbookBytes(), 'xl/styles.xml', xml => xml.replace('<fonts', '<numFmts count="1"><numFmt numFmtId="164" formatCode=";;;"/></numFmts><fonts'))), /Custom/);
  assert.throws(() => inspect(changePart(workbookBytes(), 'xl/worksheets/sheet2.xml', xml => xml.replace('<v>42.5</v>', '<v>1234567890123456</v>'))), /15 significant/);
  assert.throws(() => inspect(changePart(workbookBytes(), 'xl/worksheets/sheet1.xml', xml => xml.replace('r="B1"', 'r="A1"'))), /Duplicate/);
});
test('unused style records and source theme/typeface data never survive reconstruction', () => {
  const source = workbookModel();
  source.styles.push({ ...structuredClone(source.styles[0]), font: { ...source.styles[0].font, color: 'FF56789A' } });
  const input = inspect(packageXlsx(source));
  const bytes = redactXlsx(input.model, detectXlsx(input.sheets), true);
  assert.equal(inspect(bytes).model.styles.length, 2);
  assert(!strFromU8(unzipSync(bytes)['xl/styles.xml']).includes('FF56789A'));
});
test('active workbook locks block export while an empty default protection element is harmless', () => {
  const benign = inspect(changePart(workbookBytes(), 'xl/workbook.xml', xml => xml.replace('<sheets>', '<workbookProtection/><sheets>')));
  assert.equal(benign.blocked.length, 0);
  const locked = inspect(changePart(workbookBytes(), 'xl/workbook.xml', xml => xml.replace('<sheets>', '<workbookProtection lockStructure="1"/><sheets>')));
  assert(locked.blocked.length);
  assert.throws(() => redactXlsx(locked.model, detectXlsx(locked.sheets), true), /blocked/);
});
test('sheet, cell, text and XML processing limits are enforced before export', () => {
  const tooManySheets = workbookModel();
  while (tooManySheets.sheets.length < 21) { const sheet = structuredClone(tooManySheets.sheets[0]); sheet.name = `Tab${tooManySheets.sheets.length}`; tooManySheets.sheets.push(sheet); }
  assert.throws(() => inspect(packageXlsx(tooManySheets)), /1–20/);
  const tooManyCells = workbookModel();
  for (let row = 3; row <= 10000; row++) {
    tooManyCells.sheets[0].rows.push({ index: row, height: null, hidden: false });
    tooManyCells.sheets[0].cells.push({ ref: `A${row}`, value: '', kind: 'blank', formula: null, style: 0 });
  }
  assert.throws(() => inspect(packageXlsx(tooManyCells)), /10,000 stored cells/);
  const tooMuchText = workbookModel(); tooMuchText.sheets[0].cells.forEach(cell => { cell.value = 'X'.repeat(25000); });
  assert.throws(() => inspect(packageXlsx(tooMuchText)), /text limit/);
  const longCell = workbookModel(); longCell.sheets[0].cells[0].value = 'X'.repeat(32768);
  assert.throws(() => inspect(packageXlsx(longCell)), /32,767/);
  assert.throws(() => inspect(changePart(workbookBytes(), 'xl/workbook.xml', xml => xml + ' '.repeat(1024 * 1024))), /1 MiB/);
});
test('orphan sheets, case-insensitive duplicate names and renamed macro content types are rejected', () => {
  assert.throws(() => inspect(changePart(workbookBytes(), 'xl/workbook.xml', xml => xml.replace('Hidden source', 'synthetic_private_tab'))), /ambiguous/);
  assert.throws(() => inspect(changePart(workbookBytes(), '[Content_Types].xml', xml => xml.replace('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', 'application/vnd.ms-excel.sheet.macroEnabled.main+xml'))), /macro-enabled/);
  const orphan = changeZip(workbookBytes(), files => {
    files['xl/worksheets/sheet4.xml'] = files['xl/worksheets/sheet2.xml'];
    files['[Content_Types].xml'] = strToU8(strFromU8(files['[Content_Types].xml']).replace('</Types>', '<Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'));
  });
  assert.throws(() => inspect(orphan), /Unreferenced/);
});
