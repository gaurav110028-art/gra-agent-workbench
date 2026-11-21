import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.GRA_TEST_URL;
const marker = 'SYNTHETIC_PRIVATE_MIGRATION_VALUE';
const browser = await chromium.launch({ headless: true, ...(process.env.GRA_TEST_BROWSER_CHANNEL ? { channel: process.env.GRA_TEST_BROWSER_CHANNEL } : {}) });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base + '/workspace/migration');
  assert.equal(new URL(page.url()).searchParams.get('next'), '/workspace/migration');
  await page.locator('#login-email').fill(process.env.GRA_TEST_EMAIL);
  await page.locator('#login-password').fill(process.env.GRA_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL(base + '/workspace/migration');
  const preview = page.getByRole('button', { name: 'Preview this browser' });
  const requests = [];
  await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
  await preview.click();
  await page.getByText('No known legacy records were found in this profile.').waitFor();
  assert.deepEqual(await page.evaluate(async () => (await indexedDB.databases()).map(db => db.name)), []);

  await page.evaluate(async marker => {
    localStorage.setItem('gra-agents', JSON.stringify([{ id: 17, name: marker, status: 'paused' }]));
    localStorage.setItem('gra-workflow-version-17', '{broken');
    localStorage.setItem('gra-auth-users', marker);
    const open = indexedDB.open('gra-agent-workbench', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('sources', { keyPath: 'id' });
    await new Promise((resolve, reject) => {
      open.onerror = reject;
      open.onsuccess = () => {
        const transaction = open.result.transaction('sources', 'readwrite');
        const file = new Blob([marker], { type: 'text/plain' });
        transaction.objectStore('sources').put({
          id: 'synthetic', agentId: '17', name: marker, size: file.size,
          mimeType: file.type, category: 'Text', uploadedAt: new Date().toISOString(), file,
        });
        transaction.oncomplete = () => { open.result.close(); resolve(); };
        transaction.onerror = reject;
      };
    });
  }, marker);
  const getRows = () => page.getByRole('table').getByRole('row').allTextContents();
  const snapshots = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    await preview.click();
    await page.getByText('Review invalid records and unreadable data before approving any future import.').waitFor();
    snapshots.push(await getRows());
  }
  assert.deepEqual(snapshots[0], snapshots[1]);
  const cells = label => page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: label, exact: true }) }).getByRole('cell').allTextContents();
  assert.deepEqual((await cells('Agents')).slice(0, 4), ['1', '0', '0', '0']);
  assert.deepEqual((await cells('Workflow versions')).slice(0, 4), ['0', '0', '1', '0']);
  assert.deepEqual((await cells('Source files')).slice(0, 4), ['1', '0', '0', '0']);
  assert.deepEqual((await cells('Legacy identity keys')).slice(0, 4), ['0', '0', '0', '1']);
  assert(!(await page.content()).includes(marker));
  assert.deepEqual(await page.evaluate(() => [localStorage.getItem('gra-auth-users'), localStorage.getItem('gra-workflow-version-17')]), [marker, '{broken']);
  assert.deepEqual(requests, []);
  await context.close();
  console.log('PASS: designated admin preview, empty profile, IndexedDB inventory, malformed data and repeat scans without disclosure, network calls or writes.');
} finally {
  await browser.close();
}
