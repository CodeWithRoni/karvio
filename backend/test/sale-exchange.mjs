// One-step exchange: return + replacement sale in a single atomic request. Checks stock, serials, cost,
// profit, cash/bKash balances and customer balances for walk-in and customer invoices, upgrades and
// downgrades, refunds, unpaid invoices, failures that must save nothing, and reversing an exchange.
import assert from 'node:assert/strict';
import schema from '../../supabase/functions/karvio-api/schema.json' with {type:'json'};
import {hash} from '../../supabase/functions/karvio-api/runtime.mjs';
import {createHandler} from '../../supabase/functions/karvio-api/handler.mjs';

const setupKey = 'exchange-key', ownerPassword = 'test-password-12345';
const snapshot = {revision:0, metadata:{properties:{},cache:{},privateSheets:{}}, tables:Object.fromEntries(Object.keys(schema).map(n => [n, []])), requiresSetup:true};
const rpc = async (name, args) => {
  if (name === 'karvio_snapshot') return structuredClone(snapshot);
  if (args.expected_revision !== snapshot.revision) return {committed:false};
  if (args.initialize_owner && (!snapshot.requiresSetup || args.setup_token_hash !== hash(setupKey))) throw new Error('Invalid setup key');
  if (args.initialize_owner) snapshot.requiresSetup = false;
  Object.assign(snapshot.tables, structuredClone(args.changes)); snapshot.metadata = structuredClone(args.next_metadata); snapshot.revision++;
  return {committed:true};
};
const handler = createHandler({rpc});
const call = async (action, payload = {}, token = '') => (await handler(new Request('http://localhost', {method:'POST', body:JSON.stringify({action, payload, token, request_id:crypto.randomUUID()})}))).json();
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };

ok((await call('owner.initialize', {name:'Owner', password:ownerPassword, setup_key:setupKey})).ok, 'owner initialized');
const token = (await call('login', {username:'admin', password:ownerPassword})).data.token;
const Q = async (action, payload = {}) => { const r = await call(action, payload, token); assert.ok(r.ok, action + ': ' + r.error); return r.data; };
const R = (action, payload = {}) => call(action, payload, token);
const rejects = async (r, pattern, message) => { const res = await r; ok(!res.ok && pattern.test(res.error), message + ' (got: ' + (res.ok ? 'ok' : res.error) + ')'); };

const boot = await Q('bootstrap'), cash = boot.accounts[0], today = boot.serverToday;
const bkash = await Q('account.save', {name:'bKash', type:'mfs'});
const supplier = await Q('supplier.save', {name:'Mouse supplier'});
const product = async (name, price, cost, serials) => {
  const p = await Q('product.save', {name, sale_price:price, ...(serials ? {has_warranty:true, warranty_type:'serial', warranty_days:365} : {})});
  await Q('purchase.create', {supplier_id:supplier.id, items:[{product_id:p.id, qty:serials ? serials.length : 10, cost, ...(serials ? {serials} : {})}], payments:[]});
  return p;
};
const mouse620 = await product('Mouse 620D', 550, 400);
const mouse900 = await product('Mouse 900X', 700, 500);
const mouse100 = await product('Mouse 100', 400, 250);
const ssd = await product('SSD 512', 4000, 3000, ['S1', 'S2', 'S3']);
const customer = await Q('customer.save', {name:'Rahim', phones:['01711000123']});

const stock = id => snapshot.tables.Products.find(p => p.id === id).stock;
const balance = async id => (await Q('accounts.list')).find(a => a.id === id).balance;
const custBalance = async id => (await Q('customers.list')).find(c => c.id === id).balance;
// Gross profit exactly as the profit report computes it: sales profit less profit on returned goods.
const grossProfit = () => {
  const sales = snapshot.tables.Sales.filter(s => s.status === 'active').reduce((a, s) => a + s.profit, 0);
  const rets = snapshot.tables.SalesReturns.filter(r => r.status === 'active').reduce((a, r) => a + r.total - r.cost, 0);
  return Math.round((sales - rets) * 100) / 100;
};
const sell = (items, extra = {}) => Q('sale.create', {items, payments:[], send_sms:false, ...extra});
const line = (detail, productId) => detail.items.find(i => i.product_id === productId);

