/**
 * Offline simulation of the Apps Script backend.
 * Mocks SpreadsheetApp / CacheService / LockService / UrlFetchApp etc. in memory and
 * runs a full business scenario against Code.gs.
 *
 *   node backend/test/simulate.js
 */
process.env.TZ = 'Asia/Dhaka';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

/* ---------------- in-memory Google mocks ---------------- */
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const v = (this.sh.rows[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined ? '' : v); } out.push(row); } return out; }
  setValues(vals) { vals.forEach((rowVals, i) => { const ri = this.r - 1 + i; while (this.sh.rows.length <= ri) this.sh.rows.push([]); rowVals.forEach((v, j) => { this.sh.rows[ri][this.c - 1 + j] = v; }); }); return this; }
  setValue(v) { return this.setValues([[v]]); }
}
const rangeProxy = (rg) => new Proxy(rg, { get: (t, k) => (k in t ? t[k] : () => rangeProxy(t)) });
class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  getRange(r, c, nr = 1, nc = 1) { return rangeProxy(new Range(this, r, c, nr, nc)); }
  getLastRow() { let last = 0; this.rows.forEach((row, i) => { if (row.some((v) => v !== '' && v !== undefined)) last = i + 1; }); return last; }
  getMaxRows() { return 1000; }
  setFrozenRows() {}
  appendRow(arr) { this.rows[this.getLastRow()] = arr.slice(); }
  deleteRow(n) { this.rows.splice(n - 1, 1); }
}
const book = { sheets: {}, getId: () => 'SHEET1', getSheetByName(n) { return this.sheets[n] || null; }, insertSheet(n) { return (this.sheets[n] = new Sheet(n)); }, getSheets() { return Object.values(this.sheets); }, deleteSheet() {}, setSpreadsheetTimeZone() {} };
const props = {}, cacheStore = new Map(), fetchLog = [];
const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, isFinite, parseInt, parseFloat, encodeURIComponent, RegExp, Error, Boolean,
  SpreadsheetApp: { getActiveSpreadsheet: () => book, openById: () => book, getUi: () => { throw new Error('no ui'); } },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cacheStore.get(k) || null, put: (k, v) => cacheStore.set(k, v), remove: (k) => cacheStore.delete(k) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Session: { getScriptTimeZone: () => 'Asia/Dhaka' },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }) },
  UrlFetchApp: { fetch: (url, opt) => { fetchLog.push({ url, opt }); return { getResponseCode: () => 200, getContentText: () => '{"response_code":202}' }; } },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(String(s)).digest()).map((b) => (b > 127 ? b - 256 : b)),
    formatDate: (d, tz, fmt) => {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
      const day = `${p.year}-${p.month}-${p.day}`;
      return fmt === 'yyyy-MM-dd' ? day : `${day}T${p.hour}:${p.minute}:${p.second}`;
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8'), sandbox, { filename: 'Code.gs' });

function call(action, payload, token) {
  vm.runInContext('_mem = {}', sandbox);
  const out = sandbox.doPost({ postData: { contents: JSON.stringify({ action, payload, token }) } });
  return JSON.parse(out.getContent());
}

/* ---------------- tiny assertion helpers ---------------- */
let pass = 0, failed = 0;
const eq = (a, b, label) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : (failed++, console.log('  ✗', label, '\n     expected', JSON.stringify(b), '\n     got     ', JSON.stringify(a))); if (ok && process.env.VERBOSE) console.log('  ✓', label); };
const near = (a, b, label) => eq(Math.abs(a - b) < 0.011, true, `${label} (${a} ≈ ${b})`);
const ok = (res, label) => { if (!res.ok) { failed++; console.log('  ✗', label, '→ API error:', res.error); } else pass++; return res.data; };
const bad = (res, frag, label) => { const hit = !res.ok && String(res.error).toLowerCase().includes(frag.toLowerCase()); hit ? pass++ : (failed++, console.log('  ✗', label, '— expected error containing', JSON.stringify(frag), 'got', JSON.stringify(res))); };
const section = (t) => console.log('\n▶ ' + t);

/* ---------------- scenario ---------------- */
section('Setup & auth');
sandbox.setupDatabase();
bad(call('login', { username: 'admin', password: 'wrong' }), 'invalid', 'wrong password rejected');
const adm = ok(call('login', { username: 'admin', password: 'admin123' }), 'admin login');
const T = adm.token;
const A = (action, payload) => call(action, payload, T);
bad(call('products.list', {}), 'sign in', 'unauthenticated request rejected');

