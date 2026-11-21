import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.GRA_TEST_URL;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.GRA_TEST_BROWSER_CHANNEL
    ? { channel: process.env.GRA_TEST_BROWSER_CHANNEL }
    : {}),
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [],
    unexpected = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/whatsapp');
  await page.locator('#login-email').fill(process.env.GRA_TEST_EMAIL);
  await page.locator('#login-password').fill(process.env.GRA_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL(base + '/whatsapp');
  await page.evaluate(() =>
    localStorage.setItem('gra-query-inbox', 'PRIVATE_MARKER_DO_NOT_RENDER'),
  );
  await page.reload();
  await page.getByRole('heading', { name: 'Overview', exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  await page.route('**/*', (route) => {
    unexpected.push(route.request().url());
    return route.abort();
  });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const tab = (name) =>
    page
      .getByRole('navigation', { name: 'WhatsApp sections' })
      .getByRole('button', { name, exact: true })
      .click();
  const field = (name) => page.getByLabel(name, { exact: true });
  await tab('Contacts');
  await button('Add contact').click();
  await field('Contact name').fill('Demo recipient');
  await field('Phone number').fill('555');
  await button('Save contact').click();
  await page.getByRole('alert').filter({ hasText: 'international' }).waitFor();
  await field('Phone number').fill('+12025550188');
  await field('Consent status').selectOption('Opted in');
  await button('Add variable').click();
  await field('Key 1').fill('ref');
  await field('Value 1').fill('DEMO-VALUE');
  await button('Save contact').click();
  await button('Edit Demo recipient').click();
  await field('Contact name').fill('Demo contact');
  await button('Save contact').click();
  await button('Import CSV').click();
  await field('CSV text').fill(
    'name,phone,consent\nCSV demo,+12025550187,Unknown',
  );
  await button('Preview CSV').click();
  await button('Import 1 sample contacts').click();
  await page.getByText('CSV demo', { exact: true }).waitFor();
  await field('Search contacts').fill('Demo contact');
  await field('Select all visible opted-in contacts').check();
  await button('Draft for selected (1)').click();
  await button('Continue to recipients').click();
  await page.getByRole('alert').filter({ hasText: 'Enter a campaign name' }).waitFor();
  assert.equal(await field('Campaign name').getAttribute('aria-invalid'), 'true');
  await field('Campaign name').fill('Synthetic draft');
  await button('Continue to recipients').click();
  assert(await page.getByRole('checkbox', { name: /Demo contact/ }).isChecked());
  await button('Continue to personalization').click();
  await button('Review campaign').click();
  assert.equal(await field('Body variable 1').getAttribute('aria-invalid'), 'true');
  for (const [i, v] of ['name', 'phone', 'var:ref'].entries())
    await field('Body variable ' + (i + 1)).selectOption(v);
  await button('Review campaign').click();
  assert.equal(await button('Save simulated draft').count(), 0);
  await page.getByRole('alert').filter({ hasText: 'HTTPS PDF URL' }).waitFor();
  await field('PDF URL').fill('https://example.invalid/synthetic.pdf');
  await button('Review campaign').click();
  await page.getByText('DEMO-VALUE', { exact: true }).waitFor();
  await button('Back').click();
  assert.equal(await field('Body variable 3').inputValue(), 'var:ref');
  await button('Review campaign').click();
  await button('Save simulated draft').click();
  await page
    .getByRole('cell', { name: 'Synthetic draft', exact: true })
    .waitFor();
  await tab('Templates');
  await button('Preview reminder_bank_doc_percent').click();
  await page.getByText('{{4}}', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert(await button('Preview reminder_bank_doc_percent').evaluate(node => document.activeElement === node));
  await button('Add template').click();
  await field('Template identifier').fill('synthetic_template');
  await field('Language code').fill('en');
  await button('Save template metadata').click();
  await tab('Automated Reminders');
  const reminder = page
    .locator('article')
    .filter({ hasText: 'Bank document follow-up' });
  await reminder.getByRole('button', { name: 'Simulate failure' }).click();
  assert(
    (await reminder.innerText()).includes(
      'Next eligible: 2026-04-12 09:00 UTC',
    ),
  );
  await reminder.getByRole('button', { name: 'Pause', exact: true }).click();
  assert(
    await reminder
      .getByRole('button', { name: 'Simulate failure' })
      .isDisabled(),
  );
  await reminder.getByRole('button', { name: 'Resume' }).click();
  await reminder.getByRole('button', { name: 'Disable', exact: true }).click();
  await button('Confirm disable').click();
  await button('Add reminder').click();
  await field('Reminder name').fill('New sample');
  await field('Reminder template').selectOption('synthetic_template');
  await field('Interval in days').selectOption('5');
  await button('Save reminder').click();
  await tab('Message Logs');
  await field('Result filter').selectOption('Failed');
  await field('Search message logs').fill('Simulated failure');
  assert.equal(await page.locator('tbody tr').count(), 1);
  await field('Search message logs').fill('missing record');
  await page.getByText('No matching records.').waitFor();
  await tab('Integrations');
  await page.getByText('Disconnected', { exact: true }).waitFor();
  await button('Switch theme').click();
  await page.setViewportSize({ width: 390, height: 844 });
  const workbenchMenu = button('Workbench navigation');
  await workbenchMenu.focus();
  await page.keyboard.press('Enter');
  assert.equal(await workbenchMenu.getAttribute('aria-expanded'), 'true');
  assert(await page.getByRole('link', { name: 'Document Redactor', exact: true }).isVisible());
  await workbenchMenu.click();
  assert.equal(await workbenchMenu.getAttribute('aria-expanded'), 'false');
  await tab('Overview');
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert(
    !(await page.locator('body').innerText()).includes(
      'PRIVATE_MARKER_DO_NOT_RENDER',
    ),
  );
  assert.deepEqual(
    await page.evaluate(() => Object.keys(localStorage).sort()),
    ['gra-query-inbox', 'gra-theme'],
  );
  assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  assert.deepEqual(
    await page.evaluate(async () =>
      (await indexedDB.databases()).map((db) => db.name),
    ),
    [],
  );
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: WhatsApp dashboard navigation, contact edits and CSV, campaign mapping and PDF validation, template metadata, reminders, logs, mobile layout and isolated simulation.',
  );
} finally {
  await browser.close();
}
