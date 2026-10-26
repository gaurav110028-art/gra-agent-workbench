import { getDocument, Util, OPS, AnnotationMode } from 'pdfjs-dist/build/pdf.mjs';
import 'pdfjs-dist/build/pdf.worker.mjs'; // In-process PDF.js parser inside this terminable dedicated worker.
import fonts from './generated/pdf-fonts.mjs';
import { PdfError, PDF_LIMITS, validatePdfUpload, validatePages, exportRasterPdf } from './pdf-raster.mjs';
import { pdfTextModel, detectPdf } from './pdf-geometry.mjs';

let warned = false, model = null, processing = false;
// PDF.js diagnostics can contain source names/text. Retain a boolean only, never log values.
for (const method of ['log', 'warn', 'error', 'info', 'debug']) console[method] = (...args) => {
  if (args[0] !== 'Warning: Setting up fake worker.') warned = true;
};
class CanvasFactory {
  create(width, height) {
    if (width * height > PDF_LIMITS.pagePixels || width > PDF_LIMITS.dimension || height > PDF_LIMITS.dimension) throw new PdfError('Canvas limit.');
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, context: canvas.getContext('2d', { willReadFrequently: true }) };
  }
  reset(c, width, height) { if (width * height > PDF_LIMITS.pagePixels || width > 4096 || height > 4096) throw new PdfError('Canvas limit.'); c.canvas.width = width; c.canvas.height = height; }
  destroy(c) { c.canvas.width = c.canvas.height = 0; c.canvas = c.context = null; }
}
class BinaryDataFactory {
  async fetch({ kind, filename }) {
    if (kind !== 'standardFontDataUrl' || !Object.hasOwn(fonts, filename)) throw new PdfError('Unsupported PDF font/resource.');
    return Uint8Array.from(atob(fonts[filename]), ch => ch.charCodeAt(0));
  }
}
const imageOps = new Set(Object.entries(OPS).filter(([k]) => /Image|paintXObject|beginInlineImage|beginImageData/.test(k)).map(([, v]) => v));
function hasEntries(value) { return value instanceof Map || value instanceof Set ? value.size > 0 : value && Object.keys(value).length > 0; }
function progress(message) { self.postMessage({ type: 'progress', message }); }
async function inspect(bytes, name, mime) {
  validatePdfUpload(bytes, name, mime);
  if (!globalThis.OffscreenCanvas) throw new PdfError('This browser does not support local PDF rendering.');
  warned = false;
  const task = getDocument({ data: bytes, verbosity: 1, stopAtErrors: true, useWorkerFetch: false, useSystemFonts: false, disableFontFace: true, useWasm: false, enableXfa: false, disableWorkerRendering: true, disableRange: true, disableStream: true, disableAutoFetch: true, isImageDecoderSupported: false, maxImageSize: PDF_LIMITS.pagePixels, canvasMaxAreaInBytes: PDF_LIMITS.pagePixels * 4, CanvasFactory, BinaryDataFactory });
  task.onPassword = () => { task.destroy(); };
  let doc;
  try {
    doc = await task.promise;
    if (doc.numPages < 1 || doc.numPages > PDF_LIMITS.pages) throw new PdfError('PDF supports 1–10 pages.');
    const metadata = await doc.getMetadata();
    if (metadata.info.EncryptFilterName || await doc.getPermissions() !== null) throw new PdfError('Encrypted PDFs are unsupported, including empty-password encryption.');
    if (metadata.info.IsAcroFormPresent || metadata.info.IsXFAPresent || metadata.info.IsSignaturesPresent || metadata.info.IsCollectionPresent || doc.isPureXfa || hasEntries(await doc.getFieldObjects()) || hasEntries(await doc.getJSActions()) || hasEntries(await doc.getAttachments()) || await doc.getOpenAction()) throw new PdfError('PDF forms, scripts, attachments and document actions are unsupported.');
    const optional = await doc.getOptionalContentConfig();
    if ([...optional].length) throw new PdfError('PDF optional/hidden layers are unsupported.');
    const pages = [], review = []; let totalText = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      progress(`Rendering PDF page ${i} of ${doc.numPages} locally…`);
      const page = await doc.getPage(i);
      if (page.rotate !== 0 || page.userUnit !== 1) throw new PdfError('Rotated or scaled PDF page coordinates are unsupported.');
      if ((await page.getAnnotations({ intent: 'any' })).length || hasEntries(await page.getJSActions())) throw new PdfError('PDF annotations, links, actions and signatures are unsupported.');
      const viewport = page.getViewport({ scale: 2 });
      const size = { width: Math.ceil(viewport.width), height: Math.ceil(viewport.height), widthPt: viewport.width / 2, heightPt: viewport.height / 2 };
      validatePages([...pages, size], false);
      const ops = await page.getOperatorList({ annotationMode: AnnotationMode.DISABLE });
      if (ops.fnArray.length > 30000) throw new PdfError('PDF drawing complexity exceeds limits.');
      if (ops.fnArray.some(op => imageOps.has(op))) throw new PdfError('Scanned or mixed image PDF pages require OCR, which is unsupported. No page was skipped.');
      if (ops.fnArray.some(op => [OPS.shadingFill, OPS.beginGroup, OPS.setFillColorN, OPS.setStrokeColorN].includes(op))) throw new PdfError('Unsupported PDF transparency, pattern or shading content.');
      if (ops.fnArray.some((op, n) => op === OPS.setTextRenderingMode && ops.argsArray[n][0] !== 0)) throw new PdfError('Invisible, clipped or stroked PDF text is unsupported.');
      const content = await page.getTextContent();
      const text = pdfTextModel(content, viewport, Util.transform);
      totalText += text.text.length;
      if (totalText > 100000) throw new PdfError('PDF exceeds 100,000 extracted characters.');
      const canvas = new OffscreenCanvas(size.width, size.height), ctx = canvas.getContext('2d', { willReadFrequently: true });
      await page.render({ canvasContext: ctx, viewport, annotationMode: AnnotationMode.DISABLE, background: 'rgb(255,255,255)' }).promise;
      if (warned) throw new PdfError('PDF parsing/rendering reported a warning; reliable processing could not be verified.');
      const rgba = ctx.getImageData(0, 0, size.width, size.height).data;
      const rgb = new Uint8Array(size.width * size.height * 3);
      for (let n = 0, at = 0; n < rgba.length; n += 4) { rgb[at++] = rgba[n]; rgb[at++] = rgba[n + 1]; rgb[at++] = rgba[n + 2]; }
      const png = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let binary = ''; for (let n = 0; n < png.length; n += 8192) binary += String.fromCharCode(...png.subarray(n, n + 8192));
      pages.push({ ...size, rgb });
      review.push({ ...size, ...text, preview: 'data:image/png;base64,' + btoa(binary) });
      canvas.width = canvas.height = 0; page.cleanup();
    }
    const matches = detectPdf(review);
    model = pages;
    return { pages: review, matches };
  } finally { await task.destroy(); }
}
self.onmessage = async ({ data }) => {
  if (processing) return;
  processing = true;
  try {
    if (data.type === 'inspect') {
      model = null;
      const pdf = await inspect(new Uint8Array(data.bytes), data.name, data.mime);
      self.postMessage({ type: 'inspected', format: 'pdf', pdf });
    } else if (data.type === 'export' && model) {
      progress('Overwriting approved pixels and verifying a fresh raster-only PDF…');
      const bytes = exportRasterPdf(model, data.ranges, data.reviewed);
      self.postMessage({ type: 'exported', format: 'pdf', bytes: bytes.buffer }, [bytes.buffer]);
    } else throw new PdfError('Open a supported PDF first.');
  } catch (error) {
    // Only our static errors are exposed; parser/library messages may contain confidential values.
    self.postMessage({ type: 'error', message: error instanceof PdfError ? error.message : 'PDF processing failed: malformed, encrypted or unsupported document. No output was created.' });
  } finally { processing = false; }
};

