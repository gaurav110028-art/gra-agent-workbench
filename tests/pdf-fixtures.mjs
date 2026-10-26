// Synthetic fixtures only. This generic test writer is never used by application export.
export function fixturePdf({ pages = ['PAN ABCDE1234F\nClient Aurora Advisory\nTotal 42', 'Email client@example.test\nAccount 0011223344556677\nIFSC SBIN0001234'], content, catalog = '', pageExtra = '', extra = [], rotate = 0 } = {}) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R ' + catalog + ' >>', `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (const [i, text] of pages.entries()) {
    const id = 4 + i * 2;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Rotate ${rotate} /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R ${pageExtra} >>`);
    const stream = content ?? `BT /F1 12 Tf 30 250 Td 20 TL ${text.split('\n').map((s, n) => `${n ? 'T* ' : ''}(${s.replace(/[()\\]/g, '\\$&')}) Tj`).join('\n')} ET\n0 0 1 RG 30 160 200 1 re S`;
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  const info = objects.length + 1;
  objects.push('<< /Author (SYNTHETIC_PRIVATE_AUTHOR) /Title (Synthetic CA record) >>', ...extra);
  let result = '%PDF-1.7\n', offsets = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(result)); result += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(result);
  result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}
