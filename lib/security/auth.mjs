import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { sealData, unsealData } from 'iron-session';
import { digest, securityStore } from './store.mjs';
import { SecurityError } from './errors.mjs';

const scrypt = promisify(scryptCallback);
export const SESSION_TTL = 3600;
const roles = {
  viewer: ['workbench:read', 'mcp:read', 'queries:read'],
  operator: ['workbench:read', 'mcp:read', 'mcp:write', 'queries:read', 'webhook:ingest', 'workflow:write', 'ai:invoke', 'http:invoke', 'audit:invoke'],
  admin: ['*'],
};
const configuration = () => { throw new SecurityError(503, 'Server authentication is not configured correctly. Contact the administrator.', 'AUTH_NOT_CONFIGURED'); };
export function authConfig(env = process.env) {
  let origin, users, tokens;
  try {
    origin = new URL(env.GRA_APP_ORIGIN);
    users = JSON.parse(env.GRA_AUTH_USERS_JSON || '[]');
    tokens = JSON.parse(env.GRA_SERVICE_TOKENS_JSON || '[]');
  } catch { configuration(); }
  if (origin.origin !== env.GRA_APP_ORIGIN || origin.username || origin.password || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname) && !env.VERCEL))) configuration();
  if (!env.GRA_SESSION_PASSWORD || env.GRA_SESSION_PASSWORD.length < 32 || !Array.isArray(users) || !users.length || users.length > 50 || !Array.isArray(tokens) || tokens.length > 50) configuration();
  const ids = new Set(), emails = new Set();
  for (const user of users) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(user.id || '') || !/^[^\s@]{1,100}@[^\s@]{1,150}$/.test(user.email || '') || !Object.hasOwn(roles, user.role) || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(user.passwordHash || '') || !Number.isInteger(user.version) || user.version < 1 || ids.has(user.id) || emails.has(user.email.toLowerCase())) configuration();
    ids.add(user.id); emails.add(user.email.toLowerCase());
  }
  for (const token of tokens) if (!/^[a-zA-Z0-9_-]{1,64}$/.test(token.id || '') || !/^[a-f0-9]{64}$/.test(token.sha256 || '') || !Array.isArray(token.scopes) || token.scopes.some(s => !['mcp:read', 'mcp:write', 'webhook:ingest'].includes(s))) configuration();
  return { origin: origin.origin, users, tokens, password: env.GRA_SESSION_PASSWORD, cookieName: origin.protocol === 'https:' ? '__Host-gra-session' : 'gra-local-session', secure: origin.protocol === 'https:' };
}
export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 16 || password.length > 256) throw new SecurityError(400, 'Passwords must contain 16–256 characters.');
  const hash = await scrypt(password, salt, 64, { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [, salt, hash] = stored.split('$');
  const derived = await scrypt(password, salt, 64, { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  return timingSafeEqual(derived, Buffer.from(hash, 'hex'));
}
export function can(principal, permission) { return principal?.scopes?.includes('*') || principal?.scopes?.includes(permission) || false; }
export function publicUser(principal) { return { userId: principal.id, email: principal.email, name: principal.name, role: principal.role, workspace: 'GRA' }; }
const generation = user => digest(`${user.id}:${user.version}:${user.passwordHash}:${user.role}`);
export function cookie(config, value, age = SESSION_TTL) {
  return `${config.cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${config.secure ? '; Secure' : ''}`;
}
export function checkBrowserOrigin(request, config, mutate = false) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== config.origin) || request.headers.get('sec-fetch-site') === 'cross-site' || (mutate && origin !== config.origin)) throw new SecurityError(403, 'A same-origin browser request is required.', 'ORIGIN_REJECTED');
}
export async function login(request, { env = process.env, store = securityStore, now = Date.now } = {}) {
  const config = authConfig(env);
  checkBrowserOrigin(request, config, true);
  const payload = await request.json().catch(() => { throw new SecurityError(400, 'Invalid login request.'); });
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (email.length > 254 || password.length > 256) throw new SecurityError(400, 'Invalid login request.');
  await store.limit('login:global', 30);
  await store.limit(`login:account:${digest(email)}`, 5);
  const user = config.users.find(u => u.email.toLowerCase() === email);
  // Same expensive derivation for unknown accounts; no user enumeration details.
  const valid = await verifyPassword(password, user?.passwordHash || `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`);
  if (!user || !valid) throw new SecurityError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS');
  const sid = randomBytes(32).toString('hex');
  const exp = now() + SESSION_TTL * 1000;
  await store.set(`session:${sid}`, generation(user), SESSION_TTL);
  const value = await sealData({ uid: user.id, sid, exp }, { password: config.password, ttl: SESSION_TTL });
  return Response.json({ user: publicUser(user) }, { headers: { 'Set-Cookie': cookie(config, value), 'Cache-Control': 'no-store' } });
}
export async function authenticate(request, { env = process.env, store = securityStore, now = Date.now } = {}) {
  const config = authConfig(env);
  const authorization = request.headers.get('authorization');
  if (authorization) {
    if (!/^Bearer [a-zA-Z0-9_-]{32,256}$/.test(authorization)) throw new SecurityError(401, 'Invalid integration credential.', 'UNAUTHORIZED');
    const hash = digest(authorization.slice(7));
    const token = config.tokens.find(t => timingSafeEqual(Buffer.from(hash), Buffer.from(t.sha256)));
    if (!token) throw new SecurityError(401, 'Invalid integration credential.', 'UNAUTHORIZED');
    return { id: `service:${token.id}`, role: 'service', scopes: token.scopes, config };
  }
  checkBrowserOrigin(request, config, !['GET', 'HEAD', 'OPTIONS'].includes(request.method));
  const pairs = (request.headers.get('cookie') || '').split(';').map(s => s.trim());
  const seals = pairs.filter(s => s.startsWith(config.cookieName + '='));
  if (seals.length !== 1 || seals[0].length > 4096) throw new SecurityError(401, 'Sign in to continue.', 'UNAUTHORIZED');
  const seal = seals[0].slice(config.cookieName.length + 1);
  if (!/^[a-zA-Z0-9_.*-]+~2$/.test(seal)) throw new SecurityError(401, 'Session expired or invalid. Sign in again.', 'UNAUTHORIZED');
  const data = await unsealData(seal, { password: config.password, ttl: SESSION_TTL });
  const user = config.users.find(u => u.id === data.uid);
  if (!user || !/^[a-f0-9]{64}$/.test(data.sid || '') || !Number.isSafeInteger(data.exp) || data.exp <= now() || data.exp > now() + SESSION_TTL * 1000 + 1000) throw new SecurityError(401, 'Session expired or invalid. Sign in again.', 'UNAUTHORIZED');
  if (await store.get(`session:${data.sid}`) !== generation(user)) throw new SecurityError(401, 'Session expired or revoked. Sign in again.', 'UNAUTHORIZED');
  return { ...user, scopes: roles[user.role], sid: data.sid, config };
}
export async function logout(request, options = {}) {
  const principal = await authenticate(request, options);
  if (principal.role === 'service') throw new SecurityError(403, 'Browser session required.');
  await (options.store || securityStore).delete(`session:${principal.sid}`);
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie(principal.config, '', 0), 'Cache-Control': 'no-store' } });
}
