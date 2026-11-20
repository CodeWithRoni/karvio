// Salary paid to a staff member (in parts) and the monthly limits set by Monthly expenses.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const {q, raw} = await apiClient(db), pw = 'harness-password-1';
const boot = await q('bootstrap'), cash = boot.accounts.find((a) => a.type === 'cash').id, today = boot.serverToday;
await q('settings.save', {values: {expense_categories: JSON.stringify(['Salary', 'Rent', 'Food'])}});
await q('account.entry', {account_id: cash, direction: 'in', amount: 100000, note: 'Capital'}).catch(() => {});
await q('user.save', {name: 'Rakib', username: 'rakib', role: 'sales', password: 'rakib-password-1'});
await q('user.save', {name: 'Sumon', username: 'sumon', role: 'sales', password: 'sumon-password-1'});
const users = await q('users.list'), rakib = users.find((u) => u.username === 'rakib'), sumon = users.find((u) => u.username === 'sumon');

// No monthly line yet: no limit
let l = await q('expense.limit', {category: 'Salary', staff_id: rakib.id, date: today});
eq([l.limit, l.salary, l.staff.some((u) => u.id === rakib.id)], [null, true, true], 'no limit without a monthly line; staff list for salary');
// Monthly expenses: Rakib 10,000, Sumon 8,000, Rent 3,500
const set = await q('expense.recurring.save', {templates: [
  {name: 'Rakib salary', category: 'Salary', staff_id: rakib.id, amount: 10000, account_id: cash, day: 28},
  {name: 'Sumon salary', category: 'Salary', staff_id: sumon.id, amount: 8000, account_id: cash, day: 28},
  {name: 'Shop rent', category: 'Rent', amount: 3500, account_id: cash, day: 28}]});
eq(set.templates.map((t) => [t.name, t.staff_name || '']), [['Rakib salary', 'Rakib'], ['Sumon salary', 'Sumon'], ['Shop rent', '']], 'salary lines keep their staff');
ok(/two salary lines/.test((await raw('expense.recurring.save', {templates: [
  {name: 'A', category: 'Salary', staff_id: rakib.id, amount: 1, account_id: cash, day: 1}, {name: 'B', category: 'Salary', staff_id: rakib.id, amount: 1, account_id: cash, day: 1}]})).error), 'one salary line per person');

// Rakib paid in parts: 4,000 + 6,000 is fine, then nothing more this month
await q('expense.create', {date: today, category: 'Salary', staff_id: rakib.id, amount: 4000, account_id: cash, note: 'Advance'});
l = await q('expense.limit', {category: 'Salary', staff_id: rakib.id, date: today});
eq([l.limit, l.spent, l.left], [10000, 4000, 6000], 'part paid: 6,000 left');
const over = await raw('expense.create', {date: today, category: 'Salary', staff_id: rakib.id, amount: 6500, account_id: cash});
ok(!over.ok && /Salary of Rakib .* limited to 10000 .* at most 6000/.test(over.error), 'more than what is left is refused: ' + over.error);
await q('expense.create', {date: today, category: 'Salary', staff_id: rakib.id, amount: 6000, account_id: cash});
ok(/at most 0/.test((await raw('expense.create', {date: today, category: 'Salary', staff_id: rakib.id, amount: 1, account_id: cash})).error), 'full: nothing more');
eq((await q('expense.limit', {category: 'Salary', staff_id: sumon.id, date: today})).left, 8000, 'Sumon has his own limit');
// Category limit (rent) and a category with no line (food)
ok(/Rent .* limited to 3500/.test((await raw('expense.create', {date: today, category: 'Rent', amount: 4000, account_id: cash})).error), 'rent above its monthly line is refused');
await q('expense.create', {date: today, category: 'Rent', amount: 3500, account_id: cash});
await q('expense.create', {date: today, category: 'Food', amount: 99999, account_id: cash}).catch(() => {});
ok((await raw('expense.create', {date: today, category: 'Food', amount: 50, account_id: cash})).ok, 'no monthly line: no limit');
// The list shows who got the salary
const list = await q('expenses.list', {from: today, to: today});
eq(list.filter((e) => e.category === 'Salary').map((e) => e.staff_name), ['Rakib', 'Rakib'], 'staff on the expense list');
// Editing up past the limit is refused; cancelling frees the room again
const first = list.find((e) => e.note === 'Advance');
ok(/limited/.test((await raw('expense.update', {id: first.id, date: today, category: 'Salary', amount: 4500, account_id: cash, note: 'Advance', password: pw})).error), 'edit above the limit refused');
await q('reverse', {type: 'expense', id: first.id, password: pw, reason: 'wrong'});
eq((await q('expense.limit', {category: 'Salary', staff_id: rakib.id, date: today})).left, 4000, 'cancelled part frees its room');
// Recording the monthly line respects what was already paid
const tm = (await q('expense.recurring')).templates.find((t) => t.name === 'Rakib salary');
const rec = await q('expense.recurring.record', {id: tm.id, amount: 4000});
eq((await q('expenses.list', {from: today, to: today})).find((e) => e.id === rec.expense.id).staff_name, 'Rakib', 'recorded salary carries the staff');
ok(/at most 0/.test((await raw('expense.create', {date: today, category: 'Salary', staff_id: rakib.id, amount: 1, account_id: cash})).error), 'after recording, Daily expenses cannot pay more');

await db.close();
console.log(`Expense limits: ${checks} checks passed`);
