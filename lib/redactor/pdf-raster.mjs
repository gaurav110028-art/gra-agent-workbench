import { zlibSync, unzlibSync, strToU8 } from 'fflate';

export const PDF_LIMITS = Object.freeze({ bytes: 5 * 1024 * 1024, outputBytes: 20 * 1024 * 1024, pages: 10, pagePixels: 6_000_000, totalPixels: 20_000_000, dimension: 4096, regions: 2000 });
export class PdfError extends Error {}
const fail = message => { throw new PdfError(message); };
const finite = n => typeof n === 'number' && Number.isFinite(n);
export function validatePdfUpload(bytes, name, mime = '') {
  if (!/\.pdf$/i.test(name) || !['', 'application/pdf', 'application/octet-stream'].includes(mime)) fail('Choose a PDF with a matching file type.');
  if (!(bytes instanceof Uint8Array) || bytes.length > PDF_LIMITS.bytes || bytes.length < 30) fail('PDF must be non-empty and at most 5 MiB.');
  const start = new TextDecoder('latin1').decode(bytes.subarray(0, 8));
  const end = new TextDecoder('latin1').decode(bytes.subarray(-1024));
  if (!/^%PDF-1\.[0-7]/.test(start) || !/%%EOF\s*$/.test(end)) fail('Malformed or unsupported PDF header/trailer.');
}
export function validatePages(pages, pixels = true) {
  if (!Array.isArray(pages) || !pages.length || pages.length > PDF_LIMITS.pages) fail('PDF supports 1–10 pages.');
  let total = 0;
  for (const p of pages) {
    if (![p.width, p.height].every(n => Number.isInteger(n) && n > 0 && n <= PDF_LIMITS.dimension) || p.width * p.height > PDF_LIMITS.pagePixels) fail('PDF page dimensions exceed processing limits.');
    if (![p.widthPt, p.heightPt].every(n => finite(n) && n >= 72 && n <= 1440)) fail('Unsupported PDF page size.');
    total += p.width * p.height;
    if (pixels && (!(p.rgb instanceof Uint8Array) || p.rgb.length !== p.width * p.height * 3)) fail('PDF raster data is incomplete.');
  }
  if (total > PDF_LIMITS.totalPixels) fail('PDF exceeds the 20 megapixel total limit.');
}
export function validateRegions(pages, regions, review) {
  if (review?.final !== true || !Array.isArray(review.pages) || review.pages.length !== pages.length || !review.pages.every(v => v === true)) fail('Review every PDF page and confirm final review before export.');
  if (!Array.isArray(regions) || !regions.length || regions.length > PDF_LIMITS.regions) fail('Choose 1–2,000 PDF redaction regions.');
  return regions.map(r => {
    const p = pages[r.page];
    if (!Number.isInteger(r.page) || !p || ![r.x, r.y, r.width, r.height].every(Number.isInteger) || r.x < 0 || r.y < 0 || r.width < 2 || r.height < 2 || r.x + r.width > p.width || r.y + r.height > p.height) fail('A PDF region is ambiguous or outside its page.');
    return { page: r.page, x: r.x, y: r.y, width: r.width, height: r.height };
  });
}
export function sanitizePixels(pages, regions) {
  return pages.map((p, page) => {
    const rgb = p.rgb.slice();
    for (const r of regions.filter(r => r.page === page)) {
      for (let y = r.y; y < r.y + r.height; y++) rgb.fill(0, (y * p.width + r.x) * 3, (y * p.width + r.x + r.width) * 3);
    }
    return { width: p.width, height: p.height, widthPt: p.widthPt, heightPt: p.heightPt, rgb };
  });
}
function join(chunks) {
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }
  return bytes;
}
const number = n => String(Math.round(n * 1000) / 1000);
function stream(dict, data) { return join([strToU8(`<< ${dict} /Length ${data.length} >>\nstream\n`), data, strToU8('\nendstream')]); }
// A deliberately small PDF grammar. Only new RGB pixels enter it, never source PDF bytes/objects.
export function writeRasterPdf(pages) {
  validatePages(pages);
  const objects = [strToU8('<< /Type /Catalog /Pages 2 0 R >>'), strToU8(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`)];
  for (const [i, p] of pages.entries()) {
    const id = 3 + i * 3;
    objects.push(strToU8(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(p.widthPt)} ${number(p.heightPt)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`));
    objects.push(stream('', strToU8(`q\n${number(p.widthPt)} 0 0 ${number(p.heightPt)} 0 0 cm\n/Im0 Do\nQ`)));
    objects.push(stream(`/Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`, zlibSync(p.rgb, { level: 6 })));
  }
  const chunks = [strToU8('%PDF-1.7\n%GRA-Raster\n')], offsets = [0]; let size = chunks[0].length;
  objects.forEach((obj, i) => { offsets.push(size); const part = join([strToU8(`${i + 1} 0 obj\n`), obj, strToU8('\nendobj\n')]); chunks.push(part); size += part.length; });
  chunks.push(strToU8(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`));
  const output = join(chunks);
  if (output.length > PDF_LIMITS.outputBytes) fail('PDF output exceeds the 20 MiB export limit.');
  return output;
}
export function verifyRasterPdf(bytes, expected, regions = []) {
  validatePages(expected);
  const bad = () => fail('PDF export verification failed. No download was created.');
  // Exact grammar/entry comparison prevents extra objects, revisions, metadata or text streams.
  const canonical = writeRasterPdf(expected);
  if (!(bytes instanceof Uint8Array) || bytes.length !== canonical.length || bytes.some((v, i) => v !== canonical[i])) bad();
  // Independently decompress each image stream and compare every pixel to the sanitized model.
  const text = new TextDecoder('latin1').decode(bytes);
  for (const [i, p] of expected.entries()) {
    const marker = `${5 + i * 3} 0 obj\n`, offset = text.indexOf(marker);
    const begin = text.indexOf('stream\n', offset) + 7;
    const length = Number(text.slice(offset, begin).match(/\/Length (\d+)/)?.[1]);
    if (!Number.isInteger(length) || length < 1 || begin < 7) bad();
    let rgb; try { rgb = unzlibSync(bytes.subarray(begin, begin + length), { out: new Uint8Array(p.rgb.length) }); } catch { bad(); }
    if (rgb.length !== p.rgb.length || rgb.some((v, n) => v !== p.rgb[n])) bad();
    for (const r of regions.filter(r => r.page === i)) for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) {
      const at = (y * p.width + x) * 3;
      if (rgb[at] || rgb[at + 1] || rgb[at + 2]) bad();
    }
  }
  return true;
}
export function exportRasterPdf(pages, regions, review) {
  validatePages(pages);
  const checked = validateRegions(pages, regions, review);
  const sanitized = sanitizePixels(pages, checked);
  const bytes = writeRasterPdf(sanitized);
  verifyRasterPdf(bytes, sanitized, checked);
  return bytes;
}
