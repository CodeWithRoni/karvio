// Product import, activity log, monthly expenses, supplier prices and the daily summary SMS (with its scheduler).
import assert from 'node:assert/strict';
import {freshDatabase, apiClient, rpcFor} from './pg-harness.mjs';
import {createHandler} from '../../supabase/functions/karvio-api/handler.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const {q, raw} = await apiClient(db);
const h = createHandler({rpc: rpcFor(db)});
const post = async (body) => { const r = await h(new Request('http://k', {method: 'POST', body: JSON.stringify(body)})); return {status: r.status, ...(await r.json())}; };
const as = async (username, password) => {
  const call = async (action, payload = {}, token) => (await h(new Request('http://k', {method: 'POST', body: JSON.stringify({action, payload, token, request_id: crypto.randomUUID()})}))).json();
  const token = (await call('login', {username, password})).data.token;
  return {raw: (a, p) => call(a, p, token), q: async (a, p) => { const r = await call(a, p, token); if (!r.ok) throw Error(a + ': ' + r.error); return r.data; }};
};
const boot = await q('bootstrap'), cash = boot.accounts[0].id;

// 1) Products from Excel: check first, then import; matched by barcode / SKU / name; groups and brands created.
await q('master.save', {kind: 'unit', name: 'meter', label: 'Meter', decimal: true});
const existing = await q('product.save', {name: 'Old mouse', barcode: 'OLD-1', sale_price: 500});
const rows = [
  {name: 'Logitech M331', sku: 'LG-M331', barcode: '0978', group: 'Accessories', category: 'Mouse', brand: 'Logitech', unit: 'pcs', sale_price: '950', wholesale_price: '900', low_stock: '5', warranty_days: '365', warranty_type: 'serial'},
  {name: 'Old mouse (renamed)', barcode: 'old-1', sale_price: '650'},
  {name: 'Cat6 cable', unit: 'meter', sale_price: '35', warranty_type: 'none'},
  {name: 'Windows setup', service: 'yes', sale_price: '500', warranty_days: '7', warranty_type: 'invoice'}
];
const check = await q('products.import.check', {rows});
eq(check.counts, {create: 3, update: 1, error: 0}, 'check counts');
eq([check.new_groups, check.new_categories, check.new_brands], [['Accessories'], ['Accessories › Mouse'], ['Logitech']], 'new lists reported');
const bad = await q('products.import.check', {rows: [{name: 'Logitech M331'}, {name: 'logitech m331'}, {name: 'X', unit: 'boxes'}, {name: 'Y', sale_price: '-5'}, {sku: '', name: ''}]});
eq(bad.counts.error, 4, 'second of a duplicate pair, unknown unit, negative price, no name');
ok(/problems/.test((await raw('products.import', {rows: [{name: 'Y', sale_price: '-5'}]})).error), 'import refuses rows with problems');
eq(await q('products.import', {rows}), {added: 3, updated: 1, prices: 4}, 'imported');
const list = await q('products.list');
const lg = list.find((p) => p.name === 'Logitech M331'), old = list.find((p) => p.id === existing.id);
eq([lg.sale_price, lg.wholesale_price, lg.warranty_type, lg.warranty_days, lg.low_stock], [950, 900, 'serial', 365, 5], 'new product fields');
eq([old.name, old.sale_price, old.barcode], ['Old mouse (renamed)', 650, 'OLD-1'], 'matched by barcode, renamed, price set, code kept');
ok(list.find((p) => p.name === 'Windows setup').service === true, 'service product');
eq((await q('products.import.check', {rows})).counts, {create: 0, update: 4, error: 0}, 'running the same file again only updates');

// 2) Activity log: admin (Users & roles) only; filters by type and text.
const log = await q('audit.list', {action: 'products_import'});
ok(log.rows.length === 1 && /added/.test(log.rows[0].detail), 'import is in the activity log');
eq((await q('audit.list', {q: 'no-such-thing-xyz'})).rows.length, 0, 'text filter');
await q('rolePerms.save', {manager: ['pos', 'expenses', 'purchase'], sales: ['pos'], technician: ['repairs']});
await q('user.save', {name: 'Mgr', username: 'mgr', role: 'manager', password: 'mgr-password-1234'});
const mgr = await as('mgr', 'mgr-password-1234');
ok(/Permission denied/.test((await mgr.raw('audit.list', {})).error), 'staff cannot read the activity log');

// 3) Monthly expenses: due on their day, recorded once a month, due again if the expense is cancelled.
ok(/category list/.test((await raw('expense.recurring.save', {templates: [{name: 'Rent', category: 'Gifts', amount: 100, account_id: cash, day: 1}]})).error), 'category from the list');
ok(/1 to 28/.test((await raw('expense.recurring.save', {templates: [{name: 'Rent', category: 'Rent', amount: 100, account_id: cash, day: 31}]})).error), 'day 1 to 28');
const saved = await q('expense.recurring.save', {templates: [{name: 'Shop rent', category: 'Rent', amount: 15000, account_id: cash, day: 1}, {name: 'Internet', category: 'Internet', amount: 1200, account_id: cash, day: 28, active: false}]});
eq([saved.due, saved.templates[0].due, saved.templates[1].due], [1, true, false], 'rent due from day 1; paused one never due');
eq((await q('dashboard')).recurring_due, 1, 'dashboard shows it');
const rec = await mgr.q('expense.recurring.record', {id: saved.templates[0].id, amount: 15500});
eq([rec.expense.amount, rec.expense.category, rec.list.due], [15500, 'Rent', 0], 'recorded with this month\'s amount');
ok(/already recorded/.test((await raw('expense.recurring.record', {id: saved.templates[0].id})).error), 'once a month');
await q('reverse', {type: 'expense', id: rec.expense.id, reason: 'Wrong amount', password: 'harness-password-1'});
eq((await q('expense.recurring')).due, 1, 'cancelled expense makes it due again');
const again = await q('expense.recurring.save', {templates: (await q('expense.recurring')).templates});
eq(again.templates[0].id, saved.templates[0].id, 'ids kept when the list is saved again');

