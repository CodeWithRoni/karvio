// Customer invoice links: sent in the sale SMS, read-only, only a hash stored, gone after 15 days.
const fs = require('fs');
const path = require('path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `
sandbox.setupDatabase();
const assert = require('assert/strict');
let checks = 0;
const same = (a, b, msg) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg); checks++; };
const truthy = (v, msg) => { assert.ok(v, msg); checks++; };
const token = call('login', {username:'admin', password:'admin123'}).data.token;
const Q = (a, p, t) => { const r = call(a, p, t || token); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const QF = (a, p, t) => { const r = call(a, p, t || token); assert.equal(r.ok, false, a + ' should fail'); checks++; return r.error; };
const PUB = (tok) => call('invoice.public', { token: tok }); // no sign-in
const run = (code) => vm.runInContext(code, sandbox);
const links = () => run("_mem = {}; all_('InvoiceLinks')");
const smsLog = () => run("_mem = {}; all_('SmsLog')");

Q('settings.save', { values: { shop_name: 'Computer Plus', shop_phone: '01700000000', sms_enabled: 'true', sms_method: 'GET', sms_url: 'https://gw.example/send?to={number}&msg={message}',
  sms_template: 'Dear {name}, invoice {invoice} total {total}. View: {link}' } });
const sup = Q('supplier.save', { name: 'S' });
const pr = Q('product.save', { name: 'Mouse A4Tech', has_warranty: true, warranty_type: 'invoice', warranty_days: 365 });
Q('purchase.create', { supplier_id: sup.id, items: [{ product_id: pr.id, qty: 20, cost: 300, sale_price: 550 }], payments: [] });
const cus = Q('customer.save', { name: 'Rahim', phones: '01711111111' });
const cash = Q('bootstrap').accounts[0];
const sell = (extra) => Q('sale.create', { customer_id: cus.id, items: [{ product_id: pr.id, qty: 2, price: 550 }], payments: [{ account_id: cash.id, amount: 600 }], ...extra });

/* ---- the SMS carries a link ---- */
let sale = sell();
truthy(sale.sms && sale.sms.ok, 'SMS sent');
const sent = decodeURIComponent(fetchLog[fetchLog.length - 1].url.split('msg=')[1]);
const m = /View: (https:\\/\\/codewithroni\\.github\\.io\\/karvio\\/#\\/i\\/([A-Za-z0-9]{22}))$/.exec(sent);
truthy(m, 'message ends with the link: ' + sent);
const tok = m[2];
truthy(sent.length - m[1].length < 80 && m[1].length <= 70, 'link is short (' + m[1].length + ' chars)');
const row = links()[0];
same(links().length, 1, 'one link row');
truthy(row.token_hash.length === 64 && row.token_hash !== tok && JSON.stringify(row).indexOf(tok) < 0, 'only a hash of the key is stored');
same(row.expires_at.slice(0, 10), run("addDays_(today_(), 15)"), 'valid for 15 days');
const logged = smsLog().slice(-1)[0].message;
truthy(logged.indexOf(tok) < 0 && /#\\/i\\/[A-Za-z0-9]{4}…$/.test(logged), 'SMS log keeps only a masked link: ' + logged);

/* ---- opening it (no sign-in) ---- */
let r = PUB(tok);
truthy(r.ok, 'opens without signing in');
const d = r.data;
same([d.sale.invoice_no, d.sale.total, d.sale.paid, d.sale.due, d.customer.name, d.shop.shop_name], [sale.sale.invoice_no, 1100, 600, 500, 'Rahim', 'Computer Plus'], 'invoice content');
same(d.items.map((i) => [i.name, i.qty, i.price, i.total]), [['Mouse A4Tech', 2, 550, 1100]], 'items');
truthy(d.items[0].warranty_expiry, 'warranty shown');
const flat = JSON.stringify(d);
['"cost"', '"profit"', 'user_id', 'password', 'sms_api_key', 'token_hash', 'account_id'].forEach((k) => truthy(flat.indexOf(k) < 0, 'does not leak ' + k));
same(d.expires_at, row.expires_at, 'shows when the link stops working');
// even if sales staff were given the cost permission
Q('rolePerms.save', { manager: [], sales: ['pos', 'cost'] });
truthy(JSON.stringify(PUB(tok).data).indexOf('"cost"') < 0, 'cost never leaks');

/* ---- invalid keys ---- */
const BAD = 'This invoice link has expired or is not valid';
truthy(PUB('abc').error.indexOf(BAD) === 0, 'too short');
truthy(PUB(tok.slice(0, -1) + (tok.slice(-1) === 'A' ? 'B' : 'A')).error.indexOf(BAD) === 0, 'one character changed');
truthy(PUB("x'; DROP--aaaaaaaaaaaaaaaa").error.indexOf(BAD) === 0, 'junk refused');
truthy(PUB('').error.indexOf(BAD) === 0, 'empty');

/* ---- expiry: stops working and the row is deleted ---- */
run("update_('InvoiceLinks', '" + row.id + "', { expires_at: '2020-01-01T00:00:00' })");
truthy(PUB(tok).error.indexOf(BAD) === 0, 'expired link refused');
same(links().length, 0, 'expired link deleted when opened');

/* ---- daily clean-up even when nobody opens the link ---- */
const s2 = sell(); const s3 = sell();
same(links().length, 2, 'two new links');
const [l2] = links();
run("update_('InvoiceLinks', '" + l2.id + "', { expires_at: '2020-01-01T00:00:00' })");
run("PropertiesService.getScriptProperties().setProperty('links_cleaned', '2020-01-01')");
Q('customer.save', { name: 'Any save' }); // any save triggers the daily clean-up
same(links().length, 1, 'expired link removed by the daily clean-up');
same(links()[0].sale_id, s3.sale.id, 'the valid one is kept');

/* ---- SMS failed: the link is removed again ---- */
const realFetch = sandbox.UrlFetchApp.fetch;
sandbox.UrlFetchApp.fetch = (url, opt) => { fetchLog.push({ url, opt }); return { getResponseCode: () => 200, getContentText: () => '1007' }; };
const before = links().length;
const s4 = sell();
same(s4.sms.ok, false, 'gateway refused');
same(links().length, before, 'no link left behind when the SMS was not sent');
sandbox.UrlFetchApp.fetch = realFetch;

/* ---- links off, and old templates without {link} ---- */
Q('settings.save', { values: { sms_invoice_link: 'false' } });
sell();
let last = decodeURIComponent(fetchLog[fetchLog.length - 1].url.split('msg=')[1]);
same(last.indexOf('#/i/'), -1, 'no link when turned off');
truthy(!/View:\\s*$/.test(last), 'no dangling "View:" — ' + last);
Q('settings.save', { values: { sms_invoice_link: 'true', sms_template: 'Thanks {name}! Invoice {invoice}.' } });
sell();
last = decodeURIComponent(fetchLog[fetchLog.length - 1].url.split('msg=')[1]);
truthy(/Invoice INV-\\d+\\. Invoice: https:\\/\\/codewithroni\\.github\\.io\\/karvio\\/#\\/i\\/[A-Za-z0-9]{22}$/.test(last), 'link added to a template without {link}: ' + last);
Q('settings.save', { values: { invoice_link_base: 'https://shop.example.com/app' } });
const sl = Q('sale.link', { id: sale.sale.id });
truthy(/^https:\\/\\/shop\\.example\\.com\\/app\\/#\\/i\\/[A-Za-z0-9]{22}$/.test(sl.url) && sl.days === 15, 'own web address used: ' + sl.url);
Q('settings.save', { values: { invoice_link_base: 'javascript:alert(1)' } });
truthy(Q('sale.link', { id: sale.sale.id }).url.indexOf('https://codewithroni.github.io/karvio/#/i/') === 0, 'unsafe address ignored');

/* ---- staff link button ---- */
const tok2 = /#\\/i\\/(\\w+)$/.exec(sl.url)[1];
same(PUB(tok2).data.sale.invoice_no, sale.sale.invoice_no, 'staff link opens the invoice');
Q('user.save', { name: 'Karim', username: 'karim', password: 'secret1', role: 'sales' });
const kt = call('login', { username: 'karim', password: 'secret1' }).data.token;
truthy(/another user/.test(QF('sale.link', { id: sale.sale.id }, kt)), 'sales staff cannot link someone else\\'s invoice');
same(call('sale.link', { id: sale.sale.id }).auth, true, 'needs sign-in');

/* ---- cancelled invoice still opens, marked cancelled ---- */
Q('reverse', { type: 'sale', id: sale.sale.id, reason: 'mistake', password: 'admin123' });
same(PUB(tok2).data.sale.status, 'cancelled', 'cancelled invoice shown as cancelled');
console.log('Invoice links: ' + checks + ' checks passed');
`;
eval(harness + scenario);
