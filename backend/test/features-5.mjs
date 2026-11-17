// Supplier rebates: lower what we owe without moving money, count as other income, link to a purchase,
// promised rebates, the rebate report, and cancelling only with the admin password.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const {q, raw} = await apiClient(db);
const boot = await q('bootstrap'), cash = boot.accounts[0].id, today = boot.serverToday;
const PW = 'harness-password-1';
const sup = await q('supplier.save', {name: 'City IT'}), other = await q('supplier.save', {name: 'Global'});
const prod = await q('product.save', {name: 'Router', sale_price: 1500});
const buy = async (supplier_id, qty) => (await q('purchase.create', {supplier_id, date: today, items: [{product_id: prod.id, qty, cost: 1000, sale_price: 1500}], payments: []})).purchase;
const p1 = await buy(sup.id, 60), p2 = await buy(sup.id, 40), pOther = await buy(other.id, 5);
const owed = async () => (await q('suppliers.list')).find((s) => s.id === sup.id).balance;
const cashNow = async () => (await q('accounts.list')).find((a) => a.id === cash).balance;
eq(await owed(), 100000, 'we owe 1,00,000');
const cashBefore = await cashNow(), costBefore = (await q('products.list')).find((x) => x.id === prod.id).cost_price;

// validation
ok(/greater than 0/.test((await raw('supplier.rebate', {supplier_id: sup.id, amount: 0, kind: 'invoice', note: 'x y z'})).error), 'needs an amount');
ok(/reason/.test((await raw('supplier.rebate', {supplier_id: sup.id, amount: 10, kind: 'invoice', note: ' '})).error), 'the reason is required');
ok(/kind of rebate/.test((await raw('supplier.rebate', {supplier_id: sup.id, amount: 10, kind: 'nope', note: 'abc'})).error), 'known kinds only');
ok(/not from City IT/.test((await raw('supplier.rebate', {supplier_id: sup.id, amount: 10, kind: 'invoice', note: 'abc', purchase_id: pOther.id})).error), 'the purchase must be from that supplier');

// 1 + 2: rebate lowers the debt, no money moves, linked to the invoice
const rb = await q('supplier.rebate', {supplier_id: sup.id, amount: 10000, kind: 'invoice', note: 'Credit note CN-118', purchase_id: p2.id});
eq([rb.receipt_no, rb.balance, rb.entry.type, rb.entry.debit], ['SLA-000001', 90000, 'rebate', 10000], 'rebate recorded: we owe 90,000');
eq([await cashNow(), (await q('products.list')).find((x) => x.id === prod.id).cost_price], [cashBefore, costBefore], 'cash and product cost untouched');
const st = await q('supplier.statement', {supplier_id: sup.id});
eq([st.closing, st.rows.at(-1).type, st.rows.at(-1).note], [90000, 'rebate', 'Invoice rebate — Credit note CN-118'], 'statement shows the rebate line');
const d2 = await q('purchase.detail', {id: p2.id});
eq([d2.rebates.length, d2.rebates[0].amount, d2.rebates[0].kind_label, d2.purchase.due_now], [1, 10000, 'Invoice rebate', 30000], 'the purchase shows its rebate and its own due falls first');
eq((await q('purchase.detail', {id: p1.id})).purchase.due_now, 60000, 'the other invoice is unchanged');
const audit = (await q('audit.list', {})); const arows = audit.rows || audit;
ok(arows.some((a) => a.action === 'supplier_rebate' && /SLA-000001/.test(a.detail)), 'written to the activity log');

// profit: other income
const ps = (await q('profit.report', {from: today, to: today})).summary;
eq([ps.rebates, ps.net - ps.gross + ps.expenses - ps.stock_adjust], [10000, 10000], 'net profit includes the rebate as other income');
const pl = await q('report.pnl', {from: today, to: today});
eq(pl.lines.find((l) => l.label === 'Other income: supplier rebates').values.current, 10000, 'profit & loss has the rebate line');
eq((await q('dashboard')).today.rebates, 10000, 'dashboard net profit counts it too');
const bs = await q('report.balance', {});
ok(JSON.stringify(bs).includes('95000'), 'balance sheet payable follows the ledger (90,000 + 5,000 to the other supplier)');

