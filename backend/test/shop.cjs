// Online shop: Drive folder + shop database setup, product pictures, the public catalogue (no cost / stock leaks),
// placing and tracking orders (COD and bKash, anti-spam, idempotent), and the staff order flow.
const fs = require('fs');
const path = require('path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `
/* ---- Google Drive + extra spreadsheets ---- */
const drive = { folders: {}, files: {}, n: 0 };
const mkFolder = (name, parent) => {
  const f = { id: 'fold' + (++drive.n), name, parent, getId() { return this.id; }, getName() { return this.name; },
    createFolder(n) { return mkFolder(n, this.id); },
    createFile(blob) { const file = mkFile(blob.name, this.id); file.bytes = blob.bytes; file.mime = blob.mime; return file; } };
  drive.folders[f.id] = f; return f;
};
const mkFile = (name, parent) => {
  const f = { id: 'file' + (++drive.n), name, parent, shared: null, trashed: false, getId() { return this.id; },
    setSharing(a, p) { this.shared = a + ':' + p; return this; }, setTrashed(t) { this.trashed = t; return this; }, moveTo(folder) { this.parent = folder.id; return this; } };
  drive.files[f.id] = f; return f;
};
const books = {};
const mkBook = (name) => {
  const b = { id: 'BOOK' + (++drive.n), name, sheets: {}, getId() { return this.id; }, getSheetByName(n) { return this.sheets[n] || null; },
    insertSheet(n) { return (this.sheets[n] = new Sheet(n)); }, getSheets() { return Object.values(this.sheets); }, deleteSheet(sh) { delete this.sheets[sh.name]; } };
  b.sheets.Sheet1 = new Sheet('Sheet1');
  books[b.id] = b;
  drive.files[b.id] = { id: b.id, name, parent: 'root', getId() { return this.id; }, moveTo(folder) { this.parent = folder.id; return this; } };
  return b;
};
Sheet.prototype.getName = function () { return this.name; };
sandbox.SpreadsheetApp.create = (name) => mkBook(name);
sandbox.SpreadsheetApp.openById = (id) => books[id] || book;
sandbox.DriveApp = {
  Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
  createFolder: (n) => mkFolder(n, 'root'),
  getFolderById: (id) => { if (!drive.folders[id]) throw new Error('No folder ' + id); return drive.folders[id]; },
  getFileById: (id) => { if (!drive.files[id]) throw new Error('No file ' + id); return drive.files[id]; }
};
sandbox.Utilities.base64Decode = (s) => Array.from(Buffer.from(s, 'base64'));
sandbox.Utilities.newBlob = (bytes, mime, name) => ({ bytes, mime, name });

sandbox.setupDatabase();
const assert = require('assert/strict');
let checks = 0;
const same = (a, b, msg) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg); checks++; };
const truthy = (v, msg) => { assert.ok(v, msg); checks++; };
const login = (u, p) => { const r = call('login', { username: u, password: p }); if (!r.ok) throw new Error('login ' + u + ': ' + r.error); return r.data.token; };
const token = login('admin', 'admin123');
const Q = (a, p, t) => { const r = call(a, p, t === undefined ? token : t); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const QF = (a, p, t) => { const r = call(a, p, t === undefined ? token : t); assert.equal(r.ok, false, a + ' should fail'); checks++; return r.error; };
const pub = (a, p) => Q(a, p, null), pubF = (a, p) => QF(a, p, null);
const clearCache = () => vm.runInContext('CacheService.getScriptCache().remove("shop_catalog")', sandbox);

/* ---------- before setup ---------- */
same(pub('shop.catalog', {}).shop.open, false, 'shop closed before setup');
truthy(/closed/.test(pubF('shop.order.create', { name: 'A' })), 'no orders before setup');
same(Q('weborders.list', {}).ready, false, 'orders page knows the shop is not set up');
Q('user.save', { name: 'Roni', username: 'roni', password: 'roni123', role: 'admin' });
Q('user.save', { name: 'Mina', username: 'mina', password: 'mina123', role: 'manager' });
Q('user.save', { name: 'Sumi', username: 'sumi', password: 'sumi123', role: 'sales' });
const mina = login('mina', 'mina123'), sumi = login('sumi', 'sumi123');
truthy(/Permission denied/.test(QF('shop.setup', {}, sumi)), 'sales staff cannot set up the shop');

/* ---------- setup: Drive folder, images folder, shop database, delivery item ---------- */
const s1 = Q('shop.setup', {});
const root = Object.values(drive.folders).find((f) => f.name === 'Karvio Shop' && f.parent === 'root');
const imgs = Object.values(drive.folders).find((f) => f.name === 'Images');
const db = Object.values(books).find((b) => b.name === 'Karvio Shop Database');
truthy(root && imgs && imgs.parent === root.id, 'Drive › Karvio Shop › Images');
truthy(db && drive.files[db.id].parent === root.id, 'Karvio Shop Database inside the Karvio Shop folder');
same(Object.keys(db.sheets), ['Orders'], 'Orders tab made, empty default tab removed');
same(db.sheets.Orders.rows[0].slice(0, 4), ['id', 'order_no', 'created_at', 'status'], 'order columns');
same([s1.ready, s1.folder_url, s1.db_url], [true, 'https://drive.google.com/drive/folders/' + root.id, 'https://docs.google.com/spreadsheets/d/' + db.id], 'admin info with links');
const deliveryItem = Q('products.list', {}).find((p) => p.id === s1.delivery_product_id);
same([deliveryItem.name, deliveryItem.service, deliveryItem.web], ['Delivery charge', true, false], 'Delivery charge service item, not on the website');
const s2 = Q('shop.setup', {});
same([Object.values(drive.folders).length, Object.values(books).length, s2.delivery_product_id], [2, 1, s1.delivery_product_id], 'running setup again reuses everything');

/* ---------- products for the website ---------- */
const cash = Q('bootstrap', {}).accounts[0];
const sup = Q('supplier.save', { name: 'Supplier' });
const groups = Q('bootstrap', {}).categories, grp = groups.find((c) => !c.parent_id), sub = groups.find((c) => c.parent_id === grp.id);
const brand = Q('master.save', { kind: 'brand', name: 'A4Tech' });
const mouse = Q('product.save', { name: 'MOUSE OP-620D', sku: 'OP-620D', category_id: grp.id, subcategory_id: sub ? sub.id : '', brand_id: brand.id, web: true, has_warranty: true, warranty_type: 'invoice', warranty_days: 180, description: 'Wired optical mouse' });
const cable = Q('product.save', { name: 'CAT6 CABLE', unit: 'meter', web: true });
const hidden = Q('product.save', { name: 'SECRET STOCK ITEM', web: false });
const router = Q('product.save', { name: 'ROUTER C54', web: true });
const free = Q('product.save', { name: 'NO PRICE ITEM', web: true });
same(mouse.web, true, 'Show on website saved');
Q('purchase.create', { supplier_id: sup.id, items: [
  { product_id: mouse.id, qty: 5, cost: 380, sale_price: 550 }, { product_id: cable.id, qty: 100.5, cost: 20, sale_price: 35 },
  { product_id: hidden.id, qty: 9, cost: 1000, sale_price: 1500 }], payments: [{ account_id: cash.id, amount: 6000 }] });
Q('price.update', { items: [{ id: router.id, sale_price: 2200, wholesale_price: 2000 }] });

/* ---------- public catalogue ---------- */
same(pub('shop.catalog', {}).shop.open, false, 'still closed until switched on');
Q('settings.save', { values: { shop_name: 'COMPUTER PLUS', shop_phone: '01754614614', shop_enabled: 'true', shop_bkash_number: '01754614614', shop_bkash_type: 'personal', shop_delivery_inside: '60', shop_delivery_outside: '130', shop_inside_label: 'Inside Pabna', shop_notice: 'Free gift with every order' } });
const cat = pub('shop.catalog', {});
same([cat.shop.open, cat.shop.name, cat.shop.cod, cat.shop.bkash, cat.shop.delivery, cat.shop.notice],
  [true, 'COMPUTER PLUS', true, { enabled: true, number: '01754614614', type: 'personal' }, { inside: 60, outside: 130, inside_label: 'Inside Pabna' }, 'Free gift with every order'], 'shop info');
same(cat.products.map((p) => p.name).sort(), ['CAT6 CABLE', 'MOUSE OP-620D', 'ROUTER C54'], 'only website products with a price');
const cm = cat.products.find((p) => p.id === mouse.id);
same([cm.price, cm.in_stock, cm.low_stock, cm.warranty_days, cm.brand_id, cm.group_id, cm.description], [550, true, false, 180, brand.id, grp.id, 'Wired optical mouse'], 'mouse on the website');
same(cat.products.find((p) => p.id === router.id).in_stock, false, 'out of stock shown as such');
same(cat.products.find((p) => p.id === cable.id).decimal, true, 'cable sold by length');
const text = JSON.stringify(cat);
truthy(!/cost|wholesale|"stock"|supplier|380|1500|SECRET/i.test(text), 'no cost, wholesale price, stock count, supplier or hidden product in the public catalogue');
same(cat.brands, [{ id: brand.id, name: 'A4Tech' }], 'brands in use');
truthy(cat.groups.some((g) => g.id === grp.id), 'groups in use');
// cached for visitors, refreshed after changes
Q('price.update', { items: [{ id: mouse.id, sale_price: 600, wholesale_price: 0 }] });
same(pub('shop.catalog', {}).products.find((p) => p.id === mouse.id).price, 600, 'price change reaches the website at once');
vm.runInContext('_mem = {}', sandbox);
const fast = JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify({ action: 'shop.catalog' }) } }).getContent());
same(fast.data.products.length, 3, 'served from cache');

