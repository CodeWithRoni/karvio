// Fixes from the November 2026 review: refunds on unpaid invoices, admin-only role changes, cost hidden in
// reports, stronger passwords and sign-in lockout, business dates and closed books, cancelling account
// entries, opening-balance audit, stock adjustments in profit, warranty claims and replacements,
// duplicate customer phones, request receipt pruning and the nightly Drive backup.
const fs = require('fs');
const os = require('os');
const path = require('path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `
sandbox.setupDatabase();
const assert = require('assert/strict');
let checks = 0;
const same = (a, b, msg) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg); checks++; };
const truthy = (v, msg) => { assert.ok(v, msg); checks++; };
const login = (u, p) => { const r = call('login', { username: u, password: p }); if (!r.ok) throw new Error('login ' + u + ': ' + r.error); return r.data; };
let token = login('admin', 'admin123').token;
const Q = (a, p, t) => { const r = call(a, p, t || token); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const QF = (a, p, t) => { const r = call(a, p, t || token); assert.equal(r.ok, false, a + ' should fail'); checks++; return r.error; };
const run = (code) => vm.runInContext(code, sandbox);
const today = sandbox.today_();
const day = (n) => sandbox.addDays_(today, n);

const cash = Q('bootstrap', {}).accounts[0];
const sup = Q('supplier.save', { name: 'Supplier' });
const mouse = Q('product.save', { name: 'Mouse' });
Q('purchase.create', { supplier_id: sup.id, items: [{ product_id: mouse.id, qty: 40, cost: 300, sale_price: 500 }], payments: [] });
const cashBal = () => Q('accounts.list', {}).find((a) => a.id === cash.id).balance;
const custBal = (id) => Q('customers.list', {}).find((c) => c.id === id).balance;

/* ---------- 2. a return on an unpaid invoice clears the due before any cash goes back ---------- */
const karim = Q('customer.save', { name: 'Karim', phones: '01711000001' });
const s1 = Q('sale.create', { customer_id: karim.id, items: [{ product_id: mouse.id, qty: 2, price: 500 }], payments: [] });
const c0 = cashBal();
truthy(/at most 0/.test(QF('sreturn.create', { sale_id: s1.sale.id, items: [{ sale_item_id: s1.items[0].id, qty: 1 }], refund: { account_id: cash.id, amount: 500 } })), 'no cash back on a fully unpaid invoice');
const r1 = Q('sreturn.create', { sale_id: s1.sale.id, items: [{ sale_item_id: s1.items[0].id, qty: 1 }], refund: { account_id: cash.id } });
same([r1.return.refund, cashBal(), custBal(karim.id)], [0, c0, 500], 'default refund is 0: the return cleared 500 of the due');
const s2 = Q('sale.create', { customer_id: karim.id, items: [{ product_id: mouse.id, qty: 2, price: 500 }], payments: [{ account_id: cash.id, amount: 600 }] });
truthy(/at most 600/.test(QF('sreturn.create', { sale_id: s2.sale.id, items: [{ sale_item_id: s2.items[0].id, qty: 2 }], refund: { account_id: cash.id, amount: 1000 } })), 'cash back only up to what was paid on the invoice');
const r2 = Q('sreturn.create', { sale_id: s2.sale.id, items: [{ sale_item_id: s2.items[0].id, qty: 2 }], refund: { account_id: cash.id } });
same([r2.return.refund, Q('sale.detail', { id: s2.sale.id }).sale.due_now], [600, 0], 'full return: 400 due cleared, 600 cash back');
const w = Q('sale.create', { items: [{ product_id: mouse.id, qty: 1, price: 500 }], payments: [{ account_id: cash.id, amount: 500 }] });
same(Q('sreturn.create', { sale_id: w.sale.id, items: [{ sale_item_id: w.items[0].id, qty: 1 }], refund: { account_id: cash.id } }).return.refund, 500, 'walk-in return refunded in full');

/* ---------- 3. only admins make admins ---------- */
Q('rolePerms.save', { manager: ['users', 'pos'], sales: ['pos'] });
Q('user.save', { name: 'Mina', username: 'mina', password: 'mina123', role: 'manager' });
const mina = login('mina', 'mina123');
const mrow = () => Q('users.list', {}).find((u) => u.username === 'mina');
truthy(/admin role/.test(QF('user.save', { ...mrow(), role: 'admin' }, mina.token)), 'a manager cannot promote herself');
truthy(/admin role/.test(QF('user.save', { name: 'Evil', username: 'evil', password: 'evil123', role: 'admin' }, mina.token)), 'a manager cannot create an admin');
same(Q('user.save', { ...mrow(), name: 'Mina B' }, mina.token).name, 'Mina B', 'a manager can edit her own name');
truthy(/own role/.test(QF('user.save', { ...mrow(), role: 'sales' }, mina.token)), 'nor change her own role');
same(Q('user.save', { name: 'Sel', username: 'sel', password: 'sel1234', role: 'sales' }, mina.token).role, 'sales', 'she can still add sales staff');
Q('user.save', { name: 'Roni', username: 'roni', password: 'roni123', role: 'admin' });
{ const e = QF('user.save', { ...Q('users.list', {}).find((u) => u.username === 'roni'), password: 'hacked1' }, mina.token); truthy(/admin/.test(e), 'nor change an admin password: ' + e); }
truthy(/Only an admin/.test(QF('rolePerms.save', { manager: ['users', 'cost', 'cancel'], sales: [] }, mina.token)), 'nor grant permissions');

/* ---------- 4. no cost or profit for staff without the cost permission ---------- */
Q('rolePerms.save', { manager: ['reports', 'pos', 'sales.all', 'sales.return'], sales: ['pos'] });
Q('user.save', { name: 'Rep', username: 'rep', password: 'rep1234', role: 'manager' });
const rep = login('rep', 'rep1234');
const hasCost = (o) => o && ['cost', 'profit', 'stock_adjust'].some((k) => k in o);
['invoice', 'daily'].forEach((g) => { const r = Q('reports', { type: 'sales', group: g }, rep.token); truthy(!r.rows.some(hasCost) && !hasCost(r.totals), 'sales report (' + g + ') carries no cost'); });
['product_sales', 'daily_summary', 'sales_returns'].forEach((t) => { const r = Q('reports', { type: t }, rep.token); truthy(r.rows.length && !r.rows.some(hasCost) && !hasCost(r.totals), t + ' carries no cost'); });
truthy(!Q('sreturns.list', {}, rep.token).some(hasCost), 'returns list carries no cost');
truthy(!Q('dashboard', {}, rep.token).top_products.total.some((x) => 'profit' in x), 'top products carry no profit');
truthy('profit' in Q('reports', { type: 'product_sales' }).rows[0], 'admins still see profit');

/* ---------- 5. stronger passwords and sign-in lockout ---------- */
const hashOf = (u) => run("all_('Users').filter(function(x){return x.username==='" + u + "'})[0].password_hash");
truthy(/^v2\\$2000\\$[0-9a-f]{64}$/.test(hashOf('sel')), 'new passwords use the repeated hash');
run("_mem={}; (function(){ var u = all_('Users').filter(function(x){return x.username==='sel'})[0]; update_('Users', u.id, { password_hash: hash_(u.salt, 'sel1234') }); })(); _mem={};");
truthy(!/^v2/.test(hashOf('sel')), 'an old single-round hash');
login('sel', 'sel1234'); checks++;
truthy(/^v2\\$/.test(hashOf('sel')), 'upgraded on the first correct sign-in');
login('sel', 'sel1234'); checks++;
for (let i = 0; i < 5; i++) QF('login', { username: 'sel', password: 'wrong' });
truthy(/Too many wrong passwords/.test(QF('login', { username: 'sel', password: 'sel1234' })), 'locked after 5 wrong passwords, even with the right one');
login('admin', 'admin123'); checks++;
run("clearLoginFails_('sel')");
login('sel', 'sel1234'); checks++;
same(call('ping', {}).ok, true, 'ping needs no lock');

/* ---------- 8. business dates and closed books ---------- */
truthy(/not a valid date/.test(QF('expense.create', { category: 'Food', amount: 10, account_id: cash.id, date: 'hello' })), 'nonsense date refused');
truthy(/not a valid date/.test(QF('expense.create', { category: 'Food', amount: 10, account_id: cash.id, date: '2026-02-30' })), 'impossible date refused');
truthy(/future/.test(QF('purchase.create', { supplier_id: sup.id, date: day(1), items: [{ product_id: mouse.id, qty: 1, cost: 300 }], payments: [] })), 'future purchase refused');
const oldExp = Q('expense.create', { category: 'Food', amount: 10, account_id: cash.id, date: day(-10) });
truthy(/yesterday/.test(QF('settings.save', { values: { books_locked_until: today } })), 'books close at most up to yesterday');
Q('rolePerms.save', { manager: ['reports', 'pos', 'sales.all', 'sales.return', 'settings'], sales: ['pos'] });
truthy(/Only an admin/.test(QF('settings.save', { values: { books_locked_until: day(-5) } }, rep.token)), 'only admins close the books, not managers with settings');
Q('settings.save', { values: { books_locked_until: day(-5) } });
truthy(/books are closed/.test(QF('expense.create', { category: 'Food', amount: 10, account_id: cash.id, date: day(-6) })), 'no entry in a closed period');
truthy(/books are closed/.test(QF('customer.payment', { customer_id: karim.id, amount: 10, account_id: cash.id, date: day(-5) })), 'the last closed day is closed too');
truthy(/books are closed/.test(QF('reverse', { type: 'expense', id: oldExp.id, password: 'admin123', reason: 'x' })), 'no cancelling in a closed period');
same(Q('expense.create', { category: 'Food', amount: 10, account_id: cash.id, date: day(-4) }).date, day(-4), 'open days still take entries');
Q('settings.save', { values: { books_locked_until: '' } });
same(Q('reverse', { type: 'expense', id: oldExp.id, password: 'admin123', reason: 'reopened' }), true, 'reopened: cancel works again');

/* ---------- 9. warranty claims only for items still sold ---------- */
const ssd = Q('product.save', { name: 'SSD', has_warranty: true, warranty_type: 'serial', warranty_days: 365 });
const hdd = Q('product.save', { name: 'HDD', has_warranty: true, warranty_type: 'invoice', warranty_days: 365 });
Q('purchase.create', { supplier_id: sup.id, items: [{ product_id: ssd.id, qty: 3, cost: 2000, serials: ['A1', 'A2', 'A3'], sale_price: 2500 }, { product_id: hdd.id, qty: 3, cost: 3000, sale_price: 3500 }], payments: [] });
const pay = (t) => [{ account_id: cash.id, amount: t }];
const cs = Q('sale.create', { items: [{ product_id: ssd.id, qty: 1, price: 2500, serials: ['A1'] }], payments: pay(2500) });
Q('reverse', { type: 'sale', id: cs.sale.id, password: 'admin123', reason: 'test' });
truthy(/cancelled/.test(QF('claim.create', { sale_id: cs.sale.id, sale_item_id: cs.items[0].id, serial: 'A1', issue: 'x' })), 'no claim on a cancelled invoice');
const rs = Q('sale.create', { items: [{ product_id: hdd.id, qty: 1, price: 3500 }], payments: pay(3500) });
Q('sreturn.create', { sale_id: rs.sale.id, items: [{ sale_item_id: rs.items[0].id, qty: 1 }], refund: { account_id: cash.id } });
truthy(/returned/.test(QF('claim.create', { sale_id: rs.sale.id, sale_item_id: rs.items[0].id, issue: 'x' })), 'no claim on a returned item');

/* ---------- 10. a replacement leaves stock ---------- */
const stockOf = (id) => Q('products.list', {}).find((p) => p.id === id).stock;
const ws = Q('sale.create', { items: [{ product_id: ssd.id, qty: 1, price: 2500, serials: ['A1'] }, { product_id: hdd.id, qty: 1, price: 3500 }], payments: pay(6000) });
const cl1 = Q('claim.create', { sale_id: ws.sale.id, sale_item_id: ws.items[0].id, serial: 'A1', issue: 'dead' });
const before = [stockOf(ssd.id), stockOf(hdd.id)];
truthy(/not in stock/.test(QF('claim.update', { id: cl1.id, status: 'Replaced', replacement_serial: 'ZZ' })), 'replacement must be an in-stock serial');
Q('claim.update', { id: cl1.id, status: 'Replaced', replacement_serial: 'A2' });
same(stockOf(ssd.id), before[0] - 1, 'serial replacement: one unit left stock');
same(Q('sale.detail', { id: ws.sale.id }).items[0].serials, 'A2', 'the invoice now carries the replacement serial');
same(Q('serials.list', { product_id: ssd.id }).find((s) => s.serial === 'A1').status, 'faulty', 'the faulty unit is kept apart');
truthy(/only be delivered/.test(QF('claim.update', { id: cl1.id, status: 'Pending' })), 'a replaced claim can only be delivered');
const cl2 = Q('claim.create', { sale_id: ws.sale.id, sale_item_id: ws.items[1].id, issue: 'noisy' });
Q('claim.update', { id: cl2.id, status: 'Replaced' });
same(stockOf(hdd.id), before[1] - 1, 'invoice-warranty replacement: one unit left stock');
Q('claim.restock', { id: cl2.id });
same(stockOf(hdd.id), before[1], 'vendor unit back in stock');
Q('claim.restock', { id: cl1.id, serial: 'V9' });
same([stockOf(ssd.id), Q('serials.list', { product_id: ssd.id, status: 'in_stock' }).map((s) => s.serial).sort()], [before[0], ['A3', 'V9']], 'vendor serial V9 in stock');

/* ---------- 11. deposits, withdrawals and transfers can be cancelled ---------- */
const bank = Q('account.save', { name: 'Bank', type: 'bank' });
const c1 = cashBal();
Q('account.entry', { kind: 'deposit', account_id: cash.id, amount: 1000 });
Q('account.entry', { kind: 'transfer', account_id: cash.id, to_account_id: bank.id, amount: 300 });
const led = Q('account.ledger', { account_id: cash.id }).rows;
const dep = led.find((r) => r.ref_type === 'manual'), tr = led.find((r) => r.ref_type === 'transfer');
Q('reverse', { type: 'account', id: tr.id, password: 'admin123', reason: 'wrong account' });
same([cashBal(), Q('accounts.list', {}).find((a) => a.id === bank.id).balance], [c1 + 1000, 0], 'a transfer is cancelled on both accounts');
Q('reverse', { type: 'account', id: dep.id, password: 'admin123', reason: 'typo' });
same(cashBal(), c1, 'deposit cancelled');
truthy(/Only deposits/.test(QF('reverse', { type: 'account', id: Q('account.ledger', { account_id: cash.id }).rows.find((r) => r.ref_type === 'sale').id, password: 'admin123', reason: 'x' })), 'a sale payment is cancelled with its sale');
const audits = () => run("all_('AuditLog').map(function(a){return a.action})");
truthy(audits().includes('account_deposit') && audits().includes('account_transfer'), 'account entries are audited');

/* ---------- 12. opening balance changes are audited ---------- */
Q('customer.save', { ...karim, opening_balance: 2500 });
Q('supplier.save', { ...sup, opening_balance: 900 });
Q('account.save', { ...bank, opening_balance: 50 });
const ob = run("all_('AuditLog').filter(function(a){return /_opening_balance$/.test(a.action)}).map(function(a){return [a.action, JSON.parse(a.detail).from, JSON.parse(a.detail).to]})");
same(ob, [['customer_opening_balance', 0, 2500], ['supplier_opening_balance', 0, 900], ['account_opening_balance', 0, 50]], 'from and to are recorded');

/* ---------- 13. stock adjustments count in net profit ---------- */
const p0 = Q('profit.report', { from: today, to: today }).summary;
Q('stock.adjust', { product_id: mouse.id, new_stock: stockOf(mouse.id) - 2, note: 'damaged' });
const p1 = Q('profit.report', { from: today, to: today }).summary;
same([p1.stock_adjust, Math.round((p0.net - p1.net) * 100) / 100], [-600, 600], 'two lost mice at 300 cost reduce net profit by 600');
same(Q('dashboard', {}).today.stock_adjust, -600, 'dashboard knows too');
same(Q('profit.report', { from: today, to: today }).timeline.find((r) => r.period === today).stock_adjust, -600, 'timeline row');

/* ---------- 17. one phone, one customer ---------- */
truthy(/DUPLICATE_PHONE/.test(QF('customer.quickAdd', { name: 'Karim 2', phone: '+880 1711-000001' })), 'quick add refuses a known phone in another format');
truthy(/DUPLICATE_PHONE/.test(QF('customer.save', { name: 'Karim 3', phones: '01711000001' })), 'customer form too');
same(Q('customer.save', { name: 'Karim 3', phones: '01711000001', allow_duplicate_phone: true }).name, 'Karim 3', 'unless confirmed');

/* ---------- 14. old request receipts are pruned ---------- */
const sh = run('privateSheet_(RECEIPT_SHEET)');
const raw = (action, payload, id) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify({ action, payload, token, request_id: id }) } }).getContent());
raw('expense.create', { category: 'Food', amount: 1, account_id: cash.id }, 'receipt-old-000001');
raw('expense.create', { category: 'Food', amount: 2, account_id: cash.id }, 'receipt-new-000002');
sh.rows.forEach((row) => { if (row[1] === 'complete') { const m = JSON.parse(row[2]); if (row[0] === run("requestInfo_({action:'expense.create',request_id:'receipt-old-000001'}, authUser_('" + token + "')).key")) { m.saved_at = Date.now() - 8 * 864e5; row[2] = JSON.stringify(m); } } });
const n0 = sh.getLastRow();
same(run('pruneReceipts_()') > 0, true, 'the receipt older than 7 days is removed');
truthy(sh.getLastRow() < n0, 'the sheet got shorter');
const again = raw('expense.create', { category: 'Food', amount: 2, account_id: cash.id }, 'receipt-new-000002');
same([again.ok, run("all_('Expenses').filter(function(e){return e.amount===2}).length")], [true, 1], 'a newer receipt still answers its retry after pruning');

