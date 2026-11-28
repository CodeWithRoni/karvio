// PostgreSQL access for the Karvio server: connection pools, the API's database calls, and migrations.
import fs from 'node:fs';
import pg from 'pg';

const here = new URL('./', import.meta.url);
export const MIGRATIONS_DIR = new URL('../../supabase/migrations/', import.meta.url);

/** A small pool for one database. Shops share one PostgreSQL server, so each keeps only a few connections. */
export function createPool(database, {connection = {}, max = 3} = {}) {
  const pool = new pg.Pool({...connection, database, max, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, application_name: 'karvio'});
  pool.on('error', () => {}); // an idle connection dropped by the server; the next query reconnects
  return pool;
}

/**
 * rpc(name, args) for the Karvio API: calls public.<name>(arg => value, …) as service_role in its own
 * transaction, exactly like the Supabase Edge function's PostgREST call. A function's own
 * "raise exception" message reaches the API; any other database error keeps only its code
 * (its text, which names tables and columns, is for the log only).
 */
// The declared type of every argument of the public API functions (as PostgREST reads its schema cache):
// a JSON argument gets JSON text, an array argument (text[]) a PostgreSQL array.
const argTypeCache = new Map();
async function argTypes(client, name) {
  if (argTypeCache.has(name)) return argTypeCache.get(name);
  const res = await client.query(`select p.proargnames as names, array(select format_type(t, null) from unnest(p.proargtypes::oid[]) t) as types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [name]);
  const map = new Map();
  for (const row of res.rows) (row.names || []).forEach((arg, i) => { if (arg && row.types[i]) map.set(arg, row.types[i]); });
  argTypeCache.set(name, map);
  return map;
}
const toParam = (value, type) => {
  if (value === null || value === undefined) return null;
  if (type && type.endsWith('[]')) return value;
  return typeof value === 'object' ? JSON.stringify(value) : value;
};

export function rpcFor(pool) {
  return async (name, args) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Invalid database function');
    const keys = Object.keys(args || {});
    if (keys.some(k => !/^[a-z_][a-z0-9_]*$/.test(k))) throw new Error('Invalid database argument');
    const client = await pool.connect();
    let out;
    try {
      const types = await argTypes(client, name);
      const values = keys.map(k => toParam(args[k], types.get(k)));
      await client.query('begin');
      await client.query('set local role service_role');
      const res = await client.query(`select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(',')}) as r`, values);
      await client.query('commit');
      out = res.rows[0]?.r;
    } catch (e) {
      await client.query('rollback').catch(() => {});
      const error = new Error(e.code === 'P0001' ? e.message : 'Database RPC failed');
      Object.assign(error, {code: e.code, dbMessage: typeof e.message === 'string' ? e.message.slice(0, 200) : undefined});
      throw error;
    } finally { client.release(); }
    if (out === undefined) out = null;
    if (out && typeof out === 'object') Object.defineProperty(out, '__bytes', {value: JSON.stringify(out).length});
    return out;
  };
}

export const migrationFiles = () => fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

/** A migration as plain PostgreSQL runs it: pg_cron / pg_net come from compat.sql, the Supabase-only helper is skipped. */
export function portableMigration(sql) {
  if (/rls_auto_enable/.test(sql) && !/create (or replace )?function public\.rls_auto_enable/.test(sql)) return null;
  return sql.replace(/create extension if not exists pg_cron[^;]*;/gi, '').replace(/create extension if not exists pg_net[^;]*;/gi, '');
}

/** Bring one shop database up to date. Each migration runs once, in its own transaction. Returns the names applied. */
export async function migrate(pool) {
  const client = await pool.connect();
  const applied = [];
  try {
    await client.query(fs.readFileSync(new URL('compat.sql', here), 'utf8'));
    const done = new Set((await client.query('select name from public.karvio_migrations')).rows.map(r => r.name));
    for (const file of migrationFiles()) {
      if (done.has(file)) continue;
      const sql = portableMigration(fs.readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'));
      await client.query('begin');
      try {
        if (sql) await client.query(sql);
        await client.query('insert into public.karvio_migrations(name) values($1)', [file]);
        await client.query('commit');
        applied.push(file);
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw Object.assign(new Error(`Migration ${file} failed: ${e.message}`), {cause: e});
      }
    }
  } finally { client.release(); }
  return applied;
}
