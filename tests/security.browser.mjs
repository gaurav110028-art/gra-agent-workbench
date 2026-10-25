import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.GRA_TEST_URL;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('gra-auth-session', JSON.stringify({ role: 'admin', email: 'forged@example.test' })));
  await page.goto(base + '/redactor');
  assert(new URL(page.url()).pathname === '/login', 'Forged local session cannot access protected page');
  await page.locator('#login-email').fill(process.env.GRA_TEST_EMAIL);
  await page.locator('#login-password').fill(process.env.GRA_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL(base + '/redactor');
  const cookies = await context.cookies();
  const session = cookies.find(cookie => cookie.name === 'gra-local-session');
  assert(session?.httpOnly && session.sameSite === 'Strict');
  assert(!(await page.evaluate(() => document.cookie)).includes(session.value));
  // Client storage forgery cannot grant server-side write permission.
  const api = await page.request.get(base + '/api/auth/session'); assert.equal(api.status(), 200);
  await page.getByRole('link', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm sign out', exact: true }).click();
  await page.waitForURL(base + '/login');
  const replay = await context.request.get(base + '/api/auth/session', { headers: { Cookie: `gra-local-session=${session.value}` } });
  assert.equal(replay.status(), 401);
  await page.goto(base); assert.equal(new URL(page.url()).pathname, '/login');
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS: browser login, protected-page redirects, localStorage forgery rejection, HttpOnly session and logout/replay rejection.');
} finally { await browser.close(); }
