// "Due now" on invoices: customer payments, returns, advances and the opening balance
// reduce what is still owed on each invoice (Sales.due keeps the due at the time of sale).
const fs = require('fs');
const path = require('path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `
sandbox.setupDatabase();
const assert = require('assert/strict');
let checks = 0;
const same = (a, b, msg) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg); checks++; };
const login = (u, p) => { const r = call('login', { username: u, password: p }); if (!r.ok) throw new Error('login ' + u + ': ' + r.error); return r.data; };
const token = login('admin', 'admin123').token;
const Q = (a, p, t) => { const r = call(a, p, t || token); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };

const cash = Q('bootstrap', {}).accounts[0];
const sup = Q('supplier.save', { name: 'Supplier' });
const mouse = Q('product.save', { name: 'Mouse' });
Q('purchase.create', { supplier_id: sup.id, items: [{ product_id: mouse.id, qty: 50, cost: 300, sale_price: 500 }], payments: [] });
const sell = (cid, qty, paid, extra) => Q('sale.create', Object.assign({ customer_id: cid, items: [{ product_id: mouse.id, qty, price: 500 }], payments: paid ? [{ account_id: cash.id, amount: paid }] : [] }, extra || {}));
const pay = (cid, amount, direction) => Q('customer.payment', { customer_id: cid, amount, account_id: cash.id, direction });
const dueNow = (sale) => Q('sale.detail', { id: sale.sale.id }).sale.due_now;
const listed = (sale) => Q('sales.list', {}).find((x) => x.id === sale.sale.id);
const balance = (cid) => Q('customers.list', {}).find((x) => x.id === cid).balance;

/* ---------- 1. a full payment clears the invoice ---------- */
const karim = Q('customer.save', { name: 'Karim', phones: '01700000001' });
const a = sell(karim.id, 2, 0);
same([a.sale.due, a.sale.due_now], [1000, 1000], 'a new credit sale is due in full');
same(Q('sales.list', { only_due: true }).map((x) => x.id), [a.sale.id], 'it is in the due list');
pay(karim.id, 1000);
same(dueNow(a), 0, 'paid in full: nothing due now');
same([listed(a).due, listed(a).due_now], [1000, 0], 'the list keeps the due at sale and shows due now 0');
same(Q('sales.list', { only_due: true }).length, 0, 'paid invoices leave the due list');

/* ---------- 2. payments settle the oldest invoice first ---------- */
const rahim = Q('customer.save', { name: 'Rahim', phones: '01700000002' });
const b1 = sell(rahim.id, 2, 0), b2 = sell(rahim.id, 1, 0);
pay(rahim.id, 1200);
same([dueNow(b1), dueNow(b2)], [0, 300], 'payment of 1200: first invoice cleared, 300 left on the second');
same(dueNow(b1) + dueNow(b2), balance(rahim.id), 'open dues add up to the customer balance');

/* ---------- 3. a return credited to the account reduces its own invoice first ---------- */
const b3 = sell(rahim.id, 2, 0); // 1000 due, the older b2 still has 300
Q('sreturn.create', { sale_id: b3.sale.id, items: [{ sale_item_id: b3.items[0].id, qty: 1 }], refund: { mode: 'adjust' } });
same([dueNow(b2), dueNow(b3)], [300, 500], 'return of 500 goes to its own invoice, not the older one');
same(dueNow(b2) + dueNow(b3), balance(rahim.id), 'still equal to the balance');

/* ---------- 4. cancelling a payment brings the due back ---------- */
const pl = Q('customer.statement', { customer_id: rahim.id }).rows.find((r) => r.type === 'payment');
Q('reverse', { type: 'cpay', id: pl.id, password: 'admin123', reason: 'bounced' });
same([dueNow(b1), dueNow(b2), dueNow(b3)], [1000, 500, 500], 'payment cancelled: dues return');
same(dueNow(b1) + dueNow(b2) + dueNow(b3), balance(rahim.id), 'equal to the balance after the cancellation');

/* ---------- 5. an advance paid earlier settles a later credit sale ---------- */
const nila = Q('customer.save', { name: 'Nila', phones: '01700000003' });
pay(nila.id, 300); // advance
const c1 = sell(nila.id, 2, 0);
same([c1.sale.due, dueNow(c1), balance(nila.id)], [1000, 700, 700], 'advance 300 reduces the new invoice');
const sumi = Q('customer.save', { name: 'Sumi', phones: '01700000004' });
pay(sumi.id, 300);
const c2 = sell(sumi.id, 2, 0, { credit_used: 300 });
same([c2.sale.due, dueNow(c2), balance(sumi.id)], [700, 700, 700], 'advance used at the till is not counted twice');

/* ---------- 6. the opening balance is the oldest debt ---------- */
const babu = Q('customer.save', { name: 'Babu', phones: '01700000005', opening_balance: 0 });
Q('customer.save', Object.assign({}, babu, { opening_balance: 200 }));
const d1 = sell(babu.id, 2, 0);
pay(babu.id, 500);
same(dueNow(d1), 700, 'payment of 500 first clears the 200 opening balance');
same(balance(babu.id), 700, 'balance 200 + 1000 − 500');

/* ---------- 7. paying back an advance ---------- */
const moni = Q('customer.save', { name: 'Moni', phones: '01700000006' });
pay(moni.id, 600);
pay(moni.id, 600, 'pay'); // the advance is handed back
const e1 = sell(moni.id, 1, 0);
same(dueNow(e1), 500, 'a returned advance no longer settles new invoices');

/* ---------- 8. cancelled and walk-in invoices ---------- */
Q('reverse', { type: 'sale', id: e1.sale.id, password: 'admin123', reason: 'mistake' });
same(dueNow(e1), 0, 'a cancelled invoice owes nothing');
const w = Q('sale.create', { items: [{ product_id: mouse.id, qty: 1, price: 500 }], payments: [{ account_id: cash.id, amount: 500 }] });
same(dueNow(w), 0, 'walk-in sale');

/* ---------- 9. reports show both columns ---------- */
const rep = Q('reports', { type: 'sales', group: 'invoice' });
same(rep.columns.filter((c) => c.key === 'due' || c.key === 'due_now').map((c) => c.label), ['Due at sale', 'Due now'], 'invoice report columns');
same(rep.rows.find((r) => r.id === a.sale.id).due_now, 0, 'invoice report: paid invoice');
same(rep.totals.due_now, Math.round([b1, b2, b3, c1, c2, d1].reduce((s, x) => s + dueNow(x), 0) * 100) / 100, 'invoice report total of due now');
const grp = Q('reports', { type: 'sales', group: 'daily' });
same(grp.totals.due_now, rep.totals.due_now, 'daily report total of due now');

/* ---------- 10. Advance Search cards ---------- */
const card = Q('history', { q: a.sale.invoice_no }).cards.sales.rows.find((r) => r.id === a.sale.id);
same([card.due, card.due_now], [1000, 0], 'history card shows due now');

console.log('Invoice due now: ' + checks + ' checks passed');
`;
eval(harness + scenario);
