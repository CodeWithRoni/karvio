// The Karvio VPS server (server/): Node.js + PostgreSQL, one database per shop, against a real PostgreSQL.
// Needs a PostgreSQL login that may create databases (PGHOST, PGUSER, PGPASSWORD; role "karvio" from
// server/lib/roles.sql) and a control database (KARVIO_CONTROL_DB, default karvio_control).
// Without one, only the database-free checks run.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {parseCron} from '../../server/lib/cron.mjs';

// ---- Schedules (what pg_cron did): every schedule Karvio registers, in UTC.
const at = s => new Date(s + 'Z');
assert.ok(parseCron('*/5 * * * *').matches(at('2026-11-28T10:05:00')));
assert.ok(!parseCron('*/5 * * * *').matches(at('2026-11-28T10:06:00')));
assert.ok(parseCron('*/15 11-17 * * *').matches(at('2026-11-28T11:45:00')));
assert.ok(!parseCron('*/15 11-17 * * *').matches(at('2026-11-28T18:00:00')));
assert.ok(parseCron('0 20 * * *').matches(at('2026-11-28T20:00:00')) && !parseCron('0 20 * * *').matches(at('2026-11-28T20:01:00')));
assert.ok(parseCron('* * * * *').matches(at('2026-11-28T03:17:00')));
assert.ok(parseCron('0 9 * * 1-5').matches(at('2026-11-27T09:00:00')) && !parseCron('0 9 * * 1-5').matches(at('2026-11-28T09:00:00')), 'weekdays');
assert.ok(parseCron('30 2 1,15 * *').matches(at('2026-11-15T02:30:00')));
for (const bad of ['', '* * * *', '61 * * * *', '*/0 * * * *', 'a * * * *', '5-1 * * * *']) assert.throws(() => parseCron(bad));
// pg is the server's own dependency (server/node_modules): skip the database part when it isn't installed.
let pg;
try { pg = createRequire(new URL('../../server/package.json', import.meta.url))('pg'); }
catch { console.log('Node server: schedule checks passed; server packages not installed, database checks skipped'); process.exit(0); }
const {portableMigration} = await import('../../server/lib/db.mjs');
const {validSubdomain, dbNameFor} = await import('../../server/lib/shops.mjs');
// Addresses and database names.
assert.ok(validSubdomain('computerplus') && validSubdomain('city-computer') && validSubdomain('a1'));
for (const bad of ['', 'www', 'admin', '-x', 'x-', 'Big', 'a_b', 'a.b', 'x'.repeat(33)]) assert.ok(!validSubdomain(bad), bad);
assert.equal(dbNameFor('city-computer'), 'karvio_shop_city_computer');
// Migrations without pg_cron / pg_net / the Supabase-only helper.
assert.equal(portableMigration('create extension if not exists pg_cron with schema pg_catalog;\nselect 1;').trim(), 'select 1;');
assert.equal(portableMigration('alter function public.rls_auto_enable() owner to x;'), null);

const control = new pg.Pool({database: process.env.KARVIO_CONTROL_DB || 'karvio_control', max: 2});
try { await control.query('select 1'); }
catch { console.log('Node server: schedule/address checks passed; no PostgreSQL login, database checks skipped'); await control.end().catch(() => {}); process.exit(0); }

const {createApp} = await import('../../server/lib/app.mjs');
const {createShop, initControl, setStatus} = await import('../../server/lib/shops.mjs');
const {createPool, migrate} = await import('../../server/lib/db.mjs');
const {exportBackupLines, restoreStreamBackup} = await import('../../frontend/src/lib/backupStream.js');

