// SMS settings: admin / manager number lists (1 to 20, commas) for Service done, Repair completed and the Daily
// summary — every number gets the SMS; the sale SMS adds the invoice link when its message has {link}.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const {q, raw} = await apiClient(db);
const nums = (n, start = 100) => Array.from({length: n}, (_, i) => '01711' + String(start + i).padStart(6, '0'));
const sent = async () => { const l = await q('sms.log'); return l.rows || l; };
await q('settings.save', {values: {sms_enabled: 'true', sms_url: 'https://sms.example.com/send?to={number}&text={message}', sms_method: 'GET'}});

// lists: 20 allowed, 21 refused, bad numbers refused, repeats dropped
for (const k of ['daily_summary_phones', 'sms_service_done_numbers', 'sms_repair_done_numbers']) {
  ok(/up to 20 phone numbers/.test((await raw('settings.save', {values: {[k]: nums(21).join(', ')}})).error), k + ': 21 numbers refused');
  ok(/not a valid mobile number/.test((await raw('settings.save', {values: {[k]: '01711000100, 12345'}})).error), k + ': a bad number refused');
  await q('settings.save', {values: {[k]: nums(20).join(',') + ', ' + nums(1)[0]}});
  eq((await q('bootstrap')).settings[k].split(', ').length, 20, k + ': 20 kept, the repeat dropped');
}
// Service done: on with no number is refused (at least 1); off may be empty
ok(/at least 1 admin/.test((await raw('settings.save', {values: {sms_on_service_done: 'true', sms_service_done_numbers: ''}})).error), 'service done needs at least 1 number');
await q('settings.save', {values: {sms_on_service_done: 'false', sms_service_done_numbers: ''}});
eq((await q('bootstrap')).settings.sms_on_service_done, 'false', 'off, no numbers: saved');

// Daily summary: every number gets it
await q('settings.save', {values: {daily_summary_phones: nums(5, 300).join(', ')}});
const ds = await q('summary.send', {});
eq(ds.results.length, 5, 'summary sent to all 5 numbers');

// Service done: the SMS goes to every admin / manager number
await q('settings.save', {values: {sms_on_service_done: 'true', sms_service_done_numbers: nums(4, 400).join(', ')}});
const cam = (await q('service.type.save', {name: 'Camera fitting', charge: 500}))[0];
await q('user.save', {name: 'Rakib', username: 'rakib', role: 'technician', password: 'rakib-password-1', phone: '01811000001'});
const rakib = (await q('users.list')).find((u) => u.username === 'rakib');
const job = await q('service.save', {customer_name: 'Karim', phone: '01819000001', address: 'Mirpur', type_id: cam.id, details: '2 cameras', technician_id: rakib.id});
const wd = await q('service.status', {id: job.id, status: 'Work done', note: 'done'});
eq([wd.sms.sent + wd.sms.queued, wd.sms.to, wd.sms.status === 'failed'], [4, 4, false], 'service done: all 4 numbers');

// Repair completed: the customer and every admin / manager number get the same SMS
await q('settings.save', {values: {sms_repair_done_numbers: nums(3, 500).join(', ')}});
const rj = await q('repair.save', {customer_name: 'Sumon', phone: '01911000001', device: 'Laptop', problem: 'No display', charge: 1000});
const before = (await sent()).length;
const done = await q('repair.status', {id: rj.id, status: 'Completed'});
ok(done.sms && (done.sms.ok || done.sms.status === 'queued'), 'customer SMS sent');
eq([done.sms_staff.sent + done.sms_staff.queued, done.sms_staff.to], [3, 3], 'and the 3 staff numbers');
const after = await sent();
eq(after.length - before, 4, '4 SMS in the log');
ok(after.slice(0, 4).every((x) => x.message === after[0].message), 'the same message to all');
await q('settings.save', {values: {sms_repair_done_numbers: ''}});
const rj2 = await q('repair.save', {customer_name: 'Sumon', phone: '01911000001', device: 'Phone', problem: 'Battery', charge: 500});
eq((await q('repair.status', {id: rj2.id, status: 'Completed'})).sms_staff, undefined, 'no staff numbers: only the customer');

// Sale SMS: the link comes from {link} in the message
const p = await q('product.save', {name: 'Mouse', sale_price: 500});
const sup = await q('supplier.save', {name: 'S'});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: p.id, qty: 5, cost: 300}], payments: []});
const c = await q('customer.save', {name: 'Rahim', phones: ['01711999888']});
const cash = (await q('bootstrap')).accounts.find((a) => a.type === 'cash').id;
const sale = async () => { await q('sale.create', {customer_id: c.id, items: [{product_id: p.id, qty: 1, price: 500}], payments: [{account_id: cash, amount: 500}]}); return (await sent()).find((x) => /Rahim/.test(x.message)).message; };
ok(/#\/i\//.test(await sale()), 'default message has {link}: link added');
await q('settings.save', {values: {sms_template: 'Dear {name}, thanks. Invoice {invoice}, Total {total}.'}});
ok(!/#\/i\//.test(await sale()), 'no {link} in the message: no link');
console.log(`SMS numbers: ${checks} checks passed`);
