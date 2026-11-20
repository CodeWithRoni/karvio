// Settings → Invoice → Link validity: invoice and quotation links last N days, or a lifetime.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const {q, raw} = await apiClient(db);
const boot = await q('bootstrap'), cash = boot.accounts.find((a) => a.type === 'cash').id;
const days = (iso) => Math.round((new Date(iso.slice(0, 10) + 'T12:00:00Z') - new Date(boot.serverToday + 'T12:00:00Z')) / 864e5);
const supplier = await q('supplier.save', {name: 'S'});
const mouse = await q('product.save', {name: 'Mouse', sale_price: 550});
await q('purchase.create', {supplier_id: supplier.id, items: [{product_id: mouse.id, qty: 10, cost: 400}], payments: []});
const customer = await q('customer.save', {name: 'Rahim', phones: ['01711000999']});
const sale = await q('sale.create', {customer_id: customer.id, items: [{product_id: mouse.id, qty: 1, price: 550}], payments: [{account_id: cash, amount: 550}], send_sms: false});
const token = (url) => url.split('#/i/')[1];

// Default: 15 days
let l = await q('sale.link', {id: sale.sale.id});
eq([l.days, days(l.expires_at)], [15, 15], 'default invoice link lasts 15 days');
// 30 days
await q('settings.save', {values: {invoice_link_days: '30'}});
l = await q('sale.link', {id: sale.sale.id});
eq([l.days, days(l.expires_at)], [30, 30], 'invoice link lasts the days set');
// Lifetime: never expires, and the public page says so
await q('settings.save', {values: {invoice_link_days: 'life'}});
eq((await q('bootstrap')).settings.invoice_link_days, 'life', 'lifetime is saved as "life"');
l = await q('sale.link', {id: sale.sale.id});
eq([l.days, l.expires_at.slice(0, 4)], [0, '9999'], 'lifetime invoice link');
const pub = await q('invoice.public', {token: token(l.url)});
eq([pub.lifetime, pub.sale.invoice_no], [true, sale.sale.invoice_no], 'lifetime link opens and is marked lifetime');
// Bad values are refused
for (const v of ['0.5', '-3', '4000', 'abc']) ok(/1 to 3650 days/.test((await raw('settings.save', {values: {invoice_link_days: v}})).error), 'refused: ' + v);
eq((await q('bootstrap')).settings.invoice_link_days, 'life', 'a refused value changes nothing');
await q('settings.save', {values: {invoice_link_days: '0'}});
eq((await q('bootstrap')).settings.invoice_link_days, 'life', '0 means lifetime');

// Quotation links
await q('settings.save', {values: {sms_enabled: 'true', sms_url: 'https://sms.example.com/send?to={number}&text={message}', sms_method: 'GET'}});
const quote = () => q('quote.send', {customer: 'Q', phone: '01711222333', title: 'PC', valid_days: 7, discount: 0, lines: [{group: 'CPU', name: 'Ryzen', warranty: '', qty: 1, price: 100}]});
let r = await quote();
eq([r.days, r.lifetime, days(r.expires_at)], [3, false, 3], 'default quotation link: 3 days');
await q('settings.save', {values: {quote_link_days: '10'}});
r = await quote();
eq([r.days, days(r.expires_at)], [10, 10], 'quotation link lasts the days set');
let log = await q('sms.log'); log = log.rows || log;
ok(log.some((x) => /valid 10 days/.test(x.message)), 'the SMS tells the 10 days');
await q('settings.save', {values: {quote_link_days: 'life'}});
r = await quote();
eq([r.days, r.lifetime, r.expires_at.slice(0, 4)], [0, true, '9999'], 'lifetime quotation link');
log = await q('sms.log'); log = log.rows || log;
const last = log.map((x) => x.message).find((m) => /Ryzen|PC/.test(m) && !/valid \d+ days/.test(m));
ok(last && !/\{days\}|unlimited days/.test(last), 'lifetime SMS has no "valid N days": ' + last);
console.log(`link validity: ${checks} checks passed`);
