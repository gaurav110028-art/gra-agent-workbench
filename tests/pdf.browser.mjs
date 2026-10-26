import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { fixturePdf } from './pdf-fixtures.mjs';

const base = process.env.GRA_TEST_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const login = await context.request.post(base + '/api/auth/login', { headers: { Origin: base }, data: { email: process.env.GRA_TEST_EMAIL, password: process.env.GRA_TEST_PASSWORD } });
  assert.equal(login.status(), 200);
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/redactor');
  page.on('request', r => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  const upload = bytes => page.locator('#document-upload').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: bytes });
  await upload(fixturePdf());
  await Promise.race([
    page.getByRole('heading', { name: 'PDF page review', exact: true }).waitFor({ timeout: 50000 }),
    page.locator('.redactor-error').waitFor({ timeout: 50000 }).then(async () => { throw new Error('PDF inspect failed: ' + await page.locator('.redactor-error').textContent()); }),
  ]);
  const exportButton = page.getByRole('button', { name: 'Verify & download PDF', exact: true });
  const pageSelect = page.locator('#pdf-page');
  const pageCheck = () => page.getByRole('checkbox', { name: 'I reviewed this entire PDF page and all proposed regions.', exact: true });
  const finalCheck = () => page.getByRole('checkbox', { name: /^I reviewed every PDF page and selected region/ });
  assert(await exportButton.isDisabled());
  // Reject, restore/correct and manually extend a region; every decision invalidates review.
  await pageCheck().check();
  await page.getByRole('checkbox', { name: 'Include PDF region 1', exact: true }).uncheck();
  assert.equal(await pageCheck().isChecked(), false);
  await page.getByRole('button', { name: 'Load PDF region 1', exact: true }).click();
  await page.getByRole('button', { name: 'Adjust PDF region 1', exact: true }).click();
  assert(await page.getByRole('checkbox', { name: 'Include PDF region 1', exact: true }).isChecked());
  await page.locator('#pdf-terms').fill('Aurora Advisory');
  await page.getByRole('button', { name: 'Add matching PDF terms', exact: true }).click();
  const preview = page.locator('.pdf-preview'); await preview.scrollIntoViewIfNeeded();
  const bounds = await preview.boundingBox(); assert(bounds);
  await page.mouse.move(bounds.x + bounds.width * .6, bounds.y + bounds.height * .7);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .8);
  await page.mouse.up();
  assert(Number(await page.locator('#pdf-x').inputValue()) > 0);
  assert(Number(await page.locator('#pdf-width').inputValue()) > 100);
  for (const [key, value] of Object.entries({ x: 600, y: 500, width: 80, height: 30 })) await page.locator(`#pdf-${key}`).fill(String(value));
  await page.getByRole('button', { name: 'Add PDF region', exact: true }).click();
  await page.getByRole('button', { name: 'Remove PDF region 6', exact: true }).click();
  await page.getByRole('button', { name: 'Add PDF region', exact: true }).click();
  const previews = [], regions = [];
  for (const index of ['0', '1']) {
    await pageSelect.selectOption(index);
    previews.push(await page.locator('.pdf-preview img').getAttribute('src'));
    const coordinates = await page.locator('.redactor-matches li').allTextContents();
    for (const item of coordinates) {
      const m = item.match(/x (\d+), y (\d+), width (\d+), height (\d+)/); assert(m);
      regions.push({ page: Number(index), x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]) });
    }
    await pageCheck().check();
  }
  await finalCheck().check();
  await pageSelect.selectOption('0');
  if (process.env.GRA_TEST_PDF_SCREENSHOT) await page.screenshot({ path: process.env.GRA_TEST_PDF_SCREENSHOT, fullPage: true });
  const event = page.waitForEvent('download'); await exportButton.click();
  const download = await event; assert.equal(download.suggestedFilename(), 'gra-redacted-review-required.pdf');
  const chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  const verification = spawnSync(process.env.GRA_TEST_PYTHON || 'python', ['tests/verify-pdf-independent.py'], { input: JSON.stringify({ pdf: bytes.toString('base64'), pages: previews, regions }), encoding: 'utf8', windowsHide: true });
  assert.equal(verification.status, 0, verification.stderr || verification.error?.message);
  console.log(verification.stdout.trim());
  assert.equal(await finalCheck().isChecked(), false);
  assert(!requests.some(r => r.method !== 'GET' || r.body || r.url.includes('/api/') || /ABCDE|Aurora|synthetic.pdf/.test(r.url)));
  assert(requests.every(r => new URL(r.url).origin === new URL(base).origin), 'No third-party document processing or asset requests');
  assert(!/ABCDE|Aurora|synthetic.pdf/.test(await page.evaluate(() => JSON.stringify({ localStorage, sessionStorage }))));
  assert(await page.evaluate(async () => { try { await fetch('/api/architect/models'); return false; } catch { return true; } }));
  assert(await page.workers()[0].evaluate(async () => { try { await fetch('/api/architect/models'); return false; } catch { return true; } }));
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  if (process.env.GRA_TEST_PDF_SCREENSHOT) await page.screenshot({ path: process.env.GRA_TEST_PDF_SCREENSHOT.replace('.png', '-light-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Clear document', exact: true }).click();
  assert.equal(await pageSelect.count(), 0);
  let forbiddenDownload = false; page.on('download', () => { forbiddenDownload = true; });
  async function blocked(bytes, pattern) {
    await upload(bytes);
    await page.locator('.redactor-error').filter({ hasText: pattern }).waitFor({ timeout: 50000 });
    assert.equal(await pageSelect.count(), 0); assert.equal(forbiddenDownload, false);
  }
  const one = options => fixturePdf({ pages: ['PAN ABCDE1234F'], ...options });
  await blocked(Buffer.from('%PDF-1.7 broken'), /PDF/);
  await blocked(one({ content: '' }), /OCR|undetectable/);
  await blocked(fixturePdf({ pages: ['PAN ABCDE1234F', ''] }), /OCR|undetectable/);
  const image = 'q 100 0 0 100 30 30 cm BI /W 1 /H 1 /CS /RGB /BPC 8 ID abc EI Q';
  await blocked(one({ content: image }), /OCR|image/);
  await blocked(one({ content: 'BT /F1 12 Tf 30 250 Td (PAN ABCDE1234F) Tj ET\n' + image }), /OCR|image/);
  await blocked(one({ rotate: 90 }), /Rotated/);
  await blocked(one({ content: 'BT /F1 12 Tf 3 Tr 30 250 Td (PAN ABCDE1234F) Tj ET' }), /Invisible/);
  await blocked(one({ pages: new Array(11).fill('PAN ABCDE1234F') }), /1–10/);
  await blocked(one({ pageExtra: '/Annots [7 0 R]', extra: ['<< /Type /Annot /Subtype /Link /Rect [30 30 100 40] /A << /S /URI /URI (http://127.0.0.1/) >> >>'] }), /annotations/);
  await blocked(one({ catalog: '/OpenAction << /S /JavaScript /JS (app.alert\\(secret\\)) >>' }), /scripts|actions/);
  await blocked(one({ catalog: '/OCProperties << /OCGs [7 0 R] /D << /Order [7 0 R] /OFF [7 0 R] >> >>', extra: ['<< /Type /OCG /Name (Synthetic hidden layer) >>'] }), /layers/);
  await blocked(one({ catalog: '/AcroForm << /Fields [7 0 R] >>', extra: ['<< /Type /Annot /Subtype /Widget /FT /Tx /T (Synthetic) /V (secret) /Rect [30 30 100 40] >>'] }), /forms/);
  await blocked(one({ catalog: '/Names << /EmbeddedFiles << /Names [(synthetic) 7 0 R] >> >>', extra: ['<< /Type /Filespec /F (synthetic.txt) /EF << /F 8 0 R >> >>', '<< /Type /EmbeddedFile /Length 6 >>\nstream\nsecret\nendstream'] }), /attachments/);
  for (const mode of ['encrypted', 'empty-password']) {
    const input = spawnSync(process.env.GRA_TEST_PYTHON || 'python', ['tests/pdf-input-independent.py', mode], { input: one(), windowsHide: true });
    assert.equal(input.status, 0); await blocked(input.stdout, /encrypted|Encrypted/);
  }
  // Independently authored ReportLab input; reject forged review/regions at the worker boundary.
  const external = spawnSync(process.env.GRA_TEST_PYTHON || 'python', ['tests/pdf-input-independent.py', 'reportlab'], { windowsHide: true });
  assert.equal(external.status, 0); await upload(external.stdout);
  await page.getByRole('heading', { name: 'PDF page review', exact: true }).waitFor({ timeout: 50000 });
  const worker = page.workers()[0];
  await worker.evaluate(() => self.onmessage({ data: { type: 'export', ranges: [{ page: 0, x: 10, y: 10, width: 50, height: 30 }], reviewed: { final: true, pages: [false] } } }));
  await page.locator('.redactor-error').filter({ hasText: 'Review every PDF page' }).waitFor();
  await worker.evaluate(() => self.onmessage({ data: { type: 'export', ranges: [{ page: 0, x: -10, y: 10, width: 50, height: 30 }], reviewed: { final: true, pages: [true] } } }));
  await page.locator('.redactor-error').filter({ hasText: 'ambiguous' }).waitFor();
  assert.equal(forbiddenDownload, false);
  // Force a verifier comparison failure inside the synthetic worker. There is no production test hook.
  await worker.evaluate(() => {
    const original = Uint8Array.prototype.some;
    Uint8Array.prototype.some = function (...args) { if (this.length > 100 && this[0] === 37 && this[1] === 80 && this[2] === 68 && this[3] === 70) return true; return original.apply(this, args); };
    self.onmessage({ data: { type: 'export', ranges: [{ page: 0, x: 50, y: 50, width: 300, height: 100 }], reviewed: { final: true, pages: [true] } } });
    Uint8Array.prototype.some = original;
  });
  await page.locator('.redactor-error').filter({ hasText: 'verification failed' }).waitFor();
  assert.equal(forbiddenDownload, false);
  // Cancellation terminates processing and prevents late review/download messages.
  await upload(fixturePdf({ pages: new Array(10).fill('PAN ABCDE1234F') }));
  await page.getByRole('button', { name: 'Cancel processing', exact: true }).click();
  assert.equal(await pageSelect.count(), 0);
  assert.equal(forbiddenDownload, false);
  // Exercise the existing watchdog without making the test wait 45 seconds.
  await page.evaluate(() => { const original = window.setTimeout; window.setTimeout = (fn, ms, ...args) => original(fn, ms === 45000 ? 5 : ms, ...args); });
  await upload(fixturePdf());
  await page.locator('.redactor-error').filter({ hasText: 'exceeded 45 seconds' }).waitFor();
  assert.equal(await pageSelect.count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: PDF browser upload/render → region/custom/manual review → verified download; independent input, scan/mixed/encrypted/layers/actions/form/annotation/attachment/limits failures, review/region denial, cancellation, privacy/CSP and mobile/light mode.');
  await context.close();
} finally { await browser.close(); }
