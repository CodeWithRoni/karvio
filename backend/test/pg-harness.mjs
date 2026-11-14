// Shared test harness: an in-process PostgreSQL (PGlite) with every Karvio migration
// applied in order, plus the real Edge API handler talking to it.
import fs from 'node:fs';
import {PGlite} from '../../frontend/node_modules/@electric-sql/pglite/dist/index.js';
import {createHandler} from '../../supabase/functions/karvio-api/handler.mjs';
import {hash} from '../../supabase/functions/karvio-api/runtime.mjs';

const dir = new URL('../../supabase/migrations/', import.meta.url);
export const migrationFiles = () => fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

/** Fresh database with all migrations. Supabase-only pieces (pg_cron, the platform's auto-RLS helper) are stubbed. */
export async function freshDatabase({setupKey = 'harness-key', skip = []} = {}) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema cron; create table cron.job(jobname text primary key, schedule text, command text);
    create function cron.schedule(n text, s text, c text) returns bigint language sql as $$
      insert into cron.job values(n,s,c) on conflict (jobname) do update set schedule=excluded.schedule, command=excluded.command returning 1::bigint $$;
    create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname=n returning true $$;`);
  for (const f of migrationFiles()) {
    if (skip.includes(f)) continue;
    let sql = fs.readFileSync(new URL(f, dir), 'utf8');
    // The platform helper only exists on Supabase; the migration that hardens it is a no-op here.
    if (/rls_auto_enable/.test(sql) && !/create (or replace )?function public\.rls_auto_enable/.test(sql)) continue;
    sql = sql.replace(/create extension if not exists pg_cron[^;]*;/gi, ''); // stubbed above
    await db.exec(sql);
  }
  if (setupKey) await db.query('update karvio_private.runtime set setup_hash=$1', [hash(setupKey)]);
  return db;
}

/** rpc(name, args) exactly like the Edge function's PostgREST call; reports the response size as __bytes. */
export function rpcFor(db, {onCall} = {}) {
  return async (name, args) => {
    const keys = Object.keys(args || {});
    const t = performance.now();
    const res = await db.query(`select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(',')}) as r`, Object.values(args || {}));
    const out = res.rows[0].r;
    const bytes = out === null || out === undefined ? 0 : JSON.stringify(out).length;
    if (out && typeof out === 'object') Object.defineProperty(out, '__bytes', {value: bytes});
    onCall?.({name, args, ms: performance.now() - t, bytes, result: out});
    return out;
  };
}

/** A signed-in API client: q() fails on {ok:false}; raw() returns the reply as is. */
export async function apiClient(db, {setupKey = 'harness-key', password = 'harness-password-1', handlerOptions = {}, onCall} = {}) {
  const metrics = [];
  const handler = createHandler({rpc: rpcFor(db, {onCall}), log: m => metrics.push(m), ...handlerOptions});
  let token = '';
  const raw = async (action, payload = {}, extra = {}) => (await handler(new Request('http://karvio.test', {method: 'POST',
    body: JSON.stringify({action, payload, token, request_id: crypto.randomUUID(), ...extra})}))).json();
  const q = async (action, payload = {}, extra) => {
    const r = await raw(action, payload, extra);
    if (!r.ok) throw new Error(`${action}: ${r.error}`);
    return r.data;
  };
  const init = await raw('owner.initialize', {name: 'Harness owner', password, setup_key: setupKey});
  if (!init.ok && !/already initialized/.test(init.error)) throw new Error('owner.initialize: ' + init.error);
  token = (await q('login', {username: 'admin', password})).token;
  return {handler, raw, q, metrics, get token() { return token; }, setToken(t) { token = t; }};
}
