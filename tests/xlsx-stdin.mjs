// Only used for synthetic interoperability verification, not an application endpoint.
import { inspectXlsx, redactXlsx, detectXlsx } from '../lib/redactor/xlsx.mjs';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = inspectXlsx(new Uint8Array(Buffer.concat(chunks)), 'synthetic.xlsx');
if (input.blocked.length) throw new Error(input.blocked.join('; '));
process.stdout.write(redactXlsx(input.model, detectXlsx(input.sheets, ['Aurora Advisory']), true));