let boot = ok(A('bootstrap', {}), 'bootstrap');
eq(boot.categories.length > 20, true, 'seeded categories (3 top + sub)');
eq(boot.warrantyPeriods.map((w) => w.days), [7, 30, 90, 180, 300, 900, 1500], 'default warranty periods');
const cash = boot.accounts[0];
ok(A('account.save', { id: cash.id, name: 'Cash', type: 'cash', opening_balance: 100000 }), 'cash opening balance');
const bkash = ok(A('account.save', { name: 'bKash', type: 'mfs', number: '01711000000', opening_balance: 0 }), 'create bKash');
const ab = ok(A('account.save', { name: 'AB Bank', type: 'bank', number: '1234567', opening_balance: 50000 }), 'create AB bank');

section('Master data & products');
const sup = ok(A('supplier.save', { name: 'Star Tech Distribution', phones: ['01800000001'], address: 'Dhaka', opening_balance: 0 }), 'supplier');
const cust = ok(A('customer.save', { name: 'Rahim Uddin', phones: ['01712345678', '01912345678'], addresses: ['Bera, Pabna'], opening_balance: 0 }), 'customer');
const cat = boot.categories.find((c) => c.name === 'Core PC Components');
const sub = boot.categories.find((c) => c.name === 'SSD / HDD');
const brand = ok(A('master.save', { kind: 'brand', name: 'Kingston' }), 'brand');
const ssd = ok(A('product.save', { name: 'Kingston 512GB SSD', barcode: '111', category_id: cat.id, subcategory_id: sub.id, brand_id: brand.id, unit: 'pcs', cost_price: 3000, sale_price: 4000, has_warranty: true, warranty_type: 'serial', warranty_days: 180, low_stock: 2 }), 'SSD product');
const mouse = ok(A('product.save', { name: 'A4Tech Mouse', barcode: '222', unit: 'pcs', cost_price: 400, sale_price: 600, has_warranty: true, warranty_type: 'invoice', warranty_days: 90 }), 'Mouse product');
const cat6 = ok(A('product.save', { name: 'Cat6 Cable (roll)', barcode: '333', unit: 'meter', roll_length: 305, cost_price: 20, sale_price: 35 }), 'Cat6 product');
bad(A('product.save', { name: 'Dup', barcode: '111', unit: 'pcs' }), 'barcode already used', 'duplicate barcode blocked');
bad(A('product.save', { name: 'Bad', unit: 'meter', has_warranty: true, warranty_type: 'serial' }), 'serial-based warranty', 'serial warranty on meter blocked');

section('Purchase');
bad(A('purchase.create', { supplier_id: sup.id, items: [{ product_id: ssd.id, qty: 3, cost: 3000, serials: ['S1', 'S2'] }] }), 'exactly 3 serial', 'serial count enforced');
const pur = ok(A('purchase.create', {
  supplier_id: sup.id, discount: 200, note: 'first stock',
  items: [{ product_id: ssd.id, qty: 3, cost: 3000, serials: 'S1\nS2\nS3' }, { product_id: mouse.id, qty: 10, cost: 400 }, { product_id: cat6.id, qty: 610, cost: 20 }],
  payments: [{ account_id: cash.id, amount: 5000 }]
}), 'purchase');
eq([pur.purchase.total, pur.purchase.paid, pur.purchase.due], [25000, 5000, 20000], 'purchase totals');
bad(A('purchase.create', { items: [{ product_id: ssd.id, qty: 1, cost: 1, serials: ['S1'] }] }), 'already exists', 'duplicate serial blocked');
const bal = () => { const b = ok(A('bootstrap', {}), 'bootstrap'); return { acc: Object.fromEntries(b.accounts.map((a) => [a.name, a.balance])), cust: Object.fromEntries(b.customers.map((c) => [c.name, c.balance])), sup: Object.fromEntries(b.suppliers.map((c) => [c.name, c.balance])), stock: Object.fromEntries(b.products.map((p) => [p.name, p.stock])) }; };
let s0 = bal();
eq(s0.acc['Cash'], 95000, 'cash debited by purchase payment');
eq(s0.sup['Star Tech Distribution'], 20000, 'supplier payable');
eq(s0.stock, { 'Kingston 512GB SSD': 3, 'A4Tech Mouse': 10, 'Cat6 Cable (roll)': 610 }, 'stock after purchase');

