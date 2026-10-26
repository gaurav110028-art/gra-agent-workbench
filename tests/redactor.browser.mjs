// Run against a production server: pnpm build; pnpm start; pnpm test:browser.
// Uses synthetic bytes only; download is inspected in memory, never saved.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { packageDocx, inspectDocx } from '../lib/redactor/docx.mjs';

const base = process.env.GRA_TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true, ...(process.env.GRA_TEST_BROWSER_CHANNEL ? { channel: process.env.GRA_TEST_BROWSER_CHANNEL } : {}) });
try {
  const context = await browser.newContext({ acceptDownloads: true });
  if (!process.env.GRA_TEST_EMAIL || !process.env.GRA_TEST_PASSWORD) throw new Error('Configure synthetic GRA_TEST_EMAIL and GRA_TEST_PASSWORD, or run pnpm test:production.');
  const signIn = await context.request.post(`${base}/api/auth/login`, { headers: { Origin: base }, data: { email: process.env.GRA_TEST_EMAIL, password: process.env.GRA_TEST_PASSWORD } });
  assert.equal(signIn.status(), 200, 'Synthetic server login');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(`${base}/redactor`);
  assert(response.headers()['content-security-policy'].includes("connect-src 'none'"));
  await page.getByRole('heading', { name: 'GRA Secure Document Redactor' }).waitFor();
  const downloadButton = page.getByRole('button', { name: 'Verify & download DOCX' });
  const source = packageDocx({ paragraphs: [{ props: {}, runs: [{ props: { b: true }, text: 'PAN ABCDE1234F. Client Aurora. Total 42.' }] }], section: {} });
  const requests = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
  await page.locator('#document-upload').setInputFiles({ name: 'synthetic.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(source) });
  await page.getByRole('status').filter({ hasText: '1 proposed redactions' }).waitFor();
  assert(await downloadButton.isDisabled());
  // Remove a proposal and manually restore it using the text selection control.
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Remove proposal 1', exact: true }).click();
  assert.equal(await page.getByRole('checkbox').isChecked(), false);
  await page.locator('#manual-selection').evaluate(el => el.setSelectionRange(4, 14));
  await page.getByRole('button', { name: 'Add selected text', exact: true }).click();
  // Correct an existing range from the manual selector.
  await page.locator('#manual-selection').evaluate(el => el.setSelectionRange(4, 14));
  await page.getByRole('button', { name: 'Replace proposal 1 with selected text', exact: true }).click();
  await page.locator('#custom-terms').fill('Aurora');
  await page.getByRole('button', { name: 'Add matching terms', exact: true }).click();
  await page.getByRole('checkbox').check();
  assert(await downloadButton.isEnabled());
  if (process.env.GRA_TEST_SCREENSHOT) await page.screenshot({ path: process.env.GRA_TEST_SCREENSHOT, fullPage: true });
  const downloadEvent = page.waitForEvent('download');
  await downloadButton.click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const output = inspectDocx(new Uint8Array(Buffer.concat(chunks)), 'output.docx');
  assert.equal(output.text, 'PAN [REDACTED]. Client [REDACTED]. Total 42.');
  assert(await page.getByRole('checkbox').isChecked() === false);
  assert(!requests.some(r => r.method !== 'GET' || r.url.includes('/api/') || r.body));
  assert(!requests.some(r => /ABCDE1234F|Aurora|synthetic.docx/.test(r.url)));
  const storage = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
  assert(!/ABCDE1234F|Aurora|synthetic.docx/.test(JSON.stringify(storage)));
  // CSP actively rejects connect attempts, including same-origin API calls.
  assert(await page.evaluate(async () => { try { await fetch('/api/architect/models'); return false; } catch { return true; } }));
  // A dedicated worker has its own response CSP; prove it also cannot fetch.
  const worker = page.workers()[0];
  assert(worker, 'Local processing worker started');
  assert(await worker.evaluate(async () => { try { await fetch('/api/architect/models'); return false; } catch { return true; } }));
  await page.getByRole('button', { name: 'Clear document', exact: true }).click();
  assert.equal(await page.locator('#manual-selection').count(), 0);
  await page.locator('#document-upload').setInputFiles({ name: 'scanned.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 synthetic scan') });
  await page.getByRole('alert').filter({ hasText: 'unsupported' }).waitFor();
  await page.locator('#document-upload').setInputFiles({ name: 'malformed.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('synthetic malformed ZIP') });
  await page.getByRole('alert').filter({ hasText: 'XLSX' }).waitFor();
  await page.locator('#document-upload').setInputFiles({ name: 'malformed.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a ZIP') });
  await page.getByRole('alert').filter({ hasText: 'ZIP' }).waitFor();
  // Verification failure must never offer a download.
  const duplicate = packageDocx({ paragraphs: [{ props: {}, runs: [{ props: {}, text: 'ABCDE1234F ABCDE1234F' }] }], section: {} });
  await page.locator('#document-upload').setInputFiles({ name: 'duplicates.docx', mimeType: '', buffer: Buffer.from(duplicate) });
  await page.getByRole('status').filter({ hasText: '2 proposed redactions' }).waitFor();
  await page.getByRole('button', { name: 'Remove proposal 2', exact: true }).click();
  await page.getByRole('checkbox').check();
  let unexpectedDownload = false;
  page.once('download', () => { unexpectedDownload = true; });
  await downloadButton.click();
  await page.getByRole('alert').filter({ hasText: 'Verification failed' }).waitFor();
  assert.equal(unexpectedDownload, false);
  // Mobile layout, followed by the existing workbench navigation smoke test.
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.goto(base);
  await page.getByRole('link', { name: 'Document Redactor', exact: true }).waitFor();
  for (const name of ['Agents', 'Query Inbox', 'Runs', 'Approvals', 'Settings', 'Calendar']) assert(await page.getByRole('button', { name, exact: true }).count() > 0, name);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS: browser upload → worker → manual/custom review → verified download; unsupported/malformed inputs and failed verification blocked; no document network/storage activity; mobile and existing navigation checked.');
} finally { await browser.close(); }
