// Profit module + dashboard profit card, the Administrator-only database reset,
// and the protection that keeps other admins from taking over the Administrator account.
const fs = require('fs');
const path = require('path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `
sandbox.setupDatabase();
const assert = require('assert/strict');
let checks = 0;
const same = (a, b, msg) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg); checks++; };
const truthy = (v, msg) => { assert.ok(v, msg); checks++; };
const close = (a, b, msg) => { assert.ok(Math.abs(a - b) < 0.011, msg + ' (' + a + ' vs ' + b + ')'); checks++; };
const login = (u, p) => { const r = call('login', { username: u, password: p }); if (!r.ok) throw new Error('login ' + u + ': ' + r.error); return r.data; };
const adm = login('admin', 'admin123'), token = adm.token;
const Q = (a, p, t) => { const r = call(a, p, t || token); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const QF = (a, p, t) => { const r = call(a, p, t || token); assert.equal(r.ok, false, a + ' should fail'); checks++; return r.error; };
const today = sandbox.today_();

/* ---------- who is the Administrator ---------- */
same(adm.user.owner, true, 'the setup account (username admin) is the Administrator');
Q('user.save', { name: 'Roni', username: 'roni', password: 'roni123', role: 'admin' });
Q('user.save', { name: 'Mina', username: 'mina', password: 'mina123', role: 'manager' });
const roni = login('roni', 'roni123'), mina = login('mina', 'mina123');
same([roni.user.owner, mina.user.owner], [false, false], 'other admins and staff are not the Administrator');
same(Q('bootstrap', {}).user.owner, true, 'bootstrap tells the app too');
same(Q('bootstrap', {}, roni.token).user.owner, false, 'bootstrap for another admin');
const adminRow = Q('users.list', {}).find((u) => u.username === 'admin');
truthy(/Only the Administrator can change/.test(QF('user.save', { ...adminRow, password: 'hacked1' }, roni.token)), 'another admin cannot set the Administrator password');
truthy(/Only the Administrator can change/.test(QF('user.save', { ...adminRow, username: 'boss' }, roni.token)), 'another admin cannot rename the Administrator');
login('admin', 'admin123'); checks++;
const roniRow = Q('users.list', {}).find((u) => u.username === 'roni');
truthy(/already taken|reserved/.test(QF('user.save', { ...roniRow, username: 'admin' }, roni.token)), 'nobody else can take the username admin');
truthy(/keeps the username/.test(QF('user.save', { ...adminRow, username: 'boss' })), 'the Administrator keeps the username admin');
same(Q('user.save', { ...adminRow, name: 'Shop Owner' }).name, 'Shop Owner', 'the Administrator can still edit its own name');
same(Q('user.save', { ...roniRow, name: 'Roni Ahmed' }, token).name, 'Roni Ahmed', 'the Administrator can edit other users');

/* ---------- profit ---------- */
const cash = Q('bootstrap', {}).accounts[0];
const sup = Q('supplier.save', { name: 'Supplier' });
const mouse = Q('product.save', { name: 'Mouse' }), kb = Q('product.save', { name: 'Keyboard' });
Q('purchase.create', { supplier_id: sup.id, items: [{ product_id: mouse.id, qty: 10, cost: 400, sale_price: 550 }, { product_id: kb.id, qty: 4, cost: 700, sale_price: 1000 }], payments: [] });
const a = Q('sale.create', { items: [{ product_id: mouse.id, qty: 3, price: 550 }, { product_id: kb.id, qty: 1, price: 1000 }], discount: 50, payments: [{ account_id: cash.id, amount: 2600 }] });
same([a.sale.total, a.sale.cost, a.sale.profit], [2600, 1900, 700], 'sale A: 2650 − 50 discount, cost 1900');
const b = Q('sale.create', { items: [{ product_id: mouse.id, qty: 2, price: 600 }], payments: [{ account_id: cash.id, amount: 1200 }] }, roni.token);
same(b.sale.profit, 400, 'sale B by Roni: profit 400');
const ret = Q('sreturn.create', { sale_id: a.sale.id, items: [{ sale_item_id: a.items[0].id, qty: 1 }], refund: { account_id: cash.id } });
const rr = Q('sreturns.list', {}).find((x) => x.sale_id === a.sale.id);
const retProfit = Math.round((rr.total - rr.cost) * 100) / 100;
same(rr.cost, 400, 'returned mouse goes back at its 400 cost');
Q('expense.create', { category: 'Electricity', amount: 300, account_id: cash.id });
Q('expense.create', { category: 'Food', amount: 120, account_id: cash.id });
const gross = Math.round((700 + 400 - retProfit) * 100) / 100, net = Math.round((gross - 420) * 100) / 100;

const rep = Q('profit.report', { from: today, to: today });
same([rep.from, rep.to, rep.group], [today, today, 'day'], 'range and daily grouping');
const s = rep.summary;
same([s.invoices, s.sales, s.discount, s.cost, s.sales_profit, s.return_count, s.returns, s.expenses, s.expense_count], [2, 3800, 50, 2700, 1100, 1, rr.total, 420, 2], 'summary figures');
close(s.gross, gross, 'gross = sales profit − profit on returns');
close(s.net, net, 'net = gross − expenses');
close(s.net_sales, 3800 - rr.total, 'net sales = sales − returns');
close(s.items_profit, 1150, 'item profit before the invoice discount');
close(s.items_profit - s.discount - s.returns_profit, s.gross, 'item profit − discounts − returned profit = gross (reconciles)');
close(s.margin, Math.round(gross / (3800 - rr.total) * 1000) / 10, 'gross margin %');
same(rep.timeline.length, 1, 'one day in the timeline');
close(rep.timeline[0].gross, gross, 'timeline gross'); close(rep.timeline[0].net, net, 'timeline net');
same(rep.timeline[0].period, today, 'timeline day');
const pm = rep.products.find((x) => x.product_id === mouse.id), pk = rep.products.find((x) => x.product_id === kb.id);
same([pm.qty, pm.revenue, pm.cost, pm.returned_qty], [5, 2850, 2000, 1], 'mouse: 5 sold, 1 returned');
close(pm.profit, 850 - retProfit, 'mouse profit after the return');
same([pk.qty, pk.profit], [1, 300], 'keyboard');
same(rep.expenses, [{ category: 'Electricity', count: 1, amount: 300 }, { category: 'Food', count: 1, amount: 120 }], 'expenses by category, largest first');
const stA = rep.staff.find((x) => x.name === 'Shop Owner'), stR = rep.staff.find((x) => x.name === 'Roni Ahmed' || x.name === 'Roni');
close(stA.gross, 700 - retProfit, 'staff: the return counts against the seller'); same(stR.gross, 400, 'staff: Roni');
same(Q('profit.report', { from: today.slice(0, 4) + '-01-01', to: today }).group, 'month', 'long ranges group by month');
same(Q('profit.report', { from: today.slice(0, 4) + '-01-01', to: today, group: 'day' }).group, 'day', 'grouping can be chosen');
truthy(/after the end/.test(QF('profit.report', { from: today, to: '2000-01-01' })), 'reversed dates rejected');
same(Q('profit.report', { from: '2000-01-01', to: '2000-01-31' }).summary.gross, 0, 'empty period is zero');
// cancelled sales leave the profit
const c = Q('sale.create', { items: [{ product_id: mouse.id, qty: 1, price: 900 }], payments: [{ account_id: cash.id, amount: 900 }] });
close(Q('profit.report', { from: today, to: today }).summary.gross, gross + 500, 'a new sale adds its profit');
Q('reverse', { type: 'sale', id: c.sale.id, reason: 'test', password: 'admin123' });
close(Q('profit.report', { from: today, to: today }).summary.gross, gross, 'a cancelled sale is left out');
// permissions: reports + cost
same(Q('profit.report', { from: today, to: today }, mina.token).summary.invoices, 2, 'manager has reports and cost by default');
Q('rolePerms.save', { manager: ['pos', 'reports'], sales: ['pos'] });
const mina2 = login('mina', 'mina123');
truthy(/Permission denied/.test(QF('profit.report', {}, mina2.token)), 'reports without cost: no profit report');
truthy(Q('dashboard', {}, mina2.token).profit === undefined, 'and no dashboard profit card');
Q('rolePerms.save', { manager: ['pos', 'reports', 'cost'], sales: ['pos'] });
same(Q('profit.report', { from: today, to: today }, login('mina', 'mina123').token).summary.gross, s.gross, 'with reports + cost the manager sees it');

/* ---------- dashboard profit card ---------- */
const d = Q('dashboard', {});
same(d.profit.map((x) => x.key), ['today', 'week', 'month', 'six_months'], 'today, this week, this month, last 6 months');
d.profit.forEach((x) => { close(x.gross, gross, x.key + ' gross'); close(x.net, net, x.key + ' net'); });
same([d.profit[0].from, d.profit[0].to], [today, today], 'today range');
close(d.today.gross_profit, d.profit[0].gross, 'matches the existing Today gross profit tile');

/* ---------- database reset ---------- */
const copies = [];
truthy(/Only the Administrator account/.test(QF('database.reset', { password: 'roni123', confirm: 'RESET' }, roni.token)), 'another admin cannot reset');
truthy(/Permission denied/.test(QF('database.reset', { password: 'mina123', confirm: 'RESET' }, login('mina', 'mina123').token)), 'staff cannot reset');
truthy(/Incorrect password/.test(QF('database.reset', { password: 'wrong', confirm: 'RESET' })), 'wrong password stops it');
truthy(/Type RESET/.test(QF('database.reset', { password: 'admin123', confirm: 'reset please' })), 'confirmation word needed');
book.copy = () => { throw new Error('Drive is full'); };
truthy(/Drive is full/.test(QF('database.reset', { password: 'admin123', confirm: 'RESET' })), 'no backup copy → no reset');
same(Q('profit.report', { from: today, to: today }).summary.invoices, 2, 'data untouched after the refused resets');
book.copy = (name) => { copies.push(name); return { getName: () => name, getUrl: () => 'https://docs.google.com/spreadsheets/d/COPY' }; };

// a journal / receipt left from earlier saves is cleared as well
vm.runInContext('_mem = {}', sandbox);
const withId = JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify({ action: 'customer.quickAdd', payload: { name: 'Karim', phone: '01711000000' }, token, request_id: 'req_before_reset_0001' }) } }).getContent());
truthy(withId.ok && book.getSheetByName('__KarvioRequestReceipts').getLastRow() > 0, 'request receipts exist before the reset');
const r1 = Q('database.reset', { password: 'admin123', confirm: ' RESET ' });
same(copies.length, 1, 'one backup copy made first');
truthy(/^Karvio backup before reset \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/.test(copies[0]), 'backup named with date and time: ' + copies[0]);
same(r1, { backup: { name: copies[0], url: 'https://docs.google.com/spreadsheets/d/COPY' }, users: 1, kept_settings: false }, 'reset result');
const boot = Q('bootstrap', {}); // the Administrator's session keeps working
same([boot.products.length, boot.customers ? boot.customers.length : 0, boot.brands.length], [0, 0, 0], 'products, customers, brands gone');
same(boot.accounts.map((x) => [x.name, x.type, x.balance]), [['Cash', 'cash', 0]], 'one Cash account at 0, as on day one');
same(boot.settings.shop_name, 'My Computer Shop', 'shop settings back to default');
truthy(boot.categories.length > 10, 'default product categories again');
same(boot.warrantyPeriods.length, 7, 'default warranty periods');
same(Q('users.list', {}).map((u) => [u.username, u.name, u.role, u.owner]), [['admin', 'Shop Owner', 'admin', true]], 'only the Administrator stays');
login('admin', 'admin123'); checks++; // same password
truthy(/Invalid username or password/.test(call('login', { username: 'roni', password: 'roni123' }).error), 'other users removed');
truthy(call('bootstrap', {}, roni.token).auth, 'their open sessions end');
for (const t of ['Sales', 'SaleItems', 'Purchases', 'PurchaseItems', 'SalesReturns', 'Expenses', 'AccountTxns', 'CustomerLedger', 'SupplierLedger', 'Suppliers', 'SerialItems', 'ItemEvents', 'InvoiceLinks', 'SmsLog']) {
  same(book.getSheetByName(t).getLastRow(), 1, t + ' has only its header row');
}
same(book.getSheetByName('AuditLog').getLastRow(), 2, 'audit log: just the reset entry');
same(book.getSheetByName('__KarvioRequestReceipts').getLastRow(), 0, 'old request receipts cleared');
same(book.getSheetByName('__KarvioTxnJournal').getLastRow(), 0, 'transaction journal clear');
same(Q('profit.report', { from: '2000-01-01', to: today }).summary.gross, 0, 'profit is zero');
// numbering starts again
const p2 = Q('product.save', { name: 'Mouse' });
Q('purchase.create', { supplier_id: Q('supplier.save', { name: 'S' }).id, items: [{ product_id: p2.id, qty: 2, cost: 100, sale_price: 150 }], payments: [] });
const cash2 = Q('bootstrap', {}).accounts[0];
same(Q('sale.create', { items: [{ product_id: p2.id, qty: 1, price: 150 }], payments: [{ account_id: cash2.id, amount: 150 }] }).sale.invoice_no, 'INV-000001', 'invoice numbers start again');