// 1. Walk-in upgrade: 620D (550) -> 900X (700), customer pays 150 by bKash.
let before = {cash:await balance(cash.id), bkash:await balance(bkash.id), profit:grossProfit()};
const w1 = await sell([{product_id:mouse620.id, qty:1, price:550}], {payments:[{account_id:cash.id, amount:550}]});
const x1 = await Q('sale.exchange', {sale_id:w1.sale.id, items:[{sale_item_id:line(w1, mouse620.id).id, qty:1}], replacement:[{product_id:mouse900.id, qty:1, price:700}],
  account_id:cash.id, payments:[{account_id:bkash.id, amount:150}], expected_return_value:550, expected_total:700});
eq([x1.summary.return_value, x1.summary.replacement_total, x1.summary.difference, x1.summary.paid_now], [550, 700, 150, 150], 'walk-in upgrade summary');
eq([stock(mouse620.id), stock(mouse900.id)], [10, 9], 'returned 620D back in stock, 900X out');
eq([await balance(cash.id) - before.cash, await balance(bkash.id) - before.bkash], [550, 150], 'cash keeps the 550, bKash gets the 150 difference');
eq(grossProfit() - before.profit, 200, 'profit is the 900X profit only (700 - 500)');
eq([x1.sale.sale.total, x1.sale.sale.paid, x1.sale.sale.due, x1.sale.sale.customer_name], [700, 700, 0, 'Walk-in'], 'new invoice fully paid');
ok(x1.sale.sale.note.includes(x1.return.return_no) && x1.sale.sale.note.includes(w1.sale.invoice_no), 'new invoice names the return and old invoice');
const r1 = snapshot.tables.SalesReturns.find(r => r.id === x1.return.id);
eq([r1.type, r1.total, r1.refund, r1.note], ['exchange', 550, 550, 'Exchanged for ' + x1.sale.sale.invoice_no], 'return row is an exchange that names the new invoice');

// 2. Walk-in downgrade: 620D (550) -> Mouse 100 (400), 150 goes back in cash.
before = {cash:await balance(cash.id), profit:grossProfit()};
const w2 = await sell([{product_id:mouse620.id, qty:1, price:550}], {payments:[{account_id:cash.id, amount:550}]});
const x2 = await Q('sale.exchange', {sale_id:w2.sale.id, items:[{sale_item_id:line(w2, mouse620.id).id, qty:1}], replacement:[{product_id:mouse100.id, qty:1, price:400}], account_id:cash.id, payments:[]});
eq(x2.summary.difference, -150, 'downgrade difference');
eq(await balance(cash.id) - before.cash, 400, 'net cash is the 400 replacement');
eq(grossProfit() - before.profit, 150, 'profit is the Mouse 100 profit (400 - 250)');
await rejects(R('sale.exchange', {sale_id:w2.sale.id, items:[], replacement:[{product_id:mouse900.id, qty:1, price:700}], account_id:cash.id}), /Select at least one item/, 'needs a returned item');

// 3. Customer upgrade, pays 100 now and 50 later.
before = {cash:await balance(cash.id), profit:grossProfit(), bal:await custBalance(customer.id)};
const c3 = await sell([{product_id:mouse620.id, qty:1, price:550}], {customer_id:customer.id, payments:[{account_id:cash.id, amount:550}]});
const x3 = await Q('sale.exchange', {sale_id:c3.sale.id, items:[{sale_item_id:line(c3, mouse620.id).id, qty:1}], replacement:[{product_id:mouse900.id, qty:1, price:700}],
  payments:[{account_id:cash.id, amount:100}], next_payment_date:today});
