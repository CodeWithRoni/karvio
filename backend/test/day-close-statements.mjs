// Day close, Profit & loss, Balance sheet, POS quick add and the dashboard's "vs yesterday" figures.
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';
import {createHandler} from '../../supabase/functions/karvio-api/handler.mjs';
import {rpcFor} from './pg-harness.mjs';

let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const {q, raw} = await apiClient(db);
const h = createHandler({rpc: rpcFor(db)});
const as = async (username, password) => {
  const call = async (action, payload = {}, token) => (await h(new Request('http://k', {method: 'POST', body: JSON.stringify({action, payload, token, request_id: crypto.randomUUID()})}))).json();
  const token = (await call('login', {username, password})).data.token;
  return {raw: (a, p) => call(a, p, token), q: async (a, p) => { const r = await call(a, p, token); if (!r.ok) throw Error(a + ': ' + r.error); return r.data; }};
};
const boot = await q('bootstrap'), cash = boot.accounts[0].id, today = boot.serverToday;
await q('account.entry', {kind: 'deposit', account_id: cash, amount: 10000, note: 'Capital'});
const sup = await q('supplier.save', {name: 'Statement supplier'});
const cust = await q('customer.save', {name: 'Statement customer', phones: '01711000222'});
const mouse = await q('product.save', {name: 'Statement mouse', sale_price: 1000});
const svc = await q('product.save', {name: 'Statement service', service: true, sale_price: 500});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: mouse.id, qty: 10, cost: 600}], payments: [{account_id: cash, amount: 4000}]});
await q('sale.create', {customer_id: cust.id, items: [{product_id: mouse.id, qty: 2, price: 1000}], payments: [{account_id: cash, amount: 1500}], send_sms: false});
await q('sale.create', {customer_id: '', items: [{product_id: svc.id, qty: 1, price: 500}], payments: [{account_id: cash, amount: 500}], send_sms: false});
await q('expense.create', {category: 'Rent', amount: 300, account_id: cash});

// Day close: expected = opening + today's in − out; shortage needs a note; correction books a withdrawal.
const dc = await q('dayclose.get', {});
eq(dc.account.id, cash, 'cash account chosen by default');
eq(dc.expected, Math.round((dc.opening + dc.in - dc.out) * 100) / 100, 'expected adds up');
ok(dc.lines.some((l) => l.type === 'sale' && l.direction === 'in' && l.amount === 2000), 'sales received grouped');
ok(dc.lines.some((l) => l.type === 'expense' && l.direction === 'out' && l.amount === 300), 'expenses grouped');
ok(/note/.test((await raw('dayclose.save', {account_id: cash, counted: dc.expected - 72})).error), 'a shortage needs a note');
ok(/does not match/.test((await raw('dayclose.save', {account_id: cash, counted: 100, notes: {50: 1}})).error), 'counted must equal the notes');
const before = (await q('accounts.list')).find((a) => a.id === cash).balance;
const saved = await q('dayclose.save', {account_id: cash, counted: dc.expected - 72, note: 'Wrong change', adjust: true});
eq(saved.difference, -72, 'difference stored');
eq((await q('accounts.list')).find((a) => a.id === cash).balance, Math.round((before - 72) * 100) / 100, 'balance corrected by a withdrawal');
ok(/already closed/.test((await raw('dayclose.save', {account_id: cash, counted: 1})).error), 'one close per day and account');
const again = await q('dayclose.get', {account_id: cash});
eq(again.closed.counted, dc.expected - 72, 'closed day shows the count');
eq(again.history.length, 1, 'history lists the close');
ok(/future|not happened/.test((await raw('dayclose.get', {date: '2999-01-01'})).error), 'future days cannot be closed');

// Profit & loss for this month, with the previous month for comparison.
const month = today.slice(0, 7) + '-01';
const pl = await q('report.pnl', {from: month, to: today});
const line = (label) => pl.lines.find((l) => l.label === label);
eq(line('Sales (after discounts)').values.current, 2500, 'sales');
eq(line('Cost of items sold').values.current, -1200, 'cost of goods sold');
eq(line('Gross profit').values.current, 1300, 'gross profit');
eq(line('Rent').values.current, -300, 'expense by category');
eq(line('Net profit').values.current, 1000, 'net profit');
ok(pl.compare && pl.compare.to < month, 'previous period before this month');
eq(line('Net profit').values.previous, 0, 'nothing last month');

// Balance sheet: assets = liabilities + equity; receivable and payable from the ledgers.
const bs = await q('report.balance', {});
const b = (label) => bs.lines.find((l) => l.label.startsWith(label)).values.current;
eq(b('Customer dues'), 500, 'receivable');
eq(b('Stock at purchase cost'), 4800, 'stock at cost');
eq(b('Owed to suppliers'), 2000, 'payable');
eq(b('Total assets'), b('Liabilities + equity'), 'both sides match');

// Statements need cost permission; POS quick add lists best sellers.
await q('rolePerms.save', {manager: ['pos', 'reports'], sales: ['pos'], technician: ['repairs']});
await q('user.save', {name: 'Rep', username: 'rep', role: 'manager', password: 'rep-password-123'});
const rep = await as('rep', 'rep-password-123');
ok(/Permission denied/.test((await rep.raw('report.pnl', {})).error), 'P&L needs cost permission');
ok(/Permission denied/.test((await rep.raw('dayclose.get', {})).error), 'day close needs accounts permission');
const picks = await q('pos.picks');
eq(picks.map((p) => p.product_id).sort(), [mouse.id, svc.id].sort(), 'best sellers');
eq(await rep.q('pos.picks'), [], 'staff without "all sales" see their own best sellers');

// Dashboard: yesterday's figures for the comparison chips.
const dash = await q('dashboard');
ok(dash.yesterday && dash.yesterday.sales === 0 && dash.today.sales === 2500, 'today vs yesterday');
// Shop logo: only small pictures; the QR choice is saved as true / false.
ok(/PNG, JPEG or WebP/.test((await raw('settings.save', {values: {shop_logo: 'javascript:alert(1)'}})).error), 'only picture data');
ok(/too large/.test((await raw('settings.save', {values: {shop_logo: 'data:image/png;base64,' + 'A'.repeat(210000)}})).error), 'logo size limited');
const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const saved2 = await q('settings.save', {values: {shop_logo: logo, invoice_qr: 'no'}});
eq([saved2.shop_logo, saved2.invoice_qr], [logo, 'true'], 'logo kept; anything but false keeps the QR on');
console.log(`Day close & statements: ${checks} checks passed (day close, profit & loss, balance sheet, quick add, dashboard).`);