/* ---------- 18. nightly Drive backup ---------- */
truthy(/online/.test(QF('backup.schedule', { enabled: true, keep_days: 30 })), 'needs the Google Sheets version');
const triggers = [], trashed = [], files = [];
book.copy = (name) => { const f = { id: 'copy' + files.length, name, created: Date.now(), getId() { return this.id; }, getName() { return this.name; }, getUrl() { return ''; }, getDateCreated() { return new Date(this.created); }, setTrashed() { trashed.push(this.name); }, moveTo() {} }; files.push(f); return f; };
sandbox.DriveApp = { getFoldersByName: () => ({ hasNext: () => true, next: () => ({ getFiles: () => { let i = 0; return { hasNext: () => i < files.length, next: () => files[i++] }; } }) }), getFileById: (id) => files.find((f) => f.id === id) };
sandbox.ScriptApp = { getProjectTriggers: () => triggers.slice(), deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1), newTrigger: (fn) => ({ timeBased: () => ({ everyDays: () => ({ atHour: (h) => ({ create: () => triggers.push({ fn, h, getHandlerFunction: () => fn }) }) }) }) }) };
truthy(/Only the Administrator/.test(QF('backup.schedule', { enabled: true }, rep.token)), 'only the Administrator');
same(Q('backup.schedule', { enabled: true, keep_days: 10 }).enabled, true, 'switched on');
same(triggers.map((t) => [t.fn, t.h]), [['dailyBackup', 2]], 'one nightly trigger');
Q('backup.schedule', { enabled: true, keep_days: 10 });
same(triggers.length, 1, 'saving again does not add a second trigger');
files.push({ id: 'old', name: 'Karvio daily backup 2026-01-01 02:00:00', created: Date.now() - 11 * 864e5, getId() { return this.id; }, getName() { return this.name; }, getDateCreated() { return new Date(this.created); }, setTrashed() { trashed.push(this.name); } });
const b = run('dailyBackup()');
truthy(/^Karvio daily backup /.test(b.name) && b.removed === 1, 'nightly copy made and the 11-day-old copy trashed');
same(Q('database.info', {}).daily_backup, true, 'database info shows it');
Q('backup.schedule', { enabled: false });
same(triggers.length, 0, 'switched off');

