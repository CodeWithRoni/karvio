// Bug fixes of 19 Nov: cancelled/edited invoices and their online orders, refunds of earlier invoices,
// branch-correct cancel and edit, price 0 refused on online orders.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';
const db = await freshDatabase(); const api = await apiClient(db), {q, raw} = api;
let checks = 0; const note = (name, ok, detail) => { assert.ok(ok, name + (detail ? ' — ' + detail : '')); checks++; };
const cash = (await q('bootstrap')).accounts[0].id;
const bkash = (await q('account.save', {name: 'bKash', type: 'mfs', opening_balance: 0})).id;
const tea = await q('product.save', {name: 'Tea', sale_price: 100});
const sup = await q('supplier.save', {name: 'S'});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: tea.id, qty: 50, cost: 60, sale_price: 100}], payments: []});
const st = async (b) => (await q('products.list', {}, b ? {branch: b} : {})).find((p) => p.id === tea.id).stock;
const pw = 'harness-password-1';

// ---- Shift: cancelling an earlier invoice during a shift (cash given back from the drawer)
await q('settings.save', {values: {shift_mode: 'cashier'}});
const early = await q('sale.create', {items: [{product_id: tea.id, qty: 2, price: 100}], payments: [{account_id: cash, amount: 200}]});
const sh = await q('shift.open', {account_id: cash, opening: 1000});
await q('reverse', {type: 'sale', id: early.sale.id, password: pw, reason: 'customer returned'});
const v = (await q('shifts.list')).open[0];
note('Shift: cancelling an older invoice during the shift', v.expected === 800, `drawer should drop by the 200 handed back; expected shown ${v.expected}`);
await q('shift.close', {id: sh.id, counted: v.expected});

// ---- Online orders + invoice cancel / edit
const o = await q('order.save', {source: 'Facebook', customer: {name: 'Rina', phone: '01712345678', address: 'House 1, Road 2, Dhaka'}, items: [{product_id: tea.id, qty: 2, price: 100}], delivery_charge: 50});
const oc = await q('order.confirm', {id: o.id});
await q('order.ship', {id: o.id, courier: 'other', tracking: 'T1'});
await q('reverse', {type: 'sale', id: oc.sale_id, password: pw, reason: 'wrong'});
const ol = await q('orders.list');
note('Online order: invoice cancelled from Sales', ol.cod_with_courier === 0, `"cash with couriers" still counts it: ${ol.cod_with_courier}, order status ${ol.orders[0].status}, invoice ${ol.orders[0].sale_status}`);
const s2 = await raw('order.settle', {id: o.id, account_id: cash, charge: 0});
note('Online order: settle after its invoice was cancelled', !s2.ok, s2.ok ? 'it collected COD for a cancelled invoice' : s2.error);
const o2 = await q('order.save', {source: 'Facebook', customer: {name: 'Rina', phone: '01712345678', address: 'House 1, Road 2, Dhaka'}, items: [{product_id: tea.id, qty: 2, price: 100}]});
const o2c = await q('order.confirm', {id: o2.id});
const det = await q('sale.detail', {id: o2c.sale_id});
await q('sale.edit', {id: o2c.sale_id, password: pw, customer_id: det.sale.customer_id, items: [{product_id: tea.id, qty: 3, price: 100}], payments: []});
const o2n = (await q('orders.list')).orders.find((x) => x.id === o2.id);
note('Online order: its invoice edited (2 → 3 items)', o2n.cod === 300, `order still says total ${o2n.total}, COD ${o2n.cod}`);