// 4: kinds + 3: report
await q('supplier.rebate', {supplier_id: sup.id, amount: 2500, kind: 'target', note: 'October target reached'});
await q('supplier.rebate', {supplier_id: other.id, amount: 500, kind: 'cash', note: 'Paid in cash discount'});
// 5: promised
const pr = await q('rebate.promise', {supplier_id: sup.id, amount: 4000, kind: 'target', note: 'November 5 lakh target'});
eq([pr.pending.length, await owed()], [1, 87500], 'a promise changes nothing in the books');
eq((await q('dashboard')).rebates_pending, {count: 1, amount: 4000}, 'dashboard reminds about it');
eq((await q('supplier.statement', {supplier_id: sup.id})).pending_rebates.length, 1, 'listed on the supplier');
let rep = await q('reports', {type: 'supplier_rebates', from: today, to: today});
eq([rep.rebates.received, rep.rebates.count, rep.rebates.promised, rep.rebates.promised_count], [13000, 3, 4000, 1], 'report totals');
eq(rep.rebates.by_supplier.map((x) => [x.supplier, x.amount, x.count]), [['City IT', 12500, 2], ['Global', 500, 1]], 'by supplier, biggest first');
eq(rep.rebates.by_kind.map((x) => [x.kind, x.amount]), [['Invoice rebate', 10000], ['Target bonus', 2500], ['Cash payment discount', 500]], 'by kind');
ok(rep.rows.some((r) => r.status === 'Promised — not received' && r.promised === 4000) && rep.rows.some((r) => r.purchase === p2.invoice_no), 'rows: promised and the linked purchase');
rep = await q('reports', {type: 'supplier_rebates', from: today, to: today, supplier_id: other.id});
eq([rep.rebates.received, rep.rebates.promised], [500, 0], 'one supplier only');
ok(/Write why/.test((await raw('rebate.promise.cancel', {id: pr.promise.id, reason: ''})).error), 'dropping a promise needs a reason');
const got = await q('supplier.rebate', {supplier_id: sup.id, amount: 4000, kind: 'target', note: 'November 5 lakh target', pending_id: pr.promise.id});
eq([got.balance, (await q('rebate.options', {supplier_id: sup.id})).pending.length], [83500, 0], 'received: debt falls and the promise is cleared');
ok(/no longer waiting/.test((await raw('supplier.rebate', {supplier_id: sup.id, amount: 4000, kind: 'target', note: 'again', pending_id: pr.promise.id})).error), 'a promise is received once');
const pr2 = await q('rebate.promise', {supplier_id: sup.id, amount: 100, kind: 'other', note: 'maybe later'});
eq((await q('rebate.promise.cancel', {id: pr2.promise.id, reason: 'not given'})).pending.length, 0, 'a promise can be dropped');
eq((await q('rebate.options', {supplier_id: sup.id})).purchases.find((x) => x.id === p2.id).rebated, 10000, 'options show the rebate so far per invoice');

// security: cancelling needs the admin password; a purchase with a rebate cannot be cancelled first
ok(/Void the rebate first/.test((await raw('reverse', {type: 'purchase', id: p2.id, reason: 'x', password: PW})).error), 'purchase with a rebate: void the rebate first');
ok(!(await raw('reverse', {type: 'rebate', id: rb.entry.id, reason: 'mistake', password: 'wrong'})).ok, 'wrong admin password: not cancelled');
ok(!(await raw('reverse', {type: 'rebate', id: rb.entry.id, reason: '', password: PW})).ok, 'a reason is needed');
ok(/Only payment entries/.test((await raw('reverse', {type: 'spay', id: rb.entry.id, reason: 'x', password: PW})).error), 'not through the payment route');
await q('reverse', {type: 'rebate', id: rb.entry.id, reason: 'entered twice', password: PW});
eq([await owed(), (await q('profit.report', {from: today, to: today})).summary.rebates, (await q('purchase.detail', {id: p2.id})).rebates.length], [93500, 7000, 0], 'cancelled: debt, profit and the purchase go back');
ok(/already cancelled/.test((await raw('reverse', {type: 'rebate', id: rb.entry.id, reason: 'x', password: PW})).error), 'cancelled once');
ok((await raw('reverse', {type: 'purchase', id: p2.id, reason: 'x', password: PW})).ok, 'then the purchase can be cancelled');

console.log(`Features 5: ${checks} checks passed (supplier rebates).`);
