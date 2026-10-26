import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../lib/security/auth.mjs';
import { digest } from '../lib/security/store.mjs';

const port = process.env.GRA_TEST_PORT || '3100';
const origin = `http://localhost:${port}`;
const password = 'synthetic-only-test-password-2026';
const passwordHash = await hashPassword(password);
const users = ['admin', 'operator', 'viewer', 'logout', 'lockout'].map(id => ({ id, email: `${id}@example.test`, name: `Synthetic ${id}`, role: ['admin', 'operator', 'viewer'].includes(id) ? id : 'viewer', version: 1, passwordHash }));
const readToken = 'synthetic-mcp-read-token-'.repeat(3), writeToken = 'synthetic-mcp-write-token-'.repeat(3), hookToken = 'synthetic-hook-ingest-token-'.repeat(3);
const env = {
  ...process.env, NODE_ENV: 'production', VERCEL: '', NEXT_TELEMETRY_DISABLED: '1',
  GRA_APP_ORIGIN: origin, GRA_SECURITY_STORE: 'memory', GRA_SESSION_PASSWORD: randomBytes(48).toString('base64url'), GRA_AUTH_USERS_JSON: JSON.stringify(users),
  GRA_SERVICE_TOKENS_JSON: JSON.stringify([{ id: 'reader', sha256: digest(readToken), scopes: ['mcp:read'] }, { id: 'writer', sha256: digest(writeToken), scopes: ['mcp:read', 'mcp:write'] }, { id: 'hook', sha256: digest(hookToken), scopes: ['webhook:ingest'] }]),
  GRA_HTTP_ALLOWED_HOSTS: 'approved.test', GRA_INTEGRATION_ORIGINS: 'https://extension.example', GRA_ENABLE_SYNTHETIC_AUDIT: 'false',
  GRA_TEST_URL: origin, GRA_TEST_EMAIL: 'admin@example.test', GRA_TEST_PASSWORD: password,
  GRA_TEST_READ_TOKEN: readToken, GRA_TEST_WRITE_TOKEN: writeToken, GRA_TEST_HOOK_TOKEN: hookToken,
  // Never inherit real provider credentials into synthetic tests.
  OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GROQ_API_KEY: '', OPENROUTER_API_KEY: '', RESEND_API_KEY: '',
};
let startup = '';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', port, '-H', 'localhost'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', chunk => { startup += chunk.toString(); });
server.stderr.on('data', chunk => { startup += chunk.toString(); });
async function run(file) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', resolve);
  });
  if (code !== 0) throw new Error(`${file} failed.`);
}
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(`Production server failed to start: ${startup}`);
    if (!startup.includes('Ready in')) { await new Promise(resolve => setTimeout(resolve, 250)); continue; }
    try { const response = await fetch(`${origin}/login`); if (response.status === 200) { ready = true; break; } } catch { /* Still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`Production server did not become ready: ${startup}`);
  await run('tests/security.server.mjs');
  await run('tests/security.browser.mjs');
  await run('tests/redactor.browser.mjs');
  await run('tests/xlsx.browser.mjs');
  console.log('PASS: production-server security and browser regression suite. Synthetic data only; no provider keys configured.');
} finally { server.kill(); }
