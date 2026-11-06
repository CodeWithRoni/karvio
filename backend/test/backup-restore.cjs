// Full database backup (export) and restore (import) — Administrator account only.
// A backup → change everything → restore round trip must give back exactly the same tables,
// and every bad file must be refused before anything is touched.
const fs = require('fs');
const path = require('path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `
sandbox.setupDatabase();
const assert = require('assert/strict');
let checks = 0;
const same = (a, b, msg) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg); checks++; };
const truthy = (v, msg) => { assert.ok(v, msg); checks++; };
const login = (u, p) => { const r = call('login', { username: u, password: p }); if (!r.ok) throw new Error('login ' + u + ': ' + r.error); return r.data.token; };
let token = login('admin', 'admin123');
const Q = (a, p, t) => { const r = call(a, p, t || token); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const QF = (a, p, t) => { const r = call(a, p, t || token); assert.equal(r.ok, false, a + ' should fail'); checks++; return r.error; };
const copies = [];
book.copy = (name) => { copies.push(name); return { getName: () => name, getUrl: () => 'https://docs.google.com/spreadsheets/d/SAFE' }; };
// compare everything except the audit trail and the backup / restore time stamps
const strip = (b) => { const t = JSON.parse(JSON.stringify(b.tables)); delete t.AuditLog; t.Settings.rows = t.Settings.rows.filter((r) => !/^last_(backup|restore)_at$/.test(r[0])); return t; };

/* ---------- some real shop data ---------- */
Q('settings.save', { values: { shop_name: 'COMPUTER PLUS', invoice_prefix: 'CP-' } });
Q('user.save', { name: 'Roni', username: 'roni', password: 'roni123', role: 'admin' });
Q('user.save', { name: 'Mina', username: 'mina', password: 'mina123', role: 'manager' });
const roni = login('roni', 'roni123'), mina = login('mina', 'mina123');
const cash = Q('bootstrap', {}).accounts[0];
const sup = Q('supplier.save', { name: 'Smart Tech', phones: '01711000000' });
const cust = Q('customer.save', { name: 'রহিম উদ্দিন', phones: '01811000000', addresses: 'বেড়া, পাবনা' });
const router = Q('product.save', { name: 'ROUTER C54', has_warranty: true, warranty_type: 'serial', warranty_days: 300, barcode: '00123' });
const cable = Q('product.save', { name: 'CAT6 CABLE', unit: 'meter' });
Q('purchase.create', { supplier_id: sup.id, supplier_invoice: 'ST-77', items: [{ product_id: router.id, qty: 3, cost: 1800, sale_price: 2200, serials: ['R1', 'R2', 'R3'] }, { product_id: cable.id, qty: 100.5, cost: 22.35, sale_price: 35 }], payments: [{ account_id: cash.id, amount: 3000 }] });
const sale = Q('sale.create', { customer_id: cust.id, items: [{ product_id: router.id, qty: 2, price: 2200, serials: ['R1', 'R2'], warranty_days: 300 }, { product_id: cable.id, qty: 12.5, price: 35 }], payments: [{ account_id: cash.id, amount: 2000 }], next_payment_date: sandbox.today_() });
Q('expense.create', { category: 'Food', amount: 120, account_id: cash.id, note: 'চা' });
const tmp = Q('master.save', { kind: 'brand', name: 'Temp brand' });
Q('master.delete', { kind: 'brand', id: tmp.id }); // leaves an empty (tombstone) row in the sheet

/* ---------- who may do it ---------- */
truthy(/Only the Administrator account/.test(QF('database.export', {}, roni)), 'another admin cannot export');
truthy(/Permission denied/.test(QF('database.export', {}, mina)), 'staff cannot export');
truthy(/Only the Administrator account/.test(QF('database.info', {}, roni)), 'another admin cannot see the overview');
truthy(/Only the Administrator account/.test(QF('database.restore', { password: 'roni123', confirm: 'RESTORE', backup_text: '{}' }, roni)), 'another admin cannot restore');

/* ---------- overview ---------- */
const info = Q('database.info', {});
const n = (t) => info.tables.find((x) => x.name === t).rows;
same([n('Sales'), n('Products'), n('Customers'), n('Users'), n('SerialItems'), n('Brands')], [1, 2, 1, 3, 3, 0], 'row counts (deleted brand not counted)');
same(info.last_backup, '', 'no backup yet');
same(info.offline, false, 'online database');

/* ---------- export ---------- */
const b1 = Q('database.export', {});
same([b1.format, b1.version, b1.shop_name, b1.created_by], ['Karvio database backup', 1, 'COMPUTER PLUS', 'Administrator'], 'file header');
same(Object.keys(b1.tables), Object.keys(sandbox.SCHEMA), 'every table, in order');
truthy(!b1.tables.__KarvioTxnJournal && !b1.tables.__KarvioRequestReceipts, 'private runtime sheets left out');
same(b1.counts.Sales, 1, 'counts'); same(b1.tables.Brands.rows.length, 0, 'empty row of a deleted brand not exported');
same(b1.tables.Products.columns.slice(0, 3), ['id', 'sku', 'barcode'], 'column names kept');
truthy(b1.tables.Products.rows.some((r) => r[2] === '00123'), 'leading-zero barcode kept as text');
truthy(b1.tables.Customers.rows.some((r) => r[1] === 'রহিম উদ্দিন'), 'Bangla text kept');
truthy(b1.tables.Settings.rows.some((r) => r[0] === 'seq_sale' && r[1] === '1'), 'invoice counters included');
same(b1.checksum, sandbox.backupDigest_(JSON.parse(JSON.stringify(b1.tables))), 'checksum');
truthy(Q('database.info', {}).last_backup === b1.created_at, 'last backup time recorded');
const file = JSON.stringify(b1); // what the browser saves

/* ---------- change everything, then restore ---------- */
Q('sale.create', { items: [{ product_id: cable.id, qty: 5, price: 40 }], payments: [{ account_id: cash.id, amount: 200 }] });
Q('product.save', { name: 'NEW SWITCH' });
Q('user.save', { name: 'Late User', username: 'late', password: 'late123', role: 'sales' });
Q('database.reset', { password: 'admin123', confirm: 'RESET' }); // even a full reset
same(Q('bootstrap', {}).products.length, 0, 'database empty before the restore');
copies.length = 0;

// every bad request is refused and changes nothing
const before = JSON.stringify(strip(Q('database.export', {})));
const refuse = (payload, re, msg) => { truthy(re.test(QF('database.restore', { password: 'admin123', confirm: 'RESTORE', backup_text: file, ...payload })), msg); };
refuse({ password: 'nope' }, /Incorrect password/, 'wrong password');
refuse({ confirm: 'restore it' }, /Type RESTORE/, 'confirmation word');
refuse({ backup_text: 'hello' }, /not a Karvio database backup/, 'not JSON');
refuse({ backup_text: JSON.stringify({ format: 'Other app' }) }, /not a Karvio database backup/, 'wrong format');
refuse({ backup_text: JSON.stringify({ ...b1, version: 2 }) }, /newer Karvio/, 'newer version');
const edited = JSON.parse(file); edited.tables.Sales.rows[0][7] = 1; // change an invoice total by hand
refuse({ backup_text: JSON.stringify(edited) }, /damaged or was edited/, 'edited file');
const reseal = (b) => { b.checksum = sandbox.backupDigest_(b.tables); return JSON.stringify(b); };
const unk = JSON.parse(file); unk.tables.Hacks = { columns: ['id'], rows: [] };
refuse({ backup_text: reseal(unk) }, /Unknown table/, 'unknown table');
const noUsers = JSON.parse(file); delete noUsers.tables.Users;
refuse({ backup_text: reseal(noUsers) }, /no Users table/, 'missing Users');
const noOwner = JSON.parse(file); noOwner.tables.Users.rows = noOwner.tables.Users.rows.filter((r) => r[2] !== 'admin');
refuse({ backup_text: reseal(noOwner) }, /no active Administrator/, 'no Administrator in the file');
const dup = JSON.parse(file); dup.tables.Customers.rows.push(dup.tables.Customers.rows[0].slice());
refuse({ backup_text: reseal(dup) }, /Duplicate ID in Customers/, 'duplicate IDs');
const short = JSON.parse(file); short.tables.Sales.rows[0].pop();
refuse({ backup_text: reseal(short) }, /row in Sales is damaged/, 'broken row');
const cols = JSON.parse(file); cols.tables.Sales.columns[3] = 'hacked';
refuse({ backup_text: reseal(cols) }, /does not match/, 'wrong column');
const obj = JSON.parse(file); obj.tables.Sales.rows[0][1] = { x: 1 };
refuse({ backup_text: reseal(obj) }, /damaged/, 'object value');
book.copy = () => { throw new Error('Drive is full'); };
refuse({}, /Drive is full/, 'no safety copy → no restore');
book.copy = (name) => { copies.push(name); return { getName: () => name, getUrl: () => 'https://docs.google.com/spreadsheets/d/SAFE' }; };
same(copies.length, 0, 'nothing copied for refused files');
same(JSON.stringify(strip(Q('database.export', {}))), before, 'database untouched by refused restores');

const r = Q('database.restore', { password: 'admin123', confirm: ' RESTORE ', backup_text: file });
same(copies.length, 1, 'safety copy made first'); truthy(/^Karvio backup before restore /.test(copies[0]), 'safety copy name');
same([r.signed_out, r.shop_name, r.backup_created_at, r.counts.Sales, r.safety.name], [false, 'COMPUTER PLUS', b1.created_at, 1, copies[0]], 'restore result');
const b2 = Q('database.export', {}); // the same session still works
same(strip(b2), strip(b1), 'every table is exactly as in the backup');
truthy(call('login', { username: 'late', password: 'late123' }).ok === false, 'user made after the backup is gone');
login('roni', 'roni123'); login('mina', 'mina123'); checks++;
same(Q('database.info', {}).last_restore, r.restored_at, 'last restore time recorded');
truthy(Q('history', { q: 'R1' }).summary !== undefined, 'serial history works after restore');
same(Q('customers.list', {}).find((c) => c.id === cust.id).balance, sale.sale.due, 'customer due restored');
const next = Q('sale.create', { items: [{ product_id: router.id, qty: 1, price: 2200, serials: ['R3'] }], payments: [{ account_id: cash.id, amount: 2200 }] });
same(next.sale.invoice_no, 'CP-000002', 'invoice numbering continues from the backup');
same(['R1', 'R2', 'R3'].map((x) => Q('serials.find', { serial: x }).status), ['sold', 'sold', 'sold'], 'serial status restored (R1, R2 sold in the backup; R3 sold just now)');
truthy(book.getSheetByName('AuditLog').rows.some((row) => row[3] === 'database_restore'), 'restore written to the audit log');

// a backup whose Administrator password differs signs this session out
Q('user.save', { ...Q('users.list', {}).find((u) => u.username === 'admin'), password: 'newpass1' });
token = login('admin', 'newpass1');
const r2 = Q('database.restore', { password: 'newpass1', confirm: 'RESTORE', backup_text: file });
same(r2.signed_out, true, 'tells the app to sign in again');
truthy(call('bootstrap', {}, token).auth, 'old session ended');
token = login('admin', 'admin123'); checks++; // the backup's password works

// an older backup (fewer columns) is accepted and the new columns stay empty
const old = JSON.parse(file);
old.tables.Users.columns = old.tables.Users.columns.slice(0, 8); old.tables.Users.rows = old.tables.Users.rows.map((x) => x.slice(0, 8));
Q('database.restore', { password: 'admin123', confirm: 'RESTORE', backup_text: reseal(old) });
same(Q('users.list', {}).map((u) => [u.username, u.access_limit]), [['admin', false], ['roni', false], ['mina', false]], 'older backup restored, new columns empty');
console.log('Database backup and restore: ' + checks + ' checks passed');
`;
eval(harness + scenario);

// Offline desktop app: no Drive copy; the previous data file is kept and the restore survives a restart.
{
  const assert = require('node:assert/strict');
  const os = require('node:os');
  const { OfflineRuntime } = require('../../frontend/desktop/offline-runtime.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'karvio-backup-test-'));
  let n = 0;
  try {
    const opts = { dataDir: dir, codePath: path.join(__dirname, '..', 'Code.gs') };
    const app = new OfflineRuntime(opts);
    let token;
    const call = (action, payload = {}) => app.execute({ action, payload, token });
    token = call('login', { username: 'admin', password: 'admin123' }).data.token;
    call('product.save', { name: 'Offline item' });
    const file = JSON.stringify(call('database.export').data);
    call('product.save', { name: 'Second item' });
    const bad = call('database.restore', { password: 'admin123', confirm: 'RESTORE', backup_text: file.replace('Offline item', 'Changed') });
    assert.equal(bad.ok, false); assert.equal(call('products.list').data.length, 2); n++;
    const r = call('database.restore', { password: 'admin123', confirm: 'RESTORE', backup_text: file });
    assert.equal(r.ok, true, r.error); assert.equal(r.data.safety, null); n++;
    assert.deepEqual(call('products.list').data.map((p) => p.name), ['Offline item']); n++;
    const again = new OfflineRuntime(opts);
    token = again.execute({ action: 'login', payload: { username: 'admin', password: 'admin123' } }).data.token;
    assert.deepEqual(again.execute({ action: 'products.list', payload: {}, token }).data.map((p) => p.name), ['Offline item'], 'restore survives a restart'); n++;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log('Offline database backup and restore: ' + n + ' checks passed');
}
