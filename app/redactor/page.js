'use client';

import { useEffect, useRef, useState } from 'react';
import { detect, mergeRanges } from '../../lib/redactor/detect.mjs';
import './redactor.css';

const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default function RedactorPage() {
  const worker = useRef(null);
  const timer = useRef(null);
  const selection = useRef(null);
  const upload = useRef(null);
  const [text, setText] = useState('');
  const [ranges, setRanges] = useState([]);
  const [terms, setTerms] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Choose a supported DOCX to begin.');

  useEffect(() => {
    return () => { worker.current?.terminate(); clearTimeout(timer.current); };
  }, []);

  function clear() {
    worker.current?.terminate(); worker.current = null;
    clearTimeout(timer.current);
    setText(''); setRanges([]); setTerms(''); setReviewed(false); setError(''); setBusy(false);
    setStatus('Document cleared from this workspace.');
    if (upload.current) upload.current.value = '';
  }
  function update(next) {
    if (next.length > 2000) { setError('At most 2,000 proposals are supported. Use a smaller document.'); return; }
    setRanges(next); setReviewed(false); setStatus('Review the updated selections before export.');
  }
  function deadline() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      worker.current?.terminate(); worker.current = null;
      setBusy(false); setText(''); setRanges([]); setReviewed(false);
      setError('Processing exceeded 15 seconds. The document was closed; try a smaller supported DOCX.');
    }, 15000);
  }
  async function open(file) {
    clear();
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Maximum file size is 5 MiB.'); return; }
    if (!/\.docx$/i.test(file.name)) {
      setError('PDF (including scans) and XLSX are unsupported in this increment. Choose a plain text DOCX.'); return;
    }
    setBusy(true); setStatus('Inspecting the document locally…');
    let current;
    try { current = new Worker(new URL('../../lib/redactor/redactor.worker.js', import.meta.url)); }
    catch { setBusy(false); setError('This browser could not start the local processor. Use a current browser with Web Worker support.'); return; }
    worker.current = current;
    current.onmessage = ({ data }) => {
      if (worker.current !== current) return;
      clearTimeout(timer.current); setBusy(false); setError('');
      if (data.type === 'error') { setError(data.message); setStatus('No output was created.'); return; }
      if (data.type === 'inspected') {
        try {
          const found = detect(data.text);
          setText(data.text); setRanges(found);
          setStatus(`${found.length} proposed redactions. Review every paragraph; detection is heuristic.`);
        } catch (e) { clear(); setError(e.message); }
      }
      if (data.type === 'exported') {
        const url = URL.createObjectURL(new Blob([data.bytes], { type: MIME }));
        const link = document.createElement('a');
        link.href = url; link.download = 'gra-redacted-review-required.docx';
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        setReviewed(false);
        setStatus('Approved removals verified. Download created. Open and inspect it in Word before sharing; verification cannot find missed sensitive content.');
      }
    };
    current.onerror = () => {
      if (worker.current !== current) return;
      current.terminate(); worker.current = null; clearTimeout(timer.current);
      setBusy(false); setError('The local processor failed. Reopen a supported document.');
    };
    deadline();
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
    <main className="redactor">
      <header className="redactor-header">
        <a href="/" className="redactor-back">← GRA Agent Workbench</a>
        <a href="/logout" className="redactor-back">Sign out</a>
        <span className="redactor-badge">Local processing</span>
      </header>
      <section className="redactor-intro">
        <h1>GRA Secure Document Redactor</h1>
        <p>Find sensitive identifiers. Review every removal. Export a rebuilt document.</p>
      </section>
      <aside className="redactor-notice">
        <strong>Supported: plain text DOCX only · 5 MiB maximum</strong>
        <p>PDF, scanned documents and XLSX are not supported yet. DOCX tables, images, headers, footers, comments, revisions, fields, links, hidden text, embedded objects and custom XML are rejected. Metadata is stripped. Direct bold, italic, underline, font size, alignment and basic page geometry are retained; named styles and exact pagination are not.</p>
        <p>Document processing stays in this tab. There are no document uploads or AI calls. Detection can miss names, addresses and unusual identifiers. This is a restricted first increment, not a guarantee of anonymity.</p>
      </aside>
      <section className="redactor-card redactor-upload">
        <div className="redactor-file-details">
          <label htmlFor="document-upload"><strong>Open document</strong></label>
          <span id="document-upload-help">Choose a supported DOCX up to 5 MiB.</span>
        </div>
        <input ref={upload} id="document-upload" aria-describedby="document-upload-help" type="file" accept=".docx,.pdf,.xlsx" disabled={busy} onChange={e => open(e.target.files?.[0])} />
        <button type="button" onClick={clear}>Clear document</button>
      </section>
      <p role="status" aria-live="polite" className="redactor-status">{status}</p>
      {error && <p role="alert" className="redactor-error">{error}</p>}
      {text && <>
        <div className="redactor-grid">
          <section className="redactor-card">
            <h2>Review the text</h2>
            <p>Highlights are proposed removals. This text preview is not a paginated Word rendering. Offsets start at zero.</p>
            <div className="redactor-preview" aria-label="Highlighted document preview">{chunks}</div>
            <label htmlFor="manual-selection">Select text below to add a removal or correct a proposal</label>
            <textarea ref={selection} id="manual-selection" value={text} readOnly spellCheck={false} autoComplete="off" className="redactor-selection" disabled={busy} />
            <button type="button" disabled={busy} onClick={() => addSelection()}>Add selected text</button>
          </section>
          <section className="redactor-card">
            <h2>Adjust removals <span className="redactor-count">{ranges.length}</span></h2>
            <p>PAN, Aadhaar, GSTIN, TAN, phone, email, labelled bank accounts and IFSC are suggested automatically.</p>
            <label htmlFor="custom-terms">Additional literal terms (one per line, case sensitive)</label>
            <textarea id="custom-terms" value={terms} onChange={e => { setTerms(e.target.value); setReviewed(false); }} autoComplete="off" spellCheck={false} maxLength={6030} disabled={busy} rows={3} placeholder="Client name or another sensitive phrase" />
            <button type="button" disabled={busy} onClick={custom}>Add matching terms</button>
            <ul className="redactor-matches">
              {ranges.map((r, i) => <li key={`${i}-${r.start}`}>
                <div><strong>{r.kind}</strong><small>{r.start}–{r.end}</small></div>
                <code>{text.slice(r.start, r.end)}</code>
                <div className="redactor-actions">
                  <button type="button" disabled={busy} onClick={() => addSelection(i)} aria-label={`Replace proposal ${i + 1} with selected text`}>Use selection</button>
                  <button type="button" disabled={busy} onClick={() => update(ranges.filter((_, n) => n !== i))} aria-label={`Remove proposal ${i + 1}`}>Remove</button>
                </div>
              </li>)}
            </ul>
            {!ranges.length && <p>No selections. Add manual removals before exporting.</p>}
          </section>
        </div>
        <section className="redactor-card redactor-export">
          <h2>Human review & verified export</h2>
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
