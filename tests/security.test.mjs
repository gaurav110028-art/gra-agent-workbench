import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { sealData } from 'iron-session';
import { authConfig, hashPassword, login, logout, authenticate, can, SESSION_TTL } from '../lib/security/auth.mjs';
import { createStore, digest } from '../lib/security/store.mjs';
import { boundedRequest, secure } from '../lib/security/route.mjs';
import { publicAddress, resolveTarget, createSafeFetch, cleanHeaders } from '../lib/security/egress.mjs';
import { mcpStream } from '../lib/security/sse.mjs';
import { requireWhatsAppAdmin } from '../lib/security/whatsapp.mjs';
import { loginDestination } from '../app/access-destinations.js';

const ORIGIN = 'http://localhost:3199';
const password = 'synthetic-only-long-password-2026';
const passwordHash = await hashPassword(password);
const user = { id: 'synthetic-admin', email: 'admin@example.test', name: 'Synthetic Admin', role: 'admin', version: 1, passwordHash };
const env = { GRA_APP_ORIGIN: ORIGIN, GRA_SESSION_PASSWORD: 'synthetic-session-key-'.repeat(3), GRA_AUTH_USERS_JSON: JSON.stringify([user]), GRA_SECURITY_STORE: 'memory' };
const store = createStore({ env });
const request = (path, method = 'GET', body, cookie) => new Request(ORIGIN + path, { method, headers: { Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });

test('WhatsApp authorization requires the designated server admin ID', () => {
  const other = { ...user, id: 'another-admin', email: 'other-admin@example.test' };
  const config = { users: [user, other] };
  const designation = { GRA_WHATSAPP_ADMIN_ID: user.id };
  requireWhatsAppAdmin({ ...user, config }, designation);
  for (const principal of [other, { ...user, role: 'operator' }, { id: user.id, role: 'service' }]) {
    assert.throws(() => requireWhatsAppAdmin({ ...principal, config }, designation), { status: 403 });
  }
  assert.throws(() => requireWhatsAppAdmin({ ...user, config }, {}), { status: 503 });
  assert.throws(() => requireWhatsAppAdmin({ ...user, config }, { GRA_WHATSAPP_ADMIN_ID: 'unknown' }), { status: 503 });
});

test('login uses a closed allowlist of complete internal destinations', () => {
  for (const target of ['/whatsapp', '/redactor', '/workspace?view=runs']) assert.equal(loginDestination(target), target);
  for (const target of [null, 'https://external.example', '//external.example', '/workspace?view=unknown', '/whatsapp?next=//external.example', '/%2fexternal.example']) {
    assert.equal(loginDestination(target), '/workspace');
  }
});

test('no default credentials, weak secrets or invalid roles accepted', () => {
  assert.throws(() => authConfig({}));
  assert.throws(() => authConfig({ ...env, GRA_SESSION_PASSWORD: 'weak' }));
  assert.throws(() => authConfig({ ...env, GRA_AUTH_USERS_JSON: JSON.stringify([{ ...user, role: '__proto__' }]) }));
  assert.throws(() => authConfig({ ...env, GRA_APP_ORIGIN: 'http://example.test' }));
});
test('server session is HttpOnly, expires, rejects tampering and is revoked by logout', async () => {
  const result = await login(request('/login', 'POST', { email: user.email, password }), { env, store });
  assert.equal(result.status, 200);
  const header = result.headers.get('set-cookie');
  assert(header.includes('HttpOnly') && header.includes('SameSite=Strict') && header.includes('Max-Age=3600'));
  const seal = header.split(';')[0];
  assert(!seal.includes(user.email) && !seal.includes(password));
  const principal = await authenticate(request('/session', 'GET', undefined, seal), { env, store });
  assert.equal(principal.id, user.id);
  assert(can(principal, 'email:send'));
  await assert.rejects(authenticate(request('/session', 'GET', undefined, seal + 'tampered'), { env, store }), e => e.status === 401);
  await assert.rejects(authenticate(request('/session', 'GET', undefined, seal), { env, store, now: () => Date.now() + SESSION_TTL * 1000 + 100 }), e => e.status === 401);
  await logout(request('/logout', 'POST', undefined, seal), { env, store });
  await assert.rejects(authenticate(request('/session', 'GET', undefined, seal), { env, store }), e => e.status === 401);
});
test('password/version/role changes revoke prior sessions and future-dated seals fail', async () => {
  const response = await login(request('/login', 'POST', { email: user.email, password }), { env, store });
  const cookie = response.headers.get('set-cookie').split(';')[0];
  for (const changed of [{ version: 2 }, { role: 'viewer' }, { passwordHash: await hashPassword('another-synthetic-password') }]) {
    const updated = { ...env, GRA_AUTH_USERS_JSON: JSON.stringify([{ ...user, ...changed }]) };
    await assert.rejects(authenticate(request('/session', 'GET', undefined, cookie), { env: updated, store }), e => e.status === 401);
  }
  const seal = await sealData({ uid: user.id, sid: 'a'.repeat(64), exp: Date.now() + 9000000 }, { password: env.GRA_SESSION_PASSWORD, ttl: 10000 });
  await assert.rejects(authenticate(request('/session', 'GET', undefined, `gra-local-session=${seal}`), { env, store }), e => e.status === 401);
});
test('strict browser origins prevent CSRF, including null/missing origins on mutation', async () => {
  for (const origin of ['https://evil.example', 'null', null]) {
    const headers = origin ? { Origin: origin } : {};
    await assert.rejects(login(new Request(ORIGIN, { method: 'POST', headers, body: '{}' }), { env, store }), e => e.status === 403);
  }
});
test('production cookies are host-only and Secure; localhost exception is denied on Vercel', () => {
  const production = authConfig({ ...env, GRA_APP_ORIGIN: 'https://synthetic.example' });
  assert.equal(production.cookieName, '__Host-gra-session');
  assert.equal(production.secure, true);
  assert.throws(() => authConfig({ ...env, VERCEL: '1' }));
});
test('scoped machine credentials cannot inherit browser roles or unrelated permissions', async () => {
  const token = 'synthetic-webhook-token-'.repeat(3);
  const config = { ...env, GRA_SERVICE_TOKENS_JSON: JSON.stringify([{ id: 'hook', sha256: digest(token), scopes: ['webhook:ingest'] }]) };
  const principal = await authenticate(new Request(ORIGIN, { headers: { Authorization: `Bearer ${token}` } }), { env: config, store });
  assert(can(principal, 'webhook:ingest'));
  for (const permission of ['queries:read', 'email:send', 'mcp:write', 'workbench:read']) assert(!can(principal, permission));
  await assert.rejects(authenticate(new Request(ORIGIN, { headers: { Authorization: `Bearer ${'x'.repeat(40)}` } }), { env: config, store }), e => e.status === 401);
});
test('rate windows expire and memory storage is forbidden on Vercel', async () => {
  let now = Date.now();
  const local = createStore({ env: { ...env, GRA_APP_ORIGIN: ORIGIN + '/unit-limit' }, now: () => now });
  await local.limit('synthetic', 2, 2); await local.limit('synthetic', 2, 2);
  await assert.rejects(local.limit('synthetic', 2, 2), e => e.status === 429);
  now += 2100; await local.limit('synthetic', 2, 2);
  await assert.rejects(createStore({ env: { ...env, VERCEL: '1' } }).limit('x', 1), e => e.status === 503);
  await assert.rejects(createStore({ env: {} }).get('session:x'), e => e.status === 503);
});
test('Redis uses atomic counters with expiry and fails closed on backend/response errors', async () => {
  const calls = [];
  const redisEnv = { ...env, GRA_SECURITY_STORE: 'redis', GRA_REDIS_REST_URL: 'https://synthetic.upstash.io', GRA_REDIS_REST_TOKEN: 'synthetic-only-token' };
  const redis = createStore({ env: redisEnv, fetch: async (url, options) => { calls.push({ url, options }); return Response.json({ result: 1 }); } });
  await redis.limit('principal:x', 2);
  const command = JSON.parse(calls[0].options.body);
  assert.equal(command[0], 'EVAL'); assert(command[1].includes('EXPIRE'));
  assert.equal(calls[0].options.maxRedirects, 0);
  for (const response of [Response.json({ error: 'synthetic secret' }), Response.json({ result: null }), new Response('malformed')]) {
    const broken = createStore({ env: redisEnv, fetch: async () => response });
    await assert.rejects(broken.limit('x', 1), e => e.status === 503 && !e.message.includes('secret'));
  }
  const outage = createStore({ env: redisEnv, fetch: async () => { throw new Error('private key'); } });
  await assert.rejects(outage.get('x'), e => e.status === 503 && !e.message.includes('private'));
});
test('request byte limits apply to actual streams, not just Content-Length', async () => {
  await assert.rejects(boundedRequest(new Request(ORIGIN, { method: 'POST', body: '123456' }), 5), e => e.status === 413);
  await assert.rejects(boundedRequest(new Request(ORIGIN, { method: 'POST', headers: { 'Content-Length': '9999' }, body: '{}' }), 5), e => e.status === 413);
  assert.equal(await (await boundedRequest(new Request(ORIGIN, { method: 'POST', body: '{}' }), 5)).text(), '{}');
});
test('route authorization happens before body/handler execution and failures never echo upstream data', async () => {
  let invoked = false;
  const dependencies = { store: { limit: async () => {} }, authenticate: async () => ({ id: 'viewer', scopes: ['workbench:read'] }) };
  const forbidden = secure({ permission: 'email:send' }, () => { invoked = true; return Response.json({}); }, dependencies);
  assert.equal((await forbidden(request('/send', 'POST', {}))).status, 403); assert.equal(invoked, false);
  const failed = secure({ permission: 'workbench:read' }, () => Response.json({ error: 'SYNTHETIC_PROVIDER_SECRET' }, { status: 500 }), dependencies);
  const response = await failed(request('/models'));
  assert.equal(response.status, 502); assert(!(await response.text()).includes('SYNTHETIC_PROVIDER_SECRET'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('every API export is security-wrapped and Edge runtimes are removed', () => {
  const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
  for (const file of walk('app/api').filter(f => f.endsWith('/route.js'))) {
    const source = readFileSync(file, 'utf8');
    assert(!/runtime\s*=\s*['"]edge/.test(source), file);
    const exports = [...source.matchAll(/export\s+(?:const|(?:async\s+)?function)\s+(GET|POST|DELETE|PATCH|PUT|OPTIONS)\b/g)];
    assert(exports.length > 0, file);
    for (const match of exports) assert(new RegExp(`export const ${match[1]} = secure\\(`).test(source), `${file}: ${match[1]}`);
  }
});
test('malformed or non-object JSON is rejected before authenticated handlers execute', async () => {
  let invoked = false;
  const wrapped = secure({ permission: 'workbench:read' }, () => { invoked = true; return Response.json({}); }, { store: { limit: async () => {} }, authenticate: async () => ({ id: 'viewer', scopes: ['workbench:read'] }) });
  for (const body of ['{broken', 'null', '[]', '"string"']) {
    const response = await wrapped(new Request(ORIGIN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }));
    assert.equal(response.status, 400); assert.equal(invoked, false);
    assert(!(await response.text()).includes('broken'));
  }
});

test('private, loopback, link-local, CGNAT, reserved and IPv6 transition addresses are blocked', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.2.3', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '192.0.2.1', '198.18.0.1', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8', '2002:0808:0808::1', '64:ff9b::a00:1', '4000::1']) assert.equal(publicAddress(ip), false, ip);
  assert(publicAddress('8.8.8.8')); assert(publicAddress('2001:4860:4860::8888'));
});
test('URL canonicalization, numeric IPv4, userinfo, fragments and alternate schemes cannot bypass policy', async () => {
  const lookup = async () => [{ address: '8.8.8.8', family: 4 }];
  for (const url of ['http://2130706433', 'http://0x7f000001', 'http://0177.0.0.1', 'http://127.1', 'http://[::1]', 'http://[::ffff:7f00:1]', 'http://localhost', 'http://test.local', 'file:///secret', 'https://user:pass@example.test', 'https://example.test/#secret', 'https://example.test.']) await assert.rejects(resolveTarget(url, { lookup }), url);
});
test('DNS answers are all validated; mixed public/private and empty resolutions fail', async () => {
  for (const answers of [[], [{ address: '8.8.8.8', family: 4 }, { address: '10.1.1.1', family: 4 }]]) await assert.rejects(resolveTarget('https://example.test', { lookup: async () => answers }));
});
test('redirects are re-resolved and DNS rebinding cannot change a pinned hop', async () => {
  let lookups = 0, hops = 0;
  const fetch = createSafeFetch({ lookup: async () => [{ address: ++lookups === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 }], hop: async (_url, addresses) => {
    hops++; assert.equal(addresses[0].address, '8.8.8.8'); return new Response(null, { status: 302, headers: { location: '/next' } });
  } });
  await assert.rejects(fetch('https://example.test'), e => e.code === 'EGRESS_BLOCKED');
  assert.equal(hops, 1); assert.equal(lookups, 2);
});
test('cross-origin redirects strip all credentials and block body forwarding and TLS downgrade', async () => {
  const captured = [];
  const fetch = createSafeFetch({ lookup: async () => [{ address: '8.8.8.8', family: 4 }], hop: async (url, _addresses, options) => {
    captured.push(options);
    return url.hostname === 'first.test' ? new Response(null, { status: 302, headers: { location: 'https://second.test/final' } }) : new Response('safe');
  } });
  await fetch('https://first.test', { headers: { authorization: 'Bearer synthetic', 'x-api-key': 'synthetic' } });
  assert(!captured[1].headers.authorization && !captured[1].headers['x-api-key']);
  await assert.rejects(fetch('https://first.test', { method: 'POST', body: 'synthetic confidential test' }), e => e.code === 'EGRESS_BLOCKED');
  const downgrade = createSafeFetch({ lookup: async () => [{ address: '8.8.8.8', family: 4 }], hop: async () => new Response(null, { status: 302, headers: { location: 'http://first.test/next' } }) });
  await assert.rejects(downgrade('https://first.test'), e => e.code === 'EGRESS_BLOCKED');
});
test('provider policy blocks redirects, restricts hosts, sanitizes network errors, and DNS timeout fails', async () => {
  const fetch = createSafeFetch({ lookup: async () => [{ address: '8.8.8.8', family: 4 }], hop: async () => new Response(null, { status: 307, headers: { location: '/next' } }) });
  await assert.rejects(fetch('https://provider.test', { maxRedirects: 0 }), e => e.code === 'UPSTREAM_REDIRECT');
  await assert.rejects(fetch('https://evil.test', { allowedHosts: ['provider.test'] }), e => e.code === 'EGRESS_BLOCKED');
  const failure = createSafeFetch({ lookup: async () => [{ address: '8.8.8.8', family: 4 }], hop: async () => { throw new Error('url?key=SYNTHETIC_SECRET'); } });
  await assert.rejects(failure('https://provider.test'), e => !e.message.includes('SYNTHETIC_SECRET'));
  const slow = createSafeFetch({ lookup: async () => new Promise(() => {}) });
  // Keep the test process alive while AbortSignal's unref'd deadline fires.
  const keepAlive = setTimeout(() => {}, 500);
  try { await assert.rejects(slow('https://provider.test', { timeoutMs: 20 }), e => e.code === 'UPSTREAM_TIMEOUT'); } finally { clearTimeout(keepAlive); }
});
test('hop-by-hop, cookie and forwarding headers are never proxied', () => {
  const headers = cleanHeaders({ Cookie: 'synthetic', Host: 'private', 'X-Forwarded-For': '127.0.0.1', Connection: 'keep-alive', Authorization: 'Bearer intended' });
  assert.equal(headers.authorization, 'Bearer intended');
  assert(!headers.cookie && !headers.host && !headers['x-forwarded-for'] && !headers.connection);
});
test('SSE emits trusted endpoint and cancels without leaving heartbeat timers', async () => {
  const previous = process.env.GRA_APP_ORIGIN; process.env.GRA_APP_ORIGIN = ORIGIN;
  try {
    const response = mcpStream(request('/api/mcp'));
    const reader = response.body.getReader();
    assert(new TextDecoder().decode((await reader.read()).value).includes(`${ORIGIN}/api/mcp`));
    await reader.cancel();
  } finally { if (previous === undefined) delete process.env.GRA_APP_ORIGIN; else process.env.GRA_APP_ORIGIN = previous; }
});
