import { authenticate, can, authConfig } from './auth.mjs';
import { securityStore } from './store.mjs';
import { SecurityError, errorResponse } from './errors.mjs';

export async function boundedRequest(request, maxBytes = 256 * 1024) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new SecurityError(413, 'Request body exceeds the permitted size.', 'BODY_TOO_LARGE');
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)]);
  let abort;
  try {
    const timedOut = new Promise((_, reject) => { abort = () => reject(new SecurityError(408, 'Request body read timed out.', 'BODY_TIMEOUT')); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); });
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timedOut]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new SecurityError(413, 'Request body exceeds the permitted size.', 'BODY_TOO_LARGE');
      chunks.push(Buffer.from(value));
    }
  } catch (e) { void reader.cancel().catch(() => {}); throw e; }
  finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
  return new Request(request.url, { method: request.method, headers: request.headers, body: Buffer.concat(chunks), signal: request.signal, duplex: 'half' });
}
function cors(request, response, env = process.env) {
  for (const name of [...response.headers.keys()]) if (name.startsWith('access-control-')) response.headers.delete(name);
  response.headers.set('Cache-Control', response.headers.get('Content-Type')?.startsWith('text/event-stream') ? 'no-store, no-transform' : 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  if (response.status === 429) response.headers.set('Retry-After', '60');
  const origin = request.headers.get('origin');
  const allowed = (env.GRA_INTEGRATION_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (origin && origin !== '*' && allowed.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version');
    response.headers.set('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
  }
  return response;
}
export function secure({ permission, limit = 60, maxBytes, publicRoute = false, preflight = false }, handler, dependencies = {}) {
  const store = dependencies.store || securityStore;
  const authenticateRequest = dependencies.authenticate || authenticate;
  return async request => {
    try {
      // A global pre-auth budget intentionally ignores spoofable forwarding headers.
      await store.limit('ingress:global', 600);
      if (preflight) return cors(request, new Response(null, { status: 204 }));
      let principal;
      if (publicRoute) authConfig();
      else {
        principal = await authenticateRequest(request);
        if (!can(principal, permission)) throw new SecurityError(403, 'This identity is not authorized for this operation.', 'FORBIDDEN');
        await store.limit(`${principal.id}:${permission}:${request.method}:${new URL(request.url).pathname}`, limit);
      }
      const bounded = await boundedRequest(request, maxBytes);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && /^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
        let value;
        try { value = await bounded.clone().json(); } catch { throw new SecurityError(400, 'A valid JSON object is required.', 'INVALID_JSON'); }
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SecurityError(400, 'A valid JSON object is required.', 'INVALID_JSON');
      }
      const response = await handler(bounded, principal);
      // Provider/parser failures may echo input; do not expose arbitrary failure bodies.
      if (response.status >= 500) return cors(request, errorResponse(new SecurityError(502, 'The operation failed. No automatic retry was made.', 'OPERATION_FAILED')));
      return cors(request, response);
    } catch (e) { return cors(request, errorResponse(e)); }
  };
}
