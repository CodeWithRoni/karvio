// Expense editing: category/note edits, admin-authorised money edits that keep the account entry in step,
// and every guard (cancelled, closed books, future dates, unknown categories, inactive accounts). In-memory only.
import assert from 'node:assert/strict';
import schema from '../../supabase/functions/karvio-api/schema.json' with {type:'json'};
import {hash} from '../../supabase/functions/karvio-api/runtime.mjs';
import {createHandler} from '../../supabase/functions/karvio-api/handler.mjs';

const setupKey = 'expense-edit-key', ownerPassword = 'test-password-12345';
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
const login = async (username, password) => (await call('login', {username, password})).data.token;
const owner = await login('admin', ownerPassword);
const as = token => ({
  Q: async (action, payload = {}) => { const r = await call(action, payload, token); assert.ok(r.ok, action + ': ' + r.error); return r.data; },
  R: (action, payload = {}) => call(action, payload, token)
});
const {Q, R} = as(owner);
const rejects = async (r, pattern, message) => { const res = await r; ok(!res.ok && pattern.test(res.error), message + ' (got: ' + (res.ok ? 'ok' : res.error) + ')'); };

await Q('expense.categories', {categories:['Food', 'Rent', 'Transport']});
const cash = (await Q('bootstrap')).accounts[0];
const bank = await Q('account.save', {name:'Bank', type:'bank', opening_balance:1000});
await Q('account.save', {id:cash.id, name:cash.name, type:'cash', opening_balance:5000});
const balance = async id => (await Q('accounts.list')).find(a => a.id === id).balance;
const txnsOf = id => snapshot.tables.AccountTxns.filter(t => t.ref_type === 'expense' && t.ref_id === id && !t.voided);
const today = (await Q('bootstrap')).serverToday;

const burger = await Q('expense.create', {date:today, category:'Food', amount:100, account_id:cash.id, note:'Burger Bill'});
eq(await balance(cash.id), 4900, 'expense takes cash');

// Category and note change without a password; the account entry follows the new label.
const relabel = await Q('expense.update', {id:burger.id, date:today, category:'Transport', amount:100, account_id:cash.id, note:'Rickshaw'});
eq([relabel.category, relabel.note, relabel.account_name], ['Transport', 'Rickshaw', cash.name], 'category and note changed');
eq(txnsOf(burger.id).map(t => t.note), ['Expense: Transport — Rickshaw'], 'account entry label follows');
eq(await balance(cash.id), 4900, 'relabel moves no money');

// Money changes need an admin password.
await rejects(R('expense.update', {id:burger.id, date:today, category:'Transport', amount:150, account_id:cash.id, note:'Rickshaw'}), /Admin authorization failed/, 'amount change needs a password');
await rejects(R('expense.update', {id:burger.id, date:today, category:'Transport', amount:150, account_id:cash.id, note:'Rickshaw', password:'wrong'}), /incorrect password/, 'wrong password rejected');
eq(await balance(cash.id), 4900, 'rejected edit changed nothing');
await Q('expense.update', {id:burger.id, date:today, category:'Transport', amount:150, account_id:cash.id, note:'Rickshaw', password:ownerPassword});
eq(await balance(cash.id), 4850, 'higher amount taken from cash');
eq(txnsOf(burger.id).map(t => [t.account_id, t.amount]), [[cash.id, 150]], 'one account entry with the new amount');

// Moving the expense to another account moves the money.
await Q('expense.update', {id:burger.id, date:today, category:'Transport', amount:150, account_id:bank.id, note:'Rickshaw', password:ownerPassword});
eq([await balance(cash.id), await balance(bank.id)], [5000, 850], 'money moved from cash to bank');

