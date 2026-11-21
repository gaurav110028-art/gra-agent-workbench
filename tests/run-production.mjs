import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { sealData } from 'iron-session';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../lib/security/auth.mjs';
import { digest } from '../lib/security/store.mjs';

const port = process.env.GRA_TEST_PORT || '3100';
const origin = `http://localhost:${port}`;
const password = 'synthetic-only-test-password-2026';
const passwordHash = await hashPassword(password);
const users = ['admin', 'other-admin', 'operator', 'viewer', 'logout', 'lockout'].map(id => ({ id, email: `${id}@example.test`, name: `Synthetic ${id}`, role: id === 'other-admin' ? 'admin' : ['admin', 'operator'].includes(id) ? id : 'viewer', version: 1, passwordHash }));
const readToken = 'synthetic-mcp-read-token-'.repeat(3), writeToken = 'synthetic-mcp-write-token-'.repeat(3), hookToken = 'synthetic-hook-ingest-token-'.repeat(3);
const env = {
  ...process.env, NODE_ENV: 'production', VERCEL: '', NEXT_TELEMETRY_DISABLED: '1',
  GRA_APP_ORIGIN: origin, GRA_SECURITY_STORE: 'memory', GRA_SESSION_PASSWORD: randomBytes(48).toString('base64url'), GRA_AUTH_USERS_JSON: JSON.stringify(users),
  GRA_WHATSAPP_ADMIN_ID: 'admin',
  GRA_ENABLE_LEGACY_IMPORT: 'false', DATABASE_URL: '', DATABASE_URL_UNPOOLED: '',
  GRA_SERVICE_TOKENS_JSON: JSON.stringify([{ id: 'reader', sha256: digest(readToken), scopes: ['mcp:read'] }, { id: 'writer', sha256: digest(writeToken), scopes: ['mcp:read', 'mcp:write'] }, { id: 'hook', sha256: digest(hookToken), scopes: ['webhook:ingest'] }]),
  GRA_HTTP_ALLOWED_HOSTS: 'approved.test', GRA_INTEGRATION_ORIGINS: 'https://extension.example', GRA_ENABLE_SYNTHETIC_AUDIT: 'false',
  GRA_TEST_URL: origin, GRA_TEST_EMAIL: 'admin@example.test', GRA_TEST_PASSWORD: password,
  GRA_TEST_READ_TOKEN: readToken, GRA_TEST_WRITE_TOKEN: writeToken, GRA_TEST_HOOK_TOKEN: hookToken,
  // Never inherit real provider credentials into synthetic tests.
  OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GROQ_API_KEY: '', OPENROUTER_API_KEY: '', RESEND_API_KEY: '',
};
async function run(file) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', resolve);
  });
  if (code !== 0) throw new Error(`${file} failed.`);
}
async function withServer(serverEnv, verify) {
  let startup = '';
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', port, '-H', 'localhost'], { env: serverEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { startup += chunk.toString(); });
  server.stderr.on('data', chunk => { startup += chunk.toString(); });
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) throw new Error(`Production server failed to start: ${startup}`);
      if (startup.includes('Ready in')) {
        try {
          const response = await fetch(`${origin}/login`);
          if (response.ok) { ready = true; break; }
        } catch { /* Still starting. */ }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error(`Production server did not become ready: ${startup}`);
    await verify();
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
  }
}

await withServer({ ...env, GRA_SESSION_PASSWORD: '', GRA_AUTH_USERS_JSON: '', GRA_SECURITY_STORE: '', GRA_REDIS_REST_URL: '', GRA_REDIS_REST_TOKEN: '' }, async () => {
  const homepage = await fetch(origin);
  assert.equal(homepage.status, 200);
  assert.match(await homepage.text(), /Simulation only/);
  for (const path of ['/workspace', '/whatsapp', '/redactor', '/api/webhook/whatsapp']) {
    assert.equal((await fetch(origin + path, { redirect: 'manual' })).status, 503, path);
  }
  console.log('PASS: homepage renders with no auth or security storage configuration; private pages and APIs fail closed.');
});
await withServer({ ...env, GRA_SECURITY_STORE: 'redis', GRA_REDIS_REST_URL: '', GRA_REDIS_REST_TOKEN: '' }, async () => {
  const seal = await sealData({ uid: 'admin', sid: 'b'.repeat(64), exp: Date.now() + 60000 }, { password: env.GRA_SESSION_PASSWORD, ttl: 3600 });
  const headers = { Cookie: `gra-local-session=${seal}` };
  assert.equal((await fetch(origin, { headers })).status, 200);
  assert.equal((await fetch(origin + '/whatsapp', { headers, redirect: 'manual' })).status, 503);
  console.log('PASS: with auth configured and Redis unavailable, the public homepage renders and the private page fails closed.');
});
await withServer(env, async () => {
  await run('tests/security.server.mjs');
  await run('tests/security.browser.mjs');
  await run('tests/workbench.browser.mjs');
  await run('tests/whatsapp.browser.mjs');
  await run('tests/migration.browser.mjs');
  await run('tests/redactor.browser.mjs');
  console.log('PASS: production-server security and browser regression suite. Synthetic data only; no provider keys configured.');
});