/* ---------- product pictures ---------- */
const png = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes').toString('base64');
let pm = Q('product.image.add', { id: mouse.id, data: png });
const firstImg = pm.images;
truthy(drive.files[firstImg] && drive.files[firstImg].parent === imgs.id && drive.files[firstImg].shared === 'ANYONE_WITH_LINK:VIEW', 'picture saved in Images, viewable by link');
truthy(/JPG, PNG or WebP/.test(QF('product.image.add', { id: mouse.id, data: 'data:text/html;base64,PGI+' })), 'only pictures');
truthy(/Permission denied/.test(QF('product.image.add', { id: mouse.id, data: png }, sumi)), 'sales staff cannot change pictures');
for (let i = 0; i < 5; i++) pm = Q('product.image.add', { id: mouse.id, data: png });
truthy(/up to 6/.test(QF('product.image.add', { id: mouse.id, data: png })), 'six pictures at most');
const ids = pm.images.split(',');
pm = Q('product.images', { id: mouse.id, images: [ids[2], ids[0]] });
same(pm.images, ids[2] + ',' + ids[0], 'reordered, four removed');
same(ids.filter((id) => drive.files[id].trashed).length, 4, 'removed pictures moved to the Drive bin');
truthy(/Unknown picture/.test(QF('product.images', { id: mouse.id, images: ['someone-elses-file'] })), 'cannot attach other Drive files');
same(pub('shop.catalog', {}).products.find((p) => p.id === mouse.id).images, [ids[2], ids[0]], 'pictures on the website, first is the main one');

