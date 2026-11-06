const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OfflineRuntime } = require('../../frontend/desktop/offline-runtime.cjs');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'karvio-upgrade-'));
const options = { dataDir, codePath: path.join(__dirname, '..', 'Code.gs') };
let app = new OfflineRuntime(options), token;
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const call = (action, payload = {}, extra = {}) => {
  const result = app.execute({ action, payload, token, ...extra });
  assert.equal(result.ok, true, result.error); return result.data;
};
const login = () => { token = call('login', { username: 'admin', password: 'admin123' }).token; };
try {
  login();
  const cash = call('bootstrap').accounts[0];
  const pr = call('product.save', { name: 'Offline upgrade fixture', unit: 'pcs', sale_price: 150 });
  call('purchase.create', { items: [{ product_id: pr.id, qty: 5, cost: 100 }], payments: [{ account_id: cash.id, amount: 500 }] });
  const salePayload = { items: [{ product_id: pr.id, qty: 1, price: 150 }], payments: [{ account_id: cash.id, amount: 150 }] };
  const first = call('sale.create', salePayload, { request_id: 'offline-upgrade-sale-0001' });
  const same = call('sale.create', salePayload, { request_id: 'offline-upgrade-sale-0001' });
  eq(same.sale.id, first.sale.id);
  eq(call('products.list').find(p => p.id === pr.id).stock, 4);
  app = new OfflineRuntime(options); login();
  const again = call('sale.create', salePayload, { request_id: 'offline-upgrade-sale-0001' });
  eq(again.sale.id, first.sale.id);
  eq(call('products.list').find(p => p.id === pr.id).stock, 4);
  eq(call('accounts.list').find(a => a.id === cash.id).balance, -350);

  // Synthetic old backup: headers match the first offline release. No real
  // customer/database files are opened or distributed by this test.
  const backup = path.join(dataDir, 'current.json'); app.exportBackup(token, backup);
  const old = JSON.parse(fs.readFileSync(backup, 'utf8'));
  const counts = { Users: 8, Products: 19, Customers: 8, Suppliers: 8,
    Purchases: 16, Sales: 20, PurchaseItems: 10, SalesReturnItems: 10, PurchaseReturnItems: 9 };
  for (const [name, count] of Object.entries(counts)) {
    old.sheets[name].rows = old.sheets[name].rows.map(row => row.slice(0, count));
    old.sheets[name].columns = count;
  }
  delete old.sheets.Units; delete old.sheets.InvoiceLinks;
  const oldBackup = path.join(dataDir, 'legacy.json'); fs.writeFileSync(oldBackup, JSON.stringify(old));
  call('product.save', { name: 'Not in the old backup', sale_price: 1 });
  app.restoreBackup(token, oldBackup); login();
  eq(call('products.list').find(p => p.id === pr.id).stock, 4);
  eq(call('products.list').some(p => p.name === 'Not in the old backup'), false);
  eq(call('accounts.list').find(a => a.id === cash.id).balance, -350);
  eq(call('sale.detail', { id: first.sale.id }).sale.total, 150);
  eq(call('bootstrap').settings.sms_enabled, 'false');
  eq(app.state.sheets.Users.rows[0].length, app.context.SCHEMA.Users.split(',').length);
  eq(app.state.sheets.PurchaseReturnItems.rows[0].length, app.context.SCHEMA.PurchaseReturnItems.split(',').length);

  // A failed restore must not replace the current persisted database.
  const invalid = JSON.parse(fs.readFileSync(backup, 'utf8'));
  invalid.sheets.Users.rows[0][0] = 'incorrect';
  const invalidFile = path.join(dataDir, 'invalid.json'); fs.writeFileSync(invalidFile, JSON.stringify(invalid));
  const before = fs.readFileSync(app.file, 'utf8');
  assert.throws(() => app.restoreBackup(token, invalidFile), /Invalid backup table/); checks++;
  eq(fs.readFileSync(app.file, 'utf8'), before);
  console.log('Offline idempotency/restart/legacy upgrade: ' + checks + ' checks passed');
} finally {
  // Leave cleanup to the OS temp policy; this test never touches user data.
}
