// Payment lines: blank amounts are skipped, negative or non-numeric amounts are refused (they used to be
// dropped silently, so a typo saved a sale or purchase with less paid than the user entered).
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';

const db = await freshDatabase();
const {q, raw} = await apiClient(db);
const cash = (await q('bootstrap')).accounts[0].id;
const sup = await q('supplier.save', {name: 'Pay supplier'});
const item = await q('product.save', {name: 'Pay item', sale_price: 100});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: item.id, qty: 5, cost: 40}], payments: []});
const cust = await q('customer.save', {name: 'Pay customer'});
const count = async t => (await db.query(`select count(*)::int n from public."${t}"`)).rows[0].n;
let checks = 0;
const sales = await count('Sales'), purchases = await count('Purchases');
const sale = payments => raw('sale.create', {customer_id: cust.id, items: [{product_id: item.id, qty: 1, price: 100}], payments, send_sms: false});
for (const amount of [-100, 'abc', 'NaN', '1e999']) {
  const r = await sale([{account_id: cash, amount}]);
  assert.equal(r.ok, false, `sale payment ${amount} refused`); assert.match(r.error, /Payment amount must be a number of 0 or more/); checks += 2;
}
const p = await raw('purchase.create', {supplier_id: sup.id, items: [{product_id: item.id, qty: 1, cost: 40}], payments: [{account_id: cash, amount: -40}]});
assert.equal(p.ok, false, 'purchase negative payment refused'); checks++;
assert.equal(await count('Sales'), sales); assert.equal(await count('Purchases'), purchases); checks += 2;
// Blank lines (an empty payment row in the form) are still skipped.
const ok = await sale([{account_id: cash, amount: ''}, {account_id: cash, amount: null}, {account_id: cash}, {account_id: cash, amount: 0}, {account_id: cash, amount: '60'}]);
assert.equal(ok.ok, true, ok.error); assert.equal(ok.data.sale.paid, 60); assert.equal(ok.data.sale.due, 40); checks += 3;
console.log(`Payment amounts: ${checks} checks passed (negative / non-numeric refused, blank lines skipped, nothing saved on refusal).`);
