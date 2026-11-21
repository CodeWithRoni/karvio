// Approval: chosen staff send purchases, supplier payments, collections, expenses and branch transfers to an admin.
// Held work is checked in full but changes nothing until approved; approved work is saved as the staff member's.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const api = await apiClient(db), {q, raw} = api, admin = api.token;
const boot = await q('bootstrap'), cash = boot.accounts.find((a) => a.type === 'cash').id;
const tea = await q('product.save', {name: 'Tea', sale_price: 100});
const sup = await q('supplier.save', {name: 'Wholesaler'});
const cust = await q('customer.save', {name: 'Karim', phones: ['01711000001']});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: tea.id, qty: 20, cost: 60}], payments: []});
await q('sale.create', {customer_id: cust.id, items: [{product_id: tea.id, qty: 5, price: 100}], payments: []});
await q('account.entry', {account_id: cash, direction: 'in', amount: 10000, note: 'Capital'});
let b = await q('branch.save', {name: 'Main'}); const A = b.list[0].id;
b = await q('branch.save', {name: 'Uttara'}); const B = b.list.find((x) => x.name === 'Uttara').id;
await q('rolePerms.save', {manager: ['pos', 'purchase', 'suppliers', 'customers', 'expenses', 'products', 'reports'], sales: ['pos'], technician: ['repairs', 'service']});
const mgr = await q('user.save', {name: 'Rafiq', username: 'rafiq', role: 'manager', password: 'rafiq-password-1', approvals: ['purchase', 'payment', 'collection', 'expense', 'transfer']});
eq(mgr.approvals, ['purchase', 'payment', 'collection', 'expense', 'transfer'], 'Users & Roles: approvals saved');
const free = await q('user.save', {name: 'Sumon', username: 'sumon', role: 'manager', password: 'sumon-password-1'});
eq(free.approvals, [], 'no approvals ticked');
eq((await q('users.list')).find((u) => u.id === mgr.id).approvals.length, 5, 'users.list shows them');
await q('settings.save', {values: {sms_enabled: 'true', sms_url: 'https://sms.example.com/send?to={number}&text={message}', sms_method: 'GET', sms_approval_numbers: '01711000901, 01711000902'}});
const as = async (name, pass) => { api.setToken((await q('login', {username: name, password: pass})).token); };
const state = async () => { api.setToken(admin); const bt = await q('bootstrap', {}, {branch: A}); const pl = await q('products.list', {}, {branch: A});
  return { stock: pl.find((x) => x.id === tea.id).stock, cash: bt.accounts.find((x) => x.id === cash).balance, due: (await q('customers.list')).find((x) => x.id === cust.id).balance, sup: (await q('suppliers.list')).find((x) => x.id === sup.id).balance }; };
const before = await state();

// ---- Rafiq's work is held
await as('rafiq', 'rafiq-password-1');
ok(/Write the quantity|quantity|more than 0/i.test((await raw('purchase.create', {supplier_id: sup.id, items: [{product_id: tea.id, qty: 0, cost: 60}], payments: []}, {branch: A})).error), 'a wrong purchase is refused at once, not held');
const hp = await q('purchase.create', {supplier_id: sup.id, items: [{product_id: tea.id, qty: 10, cost: 55}], payments: [{account_id: cash, amount: 200}], note: 'Eid stock'}, {branch: A});
ok(hp.pending_approval && hp.approval.status === 'pending' && /^APR-/.test(hp.approval.no), 'purchase held: ' + hp.approval.no);
eq([hp.approval.summary.party, hp.approval.summary.amount, hp.approval.summary.lines.length], ['Wholesaler', 550, 1], 'the request says what it is');
const hpay = await q('supplier.payment', {supplier_id: sup.id, amount: 300, account_id: cash}, {branch: A});
const hcol = await q('customer.payment', {customer_id: cust.id, amount: 200, account_id: cash}, {branch: A});
const hexp = await q('expense.create', {date: boot.serverToday, category: 'Other', amount: 150, account_id: cash, note: 'Tea for staff'}, {branch: A});
const htr = await q('branch.transfer.send', {to: B, items: [{product_id: tea.id, qty: 4}]}, {branch: A});
ok([hpay, hcol, hexp, htr].every((x) => x.pending_approval), 'payment, collection, expense, transfer held too');
eq(await state(), before, 'nothing changed: stock, cash, customer due, supplier balance');
await as('rafiq', 'rafiq-password-1');
const mine = await q('approvals.list');
eq([mine.rows.length, mine.admin, mine.pending.purchase], [5, false, 1], 'Rafiq sees his 5 requests');
ok(/Only an admin/.test((await raw('approval.decide', {id: hp.approval.id, decision: 'approve'})).error), 'he cannot approve');