// Guards.
await rejects(R('expense.update', {id:burger.id, date:today, category:'Transport', amount:150, account_id:bank.id, note:'Rickshaw'}), /No changes/, 'no-op rejected');
await rejects(R('expense.update', {id:burger.id, date:today, category:'Gadgets', amount:150, account_id:bank.id, note:'Rickshaw'}), /category from the expense category list/, 'unknown category rejected');
await rejects(R('expense.update', {id:burger.id, date:'2999-01-01', category:'Transport', amount:150, account_id:bank.id, note:'x', password:ownerPassword}), /cannot be in the future/, 'future date rejected');
await rejects(R('expense.update', {id:burger.id, date:'2026-02-31', category:'Transport', amount:150, account_id:bank.id, note:'x', password:ownerPassword}), /not a valid date/, 'impossible date rejected');
await rejects(R('expense.update', {id:burger.id, date:today, category:'Transport', amount:0, account_id:bank.id, note:'x', password:ownerPassword}), /greater than 0/, 'zero amount rejected');
const old = await Q('account.save', {name:'Old drawer', type:'cash'});
await Q('account.save', {id:old.id, name:'Old drawer', type:'cash', active:false});
await rejects(R('expense.update', {id:burger.id, date:today, category:'Transport', amount:150, account_id:old.id, note:'x', password:ownerPassword}), /active account/, 'inactive account rejected');

// Staff with the expenses permission need an admin's password for money changes, but not for a relabel.
await Q('user.save', {name:'Manager', username:'manager1', role:'manager', password:'manager-pass'});
const staff = as(await login('manager1', 'manager-pass'));
ok((await staff.R('expense.update', {id:burger.id, date:today, category:'Food', amount:150, account_id:bank.id, note:'Lunch'})).ok, 'manager may relabel');
await rejects(staff.R('expense.update', {id:burger.id, date:today, category:'Food', amount:120, account_id:bank.id, note:'Lunch', password:'manager-pass'}), /Admin authorization failed/, 'manager password is not admin authorisation');
ok((await staff.R('expense.update', {id:burger.id, date:today, category:'Food', amount:120, account_id:bank.id, note:'Lunch', password:ownerPassword})).ok, 'manager with admin password may change the amount');
eq(await balance(bank.id), 880, 'bank reflects the corrected amount');

// History: audit log keeps before/after, category usage and lists follow the edit.
const audits = snapshot.tables.AuditLog.filter(a => a.action === 'expense_update');
eq(audits.length, 5, 'every saved edit is audited');
eq(JSON.parse(audits.at(-1).detail).before.amount, 150, 'audit keeps the old amount');
eq((await Q('expenses.list', {category:'Food'})).map(x => x.amount), [120], 'list filter sees the new category');

// Closed books and cancelled expenses cannot be edited.
const rent = await Q('expense.create', {date:today, category:'Rent', amount:500, account_id:cash.id});
await Q('reverse', {type:'expense', id:rent.id, password:ownerPassword, reason:'Duplicate'});
await rejects(R('expense.update', {id:rent.id, date:today, category:'Rent', amount:400, account_id:cash.id, password:ownerPassword}), /cancelled expense cannot be edited/, 'cancelled expense locked');
const yesterday = new Date(Date.parse(today + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
const tea = await Q('expense.create', {date:yesterday, category:'Food', amount:40, account_id:cash.id, note:'Tea'});
await Q('settings.save', {values:{books_locked_until:yesterday}});
await rejects(R('expense.update', {id:tea.id, date:yesterday, category:'Rent', amount:40, account_id:cash.id, note:'Tea'}), /books are closed/, 'closed books block edits');
await rejects(R('expense.update', {id:burger.id, date:yesterday, category:'Food', amount:120, account_id:bank.id, note:'Lunch', password:ownerPassword}), /books are closed/, 'cannot move an expense into closed books');
ok((await R('expense.update', {id:burger.id, date:today, category:'Food', amount:120, account_id:bank.id, note:'Lunch today'})).ok, 'open-period expense still editable');

console.log(`Expense editing: ${checks} checks passed (relabel, admin-authorised money edits, account moves, guards, staff rules, audit).`);
