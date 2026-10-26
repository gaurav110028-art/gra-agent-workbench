import { detect } from './detect.mjs';

export function detectXlsx(sheets, terms = []) {
  const result = [];
  for (const [sheet, data] of sheets.entries()) for (const cell of data.cells) {
    for (const field of cell.formula === null ? ['value'] : ['value', 'formula']) {
      const text = cell[field] || '';
      const found = detect(text, terms);
      for (const match of text.matchAll(/(?<!\d)\d{9,18}(?!\d)/g)) found.push({ start: match.index, end: match.index + match[0].length, kind: 'Bank account candidate' });
      for (const match of found) result.push({ ...match, sheet, ref: cell.ref, field, enabled: true });
      if (result.length > 2000) (() => { throw new Error('XLSX exceeds 2,000 proposed redactions. Use a smaller workbook.'); })();
    }
  }
  return result;
}
