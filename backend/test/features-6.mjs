// Part payment with a date for the rest: a customer-level promise that shows on the dashboard on that day.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const {q, raw} = await apiClient(db);
const boot = await q('bootstrap'), cash = boot.accounts[0].id, today = boot.serverToday;
const day = (n) => new Date(Date.parse(today + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const svc = await q('product.save', {name: 'Service', service: true, sale_price: 100});
const c = await q('customer.save', {name: 'Tanvir', phones: '01812345678'});
const sale = (await q('sale.create', {customer_id: c.id, items: [{product_id: svc.id, qty: 1, price: 10000}], payments: [], next_payment_date: today})).sale;
const mine = async () => (await q('dashboard')).reminders.filter((r) => r.customer_id === c.id);
eq((await mine()).map((r) => [r.invoice_no, !!r.whole]), [[sale.invoice_no, false]], 'the invoice has its own reminder first');

ok(/cannot be before/.test((await raw('customer.payment', {customer_id: c.id, account_id: cash, amount: 4000, next_payment_date: day(-1)})).error), 'the date cannot be in the past');
const pay = await q('customer.payment', {customer_id: c.id, account_id: cash, amount: 4000, next_payment_date: day(5)});
eq([pay.balance, pay.next_payment_date], [6000, day(5)], 'part payment keeps the promised date');
eq(await mine(), [], 'nothing on the dashboard before that day; the invoice reminder is replaced');
eq((await q('customers.list')).find((x) => x.id === c.id).next_payment_date, day(5), 'the customer list shows the promised date');

// the promised day arrives (move the promise to today through the action)
ok(/owes nothing/.test((await raw('customer.promise', {customer_id: (await q('customer.save', {name: 'Clear'})).id, next_payment_date: day(1)})).error), 'no promise for someone who owes nothing');
await q('customer.promise', {customer_id: c.id, next_payment_date: today});
let rem = await mine();
eq(rem.map((r) => [r.whole, r.remaining, r.next_payment_date, r.overdue_days, r.sale_id]), [[true, 6000, today, 0, '']], 'on the day: one reminder for everything still owed');

// another part payment with a new date pushes the reminder on; one without a date clears it
await q('customer.payment', {customer_id: c.id, account_id: cash, amount: 1000, next_payment_date: day(3)});
eq(await mine(), [], 'new date: reminder waits again');
await q('customer.promise', {customer_id: c.id, next_payment_date: today});
await q('customer.payment', {customer_id: c.id, account_id: cash, amount: 1000});
eq([(await mine()).length, (await q('customers.list')).find((x) => x.id === c.id).next_payment_date], [0, undefined], 'a payment without a date clears the old promise');

// paying everything: a date is ignored and nothing reminds
await q('customer.promise', {customer_id: c.id, next_payment_date: today});
const full = await q('customer.payment', {customer_id: c.id, account_id: cash, amount: 4000, next_payment_date: day(2)});
eq([full.balance, full.next_payment_date, (await mine()).length], [0, '', 0], 'paid in full: no date kept, no reminder');
// dismissing from the dashboard
await q('sale.create', {customer_id: c.id, items: [{product_id: svc.id, qty: 1, price: 500}], payments: []});
await q('customer.payment', {customer_id: c.id, account_id: cash, amount: 100, next_payment_date: today});
eq((await mine()).length, 1, 'due today right away when today is chosen');
await q('customer.promise', {customer_id: c.id, next_payment_date: ''});
eq((await mine()).length, 0, 'dismissed');
const audit = await q('audit.list', {}); ok((audit.rows || audit).some((a) => a.action === 'customer_promise'), 'changes are in the activity log');

console.log(`Features 6: ${checks} checks passed (part payment with a next payment date).`);
