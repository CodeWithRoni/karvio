// The super admin panel at admin.<base domain>: one page (admin/index.html) and its JSON API (/admin/api).
// Only signed-in admins (see `karvio admin:password`) can use it; the session lives in an HttpOnly cookie.
import fs from 'node:fs';
import {createPool} from './db.mjs';
import {createShop, newSetupKey, setSetupKey, validSubdomain} from './shops.mjs';
import * as billing from './billing.mjs';

const PAGE = new URL('../admin/index.html', import.meta.url);
const COOKIE = 'karvio_admin';
const MAX_BODY = 64 * 1024;

const security = {
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const json = (status, data, extra = {}) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json', ...security, ...extra}});
const cookieOf = req => (String(req.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '=')) || '').slice(COOKIE.length + 1);

export function createAdmin({control, connection = {}, secure = true, onShopsChanged = () => {}}) {
  let page = null;
  const attempts = new Map(); // ip → {n, until}: 8 wrong passwords lock that address for 15 minutes
  const cookie = (token, maxAge) => `${COOKIE}=${token}; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Strict; Path=/; Max-Age=${maxAge}`;

  async function action(name, body, who, ip) {
    switch (name) {
      case 'overview': return billing.overview(control);
      case 'payments': return billing.shopPayments(control, String(body.subdomain || ''));
      case 'shop.create': {
        const subdomain = String(body.subdomain || '').trim().toLowerCase();
        if (!validSubdomain(subdomain)) throw new Error('Address: 1-32 lower-case letters, digits or dashes (not www, admin, api…)');
        const shop = await createShop({control, connection, subdomain, name: body.name});
        // Paid at once: the paid months start today. Otherwise the free trial.
        await billing.startSubscription(control, {subdomain, plan: body.plan, phone: body.phone, note: body.note, trial: !(Number(body.amount) > 0)});
        let payment = null;
        if (Number(body.amount) > 0) payment = await billing.recordPayment(control, {subdomain, amount: body.amount, method: body.method || 'Cash', plan: body.plan, by: who});
        onShopsChanged();
        return {subdomain, setup_key: shop.setupKey, paid_until: payment?.paid_until};
      }
      case 'shop.update': await billing.updateShop(control, body); onShopsChanged(); return {};
      case 'shop.pause': await billing.pauseShop(control, String(body.subdomain || ''), true); onShopsChanged(); return {};
      case 'shop.resume': await billing.pauseShop(control, String(body.subdomain || ''), false); onShopsChanged(); return {};
      case 'shop.setup_key': {
        const shop = (await control.query('select db_name from shops where subdomain=$1', [String(body.subdomain || '')])).rows[0];
        if (!shop) throw new Error('Shop not found');
        const pool = createPool(shop.db_name, {connection, max: 1});
        try { const key = newSetupKey(); await setSetupKey(pool, key); return {setup_key: key}; }
        catch (e) { if (/already has/.test(e.message)) throw new Error('This shop already has its Administrator account. The owner resets passwords from inside the shop.'); throw e; }
        finally { await pool.end(); }
      }
      case 'payment.record': {
        const r = await billing.recordPayment(control, {...body, by: who});
        if (r.resumed) onShopsChanged();
        return r;
      }
      case 'plans.save': await billing.savePlans(control, body.plans); return {};
      case 'settings.save': await billing.saveSettings(control, body.settings || {}); return {};
      default: throw new Error('Unknown action');
    }
  }

  async function handle(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      page ||= fs.readFileSync(PAGE);
      return new Response(page, {headers: {'Content-Type': 'text/html; charset=utf-8', ...security}});
    }
    if (url.pathname !== '/admin/api') return json(404, {ok: false, error: 'Not found'});
    if (request.method !== 'POST') return json(405, {ok: false, error: 'POST only'});
    // Only this page may call the API: a custom header, JSON, and (when sent) our own origin.
    const origin = request.headers.get('origin');
    if (request.headers.get('x-karvio-admin') !== '1' || !/application\/json/.test(request.headers.get('content-type') || '') ||
        (origin && new URL(origin).host !== (request.headers.get('host') || url.host))) return json(403, {ok: false, error: 'Forbidden'});
    const text = await request.text();
    if (text.length > MAX_BODY) return json(413, {ok: false, error: 'Too large'});
    let body; try { body = JSON.parse(text || '{}'); } catch { return json(400, {ok: false, error: 'Bad request'}); }
    const ip = String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
    const name = String(body.action || '');

    if (name === 'login') {
      const a = attempts.get(ip);
      if (a && a.until > Date.now() && a.n >= 8) return json(429, {ok: false, error: 'Too many tries. Wait 15 minutes.'});
      const s = await billing.adminLogin(control, body.username, body.password);
      if (!s) {
        const cur = a && a.until > Date.now() ? a : {n: 0, until: Date.now() + 15 * 60000};
        cur.n++; attempts.set(ip, cur);
        return json(401, {ok: false, error: 'Wrong username or password'});
      }
      attempts.delete(ip);
      return json(200, {ok: true, data: {username: s.username}}, {'Set-Cookie': cookie(s.token, 12 * 3600)});
    }
    const token = cookieOf(request);
    const who = await billing.adminSession(control, token);
    if (name === 'logout') { await billing.adminLogout(control, token); return json(200, {ok: true, data: {}}, {'Set-Cookie': cookie('', 0)}); }
    if (name === 'session') return json(200, {ok: true, data: {username: who, has_admin: await billing.hasAdmin(control)}});
    if (!who) return json(401, {ok: false, error: 'Sign in again', auth: true});
    try {
      return json(200, {ok: true, data: await action(name, body, who, ip)});
    } catch (e) {
      const known = e && (e.code === undefined || e.code === 'P0001');
      if (!known) console.error('Admin action failed', name, e.message);
      return json(400, {ok: false, error: known ? e.message : 'That could not be saved. Check the values and try again.'});
    }
  }
  return {handle};
}
