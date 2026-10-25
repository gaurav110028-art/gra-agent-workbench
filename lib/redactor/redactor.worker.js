import { inspectDocx, redactDocx } from './docx.mjs';

let model = null;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'inspect') {
      model = null;
      const result = inspectDocx(new Uint8Array(data.bytes), data.name, data.mime);
      model = result.model;
      self.postMessage({ type: 'inspected', text: result.text });
    } else if (data.type === 'export' && model) {
      const bytes = redactDocx(model, data.ranges, data.reviewed);
      self.postMessage({ type: 'exported', bytes: bytes.buffer }, [bytes.buffer]);
    } else throw new Error('Open a supported document first.');
  } catch (error) {
    // Library parser errors never reach logging or a remote error collector.
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Document processing failed.' });
  }
};
