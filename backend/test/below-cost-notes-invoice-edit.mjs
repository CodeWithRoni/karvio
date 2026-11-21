// Sales below cost, dashboard notes, SMS feature switches, invoice edit.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const api = await apiClient(db), {q, raw} = api;
const admin = api.token;
const boot = await q('bootstrap');
const cash = boot.accounts.find((a) => a.type === 'cash').id;
const mouse = await q('product.save', {name: 'Mouse M1', sale_price: 500});
const pad = await q('product.save', {name: 'Mouse pad', sale_price: 150});
const ssd = await q('product.save', {name: 'SSD 512', sale_price: 4000, has_warranty: true, warranty_type: 'serial', warranty_days: 365});
const sup = await q('supplier.save', {name: 'Supplier'});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: mouse.id, qty: 20, cost: 400, sale_price: 500}, {product_id: pad.id, qty: 20, cost: 100, sale_price: 150},
  {product_id: ssd.id, qty: 3, cost: 3500, sale_price: 4000, serials: ['S-1', 'S-2', 'S-3']}], payments: []});
const cust = await q('customer.save', {name: 'Karim', phones: '01711111111'});

// ---- Sales below cost
await q('sale.create', {items: [{product_id: mouse.id, qty: 2, price: 350}], payments: [{account_id: cash, amount: 700}]});
await q('sale.create', {items: [{product_id: pad.id, qty: 1, price: 150}], payments: [{account_id: cash, amount: 150}]});
// fine per line, but the invoice discount pushes it under cost
await q('sale.create', {items: [{product_id: mouse.id, qty: 1, price: 450}], discount: 100, payments: [{account_id: cash, amount: 350}]});
const bc = await q('dashboard.below_cost', {period: 'week'});
eq([bc.count, bc.invoices, bc.loss], [2, 2, 150], 'two lines below cost: 2×(400−350) + (400−350 after discount)');
eq([bc.rows[0].product, bc.rows.find((r) => r.qty === 2).unit_price], ['Mouse M1', 350], 'the lines show product and selling price');
const rep = await q('reports', {type: 'below_cost'});
eq([rep.rows.length, rep.below_cost.loss], [2, 150], 'the full report matches');
await q('user.save', {name: 'Seller', username: 'sell13', role: 'sales', password: 'sell-password-1'});
api.setToken((await q('login', {username: 'sell13', password: 'sell-password-1'})).token);
ok(/Permission denied/.test((await raw('dashboard.below_cost', {period: 'today'})).error), 'needs the cost permission');

// ---- Notes are private to each user
await q('note.save', {text: 'Seller private note', remind_at: '2026-01-01T09:00'});
api.setToken(admin);
let notes = await q('note.save', {text: 'Call Karim about payment', remind_at: '2026-11-20T10:30', color: 'blue'});
eq([notes.length, notes[0].text, notes[0].color, notes[0].status], [1, 'Call Karim about payment', 'blue', 'open'], 'my note, only mine');
ok(/reminder date and time/.test((await raw('note.save', {text: 'x', remind_at: 'tomorrow'})).error), 'a bad reminder is refused');
notes = await q('note.save', {...notes[0], remind_at: '', status: 'done'});
eq([notes[0].remind_at, notes[0].status], ['', 'done'], 'dismissed and done');
ok(!Object.keys(await q('settings.get')).some((k) => k.startsWith('notes_')), 'notes never travel with the settings');
eq((await q('note.delete', {id: notes[0].id})).length, 0, 'deleted');

// ---- SMS switches
await q('settings.save', {values: {sms_enabled: true, sms_url: 'https://sms.example/send', sms_on_due_reminder: false}});
ok(/Due reminder SMS is turned off/.test((await raw('customer.remind', {ids: [cust.id]})).error), 'a feature turned off does not send');
eq((await q('settings.get')).sms_on_due_reminder, 'false', 'the switch is saved');

// ---- Invoice edit
const inv = await q('sale.create', {customer_id: cust.id, items: [{product_id: mouse.id, qty: 2, price: 500}, {product_id: ssd.id, qty: 1, price: 4000, serials: 'S-1'}], payments: [{account_id: cash, amount: 3000}]});
const stock = async (id) => (await q('products.list')).find((p) => p.id === id).stock;
const bal = async () => (await q('customers.list')).find((c) => c.id === cust.id).balance;
eq([await stock(mouse.id), await stock(ssd.id), await bal()], [15, 2, 2000], 'before: 15 mice, 2 SSD, Karim owes 2000');
ok(/password/i.test((await raw('sale.edit', {id: inv.sale.id, items: []})).error), 'an admin password is needed');
const edited = await q('sale.edit', {id: inv.sale.id, password: 'harness-password-1', reason: 'wrong qty', customer_id: cust.id,
  items: [{product_id: mouse.id, qty: 3, price: 480}, {product_id: ssd.id, qty: 1, price: 4000, serials: 'S-2'}], discount: 40, payments: [{account_id: cash, amount: 5000}]});
eq([edited.sale.invoice_no, edited.sale.total, edited.sale.paid, edited.sale.due, edited.sale.date], [inv.sale.invoice_no, 5400, 5000, 400, inv.sale.date], 'same number and date, new total 3×480 + 4000 − 40');
eq([await stock(mouse.id), await stock(ssd.id), await bal()], [14, 2, 400], 'stock and due follow: 14 mice, SSD S-1 back and S-2 out, Karim owes 400');
const serials = await q('serials.find', {serial: 'S-1'});
ok(serials && serials.product_id === ssd.id, 'S-1 is back in stock');
const list = await q('sales.list', {});
eq(list.filter((x) => x.invoice_no.startsWith(inv.sale.invoice_no)).map((x) => x.invoice_no), [inv.sale.invoice_no], 'the list shows the invoice once (the old copy is hidden)');
ok((await q('sales.list', {include_edited: true})).some((x) => x.invoice_no === inv.sale.invoice_no + '-E1' && x.status === 'cancelled'), 'the old version is kept as -E1, cancelled');
const log = await q('audit.list', {});
ok(JSON.stringify(log).includes('sale_edit'), 'the edit is in the activity log');
await q('sreturn.create', {sale_id: edited.sale.id, items: [{sale_item_id: edited.items.find((i) => i.product_id === mouse.id).id, qty: 1}], refund: {mode: 'adjust'}});
ok(/has a return/.test((await raw('sale.edit', {id: edited.sale.id, password: 'harness-password-1', items: [{product_id: mouse.id, qty: 1, price: 500}], payments: []})).error), 'an invoice with a return cannot be edited');

console.log(`Features 13: ${checks} checks passed (below cost, notes, SMS switches, invoice edit).`);
