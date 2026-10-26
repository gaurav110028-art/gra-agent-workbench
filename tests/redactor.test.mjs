import test from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate';
import { detect, mergeRanges } from '../lib/redactor/detect.mjs';
import { inspectDocx, packageDocx, redactDocx, verifyExport, MAX_FILE } from '../lib/redactor/docx.mjs';

const fixture = (text = 'PAN ABCDE1234F; email client@example.test') => ({ paragraphs: [{ props: { jc: 'center' }, runs: [{ props: { b: true, i: true, u: true, sz: 24 }, text }] }], section: { pgSz: { w: 11906, h: 16838 }, pgMar: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } });
const edit = (bytes, fn) => { const files = unzipSync(bytes); fn(files); return zipSync(files); };
const modifyXml = (value) => edit(packageDocx(fixture()), files => { files['word/document.xml'] = strToU8(value(strFromU8(files['word/document.xml']))); });
const inspect = bytes => inspectDocx(bytes, 'synthetic.docx');

test('detects all supported identifier categories and literal custom terms', () => {
  const text = 'ABCDE1234F 2345 6789 0123 27ABCDE1234F1Z5 ABCD12345E +91 98765 43210 ca@example.test Account No: 001122334455 HDFC0001234 Client (A+B)';
  const matches = detect(text, ['Client (A+B)']);
  for (const name of ['PAN', 'Aadhaar', 'GSTIN', 'TAN', 'Phone', 'Email', 'Bank account', 'IFSC', 'Custom term']) assert(matches.some(m => m.kind === name), name);
});
test('literal terms do not execute regex and are bounded', () => {
  assert.equal(detect('a+b axb', ['a+b']).length, 1);
  assert.throws(() => detect('abc', ['x'.repeat(201)]));
  assert.throws(() => detect('abc', Array(31).fill('x')));
});
test('valid DOCX exports approved removals and preserves supported formatting', () => {
  const original = fixture();
  const input = inspect(packageDocx(original));
  assert.deepEqual(input.model, original);
  const output = redactDocx(input.model, detect(input.text), true);
  const parsed = inspect(output);
  assert.equal(parsed.text, 'PAN [REDACTED]; email [REDACTED]');
  assert.deepEqual(parsed.model.paragraphs[0].runs[0].props, original.paragraphs[0].runs[0].props);
  assert.deepEqual(parsed.model.section, original.section);
  assert.equal(Object.keys(unzipSync(output)).length, 3);
});
test('identifiers split across differently formatted runs are detected and removed', () => {
  const original = fixture();
  original.paragraphs[0].runs = [{ props: { b: true }, text: 'PAN ABC' }, { props: { i: true }, text: 'DE1234F end' }];
  const input = inspect(packageDocx(original));
  const output = inspect(redactDocx(input.model, detect(input.text), true));
  assert.equal(output.text, 'PAN [REDACTED] end');
  assert.equal(output.model.paragraphs[0].runs[1].props.i, true);
});
test('manual ranges can span paragraphs and overlapping proposals merge', () => {
  const model = fixture('Secret');
  model.paragraphs.push({ props: {}, runs: [{ props: {}, text: 'Client tail' }] });
  const text = 'Secret\nClient tail';
  assert.deepEqual(mergeRanges(text, [{ start: 0, end: 8 }, { start: 4, end: 13 }]), [{ start: 0, end: 13 }]);
  assert.equal(inspect(redactDocx(model, [{ start: 0, end: 13 }], true)).text, '[REDACTED]\n[REDACTED] tail');
});
test('metadata, settings and archive comments cannot survive package reconstruction', () => {
  const marker = 'SYNTHETIC_PRIVATE_METADATA';
  const bytes = edit(packageDocx(fixture()), files => {
    files['docProps/core.xml'] = strToU8(`<properties><author>${marker}</author></properties>`);
    files['word/settings.xml'] = strToU8(`<settings><private>${marker}</private></settings>`);
  });
  const input = inspect(bytes);
  const output = redactDocx(input.model, detect(input.text), true);
  const files = unzipSync(output);
  assert.deepEqual(Object.keys(files).sort(), ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
  for (const data of Object.values(files)) assert(!strFromU8(data).includes(marker));
});
test('human acknowledgement, nonempty ranges and valid offsets required', () => {
  const model = fixture();
  assert.throws(() => redactDocx(model, [{ start: 4, end: 14 }], false), /Human review/);
  assert.throws(() => redactDocx(model, [], true), /at least one/);
  for (const range of [{ start: -1, end: 2 }, { start: 0, end: 999 }, { start: 3, end: 3 }, { start: 0.5, end: 3 }]) assert.throws(() => redactDocx(model, [range], true));
  assert.throws(() => mergeRanges('😀 test', [{ start: 1, end: 2 }]), /Unicode/);
});
test('verification fails closed when approved value survives elsewhere', () => {
  assert.throws(() => redactDocx(fixture('ABCDE1234F ABCDE1234F'), [{ start: 0, end: 10 }], true), /selected value remains/);
});
test('verification fails closed on altered text or hidden extra output entries', () => {
  const expected = fixture('safe');
  assert.throws(() => verifyExport(packageDocx(fixture('unsafe')), expected, []), /differs/);
  const bytes = edit(packageDocx(expected), files => { files['docProps/core.xml'] = strToU8('<secret/>'); });
  assert.throws(() => verifyExport(bytes, expected, []), /unexpected output parts/);
});
test('DOCX importer rejects PDF, scanned PDF, XLSX and mismatched MIME', () => {
  const bytes = packageDocx(fixture());
  for (const name of ['test.pdf', 'scanned.pdf', 'test.xlsx', 'test.doc', 'test.docm']) assert.throws(() => inspectDocx(bytes, name), /unsupported|supported/);
  assert.throws(() => inspectDocx(bytes, 'test.docx', 'application/pdf'), /MIME/);
  assert.throws(() => inspectDocx(strToU8('%PDF-1.7 synthetic scan'), 'renamed.docx'), /ZIP/);
});
test('image-only scanned DOCX, tables, revisions, comments and hidden runs rejected', () => {
  for (const tag of ['drawing', 'tbl', 'ins', 'del', 'hyperlink', 'fldSimple', 'sdt', 'altChunk']) {
    assert.throws(() => inspect(modifyXml(s => s.replace('<w:p>', `<w:${tag}/><w:p>`))), /Unsupported/);
  }
  for (const tag of ['vanish', 'webHidden']) assert.throws(() => inspect(modifyXml(s => s.replace('<w:b/>', `<w:${tag}/>`))), /Hidden/);
  assert.throws(() => inspect(modifyXml(s => s.replace(/<w:t[^>]*>[\s\S]*?<\/w:t>/, '<w:drawing/>'))), /Unsupported/);
  assert.throws(() => inspect(packageDocx(fixture(''))), /Image-only/);
});
test('headers, footers, embedded objects, custom XML, macros and hidden styles rejected', () => {
  for (const path of ['word/header1.xml', 'word/footer1.xml', 'word/comments.xml', 'word/footnotes.xml', 'word/media/image.png', 'word/embeddings/object.bin', 'word/vbaProject.bin', 'customXml/item1.xml']) {
    const bytes = edit(packageDocx(fixture()), files => { files[path] = strToU8('<synthetic/>'); });
    assert.throws(() => inspect(bytes), /Unsupported/);
  }
  const bytes = edit(packageDocx(fixture()), files => { files['word/styles.xml'] = strToU8('<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:vanish/></w:styles>'); });
  assert.throws(() => inspect(bytes), /Hidden/);
});
test('external relationships are rejected without following links', () => {
  const bytes = edit(packageDocx(fixture()), files => {
    files['word/_rels/document.xml.rels'] = strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="x" TargetMode="External" Target="https://example.test/private"/></Relationships>');
  });
  assert.throws(() => inspect(bytes), /External/);
});
test('malformed XML, DTD/entity declarations and foreign namespaces rejected', () => {
  for (const transform of [s => s.replace('</w:p>', '</w:r>'), s => '<!DOCTYPE x [<!ENTITY secret "private">]>' + s, s => s.replace('<w:t ', '<evil:t xmlns:evil="urn:evil" ').replace('</w:t>', '</evil:t>')]) assert.throws(() => inspect(modifyXml(transform)));
});
test('malformed ZIP, corrupt CRC, encrypted flags, unsafe paths and expansion rejected', () => {
  const original = packageDocx(fixture());
  assert.throws(() => inspect(original.subarray(0, original.length - 12)));
  const corrupt = original.slice(); corrupt[14] ^= 1; assert.throws(() => inspect(corrupt));
  const encrypted = original.slice(); encrypted[6] |= 1; assert.throws(() => inspect(encrypted));
  assert.throws(() => inspect(edit(original, files => { files['../private.xml'] = strToU8('private'); })));
  assert.throws(() => inspect(edit(original, files => { files['large.xml'] = new Uint8Array(2 * 1024 * 1024 + 1); })));
  assert.throws(() => inspect(new Uint8Array(MAX_FILE + 1)));
});
test('invalid content types and excessive XML depth rejected', () => {
  const bytes = edit(packageDocx(fixture()), files => { files['[Content_Types].xml'] = strToU8('<Types/>'); });
  assert.throws(() => inspect(bytes), /content type/);
  assert.throws(() => inspect(modifyXml(s => s.replace('<w:body>', '<w:body>' + '<w:p>'.repeat(45)).replace('</w:body>', '</w:p>'.repeat(45) + '</w:body>'))), /complexity/);
});
test('false direct formatting canonicalizes without export verification mismatch', () => {
  const bytes = modifyXml(s => s.replace('<w:b/>', '<w:b w:val="0"/>'));
  const input = inspect(bytes);
  assert.doesNotThrow(() => redactDocx(input.model, detect(input.text), true));
});
test('formatting equality does not depend on XML property order', () => {
  const bytes = modifyXml(s => s.replace('<w:b/><w:i/>', '<w:i/><w:b/>'));
  const input = inspect(bytes);
  assert.doesNotThrow(() => redactDocx(input.model, detect(input.text), true));
});
test('XML-like source text is escaped, and selection across XML entities removes actual characters', () => {
  const model = fixture('Client A&B <private> and public');
  const input = inspect(packageDocx(model));
  assert.equal(input.text, 'Client A&B <private> and public');
  const bytes = redactDocx(input.model, [{ start: 7, end: 20 }], true);
  assert.equal(inspect(bytes).text, 'Client [REDACTED] and public');
});
test('unexpected archive parts, ambiguous main types and broken relationships are rejected', () => {
  const source = packageDocx(fixture());
  assert.throws(() => inspect(edit(source, files => { files['word/unexpected.bin'] = strToU8('synthetic hidden content'); })), /unexpected package/);
  assert.throws(() => inspect(edit(source, files => { files['[Content_Types].xml'] = strToU8(strFromU8(files['[Content_Types].xml']).replace('</Types>', '<Override PartName="/word/document.xml" ContentType="application/xml"/></Types>')); })), /unambiguous/);
  assert.throws(() => inspect(edit(source, files => { files['_rels/.rels'] = strToU8(strFromU8(files['_rels/.rels']).replace('Target="word/document.xml"', 'Target="word/missing.xml"')); })), /Broken/);
});
test('external or unsafe relationship targets fail even without TargetMode', () => {
  for (const target of ['https://example.test/private', 'file:///private', '//private/share', '..\\private', 'word/document.xml#fragment']) {
    const source = edit(packageDocx(fixture()), files => { files['_rels/.rels'] = strToU8(strFromU8(files['_rels/.rels']).replace('Target="word/document.xml"', `Target="${target}"`)); });
    assert.throws(() => inspect(source), /External or unsafe/);
  }
});
