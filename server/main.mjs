// Karvio server entry point (systemd runs `node main.mjs`). Settings come from /etc/karvio/karvio.env:
//   KARVIO_BASE_DOMAIN   e.g. karvioerp.com — shops live at <shop>.karvioerp.com
//   KARVIO_PORT          default 8787 (Caddy forwards /api here; listen on localhost only)
//   PGHOST, PGPORT, PGUSER, PGPASSWORD   the PostgreSQL login (role "karvio")
//   KARVIO_CONTROL_DB    default karvio_control (the shop list)
//   KARVIO_BACKUP_KEY    optional; otherwise each shop's database makes its own backup key
//   KARVIO_DEV_SHOP      development only: the shop served at http://localhost
import http from 'node:http';
import pg from 'pg';
import {createApp} from './lib/app.mjs';

const env = process.env;
const baseDomain = (env.KARVIO_BASE_DOMAIN || '').trim().toLowerCase();
if (!baseDomain && !env.KARVIO_DEV_SHOP) { console.error('Set KARVIO_BASE_DOMAIN (for example karvioerp.com)'); process.exit(1); }
const port = Number(env.KARVIO_PORT || 8787), host = env.KARVIO_HOST || '127.0.0.1';
const MAX_BODY = 32 * 1024 * 1024;

const control = new pg.Pool({database: env.KARVIO_CONTROL_DB || 'karvio_control', max: 2, idleTimeoutMillis: 30000, application_name: 'karvio-control'});
control.on('error', () => {});
const app = createApp({control, baseDomain, backupKeyEnv: env.KARVIO_BACKUP_KEY || '', devShop: env.KARVIO_DEV_SHOP || '', scheme: env.KARVIO_SCHEME || 'https'});

async function toRequest(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw Object.assign(new Error('Request too large'), {status: 413}); chunks.push(c); }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  const url = `http://${req.headers.host || 'localhost'}${req.url}`;
  return new Request(url, {method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks)});
}

const server = http.createServer(async (req, res) => {
  try {
    const response = await app.handle(await toRequest(req));
    const headers = {};
    response.headers.forEach((v, k) => { headers[k] = v; });
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    if (!res.headersSent) res.writeHead(e.status || 500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: false, error: e.status === 413 ? 'Request too large' : 'Server error'}));
    if (!e.status) console.error('Request failed', e.message);
  }
});
server.requestTimeout = 10 * 60 * 1000; // large backup pages and restores
server.listen(port, host, () => console.log(`Karvio server on http://${host}:${port} for *.${baseDomain || '(dev)'}`));

// Once a minute, on the minute: scheduled jobs and the calls they queue (what pg_cron + pg_net do on Supabase).
let ticking = false, timer;
const schedule = () => { timer = setTimeout(async () => {
  if (!ticking) { ticking = true; try { await app.tick(new Date()); } catch (e) { console.error('Scheduler error', e.message); } finally { ticking = false; } }
  schedule();
}, 60000 - (Date.now() % 60000) + 500); };
schedule();

const stop = async () => {
  clearTimeout(timer);
  server.close();
  await app.close();
  await control.end().catch(() => {});
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
