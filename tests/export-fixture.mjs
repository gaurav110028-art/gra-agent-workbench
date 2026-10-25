// Synthetic data only. Stdout is an in-memory DOCX for the independent verifier.
import { packageDocx, inspectDocx, redactDocx } from '../lib/redactor/docx.mjs';
import { detect } from '../lib/redactor/detect.mjs';
import { unzipSync, zipSync, strToU8 } from 'fflate';
const source = packageDocx({ paragraphs: [{ props: { jc: 'center' }, runs: [{ props: { b: true }, text: 'Synthetic PAN ABCDE' }, { props: { i: true }, text: '1234F; client@example.test. Public total: 42.' }] }], section: {} });
const files = unzipSync(source);
files['docProps/core.xml'] = strToU8('<properties><author>SYNTHETIC_PRIVATE_AUTHOR</author></properties>');
const input = inspectDocx(zipSync(files), 'synthetic.docx');
process.stdout.write(redactDocx(input.model, detect(input.text), true));
