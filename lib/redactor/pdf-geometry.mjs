import { detect } from './detect.mjs';
import { PdfError } from './pdf-raster.mjs';
// Conservative whole-text-run boxes avoid unreliable proportional character-width masking.
export function pdfTextModel(content, viewport, transform) {
  const runs = []; let text = '';
  if (!Array.isArray(content.items) || content.items.length > 2000) throw new PdfError('PDF text complexity exceeds limits.');
  for (const item of content.items) {
    if (typeof item.str !== 'string') continue;
    if (!item.str.trim()) continue;
    if (item.str.length > 10000 || item.dir !== 'ltr' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(item.str)) throw new PdfError('Unsupported or ambiguous PDF text encoding/direction.');
    const t = transform(viewport.transform, item.transform);
    if (!t.every(Number.isFinite) || Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01 || t[0] <= 0 || t[3] >= 0 || !Number.isFinite(item.width) || item.width <= 0) throw new PdfError('Rotated, skewed or ambiguous PDF text regions are unsupported.');
    const h = Math.abs(t[3]);
    if (h < 3 || h > 240) throw new PdfError('Unsupported PDF text dimensions.');
    const style = content.styles[item.fontName];
    if (!style || style.vertical) throw new PdfError('Unsupported PDF font mapping.');
    const ascent = Number.isFinite(style.ascent) ? Math.max(1, style.ascent) : 1.2;
    const descent = Number.isFinite(style.descent) ? Math.min(-0.3, style.descent) : -0.4;
    const pad = Math.max(3, h * 0.25);
    const left = Math.floor(t[4] - pad), top = Math.floor(t[5] - h * ascent - pad);
    const right = Math.ceil(t[4] + item.width * viewport.scale + pad), bottom = Math.ceil(t[5] - h * descent + pad);
    if (left < 0 || top < 0 || right > Math.ceil(viewport.width) || bottom > Math.ceil(viewport.height)) throw new PdfError('PDF text extends outside the supported page; export is blocked.');
    const previous = runs.at(-1);
    if (previous) text += Math.abs(previous.baseline - t[5]) > h * 0.5 ? '\n' : t[4] - previous.right > h * 0.15 ? ' ' : '';
    const start = text.length; text += item.str;
    runs.push({ text: item.str, start, end: text.length, x: left, y: top, width: right - left, height: bottom - top, baseline: t[5], right: t[4] + item.width * viewport.scale });
  }
  if (!runs.length) throw new PdfError('Scanned, image-only, blank or undetectable PDF page: local OCR is not supported. No page was skipped.');
  if (text.length > 100000) throw new PdfError('PDF text exceeds processing limits.');
  return { text, runs };
}
export function detectPdf(pages, terms = []) {
  const result = [];
  pages.forEach((p, page) => {
    for (const m of detect(p.text, terms)) {
      const runs = p.runs.filter(r => r.start < m.end && r.end > m.start);
      if (!runs.length) throw new PdfError('Sensitive text could not be mapped to a PDF region.');
      for (const r of runs) {
        if (!result.some(a => a.page === page && a.x === r.x && a.y === r.y && a.width === r.width && a.height === r.height)) result.push({ page, x: r.x, y: r.y, width: r.width, height: r.height, kind: m.kind, enabled: true });
      }
      if (result.length > 2000) throw new PdfError('Too many PDF regions. Use a smaller document.');
    }
  });
  return result;
}

