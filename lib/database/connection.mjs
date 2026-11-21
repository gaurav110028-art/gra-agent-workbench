import pg from 'pg';

export const SCHEMA_VERSION = 1;
export const WORKSPACE_ID = 'gra';

const localHosts = new Set(['127.0.0.1', '::1']);
const invalid = () => new Error('Invalid PostgreSQL connection configuration.');

export function databaseOptions(value, { direct = false, vercel = false } = {}) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const database = decodeURIComponent(url.pathname.slice(1));
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const port = url.port ? Number(url.port) : 5432;
    const local = localHosts.has(host);
    const neon = host.endsWith('.neon.tech');
    const pooled = neon && host.split('.')[0].endsWith('-pooler');
    const mode = url.searchParams.get('sslmode');
    const channelBinding = url.searchParams.get('channel_binding');
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !/^[a-zA-Z0-9_.-]+$/.test(database) || !user || !password || !host || url.hash
      || !Number.isInteger(port) || port < 1 || port > 65535
      || [...url.searchParams.keys()].some(key => !['sslmode', 'channel_binding'].includes(key) || url.searchParams.getAll(key).length !== 1)
      || (mode !== null && !['require', 'verify-full', 'disable'].includes(mode))
      || (mode === 'disable' && !local)
      || (channelBinding !== null && !['require', 'prefer', 'disable'].includes(channelBinding))
      || (mode === 'disable' && channelBinding === 'require')
      || (direct && pooled) || (vercel && (!pooled || direct))) throw invalid();
    return {
      host, port, database, user, password,
      ssl: mode === 'disable' ? false : { rejectUnauthorized: true },
      enableChannelBinding: mode !== 'disable' && channelBinding !== 'disable',
    };
  } catch {
    throw invalid();
  }
}

export function createDatabasePool(options, max = 3) {
  const pool = new pg.Pool({
    ...options,
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
    allowExitOnIdle: true,
  });
  // Pool errors on idle sockets have no request context and may contain connection details.
  pool.on('error', () => {});
  return pool;
}

// The target comes from an independently verified database inventory, never from a URI.
export function approvedDatabaseOptions(value, targetValue, { direct = false, vercel = false } = {}) {
  try {
    const target = JSON.parse(targetValue);
    const { directHost, port, database, runtimeRole, migrationRole } = target;
    const local = localHosts.has(directHost);
    if (!(local || /^ep-[a-z0-9-]+\.(?:[a-z0-9-]+\.)*neon\.tech$/.test(directHost))
      || (!local && directHost.split('.')[0].endsWith('-pooler'))
      || !Number.isInteger(port) || port < 1 || port > 65535
      || typeof database !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(database)
      || [runtimeRole, migrationRole].some(role => typeof role !== 'string' || !/^[a-zA-Z0-9_-]{1,63}$/.test(role))
      || runtimeRole === migrationRole) throw invalid();
    const options = databaseOptions(value, { direct, vercel });
    const host = direct || local ? directHost : directHost.replace('.', '-pooler.');
    if (options.host !== host || options.port !== port || options.database !== database
      || options.user !== (direct ? migrationRole : runtimeRole)) throw invalid();
    return options;
  } catch {
    throw new Error('PostgreSQL connection does not match the approved target configuration.');
  }
}

export function verifyDatabaseIdentity(row, expected) {
  if (row?.database !== expected.database || row.session_role !== expected.user || row.active_role !== expected.user) {
    throw new Error('Connected PostgreSQL identity does not match the approved target.');
  }
}

export async function inTransaction(pool, work) {
  const client = await pool.connect();
  let discard = false;
  const disconnected = () => { discard = true; };
  client.on('error', disconnected);
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally {
    client.removeListener('error', disconnected);
    client.release(discard);
  }
}
