import { createHash } from 'node:crypto';
import { safeFetch } from './egress.mjs';
import { SecurityError } from './errors.mjs';

const memory = globalThis.__gra_security_store ??= new Map();
export const digest = value => createHash('sha256').update(value).digest('hex');
const unavailable = () => { throw new SecurityError(503, 'Security storage is unavailable or not configured.', 'SECURITY_STORE_UNAVAILABLE'); };
const COUNTER = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";

export function createStore({ env = process.env, fetch = safeFetch, now = Date.now } = {}) {
  async function command(args) {
    if (env.GRA_SECURITY_STORE === 'memory' && !env.VERCEL) {
      for (const [key, record] of memory) if (record.expires <= now()) memory.delete(key);
      const key = args[0] === 'EVAL' ? args[3] : args[1];
      if (!memory.has(key) && memory.size >= 10000) unavailable();
      if (args[0] === 'GET') return memory.get(key)?.value ?? null;
      if (args[0] === 'DEL') return memory.delete(key) ? 1 : 0;
      if (args[0] === 'SET') { memory.set(key, { value: args[2], expires: now() + Number(args[4]) * 1000 }); return 'OK'; }
      const previous = memory.get(key);
      const record = { value: Number(previous?.value || 0) + 1, expires: previous?.expires || now() + Number(args[4]) * 1000 };
      memory.set(key, record); return record.value;
    }
    if (env.GRA_SECURITY_STORE !== 'redis') unavailable();
    let url;
    try { url = new URL(env.GRA_REDIS_REST_URL); } catch { unavailable(); }
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.upstash.io') || url.pathname !== '/' || url.search || url.username || url.password || url.hash || url.port || !env.GRA_REDIS_REST_TOKEN) unavailable();
    try {
      const response = await fetch(url.href, { method: 'POST', headers: { Authorization: `Bearer ${env.GRA_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args), allowedHosts: [url.hostname], maxRedirects: 0, timeoutMs: 3000, maxBytes: 16384 });
      const result = await response.json();
      if (!response.ok || result.error || !Object.hasOwn(result, 'result')) unavailable();
      return result.result;
    } catch { unavailable(); }
  }
  const prefix = `gra:security:${digest(env.GRA_APP_ORIGIN || 'unconfigured').slice(0, 20)}:`;
  return {
    async limit(key, maximum, seconds = 60) {
      const count = await command(['EVAL', COUNTER, '1', prefix + 'limit:' + digest(key), String(seconds)]);
      if (!Number.isSafeInteger(Number(count)) || Number(count) < 1) unavailable();
      if (Number(count) > maximum) throw new SecurityError(429, 'Request limit reached. Try again later.', 'RATE_LIMITED');
    },
    async get(key) { const value = await command(['GET', prefix + key]); if (value !== null && typeof value !== 'string') unavailable(); return value; },
    async set(key, value, seconds) { if (await command(['SET', prefix + key, value, 'EX', String(seconds)]) !== 'OK') unavailable(); },
    delete: key => command(['DEL', prefix + key]),
  };
}
export const securityStore = createStore();
