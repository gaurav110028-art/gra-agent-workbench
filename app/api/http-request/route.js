export const runtime = 'nodejs';

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const BLOCKED_HOSTS = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\])/i;

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const method = String(payload.method || 'GET').toUpperCase();

  if (!ALLOWED_METHODS.includes(method)) {
    return Response.json({ error: `Method ${method} is not allowed.` }, { status: 400 });
  }

  let url;

  try {
    url = new URL(String(payload.url || ''));
  } catch {
    return Response.json({ error: 'URL is not valid.' }, { status: 400 });
  }

  if (!/^https?:$/.test(url.protocol) || BLOCKED_HOSTS.test(url.hostname)) {
    return Response.json({ error: 'Only public http(s) URLs are allowed.' }, { status: 400 });
  }

  const headers = {};

  Object.entries(payload.headers || {}).forEach(([key, value]) => {
    if (/^(host|cookie|authorization-proxy)$/i.test(key)) return;
    headers[key] = String(value);
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const started = Date.now();

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: method === 'GET' ? undefined : payload.body || undefined,
      signal: controller.signal,
      redirect: 'follow',
    });

    const text = await response.text();
    const limited = text.slice(0, 20000);

    let body = limited;

    try {
      body = JSON.parse(limited);
    } catch {
      body = limited;
    }

    return Response.json({
      status: response.status,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error?.name === 'AbortError'
            ? 'Request timed out after 15 s.'
            : error?.message || 'Request failed.',
        durationMs: Date.now() - started,
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
