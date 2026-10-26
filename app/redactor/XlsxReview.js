'use client';

import { useMemo, useRef, useState } from 'react';
import { mergeRanges } from '../../lib/redactor/detect.mjs';
import { detectXlsx } from '../../lib/redactor/xlsx-detect.mjs';

function highlighted(text, ranges) {
  const pieces = [];
  let end = 0;
  for (const range of mergeRanges(text, ranges)) {
    pieces.push(text.slice(end, range.start), <mark key={range.start}>{text.slice(range.start, range.end)}</mark>);
    end = range.end;
  }
  pieces.push(text.slice(end));
  return pieces;
}
const keyOf = unit => `${unit.ref}:${unit.field}`;

export default function XlsxReview({ workbook, busy, onExport }) {
  const [sheetIndex, setSheetIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [ranges, setRanges] = useState(workbook.matches);
  const [selectedKey, setSelectedKey] = useState(null);
  const [terms, setTerms] = useState('');
  const [sheetReviews, setSheetReviews] = useState({});
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const selector = useRef(null);
  const sheet = workbook.sheets[sheetIndex];
  const units = useMemo(() => sheet.cells.flatMap(cell => [
    { ...cell, field: 'value', text: cell.value },
    ...(cell.formula === null ? [] : [{ ...cell, field: 'formula', text: cell.formula }]),
  ]), [sheet]);
  const selected = units.find(unit => keyOf(unit) === selectedKey) || units[0];
  const enabled = ranges.filter(range => range.enabled !== false);
  const currentRanges = ranges.map((range, index) => ({ ...range, index })).filter(range => range.sheet === sheetIndex);
  const allReviewed = workbook.sheets.every((_, index) => sheetReviews[index]);
  const pages = Math.max(1, Math.ceil(units.length / 100));

  function invalidate() { setReviewed(false); setSheetReviews({}); }
  function update(next) {
    if (next.length > 2000) { setError('At most 2,000 redaction proposals are supported.'); return; }
    setRanges(next); invalidate(); setError('');
  }
  function useSelection(index = null) {
    if (!selected || !selector.current) return;
    const next = { sheet: sheetIndex, ref: selected.ref, field: selected.field, start: selector.current.selectionStart, end: selector.current.selectionEnd, kind: 'Manual', enabled: true };
    try {
      mergeRanges(selected.text, [next]);
      update(index === null ? [...ranges, next] : ranges.map((range, at) => at === index ? next : range));
    } catch (e) { setError(e.message); }
  }
  function addTerms() {
    try {
      const found = detectXlsx(workbook.sheets, terms.split('\n').map(term => term.trim()).filter(Boolean)).filter(range => range.kind === 'Custom term');
      const next = [...ranges];
      for (const match of found) if (!next.some(range => range.sheet === match.sheet && range.ref === match.ref && range.field === match.field && range.start === match.start && range.end === match.end)) next.push(match);
      update(next);
    } catch (e) { setError(e.message); }
  }

  return <div className="xlsx-review">
    <section className="redactor-card xlsx-policy">
      <h2>XLSX workbook review</h2>
      <p>{workbook.sheets.length} worksheets · {workbook.sheets.reduce((count, item) => count + item.cells.length, 0)} stored cells · {enabled.length} selected redactions</p>
      <ul>{workbook.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
      {workbook.blocked.length > 0 && <div role="alert" className="redactor-error"><strong>Export blocked</strong><ul>{workbook.blocked.map(message => <li key={message}>{message}</li>)}</ul><p>Values remain available for inspection. This workbook cannot be exported securely by this increment.</p></div>}
      {error && <p role="alert" className="redactor-error">{error}</p>}
      <label htmlFor="xlsx-sheet">Worksheet (source names stay local; export uses generic names)</label>
      <select id="xlsx-sheet" value={sheetIndex} disabled={busy} onChange={event => { setSheetIndex(+event.target.value); setPage(0); setSelectedKey(null); }}>
        {workbook.sheets.map((item, index) => <option key={index} value={index}>{index + 1}. {item.name} — {item.state}</option>)}
      </select>
      <p className="xlsx-sheet-state">Source visibility: <strong>{sheet.state}</strong>. All source cell values below are shown, including cells in hidden rows and columns. Blank gaps are omitted; this is a raw cell review, not an Excel rendering.</p>
    </section>
    <div className="redactor-grid">
      <section className="redactor-card">
        <h2>02 / Review worksheet cells</h2>
        <div className="xlsx-table-wrap"><table className="xlsx-cells">
          <thead><tr><th>Cell</th><th>Source flags</th><th>Raw value / formula</th></tr></thead>
          <tbody>{units.slice(page * 100, page * 100 + 100).map(unit => <tr key={keyOf(unit)} data-selected={keyOf(unit) === keyOf(selected || {})}>
            <td><button type="button" disabled={busy} onClick={() => setSelectedKey(keyOf(unit))} aria-label={`Select ${unit.ref} ${unit.field}`}>{unit.ref}{unit.field === 'formula' ? ' formula' : ''}</button><small>{unit.kind}</small></td>
            <td>{[sheet.state !== 'visible' ? sheet.state + ' sheet' : '', unit.rowHidden ? 'hidden row' : '', unit.columnHidden ? 'hidden column' : '', unit.formula !== null && unit.field === 'value' ? 'cached value' : ''].filter(Boolean).join(' · ') || 'visible'}</td>
            <td className="xlsx-cell-value">{unit.text ? highlighted(unit.text, enabled.filter(range => range.sheet === sheetIndex && range.ref === unit.ref && range.field === unit.field)) : <span className="xlsx-empty">(empty)</span>}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="redactor-actions xlsx-pages">
          <button type="button" disabled={busy || page === 0} onClick={() => setPage(page - 1)}>Previous cells</button>
          <span>Page {page + 1} of {pages}</span>
          <button type="button" disabled={busy || page + 1 >= pages} onClick={() => setPage(page + 1)}>Next cells</button>
        </div>
        {selected && <>
          <label htmlFor="xlsx-selection">Select characters in {selected.ref} {selected.field} to add or correct a redaction</label>
          <textarea ref={selector} id="xlsx-selection" className="redactor-selection" value={selected.text} readOnly spellCheck={false} autoComplete="off" disabled={busy} />
          <button type="button" disabled={busy} onClick={() => useSelection()}>Add selected cell text</button>
        </>}
        <label className="redactor-check xlsx-sheet-check"><input type="checkbox" checked={!!sheetReviews[sheetIndex]} disabled={busy} onChange={event => { setSheetReviews({ ...sheetReviews, [sheetIndex]: event.target.checked }); setReviewed(false); }} />I reviewed this worksheet, including hidden data.</label>
      </section>
      <section className="redactor-card">
        <h2>03 / Approve, reject or correct proposals</h2>
        <p>Unchecked proposals retain their text. Corrections use the selection in the cell editor. Any decision change invalidates all worksheet review acknowledgements.</p>
        <label htmlFor="xlsx-custom-terms">Custom names or identifiers (literal, case sensitive; one per line)</label>
        <textarea id="xlsx-custom-terms" rows={3} maxLength={6030} value={terms} autoComplete="off" spellCheck={false} disabled={busy} onChange={event => { setTerms(event.target.value); invalidate(); }} />
        <button type="button" disabled={busy} onClick={addTerms}>Add matching workbook terms</button>
        <ul className="redactor-matches">{currentRanges.map(range => {
          const cell = sheet.cells.find(cell => cell.ref === range.ref);
          return <li key={range.index}>
            <label className="redactor-check"><input type="checkbox" checked={range.enabled !== false} disabled={busy} aria-label={`Include XLSX proposal ${range.index + 1}`} onChange={event => update(ranges.map((item, index) => index === range.index ? { ...item, enabled: event.target.checked } : item))} /><strong>{range.ref} {range.field} · {range.kind}</strong><small>{range.start}–{range.end}</small></label>
            <code>{(cell[range.field] || '').slice(range.start, range.end)}</code>
            <div className="redactor-actions">
              <button type="button" disabled={busy} aria-label={`Correct XLSX proposal ${range.index + 1}`} onClick={() => useSelection(range.index)}>Use cell selection</button>
              <button type="button" disabled={busy} aria-label={`Remove XLSX proposal ${range.index + 1}`} onClick={() => update(ranges.filter((_, index) => index !== range.index))}>Remove</button>
            </div>
          </li>;
        })}</ul>
        {!currentRanges.length && <p>No proposals on this worksheet. Inspect it and add any missed sensitive text manually.</p>}
      </section>
    </div>
    <section className="redactor-card redactor-export">
      <h2>04 / Review every worksheet & verify export</h2>
      <p>{Object.values(sheetReviews).filter(Boolean).length} of {workbook.sheets.length} worksheets acknowledged. Approved characters are removed from the rebuilt XLSX. Original shared strings, metadata, sheet names and hidden flags are not copied. Long identifiers should be text; redacted numeric cells become text.</p>
      <label className="redactor-check"><input type="checkbox" checked={reviewed} disabled={busy || !allReviewed || workbook.blocked.length > 0} onChange={event => setReviewed(event.target.checked)} />I reviewed every worksheet and selected removal, added missed sensitive content, and accept generic sheet names, visible output and formatting limits. I will inspect the exported file in Excel before sharing.</label>
      <button type="button" className="redactor-primary" disabled={busy || !reviewed || !allReviewed || !enabled.length || workbook.blocked.length > 0} onClick={() => { onExport(enabled, reviewed && allReviewed); setReviewed(false); }}>{busy ? 'Processing…' : 'Verify & download XLSX'}</button>
    </section>
  </div>;
}
