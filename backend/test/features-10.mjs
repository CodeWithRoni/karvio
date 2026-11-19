// Shifts: open with the counted cash, sales and expenses move the drawer, close by counting; per-cashier and shared modes; selling gate.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const api = await apiClient(db), {q, raw} = api;
const adminToken = api.token;
const boot = await q('bootstrap');
const cash = boot.accounts.find((a) => a.type === 'cash').id;
const pen = await q('product.save', {name: 'Gel pen', sale_price: 50});
const sup = await q('supplier.save', {name: 'Stationery supplier'});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: pen.id, qty: 100, cost: 30, sale_price: 50}], payments: []});
const sell = (n, account = cash) => raw('sale.create', {items: [{product_id: pen.id, qty: n, price: 50}], payments: [{account_id: account, amount: n * 50}]});

// ---- Shifts are optional by default: selling works without one
ok((await sell(1)).ok, 'selling works without a shift when shifts are optional');
let mine = await q('shift.mine');
eq([mine.mode, mine.required, mine.shift, mine.can_sell], ['cashier', false, null, true], 'defaults: each cashier, optional');

// ---- Turn on "Open a shift before selling"
await q('settings.save', {values: {shift_required: true}});
ok(/Open your shift before selling/.test((await sell(1)).error), 'no open shift → no selling');
eq((await q('shift.mine')).can_sell, false, 'the POS knows it is locked');
ok(/does not match the notes/.test((await raw('shift.open', {account_id: cash, opening: 900, notes: {500: 2}})).error), 'the opening must match the notes');
const s1 = await q('shift.open', {account_id: cash, opening: 1000, notes: {500: 2}, note: 'Morning'});
eq([s1.no, s1.user, s1.opening, s1.expected, s1.mode], ['SH-000001', 'Harness owner', 1000, 1000, 'cashier'], 'shift opened with the counted cash');
ok(/already have an open shift/.test((await raw('shift.open', {account_id: cash, opening: 0})).error), 'one open shift per cashier');
ok((await sell(4)).ok, 'selling works once the shift is open');

// ---- A second cashier on the same drawer: only their own money counts in their shift
await q('user.save', {name: 'Cashier Two', username: 'cash10', role: 'sales', password: 'cash-password-1'});
const two = (await q('login', {username: 'cash10', password: 'cash-password-1'})).token;
api.setToken(two);
ok(/Open your shift/.test((await sell(1)).error), 'cashier two must open their own shift');
const s2 = await q('shift.open', {account_id: cash, opening: 500});
ok((await sell(2)).ok, 'cashier two sells');
let list = await q('shifts.list');
eq([list.can_all, list.open.map((s) => s.no)], [false, ['SH-000002']], 'a cashier sees only their own shift');
eq(list.open[0].expected, 600, 'cashier two: 500 + 2 pens');
ok(/Only Harness owner or a manager/.test((await raw('shift.close', {id: s1.id, counted: 1200})).error), 'a cashier cannot close someone else\'s shift');
api.setToken(adminToken);
list = await q('shifts.list');
eq(list.open.map((s) => [s.no, s.expected]), [['SH-000001', 1200], ['SH-000002', 600]], 'the manager sees both; own money only');

// ---- Close with a shortage: note required, balance corrected, history and stats
const before = (await q('accounts.list')).find((a) => a.id === cash).balance;
ok(/Write a note explaining the shortage/.test((await raw('shift.close', {id: s1.id, counted: 1150})).error), 'a shortage needs a note');
const c1 = await q('shift.close', {id: s1.id, counted: 1150, notes: {1000: 1, 100: 1, 50: 1}, note: 'Change from wallet', adjust: true});
eq([c1.expected, c1.counted, c1.difference, c1.adjusted, c1.closed_by], [1200, 1150, -50, true, 'Harness owner'], 'closed: short by 50, balance corrected');
eq((await q('accounts.list')).find((a) => a.id === cash).balance, before - 50, 'the drawer balance follows the count');
ok(/Open your shift/.test((await sell(1)).error), 'after closing, selling is locked again');
list = await q('shifts.list');
eq([list.stats.open, list.stats.closed_today, list.stats.difference_today, list.history[0].no], [1, 1, -50, 'SH-000001'], 'stats and history');
eq(list.accounts.find((a) => a.id === cash).last_counted, 1150, 'the next shift sees what the last close left');
eq(list.open[0].expected, 600, 'the correction is a book entry, not cash in cashier two\'s shift');
ok(/not open/.test((await raw('shift.close', {id: s1.id, counted: 1})).error), 'a closed shift cannot be closed again');
// The manager closes cashier two's shift (no difference)
const c2 = await q('shift.close', {id: s2.id, counted: 600});
eq([c2.difference, c2.closed_by, c2.user], [0, 'Harness owner', 'Cashier Two'], 'a manager can close any shift');

// ---- Shared mode: one shift per drawer, everyone's sales count, anyone can sell
await q('settings.save', {values: {shift_mode: 'shared'}});
const s3 = await q('shift.open', {account_id: cash, opening: 200});
ok(/already open on/.test((await raw('shift.open', {account_id: cash, opening: 0})).error), 'one shared shift per drawer');
api.setToken(two);
ok((await sell(3)).ok, 'cashier two sells in the shared shift');
eq((await q('shift.mine')).shift.no, s3.no, 'cashier two sees the shared shift');
const c3 = await q('shift.close', {id: s3.id, counted: 350});
eq([c3.expected, c3.difference, c3.mode, c3.closed_by], [350, 0, 'shared', 'Cashier Two'], 'anyone closes the shared shift; everyone\'s sales count');
api.setToken(adminToken);
await q('settings.save', {values: {shift_required: false}});
ok((await sell(1)).ok, 'shifts optional again: selling works');

// ---- Day book: every money entry with opening and closing balances, and the day's business
const day = (await q('bootstrap')).serverToday;
await q('settings.save', {values: {expense_categories: JSON.stringify(['Tea'])}});
await q('expense.create', {date: day, category: 'Tea', amount: 30, account_id: cash, note: 'Guests'});
const book = await q('daybook', {from: day, to: day});
const acc = book.accounts.find((a) => a.id === cash);
eq([acc.opening, acc.closing], [0, acc.in - acc.out], 'opening and closing balance of the cash account');
eq(book.closing, book.opening + book.in - book.out, 'closing = opening + in − out');
eq(book.entries.at(-1).balance, book.closing, 'the running balance ends at the closing balance');
ok(book.entries.some((e) => e.type === 'expense' && e.amount === 30 && e.direction === 'out' && /Tea — Guests/.test(e.note)), 'the expense is in the day book');
eq([book.business.sales.count, book.business.sales.total, book.business.expenses.amount], [5, 550, 30], 'the day\'s business: 5 sales of 11 pens, Tk 30 expenses');
const one = await q('daybook', {from: day, to: day, account_id: cash});
eq([one.accounts.length, one.business], [1, null], 'one account only');
ok(/valid dates/.test((await raw('daybook', {from: 'x'})).error), 'bad dates are refused');

console.log(`Features 10: ${checks} checks passed`);
await db.close?.();
process.exit(0);