// ---- Sumon (no approvals) saves straight away
await as('sumon', 'sumon-password-1');
const direct = await q('expense.create', {date: boot.serverToday, category: 'Other', amount: 10, account_id: cash}, {branch: A});
ok(!direct.pending_approval && direct.id, 'no approval ticked: saved at once');
ok((await q('approvals.list')).rows.length === 0, 'and he sees no one else\'s requests');

// ---- Admin: dashboard, SMS, approve, reject
api.setToken(admin);
const dash = await q('dashboard', {}, {branch: A});
eq(dash.approvals.length, 5, 'dashboard shows 5 waiting');
const log = await q('sms.log'); const msgs = (log.rows || log).map((x) => x.message).filter((m) => /for approval/.test(m));
eq(msgs.length, 10, '5 requests × 2 admin numbers');
ok(msgs.some((m) => /Rafiq sent a Purchase for approval: Wholesaler, Tk 550/.test(m)), 'SMS text: ' + msgs[0]);
const ap = await q('approval.decide', {id: hp.approval.id, decision: 'approve'});
ok(ap.status === 'approved' && /^PUR-/.test(ap.result_no), 'purchase approved → ' + ap.result_no);
const pd = await q('purchase.detail', {id: ap.result.purchase.id});
eq([pd.purchase.user, pd.purchase.note, pd.purchase.total], ['Rafiq', 'Eid stock', 550], 'saved as Rafiq\'s purchase');
ok(/already approved/.test((await raw('approval.decide', {id: hp.approval.id, decision: 'approve'})).error), 'not twice');
ok(/Write why/.test((await raw('approval.decide', {id: hexp.approval.id, decision: 'reject'})).error), 'reject needs a reason');
const rj = await q('approval.decide', {id: hexp.approval.id, decision: 'reject', reason: 'Not needed'});
eq([rj.status, rj.reason, rj.decided_by], ['rejected', 'Not needed', 'Harness owner'], 'expense rejected');
for (const h of [hpay, hcol, htr]) eq((await q('approval.decide', {id: h.approval.id, decision: 'approve'})).status, 'approved', h.approval.kind + ' approved');
const after = await state();
eq([after.stock, after.cash, after.due, after.sup], [before.stock + 10 - 4, before.cash - 200 - 300 + 200 - 10, before.due - 200, before.sup + 550 - 200 - 300], 'approved work is in the books');
eq((await q('dashboard', {}, {branch: A})).approvals.length, 0, 'nothing waiting');
const all = await q('approvals.list', {status: 'approved'});
eq(all.rows.length, 4, '4 approved in the list');
// untick: Rafiq saves directly again
await q('user.save', {...mgr, password: '', approvals: []});
await as('rafiq', 'rafiq-password-1');
ok(!(await q('expense.create', {date: boot.serverToday, category: 'Other', amount: 5, account_id: cash}, {branch: A})).pending_approval, 'approvals removed: saved at once');
api.setToken(admin);
ok(/up to 20/.test((await raw('settings.save', {values: {sms_approval_numbers: Array.from({length: 21}, (_, i) => '0171100' + (1000 + i)).join(',')}})).error), 'approval SMS: up to 20 numbers');
console.log(`Approvals: ${checks} checks passed`);