// keeping the other users and the shop settings when asked
Q('settings.save', { values: { shop_name: 'COMPUTER PLUS' } });
Q('user.save', { name: 'Roni', username: 'roni', password: 'roni123', role: 'admin' });
const r2 = Q('database.reset', { password: 'admin123', confirm: 'RESET', keep_users: true, keep_settings: true });
same([r2.users, r2.kept_settings], [2, true], 'kept users and settings');
const boot2 = Q('bootstrap', {});
same(boot2.settings.shop_name, 'COMPUTER PLUS', 'shop name kept');
same(boot2.products.length, 0, 'business data still cleared');
login('roni', 'roni123'); checks++;
const p3 = Q('product.save', { name: 'Cable' });
Q('purchase.create', { supplier_id: Q('supplier.save', { name: 'S2' }).id, items: [{ product_id: p3.id, qty: 1, cost: 10, sale_price: 20 }], payments: [] });
same(Q('sale.create', { items: [{ product_id: p3.id, qty: 1, price: 20 }], payments: [{ account_id: Q('bootstrap', {}).accounts[0].id, amount: 20 }] }).sale.invoice_no, 'INV-000001', 'numbering restarts even when settings are kept');
console.log('Profit, dashboard profit card and database reset: ' + checks + ' checks passed');
`;
eval(harness + scenario);

// The offline desktop app: no spreadsheet copy there, but the previous data file is kept beside the new one.
{
  const assert = require('node:assert/strict');
  const os = require('node:os');
  const { OfflineRuntime } = require('../../frontend/desktop/offline-runtime.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'karvio-reset-test-'));
  let n = 0;
  try {
    const app = new OfflineRuntime({ dataDir: dir, codePath: path.join(__dirname, '..', 'Code.gs') });
    let token;
    const call = (action, payload = {}) => app.execute({ action, payload, token });
    token = call('login', { username: 'admin', password: 'admin123' }).data.token;
    assert.equal(call('product.save', { name: 'Offline item' }).ok, true); n++;
    const bad = call('database.reset', { password: 'nope', confirm: 'RESET' });
    assert.equal(bad.ok, false); assert.equal(call('products.list').data.length, 1); n++;
    const r = call('database.reset', { password: 'admin123', confirm: 'RESET' });
    assert.equal(r.ok, true, r.error); assert.equal(r.data.backup, null); n++;
    assert.equal(call('products.list').data.length, 0); n++;
    const prev = JSON.parse(fs.readFileSync(app.previousFile, 'utf8'));
    assert.equal(prev.sheets.Products.rows.filter((row) => row[0]).length, 2, 'previous file still has the product'); n++;
    const again = new OfflineRuntime({ dataDir: dir, codePath: path.join(__dirname, '..', 'Code.gs') });
    token = again.execute({ action: 'login', payload: { username: 'admin', password: 'admin123' } }).data.token;
    assert.equal(again.execute({ action: 'products.list', payload: {}, token }).data.length, 0, 'reset survives a restart'); n++;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log('Offline database reset: ' + n + ' checks passed');
}
