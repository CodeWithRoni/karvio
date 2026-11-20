// Reports hub staff leaderboard / staff report, and the POS product price card (last, 2nd last, max, avg).
import assert from 'node:assert/strict';
import {freshDatabase, apiClient} from './pg-harness.mjs';
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const db = await freshDatabase();
const api = await apiClient(db), {q, raw} = api, admin = api.token;
const cash = (await q('bootstrap')).accounts.find((a) => a.type === 'cash').id;
const tea = await q('product.save', {name: 'Tea', sale_price: 100});
const sup = await q('supplier.save', {name: 'S'});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: tea.id, qty: 50, cost: 60}], payments: []});
await q('purchase.create', {supplier_id: sup.id, items: [{product_id: tea.id, qty: 10, cost: 70}], payments: []});
const rahim = await q('customer.save', {name: 'Rahim', phones: '01711111111'});
await q('user.save', {name: 'Rakib', username: 'rakib', role: 'sales', password: 'rakib-password-1'});
await q('user.save', {name: 'Sumon', username: 'sumon', role: 'sales', password: 'sumon-password-1'});
const rk = (await q('users.list')).find((u) => u.username === 'rakib');
const as = async (u, pw) => api.setToken((await q('login', {username: u, password: pw})).token);

// Owner: one due sale to Rahim (2 × 110) and one cash sale (1 × 120); collects 100 from Rahim.
await q('sale.create', {customer_id: rahim.id, items: [{product_id: tea.id, qty: 2, price: 110}], payments: []});
await q('sale.create', {items: [{product_id: tea.id, qty: 1, price: 120}], payments: [{account_id: cash, amount: 120}]});
await q('customer.payment', {customer_id: rahim.id, amount: 100, account_id: cash});
// Rakib: two cash sales, one with a discount, one partly returned.
await as('rakib', 'rakib-password-1');
const r1 = await q('sale.create', {items: [{product_id: tea.id, qty: 4, price: 90}], payments: [{account_id: cash, amount: 360}]});
await q('sale.create', {customer_id: rahim.id, items: [{product_id: tea.id, qty: 3, price: 100}], discount: 20, payments: [{account_id: cash, amount: 280}]});
api.setToken(admin);
await q('sreturn.create', {sale_id: r1.sale.id, items: [{sale_item_id: r1.items[0].id, qty: 1}], refund: {account_id: cash}});

// ---- Leaderboard
const b = await q('reports', {type: 'staff'});
eq(b.rows.map((r) => [r.rank, r.staff, r.invoices, r.gross, r.returns, r.net]), [[1, 'Rakib', 2, 640, 90, 550], [2, 'Harness owner', 2, 340, 0, 340]], 'ranked by net sales after returns');
const own = b.rows.find((r) => r.staff === 'Harness owner'), rak = b.rows.find((r) => r.staff === 'Rakib');
eq([own.collected, own.due_given, own.customers, own.cash_sales, own.qty], [100, 220, 1, 1, 3], 'owner: collected dues, sold on due, customers, cash sales, qty');
eq([rak.discount, rak.avg, rak.qty], [20, 320, 7], 'Rakib: discount, average invoice, qty');
eq(rak.profit, round(4 * 90 - 4 * cost() + 280 - 3 * cost() - (90 - cost())), 'Rakib: profit after the return');
eq([b.staff_board.best_seller.staff, b.staff_board.best_collector.staff, b.staff_board.team.net], ['Rakib', 'Harness owner', 890], 'best seller, best collector, team total');
eq(b.rows.map((r) => r.share), [61.8, 38.2], 'share of team sales');
ok(!b.rows.some((r) => r.staff === 'Sumon'), 'staff without sales are left out');

// ---- One person
const d = await q('reports', {type: 'staff', staff_id: rk.id});
eq([d.staff_detail.staff, d.staff_detail.rank, d.staff_detail.of, d.rows.length], ['Rakib', 1, 2, 2], 'Rakib: rank 1 of 2, two invoices');
eq(d.staff_detail.daily.map((x) => [x.invoices, x.sales, x.returns, x.net]), [[2, 640, 90, 550]], 'day by day');
eq(d.staff_detail.products.map((x) => [x.product, x.qty, x.amount]), [['Tea', 7, 660]], 'products (line totals before the invoice discount)');
eq(d.staff_detail.customers.map((x) => x.customer).sort(), ['Cash sales (walk-in)', 'Rahim'], 'customers served');
eq(d.staff_detail.methods.map((x) => [x.method, x.amount]), [['Cash', 640]], 'payment methods');

// ---- A seller without "View sales made by other staff" sees only themselves
await q('settings.save', {values: {role_perms: JSON.stringify({sales: ['pos', 'warranty', 'reports'], manager: [], technician: []})}}).catch(() => {});
await as('rakib', 'rakib-password-1');
const mine = await raw('reports', {type: 'staff'});
if (mine.ok) eq([mine.data.staff_detail?.staff, mine.data.rows.length], ['Rakib', 2], 'a seller sees their own report, not the board');
else ok(/Permission denied/.test(mine.error), 'or no report at all without the Reports permission');
api.setToken(admin);

// ---- Product price card
const h = await q('product.history', {product_id: tea.id, customer_id: rahim.id});
eq([h.sale_stats.times, h.sale_stats.last.price, h.sale_stats.second.price, h.sale_stats.max, h.sale_stats.min], [4, 100, 90, 120, 90], 'last, 2nd last, max, min');
eq(h.sale_stats.avg, Math.round((2 * 110 + 120 + 4 * 90 + 3 * 100) / 10 * 100) / 100, 'average per unit, weighted by quantity');
eq(h.customer_sales.map((x) => x.price), [100, 110], 'what Rahim paid, newest first');
eq([h.cost_stats.min, h.cost_stats.max], [60, 70], 'cost range for the cost permission');
await as('rakib', 'rakib-password-1');
const hs = await q('product.history', {product_id: tea.id});
ok(hs.sale_stats && !hs.cost_stats, 'no cost info without the cost permission');
api.setToken(admin);

await db.close();
console.log(`Staff report and price card: ${checks} checks passed`);

function cost() { return (50 * 60 + 10 * 70) / 60; }
function round(v) { return Math.round(v * 100) / 100; }
