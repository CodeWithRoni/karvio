// Party Ledger Adjust (customer / supplier adjustments, admin only) and the Customer / Supplier Ledger Report.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const api = await apiClient(db), {q, raw} = api;
const boot = await q('bootstrap'), cash = boot.accounts[0].id, today = boot.serverToday;
const day = (n) => new Date(Date.parse(today + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const svc = await q('product.save', {name: 'Service', service: true, sale_price: 100});
const router = await q('product.save', {name: 'Router AX23', sale_price: 6450});

// ---- Customer: 10,250 invoice, paid 5,000 + 5,200, the last 50 written off on that invoice
const c = await q('customer.save', {name: 'Rahim', phones: '01819556677'});
const sale = (await q('sale.create', {customer_id: c.id, items: [{product_id: svc.id, qty: 1, price: 10250}], payments: []})).sale;
await q('customer.payment', {customer_id: c.id, account_id: cash, amount: 5000});
await q('customer.payment', {customer_id: c.id, account_id: cash, amount: 5200});
let opt = await q('adjust.options', {kind: 'customer', party_id: c.id});
eq([opt.balance, opt.invoices.map((i) => [i.invoice_no, i.due])], [50, [[sale.invoice_no, 50]]], 'options: balance and what the invoice still owes');
ok(Object.keys(opt.types.ded).includes('leftover') && Object.keys(opt.types.add).includes('charge'), 'customer types for both directions');

ok(/reason/.test((await raw('ledger.adjust', {kind: 'customer', party_id: c.id, dir: 'ded', type: 'leftover', amount: 50, reason: ' '})).error), 'the reason is required');
ok(/adjustment type/.test((await raw('ledger.adjust', {kind: 'customer', party_id: c.id, dir: 'ded', type: 'nope', amount: 50, reason: 'abc'})).error), 'known types only');
ok(/cannot be more/.test((await raw('ledger.adjust', {kind: 'customer', party_id: c.id, dir: 'ded', type: 'leftover', amount: 60, reason: 'too much'})).error), 'cannot write off more than is owed');
ok(/future/.test((await raw('ledger.adjust', {kind: 'customer', party_id: c.id, dir: 'ded', type: 'leftover', amount: 50, reason: 'abc', date: day(2)})).error), 'no future dates');
const wo = await q('ledger.adjust', {kind: 'customer', party_id: c.id, dir: 'ded', type: 'leftover', amount: 50, reason: 'Asked to leave the last 50', invoice_id: sale.id, ref: 'Phone call'});
eq([wo.ref_no, wo.balance], ['CLA-000001', 0], 'written off: numbered CLA and the balance is 0');
eq((await q('adjust.options', {kind: 'customer', party_id: c.id})).invoices[0].due, 0, 'the invoice is settled');
let list = await q('adjust.list', {kind: 'customer'});
eq([list.rows[0].ref_no, list.rows[0].dir, list.rows[0].type_label, list.rows[0].reason, list.rows[0].reference, list.rows[0].invoice_no, list.rows[0].party, list.rows[0].by],
  ['CLA-000001', 'ded', 'Leftover due written off', 'Asked to leave the last 50', 'Phone call', sale.invoice_no, 'Rahim', 'Harness owner'], 'recent adjustments read back every part');

// profit: the write-off lowers net profit
const pnl = await q('report.pnl', {from: day(-30), to: today});
eq(pnl.lines.find((l) => l.label === 'Customer dues written off').values.current, -50, 'profit & loss shows the write-off');
const prof = await q('profit.report', {from: day(-30), to: today});
eq([prof.summary.writeoffs, prof.timeline.reduce((a, r) => a + r.writeoffs, 0)], [50, 50], 'profit report totals the write-off');

// addition on an invoice raises that invoice
const sale2 = (await q('sale.create', {customer_id: c.id, items: [{product_id: svc.id, qty: 1, price: 6450}], payments: [{account_id: cash, amount: 6450}]})).sale;
const addc = await q('ledger.adjust', {kind: 'customer', party_id: c.id, dir: 'add', type: 'charge', amount: 300, reason: 'Delivery not billed', invoice_id: sale2.id});
eq([addc.ref_no, addc.balance], ['CLA-000002', 300], 'an addition raises what the customer owes');
eq((await q('adjust.options', {kind: 'customer', party_id: c.id})).invoices.find((i) => i.id === sale2.id).due, 300, 'and shows on that invoice');
eq((await q('report.pnl', {from: day(-30), to: today})).lines.find((l) => l.label === 'Customer dues written off').values.current, -50, 'additions do not touch profit');
ok(/That invoice is not Other's/.test((await raw('ledger.adjust', {kind: 'customer', party_id: (await q('customer.save', {name: 'Other'})).id, dir: 'add', type: 'charge', amount: 5, reason: 'abc', invoice_id: sale.id})).error), "another customer's invoice is refused");

// ---- Supplier: deduction = rebate (also promised), addition = more owed
const s = await q('supplier.save', {name: 'City IT', phones: '01711223344'});
const pur = (await q('purchase.create', {supplier_id: s.id, supplier_invoice: 'INV-CC-1042', items: [{product_id: router.id, qty: 10, cost: 5000}], payments: [{account_id: cash, amount: 20000}]})).purchase;
const reb = await q('ledger.adjust', {kind: 'supplier', party_id: s.id, dir: 'ded', type: 'invoice', amount: 10000, reason: 'Eid offer', invoice_id: pur.id, ref: 'CN-2211'});
eq([reb.ref_no, reb.balance], ['SLA-000001', 20000], 'a supplier deduction is a rebate numbered SLA');
eq((await q('adjust.options', {kind: 'supplier', party_id: s.id})).invoices[0].due, 20000, 'the purchase owes less');
const sadd = await q('ledger.adjust', {kind: 'supplier', party_id: s.id, dir: 'add', type: 'correction', amount: 850, reason: 'Courier charge missed'});
eq([sadd.ref_no, sadd.balance], ['SLA-000002', 20850], 'a supplier addition: we owe more');
const promised = await q('ledger.adjust', {kind: 'supplier', party_id: s.id, dir: 'ded', type: 'target', amount: 5000, reason: 'Q4 target', promised: true, expected: day(10), ref: 'Letter 7'});
eq([promised.promise.amount, promised.promise.ref, (await q('adjust.options', {kind: 'supplier', party_id: s.id})).balance], [5000, 'Letter 7', 20850], 'a promised rebate changes nothing yet');
const got = await q('ledger.adjust', {kind: 'supplier', party_id: s.id, dir: 'ded', type: 'target', amount: 5000, reason: 'Q4 target', pending_id: promised.promise.id});
eq([got.ref_no, got.balance, (await q('adjust.list', {kind: 'supplier'})).pending.length], ['SLA-000003', 15850, 0], 'receiving it books it and clears the promise');
list = await q('adjust.list', {kind: 'supplier'});
eq(list.rows.map((r) => [r.ref_no, r.dir, r.type_label]), [['SLA-000003', 'ded', 'Target bonus'], ['SLA-000002', 'add', 'Correction'], ['SLA-000001', 'ded', 'Invoice rebate']], 'supplier list, newest first');
eq([list.rows[2].reference, list.rows[2].invoice_no], ['CN-2211', pur.invoice_no], 'reference and purchase read back');

// cancel needs the admin password and puts the balance back
ok(/password/i.test((await raw('reverse', {type: 'sadjust', id: list.rows[1].id, reason: 'mistake', password: 'wrong'})).error), 'wrong password refused');
await q('reverse', {type: 'sadjust', id: list.rows[1].id, reason: 'mistake', password: 'harness-password-1'});
eq((await q('adjust.options', {kind: 'supplier', party_id: s.id})).balance, 15000, 'cancelled addition: balance back');
await q('reverse', {type: 'cadjust', id: (await q('adjust.list', {kind: 'customer'})).rows.find((r) => r.ref_no === 'CLA-000001').id, reason: 'customer paid after all', password: 'harness-password-1'});
eq([(await q('adjust.options', {kind: 'customer', party_id: c.id})).balance, (await q('report.pnl', {from: day(-30), to: today})).lines.some((l) => l.label === 'Customer dues written off')], [350, false], 'cancelled write-off: owed again, profit line gone');

// ---- Ledger report: all customers, one customer in full
let rep = await q('ledger.report', {kind: 'customer', from: day(-30), to: today});
const rr = rep.rows.find((r) => r.party_id === c.id);
eq([rr.opening, rr.sales, rr.paid, rr.adjusted, rr.closing, rr.invoices], [0, 16700, 16650, -300, 350, 2], 'all-customer row adds up (sales − paid − adjusted)');
eq(rep.totals.closing, rep.rows.reduce((a, r) => a + r.closing, 0), 'totals match the rows');
rep = await q('ledger.report', {kind: 'customer', party_id: c.id, from: day(-30), to: today});
eq([rep.party.name, rep.party.balance, rep.totals.closing, rep.rows.length], ['Rahim', 350, 350, 5], 'one customer: balance and every entry');
const first = rep.rows[0];
eq([first.entry, first.items[0].name, first.items[0].total, first.debit], ['sale', 'Service', 10250, 10250], 'invoice rows carry their items');
eq(rep.rows[1].accounts, ['Cash'], 'payments name their account');
eq(rep.rows.map((r) => r.balance), [10250, 5250, 50, 50, 350], 'running balance');
const adjRow = rep.rows.find((r) => r.entry === 'adjust');
eq([adjRow.adjust.dir, adjRow.adjust.type_label, adjRow.adjust.reason, adjRow.adjust.by], ['add', 'Missed charge', 'Delivery not billed', 'Harness owner'], 'adjust rows read back');
eq([rep.aging.buckets.d30, rep.aging.invoices.map((i) => [i.invoice_no, i.due]), rep.aging.other], [350, [[sale.invoice_no, 50], [sale2.invoice_no, 300]], 0], 'dues by age, oldest invoice first');
eq((await q('ledger.report', {kind: 'customer', party_id: c.id, entry: 'payment'})).rows.length, 2, 'filter by entry type');
eq((await q('ledger.report', {kind: 'customer', party_id: c.id, ref: sale2.invoice_no})).rows.map((r) => r.entry), ['sale', 'adjust'], 'search by invoice number finds the invoice and its adjustment');
const d = await q('customer.save', {name: 'Opening', opening_balance: 1000});
await q('customer.payment', {customer_id: d.id, account_id: cash, amount: 400, date: day(-3)});
const per = await q('ledger.report', {kind: 'customer', party_id: d.id, from: day(-1)});
eq([per.totals.opening, per.totals.closing, per.rows.length], [600, 600, 0], 'opening balance carried into a period');
rep = await q('ledger.report', {kind: 'supplier', party_id: s.id});
eq([rep.totals.sales, rep.totals.paid, rep.totals.adjusted, rep.totals.closing, rep.rows[0].items[0].qty, rep.rows[0].supplier_invoice], [50000, 20000, 15000, 15000, 10, 'INV-CC-1042'], 'supplier ledger in full');

// ---- Admin only
await q('user.save', {name: 'Rep', username: 'rep7', role: 'manager', password: 'rep-password-123'});
api.setToken((await q('login', {username: 'rep7', password: 'rep-password-123'})).token);
for (const [a, p] of [['ledger.report', {kind: 'customer'}], ['adjust.list', {kind: 'customer'}], ['adjust.options', {kind: 'customer', party_id: c.id}], ['ledger.adjust', {kind: 'customer', party_id: c.id, dir: 'add', type: 'charge', amount: 1, reason: 'abc'}]])
  ok(/Only an admin/.test((await raw(a, p)).error), `${a} is admin only`);

console.log(`Features 7: ${checks} checks passed (party ledger adjust and ledger report).`);

// Period-wide Net Profit agrees with Daily Counts when ledger adjustments exist.
const auditPeriod = {from: day(-30), to: today};
const dailyProfit = await q('reports', {type: 'daily_summary', ...auditPeriod});
eq(dailyProfit.totals.profit, (await q('profit.report', auditPeriod)).summary.net, 'daily net profit includes write-offs, rebates and ledger charges');