/* ---------- placing orders ---------- */
const good = { name: 'Rahim Uddin', phone: '+8801711-000000', address: 'House 5, Road 2, Bera, Pabna', area: 'inside', payment: 'cod', items: [{ product_id: mouse.id, qty: 2, price: 1 }, { product_id: cable.id, qty: 10.5 }] };
const err = (patch, re, msg) => truthy(re.test(pubF('shop.order.create', { ...good, ...patch })), msg);
err({ name: '' }, /your name/, 'name needed');
err({ phone: '12345' }, /valid mobile/, 'Bangladesh mobile needed');
err({ address: 'Bera' }, /full delivery address/, 'full address');
err({ items: [] }, /cart is empty/, 'empty cart');
err({ items: [{ product_id: hidden.id, qty: 1 }] }, /no longer sold online/, 'hidden product refused');
err({ items: [{ product_id: router.id, qty: 1 }] }, /out of stock/, 'out of stock refused');
err({ items: [{ product_id: mouse.id, qty: 9 }] }, /Only a few of MOUSE/, 'more than in stock refused (count not revealed)');
err({ items: [{ product_id: mouse.id, qty: 1.5 }] }, /quantity/, 'whole numbers for pieces');
err({ items: [{ product_id: mouse.id, qty: 1 }, { product_id: mouse.id, qty: 1 }] }, /twice/, 'same product twice');
err({ company: 'spam inc' }, /not accepted/, 'bots filling the hidden field are refused');
err({ payment: 'bkash' }, /bKash number you paid from/, 'bKash needs the sender number');
err({ payment: 'bkash', bkash_sender: '01811000000', bkash_trx: 'abc' }, /Transaction ID/, 'bKash needs a TrxID');
same(db.sheets.Orders.getLastRow(), 1, 'no order saved by refused attempts');

