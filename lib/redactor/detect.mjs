export const PATTERNS = [
  ['GSTIN', /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/gi],
  ['PAN', /\b[A-Z]{5}\d{4}[A-Z]\b/gi],
  ['TAN', /\b[A-Z]{4}\d{5}[A-Z]\b/gi],
  ['Aadhaar', /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g],
  ['Email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['Phone', /(?<!\d)(?:\+91[ -]?)?[6-9]\d{4}[ -]?\d{5}(?!\d)/g],
  ['IFSC', /\b[A-Z]{4}0[A-Z0-9]{6}\b/gi],
  ['Bank account', /\b(?:account|a\/c|acct)(?:\s*(?:number|no\.?))?\s*[:#-]?\s*\d[\d -]{7,24}\d\b/gi],
];

export function detect(text, terms = []) {
  const matches = [];
  for (const [kind, pattern] of PATTERNS) {
    for (const m of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      matches.push({ start: m.index, end: m.index + m[0].length, kind });
    }
  }
  if (terms.length > 30) throw new Error('Use at most 30 custom terms.');
  for (const term of terms) {
    if (!term || term.length > 200) throw new Error('Custom terms must contain 1–200 characters.');
    let start = 0;
    while ((start = text.indexOf(term, start)) !== -1) {
      matches.push({ start, end: start + term.length, kind: 'Custom term' });
      start += term.length;
      if (matches.length > 2000) throw new Error('Too many matches. Use a smaller document.');
    }
  }
  if (matches.length > 2000) throw new Error('Too many matches. Use a smaller document.');
  return matches.sort((a, b) => a.start - b.start || b.end - a.end);
}

export function mergeRanges(text, ranges) {
  if (!Array.isArray(ranges) || ranges.length > 2000) throw new Error('Invalid redaction ranges.');
  const sorted = ranges.map(({ start, end }) => {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length || !text.slice(start, end).trim()) {
      throw new Error('Select a non-empty range within the document.');
    }
    // Do not split a UTF-16 surrogate pair.
    if ((start && /[\uD800-\uDBFF]/.test(text[start - 1])) || /[\uD800-\uDBFF]/.test(text[end - 1])) throw new Error('Selection splits a Unicode character.');
    return { start, end };
  }).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}