const run = Math.random().toString(36).slice(2, 8);
const A = `t${run}a`, B = `t${run}b`, BASE = 'karvio.test', PASSWORD = 'owner-password-123';
await initControl(control);
const created = [];
try {
  const a = await createShop({control, subdomain: A, name: 'Shop A'}); created.push(a);
  const b = await createShop({control, subdomain: B, name: 'Shop B'}); created.push(b);
  await assert.rejects(createShop({control, subdomain: A, name: 'Again'}), /already exists/);
  await assert.rejects(createShop({control, subdomain: 'www', name: 'No'}), /reserved/);

  const app = createApp({control, baseDomain: BASE, log: () => {}});
  const call = async (sub, action, payload = {}, token = '') => (await app.handle(new Request(`https://${sub}.${BASE}/api`, {method: 'POST',
    headers: {Host: `${sub}.${BASE}`, 'Content-Type': 'application/json'}, body: JSON.stringify({action, payload, token, request_id: crypto.randomUUID()})}))).json();
  const client = async (sub, setupKey) => {
    const init = await call(sub, 'owner.initialize', {name: 'Owner ' + sub, password: PASSWORD, setup_key: setupKey});
    assert.ok(init.ok, init.error);
    let token = (await call(sub, 'login', {username: 'admin', password: PASSWORD})).data.token;
    const q = async (action, payload) => { const r = await call(sub, action, payload, token); if (!r.ok) throw new Error(`${action}: ${r.error}`); return r.data; };
    return {q, raw: (action, payload) => call(sub, action, payload, token), setToken: t => { token = t; }};
  };

  // Each shop at its own address, with its own Administrator and data.
  assert.equal((await call(A, 'owner.initialize', {name: 'x', password: PASSWORD, setup_key: 'wrong-key-wrong-key-wrong'})).ok, false, 'setup needs the shop\'s own key');
  const sa = await client(A, a.setupKey), sb = await client(B, b.setupKey);
  await sa.q('customer.save', {name: 'Only In Shop A', phones: '01711000001'});
  const custA = (await sa.q('bootstrap')).customers.map(c => c.name);
  const custB = (await sb.q('bootstrap')).customers.map(c => c.name);
  assert.ok(custA.includes('Only In Shop A'));
  assert.ok(!custB.includes('Only In Shop A'), 'shops never see each other');
  const tokenA = (await call(A, 'login', {username: 'admin', password: PASSWORD})).data.token;
  assert.equal((await call(B, 'bootstrap', {}, tokenA)).ok, false, 'a sign-in from shop A is useless at shop B');

  // Unknown or paused shops, and which names may get a certificate.
  const status = async (host, path = '/api') => (await app.handle(new Request(`https://${host}${path}`, {method: 'POST', headers: {Host: host}, body: '{}'}))).status;
  assert.equal(await status(`nope${run}.${BASE}`), 404);
  assert.equal(await status(`evil.example.com`), 404);
  const tls = async d => (await app.handle(new Request(`http://127.0.0.1/internal/tls-allowed?domain=${d}`))).status;
  assert.equal(await tls(`${A}.${BASE}`), 200); assert.equal(await tls(`www.${BASE}`), 200); assert.equal(await tls(BASE), 200);
  assert.equal(await tls(`nope${run}.${BASE}`), 404); assert.equal(await tls('evil.example.com'), 404);
  await setStatus(control, B, 'suspended'); await app.loadShops(true);
  assert.equal(await status(`${B}.${BASE}`), 403, 'a paused shop is refused');
  await setStatus(control, B, 'active'); await app.loadShops(true);

  // Encrypted backup made by shop A restores in shop A, never in shop B (each shop's database keeps its own key).
  const download = async c => { const lines = []; let done; for await (const l of exportBackupLines({call: c.q, pace: 0, onComplete: x => { done = x; }})) lines.push(l); await c.q('database.transfer.export.close', {job_id: done.job_id}); return lines; };
  const lines = await download(sa);
  const header = JSON.parse(lines[0]);
  assert.ok(header.encryption, 'backups are encrypted with the shop\'s own key');
  assert.ok(!lines.join('').includes('Only In Shop A'));
  const poolA = createPool(a.db_name, {max: 1}), poolB = createPool(b.db_name, {max: 1});
  const store = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k)}; };
  const file = new File(lines, 'a.karvio', {lastModified: 1});
  await assert.rejects(restoreStreamBackup(file, {call: sb.q, credentials: {password: PASSWORD, confirm: 'RESTORE'}, storage: store(), key: 'x1', pace: 0, wait: () => poolB.query('select karvio_private.transfer_restore_worker()')}), /different backup key/);
  await sa.q('customer.save', {name: 'Added Later'});
  const back = await restoreStreamBackup(file, {call: sa.q, credentials: {password: PASSWORD, confirm: 'RESTORE'}, storage: store(), key: 'x2', pace: 0, wait: () => poolA.query('select karvio_private.transfer_restore_worker()')});
  assert.equal(back.signed_out, true);
  sa.setToken((await call(A, 'login', {username: 'admin', password: PASSWORD})).data.token);
  const after = (await sa.q('bootstrap')).customers.map(c => c.name);
  assert.ok(after.includes('Only In Shop A') && !after.includes('Added Later'), 'restored to the backup');

  // The scheduler: a due job runs, the call it queues reaches that shop's API, nothing else.
  await poolA.query(`select cron.schedule('test-ping','* * * * *','select net.http_post(''x'', jsonb_build_object(''action'',''ping''))')`);
  await poolA.query(`select cron.schedule('test-later','0 0 1 1 *','select net.http_post(''x'', jsonb_build_object(''action'',''ping''))')`);
  await app.tick(new Date('2026-11-28T10:07:00Z'));
  const calls = (await poolA.query(`select count(*)::int n, count(done_at)::int done from net.calls`)).rows[0];
  assert.deepEqual(calls, {n: 1, done: 1}, 'only the due job ran, and its call was delivered');
  assert.equal((await poolB.query('select count(*)::int n from net.calls')).rows[0].n, 0);
  assert.ok((await poolA.query(`select value from karvio_private.config where key='edge_endpoint'`)).rows[0]?.value.startsWith(`https://${A}.${BASE}/api`), 'shop knows its own API address');
  await poolA.query(`select cron.unschedule('test-ping'), cron.unschedule('test-later')`);
  // The real daily-summary job: its one-time code is minted, delivered and redeemed by the shop's API.
  await poolA.query(`insert into public."Settings"(_position,key,value) select coalesce(max(_position),1)+1,'daily_summary_enabled','true' from public."Settings" on conflict(key) do update set value='true'`);
  await poolA.query('delete from net.calls');
  await app.tick(new Date('2026-11-28T11:15:00Z'));
  const summary = (await poolA.query(`select body->>'action' a, done_at is not null done from net.calls`)).rows;
  assert.ok(summary.some(c => c.a === 'summary.tick' && c.done), 'daily summary call delivered');
  assert.equal((await poolA.query('select count(*)::int n from karvio_private.cron_nonces')).rows[0].n, 0, 'its one-time code was used');
  await poolA.query(`update public."Settings" set value='false' where key='daily_summary_enabled'`);
  // Google Drive card: the redirect address is the shop's own /api.
  assert.equal((await sa.q('backup.drive.status')).redirect_uri, `https://${A}.${BASE}/api`);
  // Migrations are recorded and run once.
  assert.deepEqual(await migrate(poolA), []);

  // The real HTTP server (main.mjs) in front of the same code.
  const port = 18000 + Math.floor(Math.random() * 1000);
  const proc = spawn(process.execPath, [new URL('../../server/main.mjs', import.meta.url).pathname], {env: {...process.env, KARVIO_BASE_DOMAIN: BASE, KARVIO_PORT: String(port)}, stdio: ['ignore', 'pipe', 'pipe']});
  let out = ''; proc.stdout.on('data', d => { out += d; }); proc.stderr.on('data', d => { out += d; });
  for (let i = 0; i < 50 && !out.includes('Karvio server on'); i++) await new Promise(r => setTimeout(r, 100));
  const http = await import('node:http');
  const post = (host, body) => new Promise((resolve, reject) => {
    const req = http.request({host: '127.0.0.1', port, path: '/api', method: 'POST', headers: {Host: host, 'Content-Type': 'application/json'}}, res => { let t = ''; res.on('data', d => { t += d; }); res.on('end', () => resolve({status: res.statusCode, body: t})); });
    req.on('error', reject); req.end(JSON.stringify(body));
  });
  const ping = await post(`${A}.${BASE}`, {action: 'login', payload: {username: 'admin', password: PASSWORD}, request_id: crypto.randomUUID()});
  assert.equal(ping.status, 200); assert.ok(JSON.parse(ping.body).data.token, 'sign in through the HTTP server');
  assert.equal((await post(`nope.${BASE}`, {action: 'ping'})).status, 404);
  proc.kill('SIGTERM');
  await new Promise(r => proc.on('exit', r));

  await poolA.end(); await poolB.end();
  await app.close();
  console.log('Node server: schedules, shop addresses, separate databases, encrypted backups, scheduler and HTTP server passed');
} finally {
  for (const s of created) {
    await control.query('delete from shops where subdomain=$1', [s.subdomain]).catch(() => {});
    await control.query(`drop database if exists ${s.db_name} with (force)`).catch(e => console.error('cleanup', e.message));
  }
  await control.end();
}
