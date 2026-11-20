// Second 20 November audit: cancels in the document's branch, branch limits on repairs, orders and expenses,
// staff of a closed branch, renamed cashiers in an open shift, settled online orders, COD allocation, and a
// request replayed from another branch. Local PostgreSQL only.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const api = await apiClient(db), {q, raw} = api, admin = api.token, pw = 'harness-password-1';
const cash = (await q('bootstrap')).accounts.find((a) => a.type === 'cash').id;
const tea = await q('product.save', {name: 'Tea', sale_price: 100});
const sup = await q('supplier.save', {name: 'Supplier'});
const cust = await q('customer.save', {name: 'Karim', phones: '01711112222', addresses: 'Road 1, Dhaka'});
let b = await q('branch.save', {name: 'Main Branch'}); const A = b.list[0].id;
b = await q('branch.save', {name: 'B'}); const B = b.list.find((x) => x.name === 'B').id;
const stock = async (br) => (await q('products.list', {}, {branch: br})).find((p) => p.id === tea.id).stock;

// ---- 1: a cancel changes the stock of the branch that made the document
const pA = await q('purchase.create', {supplier_id: sup.id, items: [{product_id: tea.id, qty: 2, cost: 50}], payments: []}, {branch: A});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: tea.id, qty: 2, cost: 50}], payments: []}, {branch: B});
await q('reverse', {type: 'purchase', id: pA.purchase.id, password: pw, reason: 'wrong'}, {branch: B});
eq([await stock(A), await stock(B)], [0, 2], 'purchase cancelled from B takes the stock out of A');
const pA2 = await q('purchase.create', {supplier_id: sup.id, items: [{product_id: tea.id, qty: 3, cost: 50}], payments: []}, {branch: A});
const pr = await q('preturn.create', {purchase_id: pA2.purchase.id, items: [{purchase_item_id: pA2.items[0].id, qty: 1}], refund: {mode: 'adjust'}}, {branch: A});
await q('reverse', {type: 'preturn', id: pr.return?.id || pr.id, password: pw, reason: 'wrong'}, {branch: B});
eq([await stock(A), await stock(B)], [3, 2], 'purchase return cancelled from B puts the stock back in A');
const sA = await q('sale.create', {items: [{product_id: tea.id, qty: 1, price: 100}], payments: [{account_id: cash, amount: 100}]}, {branch: A});
await q('reverse', {type: 'sale', id: sA.sale.id, password: pw, reason: 'wrong'}, {branch: B});
eq([await stock(A), await stock(B)], [3, 2], 'sale cancelled from B returns the stock to A');

