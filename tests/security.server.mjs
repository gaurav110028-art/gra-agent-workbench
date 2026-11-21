import assert from 'node:assert/strict';
import { sealData } from 'iron-session';
const base = process.env.GRA_TEST_URL;
const password = process.env.GRA_TEST_PASSWORD;
async function call(path, { method = 'GET', cookie, token, body, origin = base, headers = {} } = {}) {
  return fetch(base + path, { method, redirect: 'manual', headers: { ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function signIn(id) {
  const response = await call('/api/auth/login', { method: 'POST', body: { email: `${id}@example.test`, password } });
  assert.equal(response.status, 200, `login ${id}`);
  return response.headers.get('set-cookie').split(';')[0];
}
const getRoutes = ['/api/auth/session', '/api/architect/models', '/api/architect/advanced', '/api/architect/schedule', '/api/mcp', '/api/mcp/sse', '/api/webhook/whatsapp'];
const postRoutes = ['/api/auth/logout', '/api/ai-node', '/api/send-email', '/api/audit-demo', '/api/http-request', '/api/architect/chat', '/api/architect/advanced', '/api/architect/schedule', '/api/mcp', '/api/webhook/whatsapp', '/api/workspace/migration'];
for (const path of getRoutes) assert.equal((await call(path)).status, 401, path);
for (const path of postRoutes) assert.equal((await call(path, { method: 'POST', body: {} })).status, 401, path);
assert.equal((await call('/api/webhook/whatsapp', { method: 'DELETE' })).status, 401);
const publicPage = await call('/');
assert.equal(publicPage.status, 200);
assert.match(publicPage.headers.get('content-security-policy'), /connect-src 'none'/);
for (const path of ['/workspace', '/workspace/migration', '/whatsapp', '/whatsapp/future', '/redactor']) {
  const response = await call(path); assert.equal(response.status, 307); assert(response.headers.get('location').includes('/login'));
}
assert.equal(new URL((await call('/whatsapp')).headers.get('location'), base).searchParams.get('next'), '/whatsapp');
assert.equal(new URL((await call('/workspace/migration')).headers.get('location'), base).searchParams.get('next'), '/workspace/migration');
assert.equal(new URL((await call('/workspace?view=runs')).headers.get('location'), base).searchParams.get('next'), '/workspace?view=runs');
const hostProbe = await call('/workspace', { headers: { Host: 'evil.example' } });
assert.equal(hostProbe.status, 307); assert.equal(new URL(hostProbe.headers.get('location'), base).origin, base, 'Untrusted Host cannot control the login redirect');
const admin = await signIn('admin'), viewer = await signIn('viewer'), operator = await signIn('operator');
const otherAdmin = await signIn('other-admin');
const adminPage = await call('/whatsapp', { cookie: admin });
assert.equal(adminPage.status, 200);
assert.match(adminPage.headers.get('cache-control'), /no-store/);
assert.match(await adminPage.text(), /WhatsApp Automation/);
assert.equal((await call('/workspace', { cookie: viewer })).status, 200);
for (const cookie of [viewer, operator, otherAdmin]) {
  assert.equal((await call('/workspace/migration', { cookie })).status, 403);
  assert.equal((await call('/api/workspace/migration', { method: 'POST', cookie, body: {} })).status, 403);
  assert.equal((await call('/whatsapp', { cookie })).status, 403);
  assert.equal((await call('/workspace?view=queryInbox', { cookie })).status, 403);
  for (const method of ['GET', 'POST', 'DELETE']) {
    assert.equal((await call('/api/webhook/whatsapp', { method, cookie, body: method === 'POST' ? {} : undefined })).status, 403);
  }
}
const expiredSeal = await sealData({ uid: 'admin', sid: 'a'.repeat(64), exp: Date.now() - 1000 }, { password: process.env.GRA_SESSION_PASSWORD, ttl: 3600 });
const expiredCookie = `gra-local-session=${expiredSeal}`;
assert.equal((await call('/whatsapp', { cookie: expiredCookie })).status, 307);
assert.equal((await call('/api/webhook/whatsapp', { cookie: expiredCookie })).status, 401);
assert.equal((await call('/api/architect/schedule', { method: 'POST', cookie: admin, body: null })).status, 400);
for (const path of getRoutes.filter(s => !['/api/mcp/sse', '/api/webhook/whatsapp'].includes(s))) assert.equal((await call(path, { cookie: viewer })).status, 200, path);
for (const path of ['/api/send-email', '/api/ai-node', '/api/http-request', '/api/architect/schedule']) assert.equal((await call(path, { method: 'POST', cookie: viewer, body: {} })).status, 403, path);
assert.equal((await call('/api/send-email', { method: 'POST', cookie: operator, body: {} })).status, 403);
assert.equal((await call('/api/webhook/whatsapp', { method: 'DELETE', cookie: operator })).status, 403);
assert.equal((await call('/api/architect/schedule', { method: 'POST', cookie: admin, origin: 'https://evil.example', body: { action: 'REGISTER_SCHEDULE', agentId: 'synthetic' } })).status, 403);
assert.equal((await call('/api/architect/models', { cookie: admin, origin: 'https://evil.example' })).status, 403);
assert.equal((await call('/api/architect/schedule', { cookie: admin, method: 'POST', body: { large: 'x'.repeat(300000) } })).status, 413);

const hook = process.env.GRA_TEST_HOOK_TOKEN, reader = process.env.GRA_TEST_READ_TOKEN, writer = process.env.GRA_TEST_WRITE_TOKEN;
assert.equal((await call('/workspace/migration', { token: hook })).status, 403);
assert.equal((await call('/api/workspace/migration', { method: 'POST', token: hook, body: {} })).status, 403);
assert.equal((await call('/api/workspace/migration', { method: 'POST', cookie: admin, origin: 'https://evil.example', body: {} })).status, 403);
const noRepository = await call('/api/workspace/migration', { method: 'POST', cookie: admin, body: { syntheticMarker: 'SYNTHETIC_PRIVATE' } });
assert.equal(noRepository.status, 503);
assert.equal(noRepository.headers.get('cache-control'), 'no-store');
assert.equal((await noRepository.json()).code, 'MIGRATION_STORAGE_UNAVAILABLE');
assert.equal((await call('/whatsapp', { token: hook })).status, 403);
assert.equal((await call('/api/webhook/whatsapp', { token: hook })).status, 403);
assert.equal((await call('/api/webhook/whatsapp', { token: hook, method: 'DELETE' })).status, 403);
assert.equal((await call('/api/send-email', { token: hook, method: 'POST', body: {} })).status, 403);
const ingestion = await call('/api/webhook/whatsapp', { token: hook, method: 'POST', origin: null, body: { senderName: 'Synthetic', message: 'Synthetic GST test message' } });
assert.equal(ingestion.status, 200);
assert(!(await ingestion.text()).includes('Synthetic GST test message'));
assert.equal((await call('/api/webhook/whatsapp', { cookie: admin, method: 'POST', origin: 'https://evil.example', body: {} })).status, 403);
const queries = await (await call('/api/webhook/whatsapp', { cookie: admin })).json(); assert(queries.queries.some(q => q.senderName === 'Synthetic'));
assert.equal((await call('/api/mcp', { token: reader, method: 'POST', body: { id: 1, method: 'tools/list' } })).status, 200);
assert.equal((await call('/api/mcp', { token: reader, method: 'POST', body: { method: 'tools/call', params: { name: 'gra_schedule_agent', arguments: { agentId: 'synthetic-server' } } } })).status, 403);
assert.equal((await call('/api/mcp', { token: writer, method: 'POST', body: { method: 'tools/call', params: { name: 'gra_schedule_agent', arguments: { agentId: 'synthetic-server' } } } })).status, 200);
assert.equal((await call('/api/mcp', { token: writer, method: 'POST', body: { method: 'tools/call', params: { name: 'gra_schedule_agent', arguments: {} } } })).status, 400);
assert.equal((await call('/api/architect/schedule', { cookie: operator, method: 'POST', body: { action: 'PAUSE_SCHEDULE', agentId: 'synthetic-server' } })).status, 200);
const schedule = await (await call('/api/architect/schedule?agentId=synthetic-server', { cookie: admin })).json(); assert.equal(schedule.schedule.durable, false);
const triggered = await call('/api/architect/schedule', { cookie: operator, method: 'POST', body: { action: 'TRIGGER_BACKGROUND_RUN', agentId: 'synthetic-server', agentName: 'Synthetic Run' } });
assert.equal(triggered.status, 200);
await new Promise(resolve => setTimeout(resolve, 1500));
const completed = await (await call('/api/architect/schedule?logs=true&agentId=synthetic-server', { cookie: admin })).json();
assert(completed.logs.some(log => log.event === 'EXECUTION_COMPLETED'), 'Next after() completes the existing simulated lifecycle');
assert.equal((await call('/api/audit-demo', { cookie: admin, method: 'POST', body: {} })).status, 403);
assert.equal((await call('/api/architect/chat', { cookie: operator, method: 'POST', body: { prompt: 'create a synthetic GST workflow' } })).status, 200);
for (const url of ['http://127.0.0.1', 'http://169.254.169.254/latest/meta-data', 'http://[::1]']) assert.equal((await call('/api/http-request', { cookie: operator, method: 'POST', body: { url } })).status, 400);
const badCors = await call('/api/mcp', { method: 'OPTIONS', origin: 'https://evil.example' }); assert.equal(badCors.headers.get('access-control-allow-origin'), null);
const goodCors = await call('/api/mcp', { method: 'OPTIONS', origin: 'https://extension.example' }); assert.equal(goodCors.headers.get('access-control-allow-origin'), 'https://extension.example');
const stream = await call('/api/mcp/sse', { token: reader }); assert.equal(stream.status, 200); const streamReader = stream.body.getReader(); assert(new TextDecoder().decode((await streamReader.read()).value).includes(base + '/api/mcp')); await streamReader.cancel();
for (let i = 0; i < 6; i++) {
  const response = await call('/api/auth/login', { method: 'POST', headers: { 'X-Forwarded-For': `192.0.2.${i}` }, body: { email: 'lockout@example.test', password: 'incorrect-synthetic-password' } });
  assert.equal(response.status, i < 5 ? 401 : 429);
  if (i === 5) assert.equal(response.headers.get('retry-after'), '60');
}
const revoked = await signIn('logout');
assert.equal((await call('/api/auth/logout', { cookie: revoked, method: 'POST' })).status, 200);
assert.equal((await call('/api/auth/session', { cookie: revoked })).status, 401);
assert.equal((await call('/api/webhook/whatsapp', { cookie: admin, method: 'DELETE' })).status, 200);
assert.equal((await call('/api/auth/logout', { cookie: admin, method: 'POST' })).status, 200);
assert.equal((await call('/api/workspace/migration', { method: 'POST', cookie: admin, body: {} })).status, 401);
assert.equal((await call('/whatsapp', { cookie: admin })).status, 307);
assert.equal((await call('/api/webhook/whatsapp', { cookie: admin })).status, 401);
assert.equal((await call('/api/webhook/whatsapp', { cookie: admin, method: 'DELETE' })).status, 401);
console.log('PASS: all protected routes deny anonymous access; role/scope restrictions, CSRF, CORS, SSRF rejection, login throttling, shared-workspace regression, SSE and session revocation verified on production server.');