eq([x3.summary.credit_used, x3.summary.paid_now, x3.summary.due], [550, 100, 50], 'credit covers 550, 100 paid, 50 due');
eq(await custBalance(customer.id) - before.bal, 50, 'customer now owes 50');
eq(await balance(cash.id) - before.cash, 650, 'cash got 550 + 100');
eq(grossProfit() - before.profit, 200, 'profit follows the 900X');
eq((await Q('sale.detail', {id:x3.sale.sale.id})).sale.due_now, 50, 'new invoice shows 50 due now');
await Q('customer.payment', {customer_id:customer.id, amount:50, account_id:cash.id});

// 4. Customer downgrade, surplus kept as credit; 5. downgrade with the surplus refunded.
before = {bal:await custBalance(customer.id), cash:await balance(cash.id)};
const c4 = await sell([{product_id:mouse620.id, qty:1, price:550}], {customer_id:customer.id, payments:[{account_id:cash.id, amount:550}]});
await Q('sale.exchange', {sale_id:c4.sale.id, items:[{sale_item_id:line(c4, mouse620.id).id, qty:1}], replacement:[{product_id:mouse100.id, qty:1, price:400}], payments:[]});
eq(await custBalance(customer.id) - before.bal, -150, '150 kept as customer credit');
eq(await balance(cash.id) - before.cash, 550, 'no cash went back');
before = {bal:await custBalance(customer.id), cash:await balance(cash.id)};
const c5 = await sell([{product_id:mouse620.id, qty:1, price:550}], {customer_id:customer.id, payments:[{account_id:cash.id, amount:550}], credit_used:0});
await rejects(R('sale.exchange', {sale_id:c5.sale.id, items:[{sale_item_id:line(c5, mouse620.id).id, qty:1}], replacement:[{product_id:mouse100.id, qty:1, price:400}], refund:{account_id:cash.id, amount:200}}), /at most the exchange surplus of 150/, 'refund capped at the surplus');
const x5 = await Q('sale.exchange', {sale_id:c5.sale.id, items:[{sale_item_id:line(c5, mouse620.id).id, qty:1}], replacement:[{product_id:mouse100.id, qty:1, price:400}], refund:{account_id:cash.id, amount:150}});
eq(x5.refund.amount, 150, 'refund receipt returned');
eq([await custBalance(customer.id) - before.bal, await balance(cash.id) - before.cash], [0, 400], 'refunded: balance unchanged, net cash 400');

// 6. Unpaid original invoice: the return clears its own due, so no cash refund is possible.
const debtor = await Q('customer.save', {name:'Karim', phones:['01711000456']});
const c6 = await sell([{product_id:mouse620.id, qty:1, price:550}], {customer_id:debtor.id, next_payment_date:today});
const snap6 = JSON.stringify(snapshot.tables);
await rejects(R('sale.exchange', {sale_id:c6.sale.id, items:[{sale_item_id:line(c6, mouse620.id).id, qty:1}], replacement:[{product_id:mouse100.id, qty:1, price:400}], refund:{account_id:cash.id, amount:150}}), /clears what the customer still owes/, 'no refund while the customer owes');
eq(JSON.stringify(snapshot.tables), snap6, 'failed exchange saved nothing');
await Q('sale.exchange', {sale_id:c6.sale.id, items:[{sale_item_id:line(c6, mouse620.id).id, qty:1}], replacement:[{product_id:mouse100.id, qty:1, price:400}]});
eq(await custBalance(debtor.id), 400, 'owes exactly the replacement price');