// ---- 2: staff fixed to B do not see or act on A's repairs, online orders or expenses
const cat = (await q('bootstrap')).settings?.expense_categories;
const C = (Array.isArray(cat) ? cat : JSON.parse(cat || '[]'))[0];
const job = await q('repair.save', {customer_id: cust.id, device: 'Laptop', problem: 'No power', parts: [], charge: 100}, {branch: A});
await q('repair.status', {id: job.id, status: 'Completed'}, {branch: A}).catch(() => {});
const order = await q('order.save', {source: 'Facebook', customer: {name: 'Rina', phone: '01712345678', address: 'House 1, Dhaka'}, items: [{product_id: tea.id, qty: 1, price: 100}]}, {branch: A});
const newOrder = await q('order.save', {source: 'Facebook', customer: {name: 'Rina', phone: '01712345678', address: 'House 1, Dhaka'}, items: [{product_id: tea.id, qty: 1, price: 100}]}, {branch: A});
await q('order.confirm', {id: order.id}, {branch: A});
const ex = await q('expense.create', {category: C, amount: 20, account_id: cash, note: 'A note'}, {branch: A});
const exId = ex.id || ex.expense?.id;
await q('user.save', {name: 'B manager', username: 'bman', role: 'manager', password: 'bman-password-1', branch_id: B});
api.setToken((await q('login', {username: 'bman', password: 'bman-password-1', branch: B})).token);
ok(!(await q('repairs.list', {})).some((x) => x.id === job.id), 'repair list hides A\'s job');
ok(!(await raw('repair.get', {id: job.id})).ok, 'A\'s job cannot be opened');
const ol = await q('orders.list', {});
ok(!ol.orders.some((x) => x.id === order.id || x.id === newOrder.id), 'order list hides A\'s orders, confirmed or new');
ok(/another branch/.test((await raw('order.ship', {id: order.id, courier: 'other', courier_name: 'SB', tracking: 'T-1'})).error), 'A\'s order cannot be shipped');
ok(/another branch/.test((await raw('order.confirm', {id: newOrder.id})).error), 'A\'s new order cannot be confirmed');
const today = (await q('bootstrap')).serverToday;
ok(/another branch/.test((await raw('expense.update', {id: exId, date: today, category: C, amount: 20, account_id: cash, note: 'changed'})).error), 'A\'s expense cannot be edited');
const own = await q('order.save', {source: 'Facebook', customer: {name: 'Mina', phone: '01712345679', address: 'House 2, Dhaka'}, items: [{product_id: tea.id, qty: 1, price: 100}]});
ok((await q('orders.list', {})).orders.some((x) => x.id === own.id), 'B sees its own new order');
api.setToken(admin);
ok((await q('orders.list', {})).orders.length >= 3 && (await q('repairs.list', {})).some((x) => x.id === job.id), 'the admin still sees everything');

// ---- 3: staff of a closed branch stay out until moved
const moveOut = async () => { const n = await stock(B); if (n > 0) { const t = await q('branch.transfer.send', {to: A, items: [{product_id: tea.id, qty: n}]}, {branch: B}); await q('branch.transfer.receive', {id: t.id}, {branch: A}); } };
await moveOut();
ok(/still has staff: B manager/.test((await raw('branch.save', {id: B, name: 'B', active: false})).error), 'a branch with staff cannot close');
await q('user.save', {name: 'B cashier', username: 'bcash', role: 'sales', password: 'bcash-password-1', branch_id: B});
const bcashToken = (await q('login', {username: 'bcash', password: 'bcash-password-1'})).token;
// an older shop may already have staff in a closed branch (closed before this rule): simulate it
const brs = JSON.parse((await db.query(`select value from public."Settings" where key='branches'`)).rows[0].value);
const setBranches = async (list) => { await db.query(`update public."Settings" set value=$1 where key='branches'`, [JSON.stringify(list)]); await db.query('update karvio_private.runtime set revision = revision + 1'); };
brs.find((x) => x.id === B).active = false; await setBranches(brs);
ok(/B is closed/.test((await raw('login', {username: 'bman', password: 'bman-password-1'})).error), 'staff of a closed branch cannot sign in');
api.setToken(bcashToken);
ok(/B is closed/.test((await raw('sales.list', {}, {branch: A})).error), 'an open session of that staff is stopped too');
ok((await raw('logout', {})).ok, 'but can sign out');
api.setToken(admin);
const users = await q('users.list'), bm = users.find((u) => u.username === 'bman');
ok((await raw('user.save', {...bm, name: 'B manager', password: '', branch_id: B})).ok, 'the admin can still edit that user without moving them');
await q('user.save', {...bm, name: 'B manager', password: '', branch_id: A});
const relog = await q('login', {username: 'bman', password: 'bman-password-1'});
eq(relog.branch, A, 'moved to an open branch: works there');
brs.find((x) => x.id === B).active = true; await setBranches(brs);

