// Advance Search cards: for a serial, a product, a sale invoice and a purchase invoice — the product, where it was
// bought, who bought it, sales returns, purchase returns and warranty claims, each as its own list of documents.
// Also: part of a product name ("which product?"), opening every document (history.doc) and staff privacy.
const fs = require('fs');
const path = require('path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `
sandbox.setupDatabase();
const assert = require('assert/strict');
let checks = 0;
const same = (a, b, msg) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg); checks++; };
const truthy = (v, msg) => { assert.ok(v, msg); checks++; };
const login = (u, pw) => { const r = call('login', { username: u, password: pw }); if (!r.ok) throw new Error('login ' + u + ': ' + r.error); return r.data.token; };
let token = login('admin', 'admin123');
const Q = (a, p, t) => { const r = call(a, p, t || token); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const QF = (a, p, t) => { const r = call(a, p, t || token); assert.equal(r.ok, false, a + ' should fail'); checks++; return r.error; };
const nos = (card) => card.rows.map((r) => r.no);

const boot = Q('bootstrap', {});
const cash = boot.accounts[0];
const grp = Q('master.save', { kind: 'group', name: 'NETWORKING' });
const brand = Q('master.save', { kind: 'brand', name: 'TP-LINK' });
const router = Q('product.save', { name: 'ROUTER AX23', sku: 'AX23', barcode: '6935364072650', category_id: grp.id, brand_id: brand.id, has_warranty: true, warranty_type: 'serial', warranty_days: 365 });
const mouse = Q('product.save', { name: 'MOUSE OP-620D', sku: 'OP620', has_warranty: true, warranty_type: 'invoice', warranty_days: 365 });
const mouse2 = Q('product.save', { name: 'MOUSE WIRELESS G3' });
const supA = Q('supplier.save', { name: 'Global Brand', phones: ['01711000001'] });
const supB = Q('supplier.save', { name: 'Smart Tech', phones: ['01711000002'] });
const karim = Q('customer.save', { name: 'Karim', phones: ['01811000001'] });
const rahim = Q('customer.save', { name: 'Rahim', phones: ['01811000002'] });

const p1 = Q('purchase.create', { supplier_id: supA.id, date: '2026-10-01', supplier_invoice: 'GB-501', items: [
  { product_id: router.id, qty: 3, cost: 2000, sale_price: 2600, serials: ['RX-1', 'RX-2', 'RX-3'] },
  { product_id: mouse.id, qty: 10, cost: 300, sale_price: 450 }], payments: [{ account_id: cash.id, amount: 9000 }] });
const p2 = Q('purchase.create', { supplier_id: supB.id, date: '2026-10-20', items: [{ product_id: mouse.id, qty: 5, cost: 320, sale_price: 450 }, { product_id: mouse2.id, qty: 4, cost: 500, sale_price: 700 }], payments: [] });

const s1 = Q('sale.create', { customer_id: karim.id, items: [{ product_id: router.id, qty: 1, price: 2600, serials: ['RX-1'] }, { product_id: mouse.id, qty: 2, price: 450 }], payments: [{ account_id: cash.id, amount: 3500 }] });
// a staff member's own sale (other staff must not see it)
Q('user.save', { name: 'Shop Staff', username: 'staff1', password: 'staff123', role: 'sales' });
const staff = login('staff1', 'staff123');
const s2 = Q('sale.create', { customer_id: rahim.id, items: [{ product_id: router.id, qty: 1, price: 2700, serials: ['RX-2'] }, { product_id: mouse.id, qty: 1, price: 450 }], payments: [{ account_id: cash.id, amount: 3150 }] }, staff);
const sr = Q('sreturn.create', { sale_id: s1.sale.id, items: [{ sale_item_id: s1.items[0].id, qty: 1, serials: ['RX-1'] }, { sale_item_id: s1.items[1].id, qty: 1 }], refund: { mode: 'cash', account_id: cash.id, amount: 500 }, type: 'return' });
const pr = Q('preturn.create', { purchase_id: p1.purchase.id, items: [{ purchase_item_id: p1.items[0].id, qty: 1, serials: ['RX-3'] }], refund: { mode: 'adjust' } });
const cl = Q('claim.create', { sale_id: s2.sale.id, sale_item_id: s2.items[0].id, serial: 'RX-2', issue: 'No power' });

/* ---------- serial ---------- */
let h = Q('history', { q: 'rx-2' });
same(h.kind, 'serial', 'serial found (any case)');
let c = h.cards;
same(c.products.length, 1, 'one product');
same([c.products[0].name, c.products[0].sku, c.products[0].barcode, c.products[0].brand, c.products[0].group], ['ROUTER AX23', 'AX23', '6935364072650', 'TP-LINK', 'NETWORKING'], 'product details');
same(c.products[0].serials, { in_stock: 1, sold: 1, returned_supplier: 1 }, 'serial counts: RX-1 back in stock after its return, RX-2 sold, RX-3 back to the supplier');
same(c.products[0].serial.serial, 'RX-2', 'serial details on the product card');
same(nos(c.purchases), [p1.purchase.invoice_no], 'bought from: the purchase of this serial');
same([c.purchases.rows[0].party, c.purchases.rows[0].supplier_invoice, c.purchases.rows[0].qty, c.purchases.rows[0].amount], ['Global Brand', 'GB-501', 1, 2000], 'purchase row: supplier, their invoice, 1 unit, its cost');
same(nos(c.sales), [s2.sale.invoice_no], 'sold to: the sale of this serial');
same([c.sales.rows[0].party, c.sales.rows[0].qty, c.sales.rows[0].amount], ['Rahim', 1, 2700], 'sale row: customer, 1 unit, its price');
same([c.sreturns.total, c.preturns.total], [0, 0], 'no returns for RX-2');
same(nos(c.claims), [cl.claim_no], 'warranty claim');
same([c.claims.rows[0].status, c.claims.rows[0].product], ['Pending', 'ROUTER AX23'], 'claim row');
// RX-1: sold, then returned by the customer; RX-3 went back to the supplier
c = Q('history', { q: 'RX-1' }).cards;
same([nos(c.sales), nos(c.sreturns)], [[s1.sale.invoice_no], [sr.return.return_no]], 'RX-1: sale and the sales return');
same([c.sreturns.rows[0].qty, c.sreturns.rows[0].amount, c.sreturns.rows[0].invoice_no], [1, 2600 * s1.sale.total / s1.sale.subtotal, s1.sale.invoice_no], 'return row shows only the serial line');
c = Q('history', { q: 'RX-3' }).cards;
same([nos(c.preturns), c.preturns.rows[0].party, c.preturns.rows[0].qty, c.sales.total], [[pr.return.return_no], 'Global Brand', 1, 0], 'RX-3: returned to the supplier, never sold');

/* ---------- product ---------- */
h = Q('history', { q: 'OP620' });
same(h.kind, 'product', 'product by model');
c = h.cards;
same([c.products[0].name, c.products[0].stock, c.products[0].cost_price > 0, c.products[0].serials], ['MOUSE OP-620D', 13, true, undefined], 'mouse: stock, cost for admin, no serial counts');
same(nos(c.purchases), [p2.purchase.invoice_no, p1.purchase.invoice_no], 'every purchase of the mouse, newest first');
same([c.purchases.rows[0].qty, c.purchases.rows[0].amount, c.purchases.rows[1].qty], [5, 1600, 10], 'only the mouse lines count');
same(nos(c.sales).sort(), [s1.sale.invoice_no, s2.sale.invoice_no].sort(), 'both sales of the mouse (admin sees all staff)');
same(nos(c.sreturns), [sr.return.return_no], 'sales return with a mouse line');
same(c.preturns.total, 0, 'no purchase return of the mouse');
truthy(h.timeline.length > 0, 'timeline still there');

/* ---------- part of a name ---------- */
h = Q('history', { q: 'mouse' });
same([h.kind, h.total, h.items.map((x) => x.name)], ['choose', 2, ['MOUSE OP-620D', 'MOUSE WIRELESS G3']], 'several products: which one?');
same(Q('history', { product_id: mouse2.id }).cards.products[0].name, 'MOUSE WIRELESS G3', 'picked from the list');
same(Q('history', { product_id: mouse2.id }).kind, 'product', 'picked product opens');
same(Q('history', { q: 'wireless' }).kind, 'product', 'one match opens straight away');
same(Q('history', { q: 'nothing like this' }).kind, 'none', 'no match');
QF('history', { product_id: 'nope' });

/* ---------- sale invoice ---------- */
h = Q('history', { q: s1.sale.invoice_no });
same(h.kind, 'sale_invoice', 'sale invoice');
c = h.cards;
same(c.products.map((x) => [x.name, x.line.qty, x.line.serials]), [['ROUTER AX23', 1, 'RX-1'], ['MOUSE OP-620D', 2, '']], 'products in the invoice with qty and serials');
same([nos(c.sales), c.sales.rows[0].amount, c.sales.rows[0].whole], [[s1.sale.invoice_no], s1.sale.total, true], 'the invoice itself, full total');
same(nos(c.purchases), [p2.purchase.invoice_no, p1.purchase.invoice_no], 'mouse from the last purchase before the sale (20 Oct), router from its serial');
same([c.purchases.rows[0].last, c.purchases.rows[0].qty, c.purchases.rows[0].amount, c.purchases.rows[0].party], [true, 2, 640, 'Smart Tech'], 'the mouse purchase: marked as the last purchase before this sale, counting the 2 sold here at its price 320');
same([c.purchases.rows[1].last, c.purchases.rows[1].qty, c.purchases.rows[1].amount, c.purchases.rows[1].items], [undefined, 1, 2000, 'ROUTER AX23'], 'the router purchase: only RX-1 (1 of 3), at its cost');
truthy(/last purchase before this sale/.test(c.notes.purchases), 'card explains it');
same(nos(c.sreturns), [sr.return.return_no], 'its return');
same([c.sreturns.rows[0].whole, c.sreturns.rows[0].amount], [true, sr.return.total], 'whole return amount');
same(c.claims.total, 0, 'no claim on this invoice');

/* ---------- purchase invoice (ours and the supplier's number) ---------- */
h = Q('history', { q: 'GB-501' });
same(h.kind, 'purchase_invoice', 'supplier invoice number');
c = h.cards;
same([nos(c.purchases), c.purchases.rows[0].amount, c.purchases.rows[0].whole], [[p1.purchase.invoice_no], p1.purchase.total, true], 'the purchase itself');
same(c.products.map((x) => [x.name, x.line.qty, x.line.cost]), [['ROUTER AX23', 3, 2000], ['MOUSE OP-620D', 10, 300]], 'products bought with cost');
same(nos(c.sales).sort(), [s1.sale.invoice_no, s2.sale.invoice_no].sort(), 'sold to: serial sales and mouse sales since the purchase');
same(nos(c.preturns), [pr.return.return_no], 'its purchase return');
same(nos(c.claims), [cl.claim_no], 'claim on a serial from this purchase');
truthy(/sales since this purchase/.test(c.notes.sales), 'card explains the date-based list');
// the later purchase: no serials; only sales after 20 Oct count — none here (both sales are today, 7 Nov) → both
c = Q('history', { q: p2.purchase.invoice_no }).cards;
same([c.products.length, nos(c.sales).length, c.claims.total], [2, 2, 0], 'p2: two products, sales of the mouse since 20 Oct');

/* ---------- documents ---------- */
const doc = (type, id, t) => Q('history.doc', { type, id }, t);
same(doc('sale', s1.sale.id).detail.sale.invoice_no, s1.sale.invoice_no, 'sale invoice opens');
same(doc('sale', s1.sale.invoice_no).detail.sale.id, s1.sale.id, 'by number too');
same(doc('purchase', p1.purchase.id).detail.purchase.invoice_no, p1.purchase.invoice_no, 'purchase invoice opens');
let d = doc('sreturn', sr.return.id).detail;
same([d.ret.return_no, d.ret.refund_account, d.items.length, d.customer.name, 'cost' in d.ret, 'valuation' in d.items[0]], [sr.return.return_no, cash.name, 2, 'Karim', true, false], 'sales return opens (admin sees cost, never the valuation)');
d = doc('preturn', pr.return.id).detail;
same([d.ret.return_no, d.supplier.name, d.items[0].serials, d.items[0].cost], [pr.return.return_no, 'Global Brand', 'RX-3', 2000], 'purchase return opens');
d = doc('claim', cl.id).detail;
same([d.claim_no, d.log.length, d.serial], [cl.claim_no, 1, 'RX-2'], 'claim opens with its progress');
QF('history.doc', { type: 'nope', id: 'x' });
truthy(/not found/.test(QF('history.doc', { type: 'sreturn', id: 'SR-999999' })), 'unknown return');

/* ---------- staff privacy ---------- */
// staff (POS + warranty): sees own sale only, no purchase money, no cost
c = Q('history', { q: 'OP620' }, staff).cards;
same(nos(c.sales), [s2.sale.invoice_no], 'staff sees only their own sale');
same(c.sreturns.total, 0, 'the return of another staff member\\'s sale is hidden');
truthy(c.purchases.rows.every((r) => r.amount === undefined && r.paid === undefined), 'no purchase money for staff');
same([c.products[0].cost_price, c.products[0].wholesale_price], [undefined, undefined], 'no cost / wholesale price for staff');
c = Q('history', { q: 'RX-1' }, staff).cards;
same([c.sales.total, c.sreturns.total], [0, 0], 'staff: RX-1 sale and return belong to someone else');
same(nos(Q('history', { q: 'RX-2' }, staff).cards.claims), [cl.claim_no], 'staff sees the claim on their own sale');
truthy(/Permission denied/.test(QF('history.doc', { type: 'purchase', id: p1.purchase.id }, staff)), 'staff cannot open a purchase');
truthy(/Permission denied/.test(QF('history.doc', { type: 'preturn', id: pr.return.id }, staff)), 'nor a purchase return');
truthy(/Permission denied/.test(QF('history.doc', { type: 'sreturn', id: sr.return.id }, staff)), 'nor a sales return (no return permission)');
truthy(/another user/.test(QF('history.doc', { type: 'sale', id: s1.sale.id }, staff)), 'nor another staff member\\'s sale');
same(Q('history.doc', { type: 'sale', id: s2.sale.id }, staff).detail.sale.invoice_no, s2.sale.invoice_no, 'own sale opens');
truthy(!('cost' in Q('history.doc', { type: 'sale', id: s2.sale.id }, staff).detail.sale), 'without cost');
same(Q('history.doc', { type: 'claim', id: cl.id }, staff).detail.claim_no, cl.claim_no, 'claims open with the warranty permission');
// a manager with sales returns but not cost: the return opens without its cost
Q('user.save', { name: 'Floor Manager', username: 'mgr1', password: 'mgr12345', role: 'manager' });
Q('rolePerms.save', { manager: ['pos', 'sales.all', 'sales.return'], sales: ['pos', 'warranty'] });
const mgr = login('mgr1', 'mgr12345');
d = Q('history.doc', { type: 'sreturn', id: sr.return.id }, mgr).detail;
same(['cost' in d.ret, d.items.some((i) => 'cost' in i), d.ret.total], [false, false, sr.return.total], 'return without cost for a manager without cost permission');

/* ---------- a cancelled purchase still shows, marked ---------- */
const p3 = Q('purchase.create', { supplier_id: supB.id, items: [{ product_id: mouse2.id, qty: 1, cost: 510, sale_price: 700 }], payments: [] });
Q('reverse', { type: 'purchase', id: p3.purchase.id, reason: 'typing mistake', password: 'admin123' });
c = Q('history', { product_id: mouse2.id }).cards;
same(c.purchases.rows.map((r) => [r.no, r.status]), [[p3.purchase.invoice_no, 'cancelled'], [p2.purchase.invoice_no, 'active']], 'cancelled purchase listed with its status');
console.log('Advance Search cards and documents: ' + checks + ' checks passed');
`;
eval(harness + scenario);
