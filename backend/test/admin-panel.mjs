// Super admin panel (server/admin): sign-in, shops, plans, payments, automatic pause for non-payment and the
// shop's own "renew soon" notice — against a real PostgreSQL. Skips like node-server.mjs when there is none.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

let pg;
try { pg = createRequire(new URL('../../server/package.json', import.meta.url))('pg'); }
catch { console.log('Admin panel: server packages not installed, skipped'); process.exit(0); }
const control = new pg.Pool({database: process.env.KARVIO_CONTROL_DB || 'karvio_control', max: 3});
try { await control.query('select 1'); }
catch { console.log('Admin panel: no PostgreSQL login, skipped'); await control.end().catch(() => {}); process.exit(0); }

const {createApp} = await import('../../server/lib/app.mjs');
const {initControl} = await import('../../server/lib/shops.mjs');
const billing = await import('../../server/lib/billing.mjs');

const run = Math.random().toString(36).slice(2, 7);
const BASE = 'karvio.test', ADMIN = `admin.${BASE}`, USER = `boss${run}`, PW = 'super-secret-pass-1';
const SHOP = `a${run}`, SHOP2 = `b${run}`, PASSWORD = 'owner-password-123';
await initControl(control);
await initControl(control); // twice: every step is safe to repeat
const app = createApp({control, baseDomain: BASE, log: () => {}});
const today = (await control.query(`select (now() at time zone 'Asia/Dhaka')::date::text d`)).rows[0].d;
const plusDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const plusMonths = (d, n) => { const [y, m, dd] = d.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, dd)); if (t.getUTCDate() !== dd) t.setUTCDate(0); return t.toISOString().slice(0, 10); };