section('Sale with customer (+SMS)');
ok(A('settings.save', { values: { sms_enabled: 'true', sms_api_key: 'KEY123', sms_sender_id: 'SHOP' } }), 'enable SMS');
bad(A('sale.create', { items: [{ product_id: ssd.id, qty: 1, price: 4000, serials: ['NOPE'] }], payments: [{ account_id: cash.id, amount: 4000 }] }), 'not in stock', 'unknown serial blocked');
bad(A('sale.create', { items: [{ product_id: mouse.id, qty: 1, price: 600 }], payments: [] }), 'attach a customer', 'walk-in credit sale blocked');
bad(A('sale.create', { items: [{ product_id: mouse.id, qty: 50, price: 600 }], customer_id: cust.id }), 'insufficient stock', 'oversell blocked');
const sale1 = ok(A('sale.create', {
  customer_id: cust.id, discount: 137.5,
  items: [{ product_id: ssd.id, qty: 1, price: 4000, serials: ['S1'] }, { product_id: mouse.id, qty: 2, price: 600 }, { product_id: cat6.id, qty: 12.5, price: 35 }],
  payments: [{ account_id: bkash.id, amount: 3000 }]
}), 'sale');
eq([sale1.sale.total, sale1.sale.paid, sale1.sale.due, sale1.sale.profit], [5500, 3000, 2500, 1450], 'sale totals / profit');
eq(sale1.items[0].warranty_expiry > sale1.sale.date, true, 'serial warranty expiry set');
eq(sale1.items[1].warranty_type, 'invoice', 'invoice-based warranty recorded');
eq(sale1.sms && sale1.sms.ok, true, 'SMS dispatched for named customer');
eq(fetchLog.length, 1, 'exactly one SMS fetch');
eq(fetchLog[0].url.includes('number=8801712345678') && fetchLog[0].url.includes('api_key=KEY123') && fetchLog[0].url.includes('Rahim'), true, 'SMS url has number/api key/customer name');
let s1 = bal();
eq(s1.acc.bKash, 3000, 'bKash credited');
eq(s1.cust['Rahim Uddin'], 2500, 'customer due (bakir khata)');
eq(s1.stock['Cat6 Cable (roll)'], 597.5, 'meters deducted from roll stock');
eq(s1.stock['Kingston 512GB SSD'], 2, 'SSD stock reduced');
const walk = ok(A('sale.create', { items: [{ product_id: mouse.id, qty: 1, price: 600 }], payments: [{ account_id: cash.id, amount: 600 }] }), 'walk-in sale');
eq(walk.sms, null, 'no SMS for walk-in sale');
eq(fetchLog.length, 1, 'still one SMS fetch');
eq(walk.sale.customer_name, 'Walk-in', 'walk-in label');

section('Sales return + exchange credit');
const retPayload = { sale_id: sale1.sale.id, items: [{ sale_item_id: sale1.items[0].id, qty: 1, serials: ['S1'] }, { sale_item_id: sale1.items[1].id, qty: 1 }], refund: { mode: 'cash', account_id: bkash.id, amount: 3000 }, type: 'exchange' };
const before = bal();
const ret = ok(A('sreturn.create', retPayload), 'sales return');
near(ret.return.total, 4487.81, 'return value (pro-rata discount)');
let s2 = bal();
near(s2.cust['Rahim Uddin'], 1012.19, 'customer balance after return');
eq(s2.stock['Kingston 512GB SSD'], 3, 'SSD re-stocked');
eq(s2.stock['A4Tech Mouse'], 8 + 1 - 1 + 0, 'mouse stock (10 -2 -1 walk-in +1 returned)');
eq(s2.acc.bKash, 0, 'refund debited bKash');
bad(A('sreturn.create', { ...retPayload, items: [{ sale_item_id: sale1.items[0].id, qty: 1, serials: ['S1'] }] }), 'exceeds', 'double return of same serial blocked');
bad(A('reverse', { type: 'sale', id: sale1.sale.id, reason: 'x', password: 'admin123' }), 'cancel the return', 'cannot cancel sale that has returns');
bad(A('reverse', { type: 'sreturn', id: ret.return.id, reason: 'oops', password: 'wrong' }), 'authorization failed', 'reversal needs admin password');
ok(A('reverse', { type: 'sreturn', id: ret.return.id, reason: 'entered by mistake', password: 'admin123' }), 'reverse sales return');
eq(bal(), before, 'state fully restored after cancelling the return');
ok(A('sreturn.create', retPayload), 'return again');