const o1 = pub('shop.order.create', { ...good, client_ref: 'cart-111' });
same([o1.order_no, o1.subtotal, o1.delivery, o1.total, o1.status, o1.payment], ['WO-000001', 1567.5, 60, 1627.5, 'new', 'cod'], 'COD order: server prices (600×2 + 35×10.5) + delivery');
same(pub('shop.order.create', { ...good, client_ref: 'cart-111' }).order_no, 'WO-000001', 'same cart sent twice → one order');
same(db.sheets.Orders.getLastRow(), 2, 'one row saved');
const o2 = pub('shop.order.create', { ...good, phone: '01811000000', area: 'outside', payment: 'bkash', bkash_sender: '01811000000', bkash_trx: 'bka12xyz9q', items: [{ product_id: cable.id, qty: 2 }] });
same([o2.order_no, o2.delivery, o2.total], ['WO-000002', 130, 200], 'bKash order outside the city');
truthy(/already used/.test(pubF('shop.order.create', { ...good, phone: '01911000000', payment: 'bkash', bkash_sender: '01911000000', bkash_trx: 'BKA12XYZ9Q' })), 'a TrxID cannot be used twice');
pub('shop.order.create', { ...good, client_ref: 'cart-222', items: [{ product_id: cable.id, qty: 1 }] });
pub('shop.order.create', { ...good, client_ref: 'cart-333', items: [{ product_id: cable.id, qty: 1 }] });
truthy(/Too many orders/.test(pubF('shop.order.create', { ...good, client_ref: 'cart-444' })), 'at most 3 orders per number in a short time');
same(Q('products.list', {}).find((p) => p.id === mouse.id).stock, 5, 'an online order does not change stock by itself');

/* ---------- tracking ---------- */
truthy(/No order found/.test(pubF('shop.order.track', { order_no: 'WO-000001', phone: '01999999999' })), 'needs the same mobile');
const t1 = pub('shop.order.track', { order_no: 'wo-000001', phone: '01711000000' });
same([t1.status, t1.total, t1.items.length, t1.log.map((l) => l.status)], ['new', 1627.5, 2, ['new']], 'customer sees the order');
truthy(!/staff_note|client_ref|bkash_sender|sale_id|customer_id|"by"/.test(JSON.stringify(t1)), 'no internal fields for the customer');

