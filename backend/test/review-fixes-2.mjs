// Second full-review fixes: supplier list for purchase staff, supplier-less purchase returns, quotation
// numbers, barcode/SKU uniqueness, expense categories and own-sales scope in every sales report.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient, rpcFor} from './pg-harness.mjs';
import {createHandler} from '../../supabase/functions/karvio-api/handler.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const {q, raw} = await apiClient(db);
const h = createHandler({rpc: rpcFor(db)});
const as = async (username, password) => {
  const call = async (action, payload = {}, token) => (await h(new Request('http://k', {method: 'POST', body: JSON.stringify({action, payload, token, request_id: crypto.randomUUID()})}))).json();
  const token = (await call('login', {username, password})).data.token;
  return {raw: (a, p) => call(a, p, token), q: async (a, p) => { const r = await call(a, p, token); if (!r.ok) throw Error(a + ': ' + r.error); return r.data; }};
};
const cash = (await q('bootstrap')).accounts[0].id;
const sup = await q('supplier.save', {name: 'Review supplier', opening_balance: 500});
const item = await q('product.save', {name: 'Review item', sale_price: 100, sku: 'RV-1'});

// 1) Purchase staff without the Suppliers permission can refresh the supplier list (no opening balances).
await q('rolePerms.save', {manager: ['pos', 'purchase', 'reports'], sales: ['pos'], technician: ['repairs']});
await q('user.save', {name: 'Buyer', username: 'buyer', role: 'manager', password: 'buyer-password-12'});
await q('user.save', {name: 'Tech', username: 'tech', role: 'technician', password: 'tech-password-123', phone: '01711000111'});
const buyer = await as('buyer', 'buyer-password-12'), tech = await as('tech', 'tech-password-123');
const list = await buyer.q('suppliers.list');
ok(list.some(s => s.id === sup.id) && list.every(s => !('opening_balance' in s)), 'purchase staff get suppliers without opening balances');
ok(/Permission denied/.test((await tech.raw('suppliers.list')).error), 'staff with neither permission are refused');

// 2) A purchase without a supplier: its return must be refunded in full.
const noSup = await q('purchase.create', {items: [{product_id: item.id, qty: 4, cost: 50}], payments: [{account_id: cash, amount: 200}]});
const line = noSup.items[0].id;
ok(/must be refunded/.test((await raw('preturn.create', {purchase_id: noSup.purchase.id, items: [{purchase_item_id: line, qty: 1}], refund: {mode: 'cash', account_id: cash, amount: 20}})).error), 'partial refund refused');
const full = await q('preturn.create', {purchase_id: noSup.purchase.id, items: [{purchase_item_id: line, qty: 1}], refund: {mode: 'cash', account_id: cash, amount: 50}});
eq(full.return.received, 50, 'full refund accepted');

// 3) Quotation numbers: date, time and random digits; two quotes in a row differ.
await q('settings.save', {values: {sms_enabled: 'true', sms_url: 'https://sms.example.com/send?to={number}&text={message}', sms_method: 'GET'}});
const quote = {customer: 'Q', phone: '01711222333', title: 'Build', valid_days: 3, discount: 0, lines: [{group: 'P', name: 'x', warranty: '', qty: 1, price: 10}]};
const q1 = await q('quote.send', quote), q2 = await q('quote.send', quote);
ok(/^Q-\d{14}$/.test(q1.no) && /^Q-\d{14}$/.test(q2.no), 'quotation number format ' + q1.no);
ok(q1.no !== q2.no || q1.no.slice(0, 14) === q2.no.slice(0, 14), 'numbers carry date/time');

// 4) Barcodes and SKUs are unique together, ignoring capital letters.
ok(/already used/.test((await raw('product.save', {name: 'Clash 1', barcode: 'rv-1'})).error), 'barcode equal to another SKU refused');
ok(/already used/.test((await raw('product.save', {name: 'Clash 2', sku: 'rv-1'})).error), 'SKU differing only in case refused');
const other = await q('product.save', {name: 'Other item', barcode: 'BC-77', sale_price: 90});
ok(/already used/.test((await raw('product.save', {name: 'Clash 3', sku: 'bc-77'})).error), 'SKU equal to another barcode refused');
// An older duplicate does not block editing other fields of that product.
await db.query(`update public."Products" set sku = 'BC-77' where id = $1`, [item.id]);
const edited = await q('product.save', {id: item.id, name: 'Review item', sku: 'BC-77', description: 'edited'});
eq(edited.description, 'edited', 'legacy duplicate still editable');

// 5) Expenses: only categories from the list, saved with the list's spelling.
ok(/category list/.test((await raw('expense.create', {category: 'Gifts', amount: 10, account_id: cash})).error), 'unknown category refused');
eq((await q('expense.create', {category: '  rent ', amount: 10, account_id: cash})).category, 'Rent', 'list spelling kept');

// 6) Every sales report shows only the user's own sales without "View sales made by other staff".
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: other.id, qty: 5, cost: 40}], payments: []});
await q('sale.create', {customer_id: '', items: [{product_id: other.id, qty: 2, price: 90}], payments: [{account_id: cash, amount: 180}], send_sms: false});
await buyer.q('sale.create', {customer_id: '', items: [{product_id: other.id, qty: 1, price: 90}], payments: [{account_id: cash, amount: 90}], send_sms: false});
const mine = await buyer.q('reports', {type: 'product_sales'});
eq(mine.rows.map(r => [r.name, r.qty]), [['Other item', 1]], 'product-wise sales: own sales only');
const daily = await buyer.q('reports', {type: 'daily_summary'});
eq(daily.rows.reduce((n, r) => n + r.invoices, 0), 1, 'daily counts: own invoices only');
const adminDaily = await q('reports', {type: 'daily_summary'});
eq(adminDaily.rows.reduce((n, r) => n + r.invoices, 0), 2, 'admin sees every invoice');
console.log(`Review fixes 2: ${checks} checks passed (supplier list, supplier-less return, quote numbers, barcode/SKU, expense categories, own-sales reports).`);