let cookie = '';
const admin = async (action, data = {}, {headers = {}, raw = false} = {}) => {
  const res = await app.handle(new Request(`https://${ADMIN}/admin/api`, {method: 'POST',
    headers: {Host: ADMIN, 'Content-Type': 'application/json', 'X-Karvio-Admin': '1', Cookie: cookie, 'X-Forwarded-For': '203.0.113.9', ...headers},
    body: JSON.stringify({action, ...data})}));
  if (raw) return res;
  const j = await res.json();
  if (!j.ok) throw Object.assign(new Error(j.error), {status: res.status});
  return j.data;
};
const shopCall = async (sub, action, payload = {}, token = '') => {
  const res = await app.handle(new Request(`https://${sub}.${BASE}/api`, {method: 'POST', headers: {Host: `${sub}.${BASE}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({action, payload, token, request_id: crypto.randomUUID()})}));
  return {status: res.status, ...(await res.json())};
};

try {
  // ---- The page and its protection.
  const page = await app.handle(new Request(`https://${ADMIN}/`, {headers: {Host: ADMIN}}));
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(await page.text(), /Karvio admin/);
  assert.equal((await app.handle(new Request(`http://127.0.0.1/internal/tls-allowed?domain=${ADMIN}`))).status, 200, 'admin address gets HTTPS');

  // ---- Sign-in.
  await assert.rejects(billing.setAdminPassword(control, USER, 'short'), /at least 10/);
  await billing.setAdminPassword(control, USER, PW);
  assert.equal((await admin('session')).username, null);
  await assert.rejects(admin('overview'), e => e.status === 401);
  await assert.rejects(admin('login', {username: USER, password: 'wrong-password'}), e => e.status === 401 && /Wrong/.test(e.message));
  const login = await admin('login', {username: USER, password: PW}, {raw: true});
  assert.equal(login.status, 200);
  const set = login.headers.get('set-cookie');
  assert.match(set, /HttpOnly/); assert.match(set, /Secure/); assert.match(set, /SameSite=Strict/);
  cookie = set.split(';')[0];
  assert.equal((await admin('session')).username, USER);
  // Another site cannot use the session: no custom header, or a foreign origin, is refused.
  assert.equal((await admin('overview', {}, {raw: true, headers: {'X-Karvio-Admin': ''}})).status, 403);
  assert.equal((await admin('overview', {}, {raw: true, headers: {Origin: 'https://evil.example'}})).status, 403);
  assert.equal((await admin('overview', {}, {raw: true, headers: {Origin: `https://${ADMIN}`}})).status, 200);
  // Repeated wrong passwords from one address are locked out, even with the right one afterwards.
  const ip = {headers: {'X-Forwarded-For': '198.51.100.7'}};
  for (let i = 0; i < 8; i++) await admin('login', {username: USER, password: 'nope-nope-nope'}, {...ip, raw: true});
  assert.equal((await admin('login', {username: USER, password: PW}, {...ip, raw: true})).status, 429);

  // ---- New shop: trial, setup key, the owner can set up.
  await assert.rejects(admin('shop.create', {name: 'X', subdomain: 'admin'}), /Address/);
  await assert.rejects(admin('shop.create', {name: '', subdomain: SHOP}), /name/i);
  const made = await admin('shop.create', {name: 'Shop <b>A</b>', subdomain: SHOP, plan: 'monthly', phone: '01711000000'});
  assert.ok(made.setup_key && made.setup_key.length >= 24);
  let ov = await admin('overview');
  let a = ov.shops.find(s => s.subdomain === SHOP);
  assert.equal(a.paid_until, plusDays(today, ov.settings.trial_days), 'starts with the free trial');
  assert.equal(a.plan, 'monthly'); assert.equal(a.status, 'active'); assert.equal(a.name, 'Shop <b>A</b>');
  assert.equal((await shopCall(SHOP, 'owner.initialize', {name: 'Owner', password: PASSWORD, setup_key: made.setup_key})).ok, true);
  const token = (await shopCall(SHOP, 'login', {username: 'admin', password: PASSWORD})).data.token;
  assert.ok(token);
  await assert.rejects(admin('shop.setup_key', {subdomain: SHOP}), /already has/);
  await assert.rejects(admin('shop.create', {name: 'Again', subdomain: SHOP}), /already exists/);

  // A shop created with its first payment starts paid for the plan's months.
  const made2 = await admin('shop.create', {name: 'Shop B', subdomain: SHOP2, plan: 'yearly', amount: 12000, method: 'bKash'});
  assert.equal(made2.paid_until, plusMonths(today, 12));
  assert.ok((await admin('shop.setup_key', {subdomain: SHOP2})).setup_key, 'a lost setup key can be replaced before set-up');

  // ---- Payments extend from the paid-until date, not from today.
  const trialEnd = a.paid_until;
  await assert.rejects(admin('payment.record', {subdomain: SHOP, amount: 0, method: 'Cash'}), /amount/);
  await assert.rejects(admin('payment.record', {subdomain: SHOP, amount: 100, method: 'Paypal'}), /how it was paid/);
  const p1 = await admin('payment.record', {subdomain: SHOP, amount: '1500', method: 'Nagad', note: 'TX123'});
  assert.equal(p1.paid_until, plusMonths(trialEnd, 1));
  const pays = await admin('payments', {subdomain: SHOP});
  assert.equal(pays.length, 1); assert.equal(pays[0].amount, 1500); assert.equal(pays[0].from_date, trialEnd); assert.equal(pays[0].note, 'TX123');
  ov = await admin('overview');
  assert.ok(ov.totals.month_received >= 13500, 'this month\'s takings include both payments');

  // ---- The shop's Administrator sees "renew soon" only near the end.
  const subInfo = async () => (await (await app.handle(new Request(`https://${SHOP}.${BASE}/api/subscription`, {headers: {Host: `${SHOP}.${BASE}`}}))).json()).data;
  assert.equal((await subInfo()).warn, false);
  await admin('shop.update', {subdomain: SHOP, paid_until: plusDays(today, 3)});
  assert.deepEqual({...(await subInfo())}, {paid_until: plusDays(today, 3), days_left: 3, warn: true, grace_days: ov.settings.grace_days});
  assert.equal((await app.handle(new Request(`https://nope${run}.${BASE}/api/subscription`, {headers: {Host: `nope${run}.${BASE}`}}))).status, 404);

  // ---- Not paid: grace days, then the shop pauses itself; a payment starts it again from today.
  await admin('shop.update', {subdomain: SHOP, paid_until: plusDays(today, -ov.settings.grace_days)});
  await app.tick(new Date());
  assert.equal((await admin('overview')).shops.find(s => s.subdomain === SHOP).status, 'active', 'still inside the grace days');
  await admin('shop.update', {subdomain: SHOP, paid_until: plusDays(today, -ov.settings.grace_days - 1)});
  await app.tick(new Date());
  a = (await admin('overview')).shops.find(s => s.subdomain === SHOP);
  assert.equal(a.status, 'suspended'); assert.equal(a.pause_reason, 'expired');
  const blocked = await shopCall(SHOP, 'bootstrap', {}, token);
  assert.equal(blocked.status, 403); assert.match(blocked.error, /subscription has ended/);
  const p2 = await admin('payment.record', {subdomain: SHOP, amount: 7500, method: 'Bank', plan: 'half-yearly'});
  assert.equal(p2.resumed, true); assert.equal(p2.paid_until, plusMonths(today, 6));
  a = (await admin('overview')).shops.find(s => s.subdomain === SHOP);
  assert.equal(a.status, 'active'); assert.equal(a.plan, 'half-yearly');
  assert.equal((await shopCall(SHOP, 'bootstrap', {}, token)).ok, true, 'the shop works again at once, same sign-in');

  // A manual pause stays until you resume it, whatever is paid.
  await admin('shop.pause', {subdomain: SHOP2});
  await admin('payment.record', {subdomain: SHOP2, amount: 100, method: 'Cash', months: 0});
  assert.equal((await admin('overview')).shops.find(s => s.subdomain === SHOP2).status, 'suspended');
  assert.equal((await shopCall(SHOP2, 'login', {username: 'admin', password: 'x'})).status, 403);
  await admin('shop.resume', {subdomain: SHOP2});
  assert.notEqual((await shopCall(SHOP2, 'login', {username: 'admin', password: 'x'})).status, 403);

  // ---- Plans and settings.
  const plans = (await admin('overview')).plans;
  await assert.rejects(admin('plans.save', {plans: [{...plans[0], months: 0}]}), /1-60 months/);
  await admin('plans.save', {plans: plans.map(p => p.code === 'monthly' ? {...p, price: 1600} : p)});
  await assert.rejects(admin('settings.save', {settings: {grace_days: -1}}), /0 to 60/);
  const before = (await admin('overview')).settings;
  await admin('settings.save', {settings: {warn_days: 10}});
  assert.equal((await admin('overview')).settings.warn_days, 10);
  assert.equal((await admin('overview')).plans.find(p => p.code === 'monthly').price, 1600);
  await admin('plans.save', {plans}); await admin('settings.save', {settings: before});

  // ---- Sign out ends the session.
  await admin('logout');
  await assert.rejects(admin('overview'), e => e.status === 401);
  await app.close();
  console.log('Admin panel: sign-in, lockout, new shops, trial, payments, renew notice, auto-pause and resume, plans passed');
} finally {
  for (const sub of [SHOP, SHOP2]) {
    const db = (await control.query('select db_name from shops where subdomain=$1', [sub])).rows[0]?.db_name;
    await control.query('delete from shops where subdomain=$1', [sub]).catch(() => {});
    if (db) await control.query(`drop database if exists ${db} with (force)`).catch(e => console.error('cleanup', e.message));
  }
  await control.query('delete from admins where username=$1', [USER]).catch(() => {});
  await control.end();
}