// 7. Serial swap on the same product (S1 -> S2): exact serial costs and statuses.
before = {profit:grossProfit()};
const s7 = await sell([{product_id:ssd.id, qty:1, price:4000, serials:['S1']}], {payments:[{account_id:cash.id, amount:4000}]});
const x7 = await Q('sale.exchange', {sale_id:s7.sale.id, items:[{sale_item_id:line(s7, ssd.id).id, qty:1, serials:['S1']}], replacement:[{product_id:ssd.id, qty:1, price:4000, serials:['S2']}], account_id:cash.id});
const serial = sn => snapshot.tables.SerialItems.find(s => s.serial === sn);
eq([serial('S1').status, serial('S2').status, serial('S2').sale_id], ['in_stock', 'sold', x7.sale.sale.id], 'S1 back in stock, S2 sold on the new invoice');
eq(stock(ssd.id), 2, 'SSD stock unchanged by a like-for-like swap');
eq(grossProfit() - before.profit, 1000, 'one SSD profit, not two');

// 8. Failures save nothing.
const w8 = await sell([{product_id:mouse620.id, qty:1, price:550}], {payments:[{account_id:cash.id, amount:550}]});
const snap8 = JSON.stringify(snapshot.tables);
const args8 = {sale_id:w8.sale.id, items:[{sale_item_id:line(w8, mouse620.id).id, qty:1}], account_id:cash.id};
await rejects(R('sale.exchange', {...args8, replacement:[{product_id:mouse900.id, qty:50, price:700}]}), /stock/i, 'out-of-stock replacement');
await rejects(R('sale.exchange', {...args8, replacement:[{product_id:mouse900.id, qty:1, price:700}]}), /fully paid/, 'walk-in must pay the difference');
await rejects(R('sale.exchange', {...args8, replacement:[{product_id:mouse100.id, qty:1, price:400}], expected_return_value:600}), /return value changed/, 'stale return value');
await rejects(R('sale.exchange', {...args8, replacement:[]}), /Add the replacement/, 'replacement required');
await rejects(R('sale.exchange', {...args8, replacement:[{product_id:ssd.id, qty:1, price:4000, serials:['S2']}]}), /S2/, 'sold serial cannot be the replacement');
eq(JSON.stringify(snapshot.tables), snap8, 'every failed exchange saved nothing');

// 9. Reversing an exchange: cancel the new invoice, then the exchange return -> back to the original sale.
const w9 = await sell([{product_id:mouse620.id, qty:1, price:550}], {payments:[{account_id:cash.id, amount:550}]});
before = {cash:await balance(cash.id), bkash:await balance(bkash.id), profit:grossProfit(), s620:stock(mouse620.id), s900:stock(mouse900.id)};
const x9 = await Q('sale.exchange', {sale_id:w9.sale.id, items:[{sale_item_id:line(w9, mouse620.id).id, qty:1}], replacement:[{product_id:mouse900.id, qty:1, price:700}], account_id:cash.id, payments:[{account_id:bkash.id, amount:150}]});
await Q('reverse', {type:'sale', id:x9.sale.sale.id, password:ownerPassword, reason:'Exchange undone'});
await Q('reverse', {type:'sreturn', id:x9.return.id, password:ownerPassword, reason:'Exchange undone'});
eq([await balance(cash.id), await balance(bkash.id), grossProfit(), stock(mouse620.id), stock(mouse900.id)], [before.cash, before.bkash, before.profit, before.s620, before.s900], 'undoing both documents restores money, profit and stock');

// Overall: every account entry is tied to a document and the books balance.
const totalIn = snapshot.tables.AccountTxns.filter(t => !t.voided).reduce((a, t) => a + (t.direction === 'in' ? t.amount : -t.amount), 0);
eq(Math.round(totalIn * 100) / 100, await balance(cash.id) + await balance(bkash.id), 'account balances equal the sum of live entries');
ok(snapshot.tables.AuditLog.filter(a => a.action === 'sale_exchange').length === 8, 'each exchange is audited');

console.log(`Sale exchange: ${checks} checks passed (walk-in/customer upgrades and downgrades, refunds, unpaid invoices, serial swap, atomic failures, reversal).`);