/* ---------- staff ---------- */
truthy(/sign in/i.test(QF('weborders.list', {}, null)), 'orders need sign-in');
const list = Q('weborders.list', {}, sumi);
same([list.ready, list.orders.length, list.counts.new, list.orders[0].order_no], [true, 4, 4, 'WO-000004'], 'sales staff see orders, newest first');
same(Q('weborders.list', { status: 'confirmed' }).orders.length, 0, 'filter by status');
const w1 = list.orders.find((o) => o.order_no === 'WO-000001'), w2 = list.orders.find((o) => o.order_no === 'WO-000002');
same(w1.items[0], { product_id: mouse.id, name: 'MOUSE OP-620D', sku: 'OP-620D', unit: 'pcs', qty: 2, price: 600, total: 1200 }, 'order lines');
truthy(/Open in POS/.test(QF('weborder.update', { id: w1.id, status: 'confirmed' })), 'confirmed only through a sale');
truthy(/Finish the sale/.test(QF('weborder.update', { id: w1.id, status: 'shipped' })), 'cannot ship before the sale');
same(Q('weborder.update', { id: w2.id, payment_status: 'verified', staff_note: 'TrxID checked in bKash app' }).payment_status, 'verified', 'bKash payment verified');
truthy(/Unknown payment status/.test(QF('weborder.update', { id: w2.id, payment_status: 'paid' })), 'payment status values checked');
// the POS sale for order 1 (customer by phone, delivery line)
const cust = Q('customer.quickAdd', { name: 'Rahim Uddin', phone: '01711000000', address: good.address });
const sale = Q('sale.create', { customer_id: cust.id, note: 'Online order WO-000001', items: [{ product_id: mouse.id, qty: 2, price: 600 }, { product_id: cable.id, qty: 10.5, price: 35 }, { product_id: s1.delivery_product_id, qty: 1, price: 60 }], payments: [] });
same(sale.sale.total, 1627.5, 'POS sale total = order total');
const l1 = Q('weborder.link', { id: w1.id, sale_id: sale.sale.id }, sumi);
same([l1.status, l1.sale_no, l1.customer_id], ['confirmed', sale.sale.invoice_no, cust.id], 'order confirmed with its invoice');
truthy(/already has invoice/.test(QF('weborder.link', { id: w1.id, sale_id: sale.sale.id })), 'one invoice per order');
truthy(/already linked/.test(QF('weborder.link', { id: w2.id, invoice_no: sale.sale.invoice_no })), 'an invoice belongs to one order');
truthy(/Invoice not found/.test(QF('weborder.link', { id: w2.id, invoice_no: 'INV-999999' })), 'unknown invoice');
same(Q('weborder.update', { id: w1.id, status: 'shipped' }).status, 'shipped', 'shipped');
same(Q('weborder.update', { id: w1.id, status: 'delivered' }).log.map((l) => l.status), ['new', 'confirmed', 'shipped', 'delivered'], 'full history');
truthy(/cannot change/.test(QF('weborder.update', { id: w1.id, status: 'cancelled' })), 'delivered orders are final');
same(pub('shop.order.track', { order_no: 'WO-000001', phone: '01711000000' }).invoice_no, sale.sale.invoice_no, 'customer sees the invoice number');
const w3 = list.orders.find((o) => o.order_no === 'WO-000003');
same(Q('weborder.update', { id: w3.id, status: 'cancelled' }).status, 'cancelled', 'cancel');
truthy(/cancelled/.test(QF('weborder.link', { id: w3.id, invoice_no: sale.sale.invoice_no })), 'cancelled order cannot be linked');
truthy(/Unknown order status/.test(QF('weborder.update', { id: list.orders.find((o) => o.order_no === 'WO-000004').id, status: 'lost' })), 'status values checked');
same(Q('shop.admin', {}).new_orders, 2, 'admin summary counts new orders');

/* ---------- shop closed / options ---------- */
Q('settings.save', { values: { shop_enabled: 'false' } });
same(pub('shop.catalog', {}).products.length, 0, 'closed shop shows no products');
truthy(/closed right now/.test(pubF('shop.order.create', { ...good, phone: '01611000000' })), 'closed shop takes no orders');
Q('settings.save', { values: { shop_enabled: 'true', shop_cod: 'false', shop_bkash_number: '' } });
truthy(/Cash on delivery is not available/.test(pubF('shop.order.create', { ...good, phone: '01611000000' })), 'COD can be switched off');
same(pub('shop.catalog', {}).shop.bkash.enabled, false, 'bKash off without a number');
console.log('Online shop: ' + checks + ' checks passed');
`;
eval(harness + scenario);

// The offline desktop app has no Google Drive: the shop says so instead of failing oddly.
{
  const assert = require('node:assert/strict');
  const os = require('node:os');
  const { OfflineRuntime } = require('../../frontend/desktop/offline-runtime.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'karvio-shop-test-'));
  try {
    const app = new OfflineRuntime({ dataDir: dir, codePath: path.join(__dirname, '..', 'Code.gs') });
    const token = app.execute({ action: 'login', payload: { username: 'admin', password: 'admin123' } }).data.token;
    const r = app.execute({ action: 'shop.setup', payload: {}, token });
    assert.equal(r.ok, false); assert.match(r.error, /online \(Google\) version/);
    assert.equal(app.execute({ action: 'shop.catalog', payload: {} }).data.shop.open, false);
    assert.equal(app.execute({ action: 'shop.admin', payload: {}, token }).data.google, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log('Online shop in the offline app: 3 checks passed');
}
