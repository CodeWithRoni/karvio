// Reports hub party reports: due collection, supplier payments, aging, products per party, and the party card.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const api = await apiClient(db), {q, raw} = api, admin = api.token;
const boot = await q('bootstrap'), cash = boot.accounts.find((a) => a.type === 'cash').id, today = boot.serverToday;
const bank = (await q('account.save', {name: 'City Bank', type: 'bank', opening_balance: 0})).id;
const day = (n) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const tea = await q('product.save', {name: 'Tea', sale_price: 100});
const sup = await q('supplier.save', {name: 'Sup A', phones: '01811111111'});
const sup2 = await q('supplier.save', {name: 'Sup B', phones: '01811111112'});
const rahim = await q('customer.save', {name: 'Rahim', phones: '01711111111'});
const karim = await q('customer.save', {name: 'Karim', phones: '01711111112', opening_balance: 300});
const pur = await q('purchase.create', {supplier_id: sup.id, date: day(100), items: [{product_id: tea.id, qty: 100, cost: 60}], payments: [{account_id: cash, amount: 1000}]});
await q('purchase.create', {supplier_id: sup2.id, items: [{product_id: tea.id, qty: 10, cost: 60}], payments: []});
const s1 = await q('sale.create', {customer_id: rahim.id, items: [{product_id: tea.id, qty: 20, price: 100}], payments: []});
const s2 = await q('sale.create', {customer_id: rahim.id, items: [{product_id: tea.id, qty: 10, price: 100}], payments: [{account_id: cash, amount: 400}]});
const s3 = await q('sale.create', {customer_id: karim.id, items: [{product_id: tea.id, qty: 5, price: 100}], discount: 50, payments: []});
// age the first two invoices: 75 and 200 days old
await db.query('update public."Sales" set date=$1 where id=$2', [day(75), s1.sale.id]);
await db.query('update public."Sales" set date=$1 where id=$2', [day(200), s3.sale.id]);
await db.query('update karvio_private.runtime set revision = revision + 1');
await q('customer.payment', {customer_id: rahim.id, amount: 500, account_id: cash});
await q('customer.payment', {customer_id: karim.id, amount: 100, account_id: bank});
await q('supplier.payment', {supplier_id: sup.id, amount: 700, account_id: bank});

// ---- Due collection
let r = await q('reports', {type: 'due_collections'});
eq([r.rows.length, r.totals.amount, r.party_money.parties], [2, 600, 2], 'two collections, 600 from two customers');
ok(r.rows.every((x) => x.ref_no.startsWith('CP-') && x.account && x.by === 'Harness owner'), 'each row has receipt, account and collector');
eq((await q('reports', {type: 'due_collections', account_id: bank})).totals.amount, 100, 'account filter');
eq((await q('reports', {type: 'due_collections', customer_id: rahim.id})).totals.amount, 500, 'customer filter');
eq((await q('reports', {type: 'due_collections', staff: 'Nobody'})).rows.length, 0, 'collector filter');
eq((await q('reports', {type: 'due_collections', source: 'cod'})).rows.length, 0, 'COD source: none yet');
const byParty = await q('reports', {type: 'due_collections', group: 'party'});
eq(byParty.rows.map((x) => [x.group, x.net]), [['Rahim', 500], ['Karim', 100]], 'grouped by customer, biggest first');
await q('customer.payment', {customer_id: karim.id, amount: 50, account_id: cash, direction: 'pay'}).catch(() => {});
eq((await q('reports', {type: 'due_collections', direction: 'all', from: '2000-01-01', to: '2000-01-31'})).rows.length, 0, 'date range filter');

// ---- Supplier payments: due payments and money paid with a purchase
r = await q('reports', {type: 'supplier_payments', from: day(30), to: today});
eq([r.rows.length, r.totals.amount], [1, 700], 'last 30 days: the due payment only (the purchase payment is 100 days old)');
r = await q('reports', {type: 'supplier_payments', from: '', to: ''});
eq([r.rows.length, r.totals.amount], [2, 1700], 'all time: due payment + paid with the purchase');
eq((await q('reports', {type: 'supplier_payments', from: '', to: '', source: 'invoice'})).rows.map((x) => x.ref_no), [pur.purchase.invoice_no], 'paid with purchases');
eq((await q('reports', {type: 'supplier_payments', from: '', to: '', source: 'due'})).totals.amount, 700, 'due payments only');
eq((await q('reports', {type: 'supplier_payments', from: '', to: '', group: 'account'})).rows.map((x) => [x.group, x.net]).sort(), [['Cash', 1000], ['City Bank', 700]].sort(), 'by account');

