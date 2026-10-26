'use client';
import { useRef, useState } from 'react';
import { detectPdf } from '../../lib/redactor/pdf-geometry.mjs';
import { pagePoint, editBox } from '../../lib/redactor/pdf-view.mjs';

export default function PdfReview({ pdf, busy, onExport, onReviewChange }) {
  const [pageIndex, setPageIndex] = useState(0), [regions, setRegions] = useState(pdf.matches);
  const [terms, setTerms] = useState(''), [pagesReviewed, setPagesReviewed] = useState(pdf.pages.map(() => false));
  const [final, setFinal] = useState(false), [error, setError] = useState('');
  const [box, setBox] = useState({ x: 0, y: 0, width: 100, height: 40 });
  const [zoom, setZoom] = useState(1), [mode, setMode] = useState('select'), [hasDraft, setHasDraft] = useState(false), [loaded, setLoaded] = useState(null);
  const drag = useRef(null);
  const viewport = useRef(null);
  const page = pdf.pages[pageIndex];
  function invalidate() { setPagesReviewed(pdf.pages.map(() => false)); setFinal(false); onReviewChange?.(); }
  function update(next) { if (next.length > 2000) { setError('At most 2,000 PDF regions are supported.'); return; } setRegions(next); invalidate(); setError(''); }
  function validBox() {
    if (![box.x, box.y, box.width, box.height].every(Number.isInteger) || box.x < 0 || box.y < 0 || box.width < 2 || box.height < 2 || box.x + box.width > page.width || box.y + box.height > page.height) { setError('Choose an integer region of at least 2 × 2 pixels inside this page.'); return false; }
    return true;
  }
  function add(index = null) {
    if (!validBox()) return;
    const next = { ...box, page: pageIndex, kind: 'Manual', enabled: true };
    update(index === null ? [...regions, next] : regions.map((r, i) => i === index ? next : r));
    setHasDraft(false); setLoaded(null);
  }
  function point(event) {
    return pagePoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), page);
  }
  function changePage(value) {
    setPageIndex(value); setHasDraft(false); setLoaded(null); drag.current = null;
    setBox({ x: 0, y: 0, width: 100, height: 40 });
    if (viewport.current) viewport.current.scrollTo(0, 0);
  }
  function begin(event) {
    if (busy || event.button !== 0) return;
    const handle = event.target.dataset.pdfHandle;
    drag.current = { start: point(event), box, clientX: event.clientX, clientY: event.clientY, left: viewport.current.scrollLeft, top: viewport.current.scrollTop, type: handle || mode };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (drag.current.type !== 'pan') { invalidate(); setHasDraft(true); }
  }
  function move(event) {
    const d = drag.current; if (!d || busy) return;
    if (d.type === 'pan') {
      viewport.current.scrollLeft = d.left - (event.clientX - d.clientX);
      viewport.current.scrollTop = d.top - (event.clientY - d.clientY); return;
    }
    const p = point(event), dx = p.x - d.start.x, dy = p.y - d.start.y;
    if (d.type === 'move' || d.type === 'resize') setBox(editBox(d.box, dx, dy, page, d.type === 'resize'));
    else setBox({ x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), width: Math.abs(dx), height: Math.abs(dy) });
  }
  function keyboard(event) {
    if (busy) return;
    if (event.key === 'Escape') { drag.current = null; setHasDraft(false); setLoaded(null); return; }
    const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!steps[event.key]) return;
    event.preventDefault();
    const [dx, dy] = steps[event.key].map(n => n * (event.altKey ? 10 : 1));
    if (mode === 'pan') { viewport.current.scrollBy(dx * 30, dy * 30); return; }
    setBox(editBox(box, dx, dy, page, event.shiftKey)); setHasDraft(true); invalidate();
  }
  return <>
    <section className="redactor-card pdf-policy">
      <h2>PDF page review</h2>
      <div className="review-progress"><progress value={pagesReviewed.filter(Boolean).length} max={pdf.pages.length} aria-label="PDF pages reviewed" /><span>{pagesReviewed.filter(Boolean).length} / {pdf.pages.length} pages reviewed · {regions.filter(r => r.enabled).length} selected regions</span></div>
      <p>Raster-only export at 144 DPI. Selected pixels are overwritten before a fresh PDF is built. Original text, metadata and objects are not retained. Output loses searchable text, accessibility tags and signatures. OCR is unavailable; scanned, mixed-image and unsupported pages are rejected.</p>
      <p>Suggestions cover whole text runs, sometimes an entire line. Review the rendered page and extracted text. Add missed names, unusual identifiers or vector-drawn text manually. Coordinates use preview pixels; x/y start at the top left. Every changed decision resets all review acknowledgements.</p>
      <label htmlFor="pdf-page">Page</label>
      <select id="pdf-page" disabled={busy} value={pageIndex} onChange={e => changePage(Number(e.target.value))}>{pdf.pages.map((_, i) => <option value={i} key={i}>Page {i + 1}{pagesReviewed[i] ? ' · Reviewed' : ' · Review required'}</option>)}</select>
    </section>
    <div className="redactor-grid">
      <section className="redactor-card">
        <h2>Page {pageIndex + 1} preview</h2>
        <div className="pdf-toolbar" aria-label="PDF view controls">
          <button type="button" disabled={busy || zoom <= 1} aria-label="Zoom out PDF" onClick={() => setZoom(Math.max(1, zoom - .25))}>−</button>
          <output aria-label="PDF zoom">{Math.round(zoom * 100)}%</output>
          <button type="button" disabled={busy || zoom >= 3} aria-label="Zoom in PDF" onClick={() => setZoom(Math.min(3, zoom + .25))}>+</button>
          <button type="button" disabled={busy} onClick={() => { setZoom(1); viewport.current.scrollTo(0, 0); }}>Fit page</button>
          <button type="button" disabled={busy} aria-pressed={mode === 'select'} onClick={() => setMode('select')}>Select region</button>
          <button type="button" disabled={busy} aria-pressed={mode === 'pan'} onClick={() => setMode('pan')}>Pan page</button>
        </div>
        <p id="pdf-keyboard-help">Drag to select; load a region to move its draft or resize its corner. Focus the preview: arrows move, Shift+arrows resize, Alt increases the step to 10 pixels. Pan mode arrows scroll. Escape clears the draft. Apply edits explicitly.</p>
        <div ref={viewport} className="pdf-viewport" tabIndex={0} role="region" aria-label="Scrollable PDF canvas">
        <div className="pdf-preview" tabIndex={0} role="group" aria-describedby="pdf-keyboard-help" aria-label={`PDF page ${pageIndex + 1} preview`} data-mode={mode} style={{ width: `${zoom * 100}%`, aspectRatio: `${page.width} / ${page.height}` }} onKeyDown={keyboard} onPointerDown={begin} onPointerMove={move} onPointerUp={e => { move(e); drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          {/* The source is a locally generated data URL, never document-provided HTML or a remote URL. */}
          <img src={page.preview} alt={`Rendered PDF page ${pageIndex + 1}`} draggable={false} />
          {regions.map((r, i) => r.page === pageIndex && r.enabled && <span key={i} className="pdf-region" style={{ left: `${r.x / page.width * 100}%`, top: `${r.y / page.height * 100}%`, width: `${r.width / page.width * 100}%`, height: `${r.height / page.height * 100}%` }} />)}
          {hasDraft && <span className="pdf-region pdf-draft" data-pdf-handle="move" style={{ left: `${box.x / page.width * 100}%`, top: `${box.y / page.height * 100}%`, width: `${box.width / page.width * 100}%`, height: `${box.height / page.height * 100}%` }}><span className="pdf-resize-handle" data-pdf-handle="resize" /></span>}
        </div>
        </div>
        <div className="pdf-coordinates">{['x', 'y', 'width', 'height'].map(key => <label key={key} htmlFor={`pdf-${key}`}>{key}<input id={`pdf-${key}`} type="number" min="0" step="1" disabled={busy} value={box[key]} onChange={e => { setBox({ ...box, [key]: Number(e.target.value) }); setHasDraft(true); invalidate(); }} /></label>)}</div>
        <button type="button" disabled={busy} onClick={() => add()}>Add PDF region</button>
        {loaded !== null && <button type="button" disabled={busy} onClick={() => add(loaded)}>Apply to loaded region</button>}
        {hasDraft && <><button type="button" disabled={busy} onClick={() => { setHasDraft(false); setLoaded(null); }}>Discard draft</button><p className="pdf-pending">Draft not applied. Add it, apply it to the loaded region, or discard it before final review.</p></>}
        <details><summary>Extracted page text — detection aid</summary><pre className="redactor-preview">{page.text}</pre></details>
        <label className="redactor-check"><input type="checkbox" disabled={busy} checked={pagesReviewed[pageIndex]} onChange={e => { setPagesReviewed(pagesReviewed.map((v, i) => i === pageIndex ? e.target.checked : v)); setFinal(false); }} />I reviewed this entire PDF page and all proposed regions.</label>
      </section>
      <section className="redactor-card">
        <h2>Adjust PDF removals <span className="redactor-count">{regions.length}</span></h2>
        <label htmlFor="pdf-terms">Additional literal terms (one per line, case sensitive)</label>
        <textarea id="pdf-terms" disabled={busy} value={terms} maxLength={6030} autoComplete="off" spellCheck={false} onChange={e => { setTerms(e.target.value); invalidate(); }} />
        <button type="button" disabled={busy} onClick={() => { try {
          const found = detectPdf(pdf.pages, terms.split('\n').map(t => t.trim()).filter(Boolean)).filter(r => r.kind === 'Custom term');
          const next = [...regions];
          for (const r of found) if (!next.some(a => a.page === r.page && a.x === r.x && a.y === r.y && a.width === r.width && a.height === r.height)) next.push(r);
          update(next);
        } catch (e) { setError(e.message); } }}>Add matching PDF terms</button>
        <ul className="redactor-matches">{regions.map((r, i) => r.page === pageIndex && <li key={i}>
          <label className="redactor-check"><input type="checkbox" disabled={busy} aria-label={`Include PDF region ${i + 1}`} checked={r.enabled} onChange={e => update(regions.map((a, n) => n === i ? { ...a, enabled: e.target.checked } : a))} />{r.kind} · Page {r.page + 1}</label>
          <small>x {r.x}, y {r.y}, width {r.width}, height {r.height}</small>
          <div className="redactor-actions">
            <button type="button" disabled={busy} aria-label={`Load PDF region ${i + 1}`} onClick={() => { setBox({ x: r.x, y: r.y, width: r.width, height: r.height }); setHasDraft(true); setLoaded(i); invalidate(); }}>Load coordinates</button>
            <button type="button" disabled={busy} aria-label={`Adjust PDF region ${i + 1}`} onClick={() => add(i)}>Apply coordinates</button>
            <button type="button" disabled={busy} aria-label={`Remove PDF region ${i + 1}`} onClick={() => { update(regions.filter((_, n) => n !== i)); setLoaded(null); setHasDraft(false); }}>Remove</button>
          </div>
        </li>)}</ul>
        {!regions.some(r => r.page === pageIndex) && <p>No regions on this page. Inspect it manually before acknowledging review.</p>}
      </section>
    </div>
    {error && <p role="alert" className="redactor-error">{error}</p>}
    <section className="redactor-card redactor-export">
      <h2>Human review & verified PDF export</h2>
      <p>Only approved regions are removed. Pixel verification does not detect confidential information you missed or regions you made too small. Inspect the downloaded PDF before sharing.</p>
      <label className="redactor-check"><input type="checkbox" disabled={busy || hasDraft || !pagesReviewed.every(Boolean)} checked={final} onChange={e => setFinal(e.target.checked)} />I reviewed every PDF page and selected region, added missed sensitive content, and accept raster-only output. I will inspect the exported PDF before sharing.</label>
      <button type="button" className="redactor-primary" disabled={busy || hasDraft || !final || !pagesReviewed.every(Boolean) || !regions.some(r => r.enabled)} onClick={() => { setFinal(false); onExport(regions.filter(r => r.enabled), { final, pages: pagesReviewed }); }}>Verify & download PDF</button>
    </section>
  </>;
}
