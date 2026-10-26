import { inspectDocx, redactDocx } from './docx.mjs';
import { inspectXlsx, redactXlsx } from './xlsx.mjs';
import { detectXlsx } from './xlsx-detect.mjs';

let model = null;
let format = null;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'inspect') {
      model = null;
      format = null;
      if (/\.xlsx$/i.test(data.name)) {
        const result = inspectXlsx(new Uint8Array(data.bytes), data.name, data.mime);
        const matches = detectXlsx(result.sheets);
        model = result.model; format = 'xlsx';
        self.postMessage({ type: 'inspected', format, workbook: { sheets: result.sheets, blocked: result.blocked, warnings: result.warnings, matches } });
        return;
      }
      const result = inspectDocx(new Uint8Array(data.bytes), data.name, data.mime);
      model = result.model;
      format = 'docx';
      self.postMessage({ type: 'inspected', format, text: result.text });
    } else if (data.type === 'export' && model) {
      const bytes = format === 'xlsx' ? redactXlsx(model, data.ranges, data.reviewed) : redactDocx(model, data.ranges, data.reviewed);
      self.postMessage({ type: 'exported', format, bytes: bytes.buffer }, [bytes.buffer]);
    } else throw new Error('Open a supported document first.');
  } catch (error) {
    // Library parser errors never reach logging or a remote error collector.
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Document processing failed.' });
  }
};