// ---- Aging
r = await q('reports', {type: 'aging', party: 'customer'});
const ages = Object.fromEntries(r.rows.map((x) => [x.invoice_no, [x.days, x.bucket, x.due]]));
eq(ages[s1.sale.invoice_no], [75, 'b90', 1500], 'Rahim\'s old invoice: 75 days, 61–90, the payment went to it first (2000 − 500)');
eq(ages[s2.sale.invoice_no], [0, 'b30', 600], 'Rahim\'s new invoice: 600 due');
eq(ages[s3.sale.invoice_no], [200, 'bmax', 450], 'Karim\'s invoice: over 180 days; the opening balance took his payment first');
ok(r.rows.some((x) => x.bucket === 'none' && x.party === 'Karim' && x.due === 200), 'Karim\'s opening balance shows as "No invoice"');
eq([r.aging.total, r.aging.b30, r.aging.b90, r.aging.bmax, r.aging.none], [2750, 600, 1500, 450, 200], 'bucket totals');
eq((await q('reports', {type: 'aging', party: 'customer', bucket: 'b90'})).rows.map((x) => x.invoice_no).sort(), [s1.sale.invoice_no, s3.sale.invoice_no].sort(), 'over 60 days');
eq((await q('reports', {type: 'aging', party: 'customer', bucket: 'bmax'})).rows.map((x) => x.invoice_no), [s3.sale.invoice_no], 'over 180 days');
const agp = await q('reports', {type: 'aging', party: 'customer', group: 'party'});
eq(agp.rows.map((x) => [x.party, x.total, x.oldest]), [['Rahim', 2100, 75], ['Karim', 650, 200]], 'by customer: totals and oldest');
const ags = await q('reports', {type: 'aging', party: 'supplier'});
eq(ags.rows.map((x) => [x.party, x.days, x.due]), [['Sup A', 100, 4300], ['Sup B', 0, 600]], 'supplier dues by age');

// ---- Products per party, net of returns
await q('sreturn.create', {sale_id: s2.sale.id, items: [{sale_item_id: s2.items[0].id, qty: 2}], refund: {mode: 'adjust'}});
r = await q('reports', {type: 'party_items', party: 'customer', party_id: rahim.id, from: '', to: ''});
eq(r.rows.map((x) => [x.product, x.qty, x.amount, x.ret_qty, x.net_qty, x.net_amount]), [['Tea', 30, 3000, 2, 28, 2800]], 'Rahim bought 30 tea, returned 2');
r = await q('reports', {type: 'party_items', party: 'customer', party_id: karim.id, from: '', to: ''});
eq(r.rows[0].amount, 450, 'the invoice discount is spread over the lines');
r = await q('reports', {type: 'sales_returns', customer_id: karim.id});
eq(r.rows.length, 0, 'returns report filters by customer');

// ---- Party card
let c = await q('party.card', {kind: 'customer', id: rahim.id});
eq([c.invoices, c.total, c.returns, c.net, c.due, c.advance], [2, 3000, 200, 2800, 1900, 0], 'Rahim: 2 invoices, 2800 after returns, 1900 due');
eq(c.paid_pct, Math.round((2800 - 1900) / 2800 * 100), 'collected share');
c = await q('party.card', {kind: 'supplier', id: sup.id});
eq([c.invoices, c.total, c.due, c.since], [1, 6000, 4300, day(100)], 'supplier card: since the first purchase when that is older');
const adv = await q('customer.save', {name: 'Advance man', phones: '01711111199'});
await q('customer.payment', {customer_id: adv.id, amount: 250, account_id: cash});
c = await q('party.card', {kind: 'customer', id: adv.id});
eq([c.invoices, c.due, c.advance, c.paid_pct], [0, 0, 250, 100], 'advance shown');

// ---- Permissions and branches
await q('user.save', {name: 'Seller', username: 'seller', role: 'sales', password: 'seller-password-1'});
api.setToken((await q('login', {username: 'seller', password: 'seller-password-1'})).token);
ok(/Permission denied/.test((await raw('reports', {type: 'aging', party: 'customer'})).error), 'reports need the Reports permission');
ok((await raw('party.card', {kind: 'customer', id: rahim.id})).ok, 'a POS user sees the customer card');
ok(/Permission denied/.test((await raw('party.card', {kind: 'supplier', id: sup.id})).error), 'but not the supplier card');
api.setToken(admin);

await db.close();
console.log(`Party reports: ${checks} checks passed`);
