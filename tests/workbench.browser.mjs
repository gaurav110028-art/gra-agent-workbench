import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.GRA_TEST_URL;
const browser = await chromium.launch({ headless: true, ...(process.env.GRA_TEST_BROWSER_CHANNEL ? { channel: process.env.GRA_TEST_BROWSER_CHANNEL } : {}) });
const privateMarker = 'SYNTHETIC_PRIVATE_WORKSPACE_RECORD';
const legacy = {
  'gra-agents': JSON.stringify([{ id: 1, name: privateMarker, status: 'paused' }]),
  'gra-agents-seeded': 'true',
  'gra-workflow-1': JSON.stringify({ nodes: [], edges: [] }),
  'gra-workflow-version-1': privateMarker,
  'gra-query-inbox': privateMarker,
  'gra-run-history': privateMarker,
  'gra-approval-queue': privateMarker,
  'gra-auth-users': privateMarker,
};

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(base + '/__workbench_fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic fixture</title>' }));
  await page.goto(base + '/__workbench_fixture');
  await page.evaluate(async ({ legacy, privateMarker }) => {
    for (const [key, value] of Object.entries(legacy)) localStorage.setItem(key, value);
    sessionStorage.setItem('synthetic-private', privateMarker);
    const db = indexedDB.open('gra-agent-workbench', 1);
    db.onupgradeneeded = () => db.result.createObjectStore('sources', { keyPath: 'id' });
    await new Promise((resolve, reject) => {
      db.onerror = () => reject(db.error);
      db.onsuccess = () => {
        const transaction = db.result.transaction('sources', 'readwrite');
        transaction.objectStore('sources').put({ id: 'synthetic', agentId: 1, name: privateMarker });
        transaction.oncomplete = () => { db.result.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, { legacy, privateMarker });

  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base || url.pathname.startsWith('/api/')) {
      requests.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    window.publicCalls = [];
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        window.publicCalls.push(method);
        return original.apply(this, args);
      };
    }
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (...args) {
      window.publicCalls.push('indexedDB');
      return open.apply(this, args);
    };
    const fetchRequest = window.fetch;
    window.fetch = (...args) => {
      window.publicCalls.push('fetch');
      return fetchRequest(...args);
    };
  });

  const homepage = await page.goto(base);
  assert.equal(homepage.status(), 200);
  assert(!(await homepage.text()).includes(privateMarker));
  await page.getByText('Bulk Personalized Email Outreach', { exact: true }).click();
  await page.getByText('Workflow Canvas', { exact: true }).waitFor();
  await page.locator('.react-flow__node').filter({ hasText: 'Client List' }).click();
  assert.equal(await page.locator('input[type=file]').count(), 0);
  for (const name of ['Run Workflow', 'Run Audit Demo', '↑ Publish']) {
    assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0);
  }
  await page.getByRole('button', { name: 'Test Run', exact: true }).click();
  await page.getByRole('button', { name: /Approve & Continue/ }).click();
  await page.locator('.consoleRunState.is-completed').waitFor();
  await page.getByRole('button', { name: /Dashboard/ }).click();
  await page.getByText('Client Query Auto-Classifier & Draft Reply', { exact: true }).click();
  await page.getByRole('button', { name: 'Test Run', exact: true }).click();
  await page.getByText('Test Run · simulated', { exact: true }).waitFor();
  await page.locator('.consoleStep-completed').filter({ hasText: 'Classify & Draft' }).waitFor();
  assert(!(await page.locator('body').innerText()).includes(privateMarker));
  assert.deepEqual(await page.evaluate(() => publicCalls), []);
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(legacy)), legacy);
  await context.close();
  console.log('PASS: public canvas, inspector and simulated workflows bypass private storage and provider calls, including legacy profile data.');
} finally {
  await browser.close();
}