console.log('Review fixes: ' + checks + ' checks passed');
`;
eval(harness + scenario);

/* ---------- 15. offline: no whole-database copy per request, old daily copies pruned ---------- */
{
  const assert = require('assert/strict');
  const { OfflineRuntime } = require('../../frontend/desktop/offline-runtime.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'karvio-review-'));
  let n = 0;
  try {
    const app = new OfflineRuntime({ dataDir: dir, codePath: path.join(__dirname, '..', 'Code.gs') });
    const tok = app.execute({ action: 'login', payload: { username: 'admin', password: 'admin123' } }).data.token;
    const bad = app.execute({ action: 'product.save', payload: { name: '' }, token: tok });
    assert.equal(bad.ok, false); n++;
    const ok = app.execute({ action: 'product.save', payload: { name: 'Cable' }, token: tok });
    assert.equal(ok.ok, true); n++;
    assert.equal(app.savedText, fs.readFileSync(app.file, 'utf8'), 'the rollback point is the saved file'); n++;
    app.context.insert_ = () => { app.state.sheets.Products.rows.push(['broken']); app.dirty = true; throw new Error('disk full'); };
    const failed = app.execute({ action: 'customer.quickAdd', payload: { name: 'X', phone: '01700000000' }, token: tok });
    assert.equal(failed.ok, false); n++;
    assert.ok(!app.state.sheets.Products.rows.some((r) => r[0] === 'broken'), 'a failed request is rolled back'); n++;
    for (let i = 0; i < 35; i++) fs.writeFileSync(path.join(app.backupDir, new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10) + '.json'), '{}');
    fs.writeFileSync(path.join(app.backupDir, 'before-restore-1.json'), '{}');
    app.pruneBackups();
    const left = fs.readdirSync(app.backupDir);
    assert.equal(left.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).length, 30, 'keeps 30 daily copies'); n++;
    assert.ok(left.includes('before-restore-1.json'), 'safety copies stay'); n++;
    assert.ok(!left.includes('2025-01-01.json') && left.includes('2025-02-04.json'), 'the oldest go first'); n++;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log('Offline speed and backups: ' + n + ' checks passed');
}