section('Item History Explorer');
const h = ok(A('history', { q: 'S1' }), 'history S1');
eq(h.kind, 'serial', 'serial recognised');
eq(h.timeline.map((e) => e.event), ['purchase', 'sale', 'sale_return', 'return_cancelled', 'sale_return'], 'timeline events in order');
eq(h.summary.status, 'in_stock', 'S1 back in stock after return');
eq(h.summary.purchase_invoice, pur.purchase.invoice_no, 'links purchase invoice');
const hi = ok(A('history', { q: sale1.sale.invoice_no }), 'history by invoice');
eq([hi.kind, hi.items.length, hi.returns.map((r) => r.status)], ['sale_invoice', 3, ['cancelled', 'active']], 'invoice view: items + returns (incl. cancelled)');
eq(ok(A('history', { q: '222' }), 'history by barcode').kind, 'product', 'barcode lookup');

section('Warranty claims');
const sale2 = ok(A('sale.create', { customer_id: cust.id, items: [{ product_id: ssd.id, qty: 1, price: 4100, serials: ['S2'], warranty_days: 300 }], payments: [{ account_id: cash.id, amount: 4100 }] }), 'sell S2 with 300 day warranty');
eq(sale2.items[0].warranty_days, 300, 'custom warranty days honoured');
const look = ok(A('warranty.lookup', { q: 'S2' }), 'warranty lookup');
eq([look.length, look[0].in_warranty], [1, true], 'in warranty');
const claim = ok(A('claim.create', { sale_id: look[0].sale_id, sale_item_id: look[0].sale_item_id, serial: 'S2', issue: 'Not detected' }), 'claim create');
bad(A('claim.create', { sale_id: look[0].sale_id, sale_item_id: look[0].sale_item_id, serial: 'S2' }), 'open claim', 'duplicate open claim blocked');
['Sent to Vendor', 'Replaced', 'Delivered'].forEach((st) => ok(A('claim.update', { id: claim.id, status: st, vendor: 'Star Tech', note: st }), 'claim → ' + st));
const cl = ok(A('claims.list', {}), 'claims list');
eq([cl[0].status, cl[0].log.length], ['Delivered', 4], 'claim lifecycle logged');
const h2 = ok(A('history', { q: 'S2' }), 'history S2');
eq(h2.timeline.map((e) => e.event).slice(-3), ['warranty_sent_to_vendor', 'warranty_replaced', 'warranty_delivered'], 'warranty events in serial history');

section('Payments & statements');
const pay = ok(A('customer.payment', { customer_id: cust.id, amount: 1000, account_id: cash.id, note: 'due collection' }), 'collect due');
near(pay.balance, 12.19, 'balance after collection');
const st = ok(A('customer.statement', { customer_id: cust.id }), 'statement');
eq(st.rows.map((r) => r.type), ['sale', 'sreturn', 'sale', 'payment'], 'statement rows');
near(st.closing, 12.19, 'statement closing');
ok(A('supplier.payment', { supplier_id: sup.id, amount: 8000, account_id: ab.id }), 'pay supplier');
eq(bal().sup['Star Tech Distribution'], 12000, 'supplier payable reduced');
ok(A('expense.create', { category: 'Electricity', amount: 1500, account_id: cash.id, note: 'Oct bill' }), 'expense');
ok(A('account.entry', { kind: 'transfer', account_id: cash.id, to_account_id: ab.id, amount: 2000 }), 'transfer');

section('Purchase return & reversals');
const sBefore = bal();
const pr = ok(A('preturn.create', { purchase_id: pur.purchase.id, items: [{ purchase_item_id: pur.items[0].id, qty: 1, serials: ['S3'] }], refund: { mode: 'adjust' } }), 'purchase return (adjust)');
near(bal().sup['Star Tech Distribution'], 12000 - 3000 * (25000 / 25200), 'supplier payable reduced by return (pro-rata)');
bad(A('reverse', { type: 'purchase', id: pur.purchase.id, reason: 'x', password: 'admin123' }), 'cancel the return', 'purchase with return cannot be cancelled');
ok(A('reverse', { type: 'preturn', id: pr.return.id, reason: 'x', password: 'admin123' }), 'reverse purchase return');
eq(bal(), sBefore, 'state restored after cancelling purchase return');
bad(A('reverse', { type: 'purchase', id: pur.purchase.id, reason: 'mistake', password: 'admin123' }), 'already been sold', 'cannot cancel purchase whose stock is sold');
const p2 = ok(A('purchase.create', { supplier_id: sup.id, items: [{ product_id: mouse.id, qty: 4, cost: 410 }], payments: [{ account_id: cash.id, amount: 1000 }] }), 'second purchase');
const mid = bal();
ok(A('reverse', { type: 'purchase', id: p2.purchase.id, reason: 'wrong entry', password: 'admin123' }), 'cancel purchase');
const after = bal();
eq(after.stock['A4Tech Mouse'], mid.stock['A4Tech Mouse'] - 4, 'stock removed on purchase cancel');
eq(after.acc['Cash'], mid.acc['Cash'] + 1000, 'cash restored on purchase cancel');
const snap = bal();
const sale3 = ok(A('sale.create', { customer_id: cust.id, items: [{ product_id: mouse.id, qty: 1, price: 600 }], payments: [{ account_id: bkash.id, amount: 100 }] }), 'sale to cancel');
ok(A('reverse', { type: 'sale', id: sale3.sale.id, reason: 'customer changed mind', password: 'admin123' }), 'cancel sale');
eq(bal(), snap, 'full state restored after cancelling a sale');
bad(A('reverse', { type: 'sale', id: sale3.sale.id, reason: 'again', password: 'admin123' }), 'already cancelled', 'double cancel blocked');
ok(A('reverse', { type: 'cpay', id: st.rows.find((r) => r.type === 'payment').id, reason: 'wrong customer', password: 'admin123' }), 'void customer payment');
near(bal().cust['Rahim Uddin'], 1012.19, 'customer balance back after voiding payment');

