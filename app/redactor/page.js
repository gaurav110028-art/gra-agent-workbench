'use client';

import { useEffect, useRef, useState } from 'react';
import { detect, mergeRanges } from '../../lib/redactor/detect.mjs';
import './redactor.css';
import XlsxReview from './XlsxReview';
import PdfReview from './PdfReview';
import ThemeToggle from '../ThemeToggle';

const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default function RedactorPage() {
  const worker = useRef(null);
  const timer = useRef(null);
  const selection = useRef(null);
  const upload = useRef(null);
  const errorFocus = useRef(null);
  const [text, setText] = useState('');
  const [workbook, setWorkbook] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [ranges, setRanges] = useState([]);
  const [terms, setTerms] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Choose a supported DOCX, XLSX or selectable-text PDF to begin.');
  const [theme, setTheme] = useState('dark'), [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    let saved = 'dark';
    try { saved = localStorage.getItem('gra-theme') === 'light' ? 'light' : 'dark'; } catch { /* Theme storage is optional; document processing is not. */ }
    setTheme(saved); document.documentElement.setAttribute('data-theme', saved);
    return () => { worker.current?.terminate(); clearTimeout(timer.current); };
  }, []);
  useEffect(() => { if (error) errorFocus.current?.focus(); }, [error]);

  function clear() {
    worker.current?.terminate(); worker.current = null;
    clearTimeout(timer.current);
    setText(''); setWorkbook(null); setPdf(null); setRanges([]); setTerms(''); setReviewed(false); setError(''); setBusy(false); setDownloaded(false);
    setStatus('Document cleared from this workspace.');
    if (upload.current) upload.current.value = '';
  }
  function update(next) {
    if (next.length > 2000) { setError('At most 2,000 proposals are supported. Use a smaller document.'); return; }
    setRanges(next); setReviewed(false); setStatus('Review the updated selections before export.');
    setDownloaded(false);
  }
  function reviewChanged() { setDownloaded(false); setStatus('Review updated decisions and confirm every required acknowledgement before export.'); }
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('gra-theme', next); } catch { /* Only a non-sensitive theme preference may be persisted. */ }
  }
  function deadline(pdfProcessing = false) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      worker.current?.terminate(); worker.current = null;
      setBusy(false); setText(''); setWorkbook(null); setPdf(null); setRanges([]); setReviewed(false);
      setTerms(''); setDownloaded(false); if (upload.current) upload.current.value = '';
      setError(`Processing exceeded ${pdfProcessing ? 45 : 15} seconds. The document was closed; try a smaller supported file.`);
    }, pdfProcessing ? 45000 : 15000);
  }
  async function open(file) {
    clear();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Maximum file size is 5 MiB.'); return; }
    if (!/\.(docx|xlsx|pdf)$/i.test(file.name)) {
      setError('Macro-enabled, binary and legacy formats are unsupported. Choose a restricted DOCX, XLSX or text PDF.'); return;
    }
    setBusy(true); setStatus('Inspecting the document locally…');
    let current;
    const isPdf = /\.pdf$/i.test(file.name);
    try { current = isPdf ? new Worker(new URL('../../lib/redactor/pdf.worker.js', import.meta.url)) : new Worker(new URL('../../lib/redactor/redactor.worker.js', import.meta.url)); }
    catch { setBusy(false); setError('This browser could not start the local processor. Use a current browser with Web Worker support.'); return; }
    worker.current = current;
    current.onmessage = ({ data }) => {
      if (worker.current !== current) return;
      if (data.type === 'progress') { setStatus(data.message); return; }
      if (!['error', 'inspected', 'exported'].includes(data.type)) return;
      clearTimeout(timer.current); setBusy(false); setError('');
      if (data.type === 'error') { setError(data.message); setStatus('No output was created.'); return; }
      if (data.type === 'inspected') {
        if (data.format === 'pdf') {
          setPdf(data.pdf); setStatus(`${data.pdf.matches.length} proposed PDF regions across ${data.pdf.pages.length} pages. Review every page; OCR is unavailable.`); return;
        }
        if (data.format === 'xlsx') {
          setWorkbook(data.workbook);
          setStatus(`Initial scan: ${data.workbook.matches.length} proposed redactions across ${data.workbook.sheets.length} worksheets. Review hidden data and all supported cells.`);
          return;
        }
        try {
          const found = detect(data.text);
          setText(data.text); setRanges(found);
          setStatus(`${found.length} proposed redactions. Review every paragraph; detection is heuristic.`);
        } catch (e) { clear(); setError(e.message); }
      }
      if (data.type === 'exported') {
        const url = URL.createObjectURL(new Blob([data.bytes], { type: data.format === 'pdf' ? 'application/pdf' : data.format === 'xlsx' ? XLSX_MIME : MIME }));
        const link = document.createElement('a');
        link.href = url; link.download = `gra-redacted-review-required.${data.format === 'pdf' ? 'pdf' : data.format === 'xlsx' ? 'xlsx' : 'docx'}`;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        setReviewed(false);
        setDownloaded(true);
        setStatus(`Approved removals verified. Download created. Open and inspect it in ${data.format === 'pdf' ? 'a PDF reader' : data.format === 'xlsx' ? 'Excel' : 'Word'} before sharing; verification cannot find missed sensitive content.`);
      }
    };
    current.onerror = () => {
      if (worker.current !== current) return;
      current.terminate(); worker.current = null; clearTimeout(timer.current);
      setBusy(false); setText(''); setWorkbook(null); setPdf(null); setTerms(''); setDownloaded(false); if (upload.current) upload.current.value = ''; setError('The local processor failed. Reopen a supported document.');
    };
    deadline(isPdf);
    try {
      const bytes = await file.arrayBuffer();
      if (worker.current === current) current.postMessage({ type: 'inspect', bytes, name: file.name, mime: file.type }, [bytes]);
    } catch { if (worker.current === current) { clear(); setError('Could not read this file.'); } }
  }
  function addSelection(index = null) {
    const el = selection.current;
    const next = { start: el.selectionStart, end: el.selectionEnd, kind: 'Manual' };
    try {
      mergeRanges(text, [next]);
      update(index === null ? [...ranges, next] : ranges.map((r, i) => i === index ? next : r));
      setError('');
    } catch (e) { setError(e.message); }
  }
  function custom() {
    try {
      const found = detect(text, terms.split('\n').map(t => t.trim()).filter(Boolean)).filter(r => r.kind === 'Custom term');
      const unique = [...ranges];
      for (const r of found) if (!unique.some(a => a.start === r.start && a.end === r.end)) unique.push(r);
      update(unique); setError('');
    } catch (e) { setError(e.message); }
  }
  let merged = [];
  try { merged = mergeRanges(text, ranges); } catch { /* Export validates again. */ }
  const chunks = [];
  let end = 0;
  for (const r of merged) {
    chunks.push(text.slice(end, r.start), <mark key={r.start}>{text.slice(r.start, r.end)}</mark>);
    end = r.end;
  }
  chunks.push(text.slice(end));

  return (
    <main className="redactor" id="redactor-main">
      <a className="skip-link" href="#document-upload">Skip to document upload</a>
      <header className="redactor-header">
        <a href="/" className="redactor-back">← GRA Agent Workbench</a>
        <ThemeToggle theme={theme} onToggle={toggleTheme} className="redactor-theme" />
        <a href="/logout" className="redactor-back">Sign out</a>
        <span className="redactor-badge">LOCAL PROCESSING · RESTRICTED DOCX / XLSX / PDF</span>
      </header>
      <section className="redactor-intro">
        <p className="redactor-eyebrow">CONFIDENTIAL DOCUMENT TOOLS</p>
        <h1>GRA Secure Document Redactor</h1>
        <p>Find sensitive identifiers. Review every removal. Export a rebuilt document.</p>
      </section>
      <div className="redactor-formats" aria-label="Supported document formats">
        <article><span className="format-tag">DOCX</span><h2>Plain body text</h2><p>Basic direct formatting. Tables, images, comments and complex Word structures are blocked.</p></article>
        <article><span className="format-tag">XLSX</span><h2>Values-only workbooks</h2><p>Review all sheets and hidden cells. Formulas and advanced Excel features block export.</p></article>
        <article><span className="format-tag">PDF</span><h2>Selectable text</h2><p>Up to 10 pages. Raster-only output. Scans, mixed images (including logos) and OCR are unsupported.</p></article>
      </div>
      <aside className="redactor-notice">
        <strong>Supported: restricted DOCX, XLSX and text PDF · 5 MiB maximum</strong>
        <details><summary>Full format limits and output trade-offs</summary>
        <p>DOCX supports plain body text with basic direct formatting. Tables, images, headers, footers, comments, revisions, fields, links, hidden text and embedded/custom XML content are rejected. XLSX supports multiple sheets and ordinary cells with limited direct formatting; hidden data is exposed for review. Formulas/caches can be inspected, but formulas and unsupported workbook features block export. XLSX sheet names are replaced and output sheets, rows and columns are unhidden. PDF supports up to 10 ordinary text pages, exported as fresh raster-only pages with no selectable text. Scanned/mixed-image PDFs, OCR, rotated text, annotations/forms, scripts, attachments, hidden layers, encryption, macro-enabled and legacy formats are unsupported. Metadata is stripped.</p>
        </details><p>Document processing stays in this tab. No document uploads or AI calls. Detection is heuristic; review every page, cell or paragraph and inspect the downloaded file before sharing.</p>
      </aside>
      <ol className="redactor-steps" aria-label="Redaction stages"><li aria-current={!text && !pdf && !workbook ? 'step' : undefined}>01 <span>Open locally</span></li><li aria-current={(text || pdf || workbook) && !downloaded ? 'step' : undefined}>02 <span>Review removals</span></li><li aria-current={downloaded ? 'step' : undefined}>03 <span>Verify & download</span></li></ol>
      <section className="redactor-card redactor-upload" aria-label="Local document upload" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (busy) return; if (e.dataTransfer.files.length !== 1) { setError('Choose one supported file at a time.'); return; } open(e.dataTransfer.files[0]); }}>
        <label htmlFor="document-upload"><strong>Open a document</strong><span>Drop one PDF, DOCX or XLSX here, or choose a file · maximum 5 MiB.</span></label>
        <input ref={upload} id="document-upload" type="file" accept=".docx,.pdf,.xlsx" disabled={busy} onChange={e => open(e.target.files?.[0])} />
        <button type="button" onClick={clear}>Clear document</button>
        {busy && <button type="button" onClick={clear}>Cancel processing</button>}
      </section>
      <p role="status" aria-live="polite" aria-atomic="true" className={`redactor-status${downloaded ? ' is-verified' : ''}`}><strong>{busy ? 'Processing locally · ' : downloaded ? 'Verified download · ' : 'Workspace · '}</strong>{status}</p>
      {error && <p ref={errorFocus} tabIndex={-1} role="alert" className="redactor-error">{error}</p>}
      {!busy && !text && !pdf && !workbook && !error && <div className="redactor-empty"><h2>Your private review workspace</h2><p>Open a supported document to see proposed removals. Documents and review decisions are held only in memory. Clear the workspace when finished.</p></div>}
      {pdf && <PdfReview pdf={pdf} busy={busy} onReviewChange={reviewChanged} onExport={(selections, confirmed) => {
        if (!worker.current) { setError('Reopen the PDF before exporting.'); return; }
        setBusy(true); setError(''); setStatus('Overwriting pixels and verifying the PDF locally…'); deadline(true);
        worker.current.postMessage({ type: 'export', ranges: selections, reviewed: confirmed });
      }} />}
      {workbook && <XlsxReview workbook={workbook} busy={busy} onReviewChange={reviewChanged} onExport={(selections, confirmed) => {
        if (!worker.current) { setError('Reopen the workbook before exporting.'); return; }
        setBusy(true); setError(''); setStatus('Rebuilding and verifying the XLSX locally…'); deadline();
        worker.current.postMessage({ type: 'export', ranges: selections, reviewed: confirmed });
      }} />}
      {text && <>
        <div className="redactor-grid">
          <section className="redactor-card">
            <h2>02 / Review the text</h2><p className="review-summary">{ranges.length} selected removals · {text.length.toLocaleString()} characters · {reviewed ? 'Review acknowledged' : 'Human review required'}</p>
            <p>Highlights are proposed removals. This text preview is not a paginated Word rendering. Offsets start at zero.</p>
            <div className="redactor-preview" aria-label="Highlighted document preview">{chunks}</div>
            <label htmlFor="manual-selection">Select text below to add a removal or correct a proposal</label>
            <textarea ref={selection} id="manual-selection" value={text} readOnly spellCheck={false} autoComplete="off" className="redactor-selection" disabled={busy} />
            <button type="button" disabled={busy} onClick={() => addSelection()}>Add selected text</button>
          </section>
          <section className="redactor-card">
            <h2>03 / Adjust removals <span className="redactor-count">{ranges.length}</span></h2>
            <p>PAN, Aadhaar, GSTIN, TAN, phone, email, labelled bank accounts and IFSC are suggested automatically.</p>
            <label htmlFor="custom-terms">Additional literal terms (one per line, case sensitive)</label>
            <textarea id="custom-terms" value={terms} onChange={e => { setTerms(e.target.value); setReviewed(false); reviewChanged(); }} autoComplete="off" spellCheck={false} maxLength={6030} disabled={busy} rows={3} placeholder="Client name or another sensitive phrase" />
            <button type="button" disabled={busy} onClick={custom}>Add matching terms</button>
            <ul className="redactor-matches">
              {ranges.map((r, i) => <li key={`${i}-${r.start}`}>
                <div><strong>{r.kind}</strong><small>{r.start}–{r.end}</small></div>
                <code>{text.slice(r.start, r.end)}</code>
                <div className="redactor-actions">
                  <button type="button" disabled={busy} aria-label={`Locate DOCX proposal ${i + 1}`} onClick={() => { selection.current.focus(); selection.current.setSelectionRange(r.start, r.end); selection.current.scrollIntoView({ block: 'center' }); }}>Locate in text</button>
                  <button type="button" disabled={busy} onClick={() => addSelection(i)} aria-label={`Replace proposal ${i + 1} with selected text`}>Use selection</button>
                  <button type="button" disabled={busy} onClick={() => update(ranges.filter((_, n) => n !== i))} aria-label={`Remove proposal ${i + 1}`}>Remove</button>
                </div>
              </li>)}
            </ul>
            {!ranges.length && <p>No selections. Add manual removals before exporting.</p>}
          </section>
        </div>
        <section className="redactor-card redactor-export">
          <h2>04 / Human review & verified export</h2>
          <p>Selected characters are replaced with [REDACTED] in a fresh DOCX package. Export is blocked if approved values survive verification. Removing a short/common fragment may therefore require a wider selection.</p>
          <label className="redactor-check"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} />I reviewed every paragraph and selection, added missed sensitive content, and accept the formatting limitations. I will inspect the exported file in Word before sharing.</label>
          <button type="button" className="redactor-primary" disabled={!reviewed || !ranges.length || busy} onClick={() => {
            if (!worker.current) { setError('Reopen the document before exporting.'); return; }
            setBusy(true); setError(''); setStatus('Rebuilding and verifying the export locally…'); deadline();
            worker.current.postMessage({ type: 'export', ranges, reviewed });
          }}>{busy ? 'Processing…' : 'Verify & download DOCX'}</button>
        </section>
      </>}
    </main>
  );
}
