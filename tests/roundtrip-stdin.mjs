// Used only by the synthetic python-docx interoperability test; no files/logging.
import { inspectDocx, redactDocx } from '../lib/redactor/docx.mjs';
import { detect } from '../lib/redactor/detect.mjs';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = inspectDocx(new Uint8Array(Buffer.concat(chunks)), 'synthetic.docx');
process.stdout.write(redactDocx(input.model, detect(input.text), true));
