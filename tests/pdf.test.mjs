import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePdfUpload, validatePages, validateRegions, sanitizePixels, writeRasterPdf, verifyRasterPdf, exportRasterPdf, PDF_LIMITS } from '../lib/redactor/pdf-raster.mjs';
import { pdfTextModel, detectPdf } from '../lib/redactor/pdf-geometry.mjs';
import { fixturePdf } from './pdf-fixtures.mjs';
const pages = () => [{ width: 200, height: 150, widthPt: 100, heightPt: 75, rgb: new Uint8Array(200 * 150 * 3).fill(247) }];
const region = { page: 0, x: 10, y: 12, width: 20, height: 15 };
const review = { final: true, pages: [true] };
test('PDF validates signature, extension, MIME, EOF and upload bounds', () => {
  assert.doesNotThrow(() => validatePdfUpload(fixturePdf(), 'synthetic.pdf', 'application/pdf'));
  for (const [bytes, name, mime] of [[fixturePdf(), 'x.docx', ''], [fixturePdf(), 'x.pdf', 'text/plain'], [new Uint8Array(40), 'x.pdf', ''], [new Uint8Array(PDF_LIMITS.bytes + 1), 'x.pdf', ''], [fixturePdf().subarray(0, 100), 'x.pdf', '']]) assert.throws(() => validatePdfUpload(bytes, name, mime));
});
test('PDF physically overwrites approved RGB pixels without mutating the original', () => {
  const source = pages(), sanitized = sanitizePixels(source, [region]);
  assert(source[0].rgb.every(n => n === 247));
  assert.equal(sanitized[0].rgb[(12 * 200 + 10) * 3], 0);
  assert.equal(sanitized[0].rgb[(27 * 200 + 10) * 3], 247);
  const bytes = exportRasterPdf(source, [region], review);
  assert(verifyRasterPdf(bytes, sanitized, [region]));
  const text = new TextDecoder().decode(bytes);
  for (const token of ['/Font', '/Annots', '/Metadata', '/Info', '/EmbeddedFiles', '/OCProperties', '/JavaScript', '/Encrypt', 'ABCDE1234F']) assert(!text.includes(token));
});
test('PDF export requires complete per-page/final review and nonempty bounded regions', () => {
  for (const r of [null, true, { final: false, pages: [true] }, { final: true, pages: [] }, { final: true, pages: [false] }, { final: true, pages: [true, true] }]) assert.throws(() => exportRasterPdf(pages(), [region], r), /Review/);
  for (const rs of [[], new Array(2001).fill(region), [{ ...region, x: -1 }], [{ ...region, width: 0 }], [{ ...region, x: 199 }], [{ ...region, page: 0.5 }], [{ ...region, y: NaN }]]) assert.throws(() => validateRegions(pages(), rs, review));
});
test('PDF output corruption, appended objects and unmasked pixels fail verification', () => {
  const sanitized = sanitizePixels(pages(), [region]), output = writeRasterPdf(sanitized);
  const corrupt = output.slice(); corrupt[20] ^= 1;
  assert.throws(() => verifyRasterPdf(corrupt, sanitized), /verification failed/);
  assert.throws(() => verifyRasterPdf(new Uint8Array([...output, 32]), sanitized), /verification failed/);
  assert.throws(() => verifyRasterPdf(writeRasterPdf(pages()), pages(), [region]), /verification failed/);
});
test('PDF page, pixel and raster-length bounds fail closed', () => {
  for (const ps of [[], new Array(11).fill(pages()[0]), [{ ...pages()[0], width: 4097 }], [{ ...pages()[0], rgb: new Uint8Array(3) }], [{ ...pages()[0], widthPt: Infinity }], [{ ...pages()[0], height: 4000, width: 4000 }]]) assert.throws(() => validatePages(ps));
  const p = { width: 2000, height: 2000, widthPt: 1000, heightPt: 1000 };
  assert.throws(() => validatePages(new Array(6).fill(p), false), /20 megapixel/);
});
const transform = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
const viewport = { transform: [2, 0, 0, -2, 0, 600], width: 800, height: 600, scale: 2 };
function content(text = 'PAN ABCDE1234F') { return { items: [{ str: text, dir: 'ltr', fontName: 'f1', width: 110, transform: [12, 0, 0, 12, 30, 250] }], styles: { f1: { ascent: .9, descent: -.2 } } }; }
test('PDF maps detections to conservative whole-run boxes and literal custom terms', () => {
  const page = pdfTextModel(content(), viewport, transform);
  const matches = detectPdf([page]);
  assert.equal(matches.length, 1); assert.equal(matches[0].kind, 'PAN');
  assert(matches[0].x < 60 && matches[0].width > 220 && matches[0].height > 24);
  assert.equal(detectPdf([pdfTextModel(content('Aurora Advisory'), viewport, transform)], ['Aurora'])[0].kind, 'Custom term');
  assert.throws(() => detectPdf([page], new Array(31).fill('Aurora')), /30/);
});
test('PDF reuses every supported Indian identifier detector across pages', () => {
  const samples = [['GSTIN', '27ABCDE1234F1Z5'], ['PAN', 'ABCDE1234F'], ['TAN', 'ABCD12345E'], ['Aadhaar', '2345 6789 0123'], ['Email', 'client@example.test'], ['Phone', '+91 98765 43210'], ['IFSC', 'SBIN0001234'], ['Bank account', 'Account 0011223344556677']];
  for (const [kind, text] of samples) {
    const page = pdfTextModel(content(text), viewport, transform);
    assert(detectPdf([page]).some(r => r.kind === kind), kind);
  }
});
test('PDF rejects failed detection, RTL, rotated, clipped and invalid font mappings', () => {
  for (const edit of [c => { c.items = []; }, c => { c.items[0].dir = 'rtl'; }, c => { c.items[0].transform[1] = 12; }, c => { c.items[0].transform[4] = 0; }, c => { c.styles = {}; }, c => { c.items[0].width = NaN; }]) {
    const c = content(); edit(c); assert.throws(() => pdfTextModel(c, viewport, transform));
  }
});
test('PDF multi-page output retains all pages and page sizes', () => {
  const source = [pages()[0], { ...pages()[0], widthPt: 125 }];
  const bytes = exportRasterPdf(source, [region], { final: true, pages: [true, true] });
  assert(verifyRasterPdf(bytes, sanitizePixels(source, [region]), [region]));
  assert(new TextDecoder().decode(bytes).includes('/Count 2'));
});
