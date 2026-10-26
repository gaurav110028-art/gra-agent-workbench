// Bundle pinned PDF.js standard fonts as code: no runtime font/data fetch is allowed.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const root = dirname(require.resolve('pdfjs-dist/package.json'));
const fonts = {};
for (const name of (await readdir(join(root, 'standard_fonts'))).sort()) {
  if (/\.(pfb|ttf)$/.test(name)) fonts[name] = (await readFile(join(root, 'standard_fonts', name))).toString('base64');
}
await mkdir('lib/redactor/generated', { recursive: true });
await writeFile('lib/redactor/generated/pdf-fonts.mjs', '// Generated from pinned pdfjs-dist; see docs/PDF-LICENSES.txt. Do not edit.\nexport default ' + JSON.stringify(fonts) + ';\n');
console.log('Prepared bundled PDF standard fonts; no network assets required.');
