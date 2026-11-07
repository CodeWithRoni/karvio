// Offline desktop data after the rename ShopERP → Karvio:
// the old "ShopERP Offline" folder and "shop-erp.json" file are moved (never copied or deleted),
// old data keeps loading, and backups made before the rename can still be restored.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { offlineDataDir } = require('../../frontend/desktop/data-folder.cjs');
const { OfflineRuntime, FORMAT } = require('../../frontend/desktop/offline-runtime.cjs');

const codePath = path.join(__dirname, '..', 'Code.gs');
const roots = [];
const tempRoot = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'karvio-rename-test-')); roots.push(d); return d; };
let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

// Make real data with the current runtime, then turn it into what an older Karvio left behind.
function legacyShop(dir) {
  const app = new OfflineRuntime({ dataDir: dir, codePath });
  const token = app.execute({ action: 'login', payload: { username: 'admin', password: 'admin123' } }).data.token;
  app.execute({ action: 'product.save', payload: { name: 'Old shop item' }, token });
  const data = JSON.parse(fs.readFileSync(app.file, 'utf8'));
  data.format = 'ShopERP Offline';
  fs.writeFileSync(path.join(dir, 'shop-erp.json'), JSON.stringify(data));
  fs.rmSync(app.file); if (fs.existsSync(app.previousFile)) fs.renameSync(app.previousFile, path.join(dir, 'shop-erp.previous.json'));
  fs.writeFileSync(path.join(dir, 'Local Storage.txt'), 'browser profile file'); // Electron keeps its profile here too
  return data;
}
const products = (dir) => {
  const app = new OfflineRuntime({ dataDir: dir, codePath });
  const token = app.execute({ action: 'login', payload: { username: 'admin', password: 'admin123' } }).data.token;
  return { app, token, names: app.execute({ action: 'products.list', payload: {}, token }).data.map((p) => p.name) };
};

try {
  eq(FORMAT, 'Karvio Offline', 'new file format name');

  // 1. a fresh computer: the new folder name
  let root = tempRoot();
  eq(offlineDataDir(root), path.join(root, 'Karvio Offline'), 'new install uses "Karvio Offline"');
  ok(!fs.existsSync(path.join(root, 'Karvio Offline')), 'nothing created by just choosing the folder');

  // 2. an existing shop: the old folder is moved with everything in it
  root = tempRoot();
  const legacy = path.join(root, 'ShopERP Offline');
  fs.mkdirSync(legacy); legacyShop(legacy);
  const dir = offlineDataDir(root);
  eq(dir, path.join(root, 'Karvio Offline'), 'old folder moved to "Karvio Offline"');
  ok(!fs.existsSync(legacy), 'old folder no longer there (moved, not copied)');
  ok(fs.existsSync(path.join(dir, 'Local Storage.txt')) && fs.existsSync(path.join(dir, 'backups')), 'whole folder moved, sign-in profile and backups too');
  ok(fs.existsSync(path.join(dir, 'shop-erp.json')), 'data file still there before the app opens it');
  const first = products(dir);
  eq(first.names, ['Old shop item'], 'old data loads');
  ok(fs.existsSync(path.join(dir, 'karvio.json')) && !fs.existsSync(path.join(dir, 'shop-erp.json')), 'data file renamed to karvio.json');
  ok(fs.existsSync(path.join(dir, 'karvio.previous.json')) && !fs.existsSync(path.join(dir, 'shop-erp.previous.json')), 'previous copy renamed too');
  first.app.execute({ action: 'product.save', payload: { name: 'New item' }, token: first.token });
  eq(JSON.parse(fs.readFileSync(path.join(dir, 'karvio.json'), 'utf8')).format, 'Karvio Offline', 'saved under the new format name');
  eq(products(dir).names.sort(), ['New item', 'Old shop item'], 'everything there after a restart');
  eq(offlineDataDir(root), dir, 'second start: same folder, nothing moved again');

  // 3. both folders with data: never mixed, the new one wins and the old one is left alone
  root = tempRoot();
  fs.mkdirSync(path.join(root, 'ShopERP Offline')); legacyShop(path.join(root, 'ShopERP Offline'));
  fs.mkdirSync(path.join(root, 'Karvio Offline')); fs.writeFileSync(path.join(root, 'Karvio Offline', 'karvio.json'), '{}');
  eq(offlineDataDir(root), path.join(root, 'Karvio Offline'), 'existing Karvio data is used');
  ok(fs.existsSync(path.join(root, 'ShopERP Offline', 'shop-erp.json')), 'old data untouched');

  // 4. an empty "Karvio Offline" folder in the way is set aside, not deleted
  root = tempRoot();
  fs.mkdirSync(path.join(root, 'ShopERP Offline')); legacyShop(path.join(root, 'ShopERP Offline'));
  fs.mkdirSync(path.join(root, 'Karvio Offline')); fs.writeFileSync(path.join(root, 'Karvio Offline', 'note.txt'), 'x');
  eq(offlineDataDir(root), path.join(root, 'Karvio Offline'), 'old data moved in');
  ok(fs.readdirSync(root).some((n) => /^Karvio Offline \(empty \d+\)$/.test(n) && fs.existsSync(path.join(root, n, 'note.txt'))), 'the empty folder kept aside with its file');
  eq(products(path.join(root, 'Karvio Offline')).names, ['Old shop item'], 'old data loads from the new folder');

  // 5. folder busy (an old Karvio window still open): keep using the old folder, move it next time
  root = tempRoot();
  fs.mkdirSync(path.join(root, 'ShopERP Offline')); legacyShop(path.join(root, 'ShopERP Offline'));
  const rename = fs.renameSync;
  fs.renameSync = () => { throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); };
  try { eq(offlineDataDir(root), path.join(root, 'ShopERP Offline'), 'busy: old folder used as it is'); }
  finally { fs.renameSync = rename; }
  eq(offlineDataDir(root), path.join(root, 'Karvio Offline'), 'next start: moved');

  // 6. a backup file saved before the rename can still be restored
  root = tempRoot();
  const oldBackup = path.join(root, 'Karvio-backup-old.json');
  fs.mkdirSync(path.join(root, 'old')); fs.writeFileSync(oldBackup, JSON.stringify(legacyShop(path.join(root, 'old'))));
  const shop = new OfflineRuntime({ dataDir: path.join(root, 'shop'), codePath });
  const token = shop.execute({ action: 'login', payload: { username: 'admin', password: 'admin123' } }).data.token;
  shop.restoreBackup(token, oldBackup);
  const token2 = shop.execute({ action: 'login', payload: { username: 'admin', password: 'admin123' } }).data.token; // the restored users' sign-in
  eq(shop.execute({ action: 'products.list', payload: {}, token: token2 }).data.map((p) => p.name), ['Old shop item'], 'old backup restored');
  eq(JSON.parse(fs.readFileSync(shop.file, 'utf8')).format, 'Karvio Offline', 'and saved in the new format');
  fs.writeFileSync(oldBackup, JSON.stringify({ format: 'Something else', schemaVersion: 1, sheets: {}, properties: {} }));
  assert.throws(() => shop.restoreBackup(token2, oldBackup), /valid Karvio/); checks++;
} finally { roots.forEach((d) => fs.rmSync(d, { recursive: true, force: true })); }
console.log('Offline data folder rename: ' + checks + ' checks passed');
