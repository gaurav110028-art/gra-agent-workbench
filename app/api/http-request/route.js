import { secure } from '../../../lib/security/route.mjs';
import { safeFetch } from '../../../lib/security/egress.mjs';
import { SecurityError } from '../../../lib/security/errors.mjs';
export const runtime = 'nodejs';

export const POST = secure({ permission: 'http:invoke', limit: 20 }, async request => {
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const method = String(payload.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return Response.json({ error: 'Unsupported HTTP method.' }, { status: 400 });
  const allowedHosts = (process.env.GRA_HTTP_ALLOWED_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (process.env.VERCEL && !allowedHosts.length) throw new SecurityError(503, 'Configure the server HTTP destination allowlist before using this integration.', 'EGRESS_NOT_CONFIGURED');
  const started = Date.now();
  const response = await safeFetch(String(payload.url || ''), { method, headers: payload.headers || {}, body: method === 'GET' ? undefined : String(payload.body || ''), allowedHosts: allowedHosts.length ? allowedHosts : undefined, maxBytes: 256 * 1024 });
  const text = await response.text();
  const limited = text.slice(0, 20000);
  let body = limited;
  try { body = JSON.parse(limited); } catch { /* Plain text response. */ }
  const headers = Object.fromEntries([...response.headers].filter(([name]) => !['set-cookie', 'set-cookie2', 'www-authenticate', 'proxy-authenticate'].includes(name)));
  return Response.json({ status: response.status, ok: response.ok, headers, body, truncated: text.length > limited.length, durationMs: Date.now() - started });
});
