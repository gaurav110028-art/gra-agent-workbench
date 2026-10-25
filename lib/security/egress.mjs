import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import { SecurityError } from './errors.mjs';

const reject = message => { throw new SecurityError(400, message, 'EGRESS_BLOCKED'); };
export function publicAddress(address) {
  try {
    // Reject mapped IPv6 as well as transition/tunnel/reserved ranges.
    const parsed = ipaddr.parse(address);
    return parsed.range() === 'unicast' && (parsed.kind() !== 'ipv6' || (!parsed.isIPv4MappedAddress() && parsed.match(ipaddr.parse('2000::'), 3)));
  } catch { return false; }
}
export async function resolveTarget(value, { allowedHosts, lookup = dnsLookup, signal } = {}) {
  let url;
  try { url = new URL(value); } catch { reject('Invalid destination URL.'); }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || host.endsWith('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || (!host.includes('.') && !ipaddr.isValid(host))) reject('Only public HTTP(S) destinations without credentials or fragments are allowed.');
  if (allowedHosts && !allowedHosts.includes(host)) reject('Destination is not in the server egress allowlist.');
  let addresses;
  try {
    if (ipaddr.isValid(host)) addresses = [{ address: host, family: ipaddr.parse(host).kind() === 'ipv4' ? 4 : 6 }];
    else {
      let abort;
      try {
        addresses = await Promise.race([
          lookup(host, { all: true, verbatim: true }),
          new Promise((_, rejectPromise) => { abort = () => rejectPromise(new SecurityError(504, 'Destination lookup timed out.', 'UPSTREAM_TIMEOUT')); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort(); }),
        ]);
      } finally { if (abort) signal?.removeEventListener('abort', abort); }
    }
  } catch (e) { if (e instanceof SecurityError) throw e; reject('Destination DNS resolution failed.'); }
  if (!addresses?.length || addresses.length > 32 || addresses.some(a => !publicAddress(a.address))) reject('Destination resolves to a private, local or reserved IP address.');
  return { url, addresses };
}

function requestHop(url, addresses, { method, headers, body, signal, maxBytes }) {
  return new Promise((resolve, rejectPromise) => {
    const transport = url.protocol === 'https:' ? https : http;
    const pinned = addresses[0];
    const req = transport.request(url, {
      method, headers, signal, agent: false,
      lookup: (_host, options, callback) => options.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family),
    }, res => {
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy(new SecurityError(502, 'Upstream response exceeds the size limit.', 'UPSTREAM_TOO_LARGE'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('error', rejectPromise);
      res.on('end', () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(res.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        const bytes = Buffer.concat(chunks);
        try {
          if (headers.has('content-encoding') && headers.get('content-encoding') !== 'identity') throw new SecurityError(502, 'Unexpected compressed upstream response.', 'UPSTREAM_ENCODING');
          resolve(new Response([204, 205, 304].includes(res.statusCode) || method === 'HEAD' ? null : bytes, { status: res.statusCode, headers }));
        } catch (e) { rejectPromise(e); }
      });
    });
    req.on('error', rejectPromise);
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') req.write(body);
    req.end();
  });
}

export function cleanHeaders(input = {}) {
  const headers = new Headers(input);
  for (const name of [...headers.keys()]) {
    if (/^(host|cookie|set-cookie|proxy-.*|authorization-proxy|connection|keep-alive|transfer-encoding|te|trailer|upgrade|content-length|accept-encoding|forwarded|x-forwarded-.*|x-vercel-.*)$/i.test(name)) headers.delete(name);
  }
  headers.set('accept-encoding', 'identity');
  return Object.fromEntries(headers);
}

// Dependency injection is for synthetic tests. Production callers use safeFetch.
export function createSafeFetch({ lookup = dnsLookup, hop = requestHop } = {}) {
  return async (value, options = {}) => {
    const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs || 15000), ...(options.signal ? [options.signal] : [])]);
    let target = String(value);
    let method = options.method || 'GET';
    let headers = cleanHeaders(options.headers);
    let body = options.body;
    try {
      for (let redirects = 0; ; redirects++) {
        const { url, addresses } = await resolveTarget(target, { allowedHosts: options.allowedHosts, lookup, signal });
        const response = await hop(url, addresses, { method, headers, body, signal, maxBytes: options.maxBytes || 2 * 1024 * 1024 });
        if (![301, 302, 303, 307, 308].includes(response.status)) return response;
        if (redirects >= (options.maxRedirects ?? 3)) throw new SecurityError(502, 'Upstream redirect was refused or exceeded the redirect limit.', 'UPSTREAM_REDIRECT');
        const location = response.headers.get('location');
        if (!location) throw new SecurityError(502, 'Upstream redirect has no destination.', 'UPSTREAM_REDIRECT');
        const next = new URL(location, url);
        if (url.protocol === 'https:' && next.protocol !== 'https:') reject('HTTPS downgrade redirects are blocked.');
        if (next.origin !== url.origin) {
          if (!['GET', 'HEAD'].includes(method) && body) reject('Cross-origin redirects carrying a request body are blocked.');
          headers = Object.fromEntries(Object.entries(headers).filter(([key]) => ['accept', 'accept-encoding'].includes(key.toLowerCase())));
        }
        if (response.status === 303 || ([301, 302].includes(response.status) && method === 'POST')) { method = 'GET'; body = undefined; delete headers['content-type']; }
        target = next.href;
      }
    } catch (e) {
      if (e instanceof SecurityError) throw e;
      if (signal.aborted) throw new SecurityError(504, 'Upstream request timed out.', 'UPSTREAM_TIMEOUT');
      throw new SecurityError(502, 'Upstream connection or response failed.', 'UPSTREAM_FAILED');
    }
  };
}
export const safeFetch = createSafeFetch();
const PROVIDERS = ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com', 'api.groq.com', 'openrouter.ai', 'api.resend.com'];
export async function providerFetch(url, options) {
  if (new URL(url).protocol !== 'https:') reject('Provider requests require HTTPS.');
  return safeFetch(url, { ...options, allowedHosts: PROVIDERS, maxRedirects: 0 });
}
