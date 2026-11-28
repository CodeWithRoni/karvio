// The Karvio server for one VPS: every shop at <shop>.<base domain>, each with its own PostgreSQL database,
// all served by the same Karvio API code that runs on Supabase (handler.mjs), plus the jobs pg_cron and
// pg_net run there (see compat.sql). Caddy in front terminates HTTPS and serves the web app.
import {createHandler, logRequest} from '../../supabase/functions/karvio-api/handler.mjs';
import {dispatchSms} from '../../supabase/functions/karvio-api/sms.mjs';
import {driveCallback} from '../../supabase/functions/karvio-api/drive.mjs';
import {keyResolver} from '../../supabase/functions/karvio-api/backupCrypto.mjs';
import {createPool, rpcFor} from './db.mjs';
import {parseCron} from './cron.mjs';

const json = (status, data) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});

/**
 * createApp({control, connection, baseDomain, backupKeyEnv, fetch, devShop, log})
 *  handle(Request) → Response   for /api, /healthz and /internal/tls-allowed
 *  tick(date)                   runs due cron jobs and queued calls of every active shop (call once a minute)
 *  close()                      waits for background work and closes every pool
 */
export function createApp({control, connection = {}, baseDomain, backupKeyEnv = '', fetch: fetchImpl = globalThis.fetch, devShop = '', log = logRequest, scheme = 'https', poolSize = 3}) {
  const base = String(baseDomain || '').toLowerCase();
  const tenants = new Map(); // subdomain → tenant
  const pending = new Set();
  const track = work => { const p = Promise.resolve(work).catch(e => console.error('Background work failed', e?.message)); pending.add(p); p.finally(() => pending.delete(p)); return p; };
  let shops = new Map(), loadedAt = 0, loading = null;

  async function loadShops(force = false) {
    if (!force && Date.now() - loadedAt < 30000) return shops;
    loading ||= control.query('select subdomain, name, db_name, status from shops').then(r => {
      shops = new Map(r.rows.map(s => [s.subdomain, s])); loadedAt = Date.now(); return shops;
    }).finally(() => { loading = null; });
    return loading;
  }

  function tenantFor(shop) {
    let t = tenants.get(shop.subdomain);
    if (t && t.db_name === shop.db_name) return t;
    const pool = createPool(shop.db_name, {connection, max: poolSize});
    const rpc = rpcFor(pool);
    const apiUrl = `${scheme}://${shop.subdomain}.${base}/api`;
    const backupKey = keyResolver(rpc, backupKeyEnv);
    // The owner enters their own Google keys in Settings → Database; the redirect address is this shop's /api.
    const drive = {clientId: '', clientSecret: '', redirectUri: apiUrl, fetch: fetchImpl};
    const handler = createHandler({rpc, log, backupKey, drive, background: track,
      allowRequest: body => rpc('karvio_request_limit', {session_key: 'tok_' + String(body.token || '').slice(0, 512), action_name: body.action}),
      dispatch: () => track(dispatchSms(rpc))});
    t = {subdomain: shop.subdomain, db_name: shop.db_name, pool, rpc, handler, backupKey, drive, apiUrl, registered: null};
    tenants.set(shop.subdomain, t);
    return t;
  }
  // The scheduler jobs (daily summary, Drive backup) only run once the shop knows its API address.
  // (karvio_register_endpoint only accepts a Supabase address, so the server, as the database owner, writes its own.)
  const ensureRegistered = t => (t.registered ||= t.pool.query(`insert into karvio_private.config(key,value,updated_at) values('edge_endpoint',$1,now())
    on conflict(key) do update set value=excluded.value, updated_at=now() where karvio_private.config.value is distinct from excluded.value`, [t.apiUrl])
    .catch(e => { t.registered = null; throw e; }));

  function subdomainOf(host) {
    const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
    if (devShop && (h === 'localhost' || h === '127.0.0.1')) return devShop;
    if (!base || !h.endsWith('.' + base)) return '';
    const sub = h.slice(0, -(base.length + 1));
    return /^[a-z0-9-]+$/.test(sub) ? sub : '';
  }

  async function handle(request) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return json(200, {ok: true});
    // Caddy asks before getting a certificate for a new name: only the main site and real shops.
    if (url.pathname === '/internal/tls-allowed') {
      const domain = String(url.searchParams.get('domain') || '').toLowerCase();
      if (domain === base || domain === 'www.' + base) return json(200, {ok: true});
      const sub = subdomainOf(domain);
      return sub && (await loadShops()).has(sub) ? json(200, {ok: true}) : json(404, {ok: false});
    }
    if (url.pathname !== '/api' && url.pathname !== '/api/') return json(404, {ok: false, error: 'Not found'});
    const sub = subdomainOf(request.headers.get('host') || url.host);
    let shop = sub ? (await loadShops()).get(sub) : null;
    if (sub && !shop) shop = (await loadShops(true)).get(sub); // a shop created a moment ago
    if (!shop) return json(404, {ok: false, error: 'Unknown shop address'});
    if (shop.status !== 'active') return json(403, {ok: false, error: 'This shop is paused. Contact Karvio support.'});
    const t = tenantFor(shop);
    track(ensureRegistered(t));
    // The Google sign-in window comes back here with ?code=…&state=….
    if (request.method === 'GET' && url.searchParams.has('state')) return driveCallback(url, t.rpc, {...t.drive, backupKey: await t.backupKey()});
    return t.handler(request);
  }

  /** One scheduler minute: each active shop's due jobs, then the calls they queued (pg_net's part). */
  async function tick(date = new Date()) {
    const list = [...(await loadShops(true)).values()].filter(s => s.status === 'active');
    for (const shop of list) {
      const t = tenantFor(shop);
      try {
        await ensureRegistered(t);
        const jobs = (await t.pool.query('select jobname, schedule, command from cron.job order by jobname')).rows;
        for (const job of jobs) {
          let due = false;
          try { due = parseCron(job.schedule).matches(date); } catch { console.error('Bad schedule', shop.subdomain, job.jobname); }
          if (!due) continue;
          try { await t.pool.query(job.command); }
          catch (e) { console.error('Scheduled job failed', shop.subdomain, job.jobname, e.message?.slice(0, 200)); }
        }
        await drainCalls(t);
      } catch (e) { console.error('Scheduler failed for shop', shop.subdomain, e.message?.slice(0, 200)); }
    }
  }
  async function drainCalls(t) {
    for (let round = 0; round < 10; round++) {
      const calls = (await t.pool.query(`update net.calls set done_at=now() where id in
        (select id from net.calls where done_at is null order by id limit 20 for update skip locked) returning id, body`)).rows;
      if (!calls.length) break;
      for (const call of calls) {
        const res = await t.handler(new Request(t.apiUrl, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(call.body || {})}));
        await res.text().catch(() => {});
      }
    }
    await t.pool.query(`delete from net.calls where done_at < now() - interval '2 days'`);
  }

  async function close() {
    await Promise.allSettled([...pending]);
    await Promise.allSettled([...tenants.values()].map(t => t.pool.end()));
  }

  return {handle, tick, close, loadShops, tenants, pending};
}