// ---- 4: a cashier renamed during an open shift keeps the shift's money
await q('user.save', {name: 'Rakib', username: 'rakib', role: 'sales', password: 'rakib-password-1'});
const ru = (await q('users.list')).find((u) => u.username === 'rakib');
api.setToken((await q('login', {username: 'rakib', password: 'rakib-password-1', branch: A})).token);
await q('shift.open', {account_id: cash, opening: 0});
await q('sale.create', {items: [{product_id: tea.id, qty: 1, price: 100}], payments: [{account_id: cash, amount: 100}]});
api.setToken(admin);
await q('user.save', {...ru, name: 'Rakib Hasan', password: ''});
api.setToken((await q('login', {username: 'rakib', password: 'rakib-password-1', branch: A})).token);
await q('sale.create', {items: [{product_id: tea.id, qty: 1, price: 100}], payments: [{account_id: cash, amount: 100}]});
const mine = (await q('shift.mine')).shift;
eq([mine.in, mine.expected, mine.user], [200, 200, 'Rakib Hasan'], 'both sales count in the shift, before and after the rename');
api.setToken(admin);

// ---- 5 + 6: COD pays its own parcel first; a settled order's invoice cannot be edited
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: tea.id, qty: 20, cost: 50}], payments: []}, {branch: A});
const k = await q('customer.save', {name: 'Old due', phones: '01799990000', addresses: 'Road 5, Dhaka'});
const old = await q('sale.create', {customer_id: k.id, items: [{product_id: tea.id, qty: 1, price: 100}], payments: []}, {branch: A});
const o6 = await q('order.save', {source: 'Facebook', customer: {name: 'Old due', phone: '01799990000', address: 'Road 5, Dhaka'}, items: [{product_id: tea.id, qty: 2, price: 100}]}, {branch: A});
const c6 = await q('order.confirm', {id: o6.id}, {branch: A});
await q('order.ship', {id: o6.id, courier: 'other', courier_name: 'SB', tracking: 'T-6'}, {branch: A});
await q('order.settle', {id: o6.id, account_id: cash, charge: 0}, {branch: A});
const due = async (id) => (await q('sale.detail', {id})).sale.due_now;
eq([await due(c6.sale_id), await due(old.sale.id)], [0, 100], 'COD pays the parcel invoice; the older due stays');
eq((await q('customers.list')).find((x) => x.id === k.id).balance, 100, 'the customer total is unchanged');
const pay = await q('customer.payment', {customer_id: k.id, amount: 100, account_id: cash});
eq([await due(old.sale.id), pay.balance], [0, 0], 'an ordinary collection still pays the oldest due');
const d6 = await q('sale.detail', {id: c6.sale_id});
const edit = await raw('sale.edit', {id: c6.sale_id, password: pw, reason: 'price', customer_id: d6.sale.customer_id, items: [{product_id: tea.id, qty: 2, price: 150}], payments: []}, {branch: A});
ok(!edit.ok && /already settled/.test(edit.error), 'a settled order\'s invoice cannot be edited');
// cancelling the COD payment reopens the parcel invoice
const led = (await q('customer.statement', {customer_id: k.id})).rows.filter((r) => r.type === 'payment');
const cod = led.find((r) => /COD/.test(r.note));
await q('reverse', {type: 'cpay', id: cod.id, password: pw, reason: 'courier bounced'});
eq([await due(old.sale.id), await due(c6.sale_id)], [0, 200], 'the parcel invoice is open again; the later collection still pays the oldest');
eq((await q('customers.list')).find((x) => x.id === k.id).balance, 200, 'balance back to 200 owed');

// ---- 7: a request saved in one branch, replayed from another, says so
const rid = crypto.randomUUID();
const sale = {items: [{product_id: tea.id, qty: 1, price: 100}], payments: [{account_id: cash, amount: 100}]};
const first = await raw('sale.create', sale, {branch: A, request_id: rid});
const again = await raw('sale.create', sale, {branch: A, request_id: rid});
eq([first.ok, again.ok, again.data?.sale?.id], [true, true, first.data.sale.id], 'same branch: the saved invoice comes back');
const elsewhere = await raw('sale.create', sale, {branch: B, request_id: rid});
ok(!elsewhere.ok && /already saved in Main Branch/.test(elsewhere.error), 'another branch: told where it was saved');

await db.close();
console.log(`November 20 audit (2): ${checks} checks passed`);
