// Day lock after Day close, owner's money, slow-moving stock, signed-in devices and login history.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const {q, raw} = await apiClient(db);
const boot = await q('bootstrap'), cash = boot.accounts[0].id, today = boot.serverToday;
const day = (n) => new Date(Date.parse(today + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
await q('settings.save', {values: {expense_categories: JSON.stringify(['Other'])}});
const bank = await q('account.save', {name: 'Bank', type: 'bank', opening_balance: 0});

// ---- Owner's money
await q('account.entry', {kind: 'deposit', account_id: cash, amount: 300000, note: 'Starting capital', date: day(-40)});
await q('account.entry', {kind: 'withdraw', account_id: cash, amount: 20000, note: 'Drawing', date: day(-5)});
await q('account.entry', {kind: 'transfer', account_id: cash, to_account_id: bank.id, amount: 5000, date: day(-5)});
let om = await q('owner.money', {});
eq([om.put_in, om.taken_out, om.net, om.invested, om.count_in, om.count_out], [300000, 20000, 280000, 280000, 1, 1], 'owner totals; transfers are not owner money');
eq([om.rows[0].kind, om.rows[0].note, om.rows[0].invested, om.rows[1].note], ['out', 'Drawing', 280000, 'Starting capital'], 'newest first, running invested, plain notes');
om = await q('owner.money', {from: day(-10), to: today});
eq([om.put_in, om.taken_out, om.invested], [0, 20000, 280000], 'a period shows its own entries and the invested total so far');
ok(typeof om.profit === 'number', 'profit of the period for those who may see it');
const bs = await q('report.balance', {});
const line = (l) => bs.lines.find((x) => x.label === l);
eq(line("Owner's money put in, less taken out").values.current ?? line("Owner's money put in, less taken out").value, 280000, 'balance sheet shows the owner money');

// ---- Day close lock
const exp = await q('expense.create', {category: 'Other', amount: 100, account_id: cash, date: day(-2)});
const closed = await q('dayclose.save', {account_id: cash, date: day(-2), counted: (await q('dayclose.get', {account_id: cash, date: day(-2)})).expected, note: ''});
eq(closed.difference, 0, 'closed with matching count');
let dc = await q('dayclose.get', {account_id: cash, date: day(-2)});
eq([!!dc.closed, dc.locked], [true, true], 'the day is closed and locked');
const blocked = (r) => /is closed for Cash/.test(r.error || '');
ok(blocked(await raw('expense.create', {category: 'Other', amount: 50, account_id: cash, date: day(-2)})), 'no new expense on the closed day');
ok(blocked(await raw('account.entry', {kind: 'deposit', account_id: cash, amount: 10, date: day(-2)})), 'no deposit on the closed day');
ok(blocked(await raw('account.entry', {kind: 'transfer', account_id: bank.id, to_account_id: cash, amount: 10, date: day(-2)})), 'no transfer into the closed day');
ok(blocked(await raw('reverse', {type: 'expense', id: exp.id, reason: 'x', password: 'harness-password-1'})), 'no cancelling on the closed day');
ok(blocked(await raw('expense.update', {id: exp.id, category: 'Other', amount: 150, account_id: cash, date: day(-2), note: '', password: 'harness-password-1'})), 'no changing the amount on the closed day');
ok((await raw('expense.create', {category: 'Other', amount: 50, account_id: bank.id, date: day(-2)})).ok, 'another account is still open that day');
ok((await raw('expense.create', {category: 'Other', amount: 50, account_id: cash, date: day(-1)})).ok, 'another day is still open');
ok(/Write why/.test((await raw('dayclose.reopen', {account_id: cash, date: day(-2), reason: ' ', password: 'harness-password-1'})).error), 'reopening needs a reason');
ok(!(await raw('dayclose.reopen', {account_id: cash, date: day(-2), reason: 'missed', password: 'wrong-password'})).ok, 'reopening needs the admin password');
dc = await q('dayclose.reopen', {account_id: cash, date: day(-2), reason: 'missed an expense', password: 'harness-password-1'});
eq([dc.closed, dc.history[0].reopened, dc.history[0].reopen_reason], [null, true, 'missed an expense'], 'reopened: open again, history keeps the count');
ok((await raw('expense.create', {category: 'Other', amount: 50, account_id: cash, date: day(-2)})).ok, 'entries work again after reopening');
await q('dayclose.save', {account_id: cash, date: day(-2), counted: (await q('dayclose.get', {account_id: cash, date: day(-2)})).expected, note: ''});
ok(blocked(await raw('expense.create', {category: 'Other', amount: 50, account_id: cash, date: day(-2)})), 'closed again: locked again');
await q('settings.save', {values: {day_close_lock: 'false'}});
ok((await raw('expense.create', {category: 'Other', amount: 1, account_id: cash, date: day(-2)})).ok, 'the lock can be switched off in Settings');
await q('settings.save', {values: {day_close_lock: 'true'}});

// ---- Slow-moving stock
const sup = await q('supplier.save', {name: 'City IT'});
const mk = async (name, date, qty, cost) => {
  const p = await q('product.save', {name, sale_price: cost * 1.2});
  await q('purchase.create', {supplier_id: sup.id, date, items: [{product_id: p.id, qty, cost, sale_price: cost * 1.2}], payments: []});
  return p;
};
const oldNever = await mk('Old never sold', day(-100), 4, 1000);
const fresh = await mk('Fresh stock', day(-10), 5, 500);
const sells = await mk('Sells today', day(-100), 10, 200);
await q('sale.create', {items: [{product_id: sells.id, qty: 1, price: 300}], payments: [{account_id: bank.id, amount: 300}]});
let slow = await q('reports', {type: 'slow_stock', days: 60});
eq(slow.rows.map((r) => r.product), ['Old never sold'], 'only stock without a sale for 60 days');
eq([slow.rows[0].last_sold, slow.rows[0].idle_days, slow.rows[0].value, slow.rows[0].supplier], ['Never sold', 100, 4000, 'City IT'], 'never sold: days since it arrived, value at cost, last supplier');
eq([slow.slow.tied, slow.slow.products, slow.slow.stock_value, slow.slow.share], [4000, 1, 8300, 48.2], 'money tied up and its share of all stock');
slow = await q('reports', {type: 'slow_stock', days: 30});
eq(slow.rows.length, 1, 'fresh stock is not slow yet');
ok(oldNever.id && fresh.id, 'products made');

// ---- Devices and login history
const first = await raw('login', {username: 'admin', password: 'harness-password-1', device: 'Chrome on Windows'});
const second = await raw('login', {username: 'admin', password: 'harness-password-1', device: 'Chrome on Android'});
await raw('login', {username: 'admin', password: 'nope', device: 'Firefox on Linux'});
const as = (token) => (action, payload = {}) => raw(action, payload, {token});
let list = (await as(first.data.token)('sessions.list')).data;
ok(list.sessions.some((s) => s.device === 'Chrome on Windows' && s.current) && list.sessions.some((s) => s.device === 'Chrome on Android' && !s.current), 'both devices listed, this one marked');
eq(list.history.slice(0, 3).map((h) => [h.device, h.result]).sort(), [['Chrome on Android', 'ok'], ['Chrome on Windows', 'ok'], ['Firefox on Linux', 'failed']], 'history: sign-ins and the wrong password');
const mine = list.sessions.find((s) => s.current), other = list.sessions.find((s) => s.device === 'Chrome on Android');
ok(/device you are using/.test((await as(first.data.token)('sessions.revoke', {sid: mine.sid})).error), 'cannot sign out the device in use');
const rv = (await as(first.data.token)('sessions.revoke', {sid: other.sid})).data;
eq(rv.signed_out, 1, 'one device signed out');
ok(/AUTH: This device was signed out by an admin/.test((await as(second.data.token)('bootstrap')).error), 'the signed-out device must sign in again');
ok((await as(first.data.token)('bootstrap')).ok, 'the other device keeps working');
list = (await as(first.data.token)('sessions.list')).data;
ok(!list.sessions.some((s) => s.sid === other.sid) && list.history.some((h) => h.result === 'signed_out' && h.device === 'Chrome on Android'), 'gone from the list, noted in the history');
await as(first.data.token)('logout');
ok(!(await q('sessions.list')).sessions.some((s) => s.sid === mine.sid), 'signing out removes the device');

console.log(`Features 4: ${checks} checks passed (day lock, owner's money, slow stock, devices & logins).`);