section('Dashboard & reports');
const d = ok(A('dashboard', {}), 'dashboard');
eq(d.today.invoices, 3, "today's active invoices (sale1, walk-in, S2 sale; cancelled one excluded)");
eq(d.accounts.length, 3, 'three account cards');
eq(d.leaderboard.total[0].name, 'Administrator', 'leaderboard');
eq(d.low_stock.some((x) => x.name === 'Kingston 512GB SSD'), true, 'low-stock alert (SSD stock 1 <= threshold 2)');
const rep = ok(A('reports', { type: 'sales', group: 'invoice', status: 'all' }), 'sales report');
eq(rep.rows.length, 4, 'sales report includes cancelled for status=all');
eq(ok(A('reports', { type: 'sales', group: 'monthly' }), 'monthly sales').rows.length, 1, 'monthly grouping');
eq(ok(A('reports', { type: 'daily_summary' }), 'daily').rows.length, 1, 'daily counts');
const pm = ok(A('reports', { type: 'payment_methods' }), 'payment methods');
eq(pm.rows.map((r) => r.account).sort(), ['AB Bank', 'Cash', 'bKash'], 'per-method daily summary');
eq(ok(A('reports', { type: 'warranty', status: 'Delivered' }), 'warranty report').rows.length, 1, 'warranty report Delivered');
eq(ok(A('reports', { type: 'product_sales' }), 'product sales').rows.length > 0, true, 'product-wise sales');
eq(ok(A('reports', { type: 'expenses', group: 'category' }), 'expense report').totals.amount, 1500, 'expense totals');

section('Role-based access');
ok(A('user.save', { name: 'Karim', username: 'karim', password: 'secret1', role: 'sales' }), 'create sales user');
const kt = ok(call('login', { username: 'karim', password: 'secret1' }), 'sales login').token;
const K = (a, p) => call(a, p, kt);
bad(K('purchase.create', {}), 'permission denied', 'sales staff cannot purchase');
bad(K('users.list', {}), 'permission denied', 'sales staff cannot manage users');
bad(K('reverse', { type: 'sale', id: sale1.sale.id, reason: 'x', password: 'admin123' }), 'permission denied', 'sales staff cannot cancel');
const kb = ok(K('bootstrap', {}), 'sales bootstrap');
eq(kb.products.every((p) => p.cost_price === undefined), true, 'cost price hidden from sales staff');
eq(kb.accounts.every((a) => a.balance === undefined), true, 'account balances hidden from sales staff');
const ksale = ok(K('sale.create', { items: [{ product_id: mouse.id, qty: 1, price: 600 }], payments: [{ account_id: cash.id, amount: 600 }] }), 'sales staff can sell');
eq(ksale.sale.profit, undefined, 'profit hidden in sale response');
bad(K('sale.detail', { id: sale1.sale.id }), 'another user', "cannot open other staff's invoice");
eq(ok(K('sales.list', {}), 'own sales list').length, 1, 'only own sales listed');
eq(ok(K('dashboard', {}), 'limited dashboard').limited, true, 'limited dashboard for sales role');
ok(A('rolePerms.save', { manager: ['pos'], sales: ['pos', 'purchase'] }), 'edit role permissions');
ok(K('purchases.list', {}), 'permission change takes effect immediately');

console.log(`\n${failed ? '✗' : '✓'} ${pass} checks passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