// 4) Supplier prices: per product and supplier, cheapest marked; report needs cost permission.
const s1 = await q('supplier.save', {name: 'Alpha IT'}), s2 = await q('supplier.save', {name: 'Beta Tech'});
await q('purchase.create', {supplier_id: s1.id, items: [{product_id: lg.id, qty: 2, cost: 700, serials: ['SN-A1', 'SN-A2']}], payments: []});
await q('purchase.create', {supplier_id: s2.id, items: [{product_id: lg.id, qty: 1, cost: 650, serials: ['SN-B1']}], payments: []});
await q('purchase.create', {supplier_id: s1.id, items: [{product_id: lg.id, qty: 1, cost: 720, serials: ['SN-A3']}], payments: []});
const sp = await mgr.q('supplier.prices', {product_id: lg.id});
eq(sp.map((r) => [r.supplier, r.times, r.last_cost, r.min_cost, r.avg_cost, r.cheapest]), [['Beta Tech', 1, 650, 650, 650, true], ['Alpha IT', 2, 720, 700, 706.67, false]], 'per supplier figures, cheapest first');
const rep = await q('reports', {type: 'supplier_prices', product_id: lg.id});
ok(rep.rows.some((r) => /cheapest/.test(r.supplier)) && rep.totals.spent === 2770, 'report with total spent');
ok(/Permission denied/.test((await mgr.raw('reports', {type: 'supplier_prices'})).error), 'report needs reports and cost permission');

// 5) Daily summary: settings, preview, manual send, and the scheduler's one-time code.
ok(/at least|add the phone/i.test((await raw('settings.save', {values: {daily_summary_enabled: 'true', daily_summary_phones: ''}})).error), 'phone needed');
ok(/17:00/.test((await raw('settings.save', {values: {daily_summary_hour: '9'}})).error), 'evening hours only');
await q('settings.save', {values: {daily_summary_enabled: 'true', daily_summary_phones: '01711-000111, 01811000222', daily_summary_hour: '17'}});
const pv = await q('summary.preview');
ok(/Sales .*\nProfit .*\nExpenses/.test(pv.text) && pv.phones.length === 2, 'preview text');
ok(/SMS gateway/.test((await raw('summary.send')).error), 'needs the SMS gateway');
await q('settings.save', {values: {sms_enabled: 'true', sms_url: 'https://sms.example.com/send?to={number}&text={message}', sms_method: 'GET'}});
const sent = await q('summary.send');
eq(sent.results.map((r) => r.status), ['queued', 'queued'], 'queued for both phones');
eq((await post({action: 'summary.tick', payload: {nonce: 'x'.repeat(40)}})).status, 403, 'scheduler call without a valid code is refused');
eq((await db.query(`select public.karvio_register_endpoint('http://evil.example/x') r`)).rows[0].r, false, 'only the function URL is accepted');
await db.query(`select public.karvio_register_endpoint('https://abc.supabase.co/functions/v1/karvio-api')`);
await db.query('select karvio_private.summary_tick()');
const call = (await db.query('select url, body from net.calls order by id desc limit 1')).rows[0];
eq(call.url, 'https://abc.supabase.co/functions/v1/karvio-api', 'posted to the function');
const first = await post(call.body);
ok(first.ok && (first.data.sent === 2 || first.data.skipped), 'code accepted: ' + JSON.stringify(first.data));
eq((await post(call.body)).status, 403, 'the same code works only once');
eq((await db.query(`select count(*)::int n from cron.job where jobname='karvio-daily-summary'`)).rows[0].n, 1, 'scheduled');
await q('settings.save', {values: {daily_summary_enabled: 'false'}});
const before = (await db.query('select count(*)::int n from net.calls')).rows[0].n;
await db.query('select karvio_private.summary_tick()');
eq((await db.query('select count(*)::int n from net.calls')).rows[0].n, before, 'switched off: no call');
// 6) Unused accounts can be deleted (one or many); used ones and opening balances are refused.
const spare1 = await q('account.save', {name: 'City Bank PLC', type: 'bank', opening_balance: 0});
const spare2 = await q('account.save', {name: 'Upay Personal', type: 'mfs', opening_balance: 0});
const opened = await q('account.save', {name: 'Opened bank', type: 'bank', opening_balance: 500});
ok(/history|cannot be deleted/.test((await raw('account.delete', {ids: [spare1.id, cash]})).error), 'an account with transactions is refused (nothing deleted)');
ok((await q('accounts.list')).some((a) => a.id === spare1.id), 'all or nothing');
ok(/opening balance/.test((await raw('account.delete', {ids: [opened.id]})).error), 'opening balance must be 0');
ok(/Permission denied/.test((await mgr.raw('account.delete', {ids: [spare2.id]})).error), 'needs the accounts permission');
eq(await q('account.delete', {ids: [spare1.id, spare2.id]}), {deleted: 2}, 'two unused accounts deleted');
ok(!(await q('accounts.list')).some((a) => a.id === spare1.id || a.id === spare2.id), 'gone from the list');
// Dashboard chart covers 30 days; the profit card carries cost and margins.
const dash = await q('dashboard');
eq(dash.series.length, 30, '30 days in the chart');
ok(dash.profit.every((x) => x.cost !== undefined && x.margin !== undefined), 'cost and margins for the breakdown');
console.log(`Features 2: ${checks} checks passed (product import, activity log, monthly expenses, supplier prices, daily summary).`);