// ---- Branches: cancel / return / edit done while working in another branch
const A = (await q('branch.save', {name: 'A'})).list[0].id;
const B = (await q('branch.save', {name: 'B'})).list.find((x) => x.name === 'B').id;
const sA = await q('sale.create', {items: [{product_id: tea.id, qty: 5, price: 100}], payments: [{account_id: cash, amount: 500}]}, {branch: A});
const a0 = await st(A), b0 = await st(B);
await q('reverse', {type: 'sale', id: sA.sale.id, password: pw, reason: 'x'}, {branch: B});
note('Branches: invoice of A cancelled while working in B', (await st(A)) === a0 + 5 && (await st(B)) === b0, `A ${a0}→${await st(A)}, B ${b0}→${await st(B)} (stock should go back to A)`);
const sA2 = await q('sale.create', {customer_id: (await q('customer.save', {name: 'Kamal', phones: '01811111111'})).id, items: [{product_id: tea.id, qty: 4, price: 100}], payments: []}, {branch: A});
const a1 = await st(A), b1 = await st(B);
await q('sreturn.create', {sale_id: sA2.sale.id, items: [{sale_item_id: sA2.items[0].id, qty: 1}], refund: {mode: 'adjust'}}, {branch: B});
note('Branches: return of an A invoice taken in B', (await st(A)) === a1 + 1 || (await st(B)) === b1 + 1, `A ${a1}→${await st(A)}, B ${b1}→${await st(B)} (goods come back where the return is taken — acceptable)`);
const rep = await q('branch.report', {});
const ed = await q('sale.edit', {id: sA2.sale.id, password: pw, customer_id: sA2.sale.customer_id, items: [{product_id: tea.id, qty: 1, price: 100}], payments: []}, {branch: B}).catch((e) => ({error: e.message}));
note('Branches: edit an A invoice while working in B', !!ed.error, ed.error || 'the edited invoice moved to branch B (sales and stock)');

// ---- Stock count while a branch has none, purchase cancel in a branch without the stock
const p2 = await q('purchase.create', {supplier_id: sup.id, items: [{product_id: tea.id, qty: 10, cost: 60, sale_price: 100}], payments: []}, {branch: A});
await q('branch.transfer.send', {to: B, items: [{product_id: tea.id, qty: await st(A)}]}, {branch: A}).catch(() => {});
const cancelP = await raw('reverse', {type: 'purchase', id: p2.id || p2.purchase?.id, password: pw, reason: 'x'}, {branch: A});
note('Branches: cancel a purchase after its stock was sent away', !cancelP.ok, cancelP.ok ? 'cancelled with no stock in A' : cancelP.error);

// ---- Notes / settings
const notesBefore = await q('notes.list');
note('Notes: start empty', notesBefore.length === 0);
// invoice edit from another branch keeps the invoice in its branch
const t2 = await q('product.save', {name: 'Biscuit', sale_price: 50});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: t2.id, qty: 20, cost: 30, sale_price: 50}], payments: []}, {branch: A});
const bs = async (b) => (await q('products.list', {}, {branch: b})).find((p) => p.id === t2.id).stock;
const sx = await q('sale.create', {items: [{product_id: t2.id, qty: 2, price: 50}], payments: [{account_id: cash, amount: 100}]}, {branch: A});
const before = (await q('branch.report', {})).branches.find((x) => x.id === A).sales;
await q('sale.edit', {id: sx.sale.id, password: pw, items: [{product_id: t2.id, qty: 3, price: 50}], payments: [{account_id: cash, amount: 150}]}, {branch: B});
note('Branches: an A invoice edited from B stays in A', (await bs(A)) === 17 && (await bs(B)) === 0 && (await q('branch.report', {})).branches.find((x) => x.id === A).sales === before + 50);
const zero = await raw('order.save', {source: 'Facebook', customer: {name: 'X', phone: '01700000000', address: 'Somewhere road'}, items: [{product_id: tea.id, qty: 1, price: 0}]});
note('Online order: price 0 is refused', /more than 0/.test(zero.error || ''));
// the cancel refund shows in the day book as a refund
const book = await q('daybook', {});
note('Day book shows the refund of the cancelled invoice', book.entries.some((e) => e.type === 'sale_cancel' && e.direction === 'out' && e.amount === 200));
console.log(`Features 14: ${checks} checks passed (bug fixes of 19 Nov).`);
