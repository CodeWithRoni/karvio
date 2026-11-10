// Five financial regressions, executed only against in-memory Google mocks.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const file = path.resolve(__dirname, '../../backend/test/__financial_harness.cjs');
const fixture = new Module(file, module);
fixture.filename = file;
fixture.paths = Module._nodeModulePaths(path.dirname(file));
fixture._compile(fs.readFileSync(path.join(path.dirname(file), 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0] + '\nmodule.exports={sandbox,call};', file);
const { sandbox, call } = fixture.exports;
sandbox.setupDatabase();
const token = call('login', { username: 'admin', password: 'admin123' }).data.token;
let checks = 0;
const eq = (a, b) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), b); checks++; };
const Q = (action, payload = {}, t = token) => { const r = call(action, payload, t); assert.ok(r.ok, action + ': ' + r.error); return r.data; };
const reject = (action, payload, pattern, t = token) => { const r = call(action, payload, t); eq(r.ok, false); assert.match(r.error, pattern); checks++; };
const cash = Q('bootstrap').accounts[0];
const supplier = Q('supplier.save', { name: 'Backdated supplier', opening_balance: 400 });
const part = Q('product.save', { name: 'RAM', sale_price: 100 });
Q('purchase.create', { supplier_id: supplier.id, date: '2020-01-05', items: [{ product_id: part.id, qty: 10, cost: 100 }], payments: [] });
Q('purchase.create', { supplier_id: supplier.id, date: '2020-01-01', items: [{ product_id: part.id, qty: 10, cost: 20 }], payments: [] });
const statement = Q('supplier.statement', { supplier_id: supplier.id, from: '2020-01-03', to: '2020-01-05' });
eq(statement.opening, 600);
eq(statement.rows.map(r => r.balance), [1600]);
eq(statement.closing, 1600);
eq(Q('supplier.statement', { supplier_id: supplier.id, to: '2020-01-02' }).closing, 600);

const helper = { module: { exports: {} }, require: () => ({ round2: n => Math.round((Number(n) || 0) * 100) / 100 }) };
vm.runInNewContext(esbuild.transformSync(fs.readFileSync(path.join(__dirname, '../src/lib/returnValue.js'), 'utf8'), { format: 'cjs' }).code, helper);
const value = helper.module.exports.returnValue;
const services = [0, 1, 2].map(i => Q('product.save', { name: 'Service ' + i, service: true, sale_price: 100 }));
const walkin = Q('sale.create', { items: services.map(p => ({ product_id: p.id, qty: 1, price: 100 })), discount: 100, payments: [{ account_id: cash.id, amount: 200 }] });
let returned = 0;
for (const index of [1, 0, 2]) {
  const detail = Q('sale.detail', { id: walkin.sale.id });
  const lines = detail.items.map((_, i) => ({ qty: i === index ? 1 : 0 }));
  const predicted = value(detail.sale, detail.items, lines);
  const r = Q('sreturn.create', { sale_id: walkin.sale.id, items: [{ sale_item_id: detail.items[index].id, qty: 1 }], refund: { mode: 'cash', account_id: cash.id } });
  eq(r.return.total, predicted);
  eq(r.return.refund, predicted);
  returned += predicted;
}
eq(returned, 200);
// Cumulative partial returns must preserve the last cent.
const partial = Q('sale.create', { items: [{ product_id: services[0].id, qty: 3, price: 100 }], discount: 100, payments: [{ account_id: cash.id, amount: 200 }] });
for (let i = 0; i < 3; i++) {
  const d = Q('sale.detail', { id: partial.sale.id });
  const predicted = value(d.sale, d.items, [{ qty: 1 }]);
  const r = Q('sreturn.create', { sale_id: partial.sale.id, items: [{ sale_item_id: d.items[0].id, qty: 1 }], refund: { mode: 'cash', account_id: cash.id } });
  eq(r.return.total, predicted);
}

const customer = Q('customer.save', { name: 'Repair customer', phones: '01711112222' });
Q('user.save', { name: 'Technician', username: 'techfix', password: 'abcdef12', role: 'technician', phone: '01733334444' });
const tech = Q('login', { username: 'techfix', password: 'abcdef12' }).token;
const draft = { customer_id: customer.id, device: 'PC', problem: 'Test', parts: [{ product_id: part.id, qty: 3, price: 0 }] };
reject('repair.save', draft, /POS permission/, tech);
const job = Q('repair.save', { ...draft, parts: [{ product_id: part.id, qty: 3, price: 100 }] }, tech);
const before = Q('products.list').find(p => p.id === part.id).stock;
for (const payload of [{}, { discount: 300 }, { payments: [{ account_id: cash.id, amount: 300 }] }]) reject('repair.deliver', { id: job.id, ...payload }, /Permission denied/, tech);
eq(Q('products.list').find(p => p.id === part.id).stock, before);
Q('repair.status', { id: job.id, status: 'Completed', send_sms: false }, tech);
eq(Q('repair.get', { id: job.id }, tech).status, 'Completed');
const delivered = Q('repair.deliver', { id: job.id, payments: [{ account_id: cash.id, amount: 300 }] });
eq(delivered.sale.total, 300);
eq(Q('products.list').find(p => p.id === part.id).stock, before - 3);

const advanceJob = Q('repair.save', { customer_id: customer.id, device: 'Laptop', problem: 'Test', advance: 500, account_id: cash.id });
Q('sale.create', { customer_id: customer.id, items: [{ product_id: services[0].id, qty: 1, price: 500 }], credit_used: 500, payments: [] });
const moneyBefore = Q('accounts.list').find(a => a.id === cash.id).balance;
reject('repair.cancel', { id: advanceJob.id, reason: 'Cancel', refund_account_id: cash.id }, /no longer fully available/);
eq(Q('accounts.list').find(a => a.id === cash.id).balance, moneyBefore);
eq(Q('repair.get', { id: advanceJob.id }).status, 'Received');
Q('repair.cancel', { id: advanceJob.id, reason: 'Keep existing ledger credit' });
eq(Q('customers.list').find(c => c.id === customer.id).balance, 0);
const fresh = Q('repair.save', { customer_id: customer.id, device: 'Phone', problem: 'Test', advance: 200, account_id: cash.id });
Q('repair.cancel', { id: fresh.id, reason: 'Refund available credit', refund_account_id: cash.id });
eq(Q('customers.list').find(c => c.id === customer.id).balance, 0);
reject('repair.cancel', { id: fresh.id, reason: 'Again', refund_account_id: cash.id }, /Cancelled/);

const debt = Q('sale.create', { customer_id: customer.id, items: [{ product_id: services[0].id, qty: 1, price: 100 }], payments: [] });
const link = Q('sale.link', { id: debt.sale.id }).url.split('/').pop();
const publicInvoice = () => { const r = call('invoice.public', { token: link }); assert.ok(r.ok, r.error); return r.data.sale; };
eq(publicInvoice().due, 100);
Q('customer.payment', { customer_id: customer.id, account_id: cash.id, amount: 40 });
eq(publicInvoice().due, 60);
Q('customer.payment', { customer_id: customer.id, account_id: cash.id, amount: 60 });
eq(publicInvoice().due, 0);
eq(publicInvoice().original_due, 100);
eq(publicInvoice().paid, 0); // Preserve the historical payment at the time of sale.
console.log('Five financial fixes: ' + checks + ' checks passed');
