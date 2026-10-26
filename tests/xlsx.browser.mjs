import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { packageXlsx, inspectXlsx } from '../lib/redactor/xlsx.mjs';
import { workbookBytes, workbookModel, sharedStringFixture, formulaFixture, changeZip } from './xlsx-fixtures.mjs';
import { strToU8 } from 'fflate';

const base = process.env.GRA_TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const response = await context.request.post(`${base}/api/auth/login`, { headers: { Origin: base }, data: { email: process.env.GRA_TEST_EMAIL, password: process.env.GRA_TEST_PASSWORD } });
  assert.equal(response.status(), 200);
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/redactor');
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
  const upload = async (buffer, name = 'synthetic.xlsx', mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') => page.locator('#document-upload').setInputFiles({ name, mimeType, buffer: Buffer.from(buffer) });
  const sheet = page.locator('#xlsx-sheet');
  const exportButton = page.getByRole('button', { name: 'Verify & download XLSX', exact: true });
  const sheetReview = () => page.getByRole('checkbox', { name: 'I reviewed this worksheet, including hidden data.', exact: true });
  const finalReview = () => page.getByRole('checkbox', { name: /^I reviewed every worksheet and selected removal/ });
  async function acknowledgeAll() {
    for (const index of ['0', '1', '2']) { await sheet.selectOption(index); await sheetReview().check(); }
    await finalReview().check();
  }
  await upload(sharedStringFixture());
  await page.getByRole('heading', { name: 'XLSX workbook review', exact: true }).waitFor();
  assert(await exportButton.isDisabled());
  assert(await page.getByText('hidden row', { exact: false }).count() > 0);
  await page.getByRole('checkbox', { name: 'Include XLSX proposal 1', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Select A1 value', exact: true }).click();
  await page.locator('#xlsx-selection').evaluate(el => el.setSelectionRange(4, 14));
  await page.getByRole('button', { name: 'Correct XLSX proposal 1', exact: true }).click();
  assert(await page.getByRole('checkbox', { name: 'Include XLSX proposal 1', exact: true }).isChecked());
  await page.locator('#xlsx-custom-terms').fill('Aurora Advisory');
  await page.getByRole('button', { name: 'Add matching workbook terms', exact: true }).click();
  await page.getByText('A2 value · Custom term', { exact: true }).waitFor();
  // Remove the custom proposal and restore it manually, preserving all other proposals.
  await page.getByRole('button', { name: 'Remove XLSX proposal 9', exact: true }).click();
  await page.getByRole('button', { name: 'Select A2 value', exact: true }).click();
  await page.locator('#xlsx-selection').evaluate(el => el.setSelectionRange(0, el.value.length));
  await page.getByRole('button', { name: 'Add selected cell text', exact: true }).click();
  await sheetReview().check();
  await page.getByRole('checkbox', { name: 'Include XLSX proposal 1', exact: true }).uncheck();
  assert.equal(await sheetReview().isChecked(), false, 'Changing decisions invalidates worksheet acknowledgement');
  await page.getByRole('checkbox', { name: 'Include XLSX proposal 1', exact: true }).check();
  await acknowledgeAll();
  assert(await exportButton.isEnabled());
  await sheet.selectOption('0');
  if (process.env.GRA_TEST_XLSX_SCREENSHOT) await page.screenshot({ path: process.env.GRA_TEST_XLSX_SCREENSHOT, fullPage: true });
  const event = page.waitForEvent('download');
  await exportButton.click();
  const download = await event;
  assert.equal(download.suggestedFilename(), 'gra-redacted-review-required.xlsx');
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  assert.equal(inspectXlsx(new Uint8Array(bytes), 'redacted.xlsx').sheets[0].cells[0].value, 'PAN [REDACTED]');
  const python = spawnSync(process.env.GRA_TEST_PYTHON || 'python', ['tests/verify-xlsx-download.py'], { input: bytes, encoding: 'utf8', windowsHide: true });
  assert.equal(python.status, 0, `Python 3 with openpyxl is required (set GRA_TEST_PYTHON). ${python.stderr || python.error?.message || ''}`);
  console.log(python.stdout.trim());
  await page.getByRole('status').filter({ hasText: 'Approved removals verified' }).waitFor();
  assert.equal(await finalReview().isChecked(), false);
  assert(!requests.some(request => request.method !== 'GET' || request.body || request.url.includes('/api/') || /ABCDE1234F|Aurora|synthetic.xlsx/.test(request.url)));
  const storage = await page.evaluate(() => JSON.stringify({ local: localStorage, session: sessionStorage }));
  assert(!/ABCDE1234F|Aurora|SYNTHETIC_PRIVATE_TAB/.test(storage));
  assert(await page.evaluate(async () => { try { await fetch('/api/architect/models'); return false; } catch { return true; } }));
  const worker = page.workers()[0]; assert(worker);
  assert(await worker.evaluate(async () => { try { await fetch('/api/architect/models'); return false; } catch { return true; } }));
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Clear document', exact: true }).click();
  assert.equal(await page.locator('#xlsx-sheet').count(), 0);

  // Formula expression and cache must be visible, and both UI and worker deny export.
  await upload(formulaFixture());
  await page.getByRole('alert').filter({ hasText: 'Export blocked' }).waitFor();
  await sheet.selectOption('1');
  await page.getByRole('button', { name: 'Select B1 formula', exact: true }).waitFor();
  assert(await page.getByText('cached@example.test', { exact: true }).count() > 0);
  assert(await exportButton.isDisabled());
  let forbiddenDownload = false;
  page.on('download', () => { forbiddenDownload = true; });
  await page.workers()[0].evaluate(() => self.onmessage({ data: { type: 'export', ranges: [], reviewed: true } }));
  await page.getByRole('alert').filter({ hasText: 'XLSX export is blocked' }).waitFor();
  assert.equal(forbiddenDownload, false);

  // An omitted duplicate occurrence blocks export even after human acknowledgement.
  const duplicate = workbookModel(); duplicate.sheets[1].cells[0].value = 'ABCDE1234F';
  await upload(packageXlsx(duplicate));
  await page.getByRole('heading', { name: 'XLSX workbook review', exact: true }).waitFor();
  await sheet.selectOption('1');
  await page.getByRole('checkbox', { name: 'Include XLSX proposal 4', exact: true }).uncheck();
  await acknowledgeAll();
  await exportButton.click();
  await page.getByRole('alert').filter({ hasText: 'Verification failed' }).waitFor();
  assert.equal(forbiddenDownload, false);

  await upload(changeZip(workbookBytes(), files => { files['xl/comments/comment1.xml'] = strToU8('<synthetic/>'); }));
  await page.getByRole('alert').filter({ hasText: 'Unsupported XLSX package' }).waitFor();
  await upload(Buffer.from('not a ZIP'));
  await page.getByRole('alert').filter({ hasText: 'XLSX' }).waitFor();
  await upload(workbookBytes(), 'synthetic.xlsm');
  await page.getByRole('alert').filter({ hasText: 'macro-enabled' }).waitFor();
  await upload(Buffer.alloc(5 * 1024 * 1024 + 1));
  await page.getByRole('alert').filter({ hasText: 'Maximum file size' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS: XLSX browser upload → review hidden worksheets/cells → reject/correct/manual/custom selections → required per-sheet review → verified download; formula/verification/unsupported/malformed/macro/size failures blocked, privacy/CSP/mobile checks passed.');
} finally { await browser.close(); }
