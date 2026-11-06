// Supplier invoice number on purchases: kept apart from the note, searchable, duplicate guard per supplier.
const fs = require('fs');
const path = require('path');
const harness = fs.readFileSync(path.join(__dirname, 'simulate.js'), 'utf8').split('/* ---------------- scenario ---------------- */')[0];
const scenario = `
sandbox.setupDatabase();
const assert = require('assert/strict');
let checks = 0;
const same = (a, b, msg) => { assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg); checks++; };
const truthy = (v, msg) => { assert.ok(v, msg); checks++; };
const token = call('login', {username:'admin', password:'admin123'}).data.token;
const Q = (a, p, t) => { const r = call(a, p, t || token); if (!r.ok) throw new Error(a + ': ' + r.error); return r.data; };
const QF = (a, p, t) => { const r = call(a, p, t || token); assert.equal(r.ok, false, a + ' should fail'); checks++; return r.error; };
const s1 = Q('supplier.save', { name: 'Smart Tech' }), s2 = Q('supplier.save', { name: 'Global Brand' });
const pr = Q('product.save', { name: 'SSD 512GB' });
const buy = (sup, extra) => Q('purchase.create', { supplier_id: sup.id, items: [{ product_id: pr.id, qty: 1, cost: 3000, sale_price: 3600 }], payments: [], ...extra }).purchase;

const a = buy(s1, { supplier_invoice: '  INV-0457 ', note: 'Delivered by Rahim' });
same([a.supplier_invoice, a.note], ['INV-0457', 'Delivered by Rahim'], 'invoice no. and note stored separately (trimmed)');
same(Q('purchase.detail', { id: a.id }).purchase.supplier_invoice, 'INV-0457', 'in the detail');
const st = Q('supplier.statement', { supplier_id: s1.id }); truthy(JSON.stringify(st).includes('Supplier invoice INV-0457'), 'shown on the supplier statement');

// duplicates for the same supplier are stopped (case-insensitive), with the earlier purchase named
const err = QF('purchase.create', { supplier_id: s1.id, supplier_invoice: 'inv-0457', items: [{ product_id: pr.id, qty: 1, cost: 3000 }], payments: [] });
truthy(/^DUPLICATE_SUPPLIER_INVOICE: Supplier invoice inv-0457 is already entered on purchase PUR-/.test(err) && err.indexOf(a.invoice_no) > 0, 'duplicate stopped: ' + err);
const b = buy(s1, { supplier_invoice: 'INV-0457', allow_duplicate_invoice: true });
same(b.supplier_invoice, 'INV-0457', 'saved when the user confirms');
same(buy(s2, { supplier_invoice: 'INV-0457' }).supplier_invoice, 'INV-0457', 'another supplier may use the same number');
same(buy(s1, {}).supplier_invoice, '', 'optional');
truthy(/too long/.test(QF('purchase.create', { supplier_id: s1.id, supplier_invoice: 'x'.repeat(61), items: [{ product_id: pr.id, qty: 1, cost: 3000 }], payments: [] })), 'length limit');

// a cancelled purchase no longer blocks the number
const c = buy(s2, { supplier_invoice: 'GB-77' });
Q('reverse', { type: 'purchase', id: c.id, reason: 'wrong entry', password: 'admin123' });
same(buy(s2, { supplier_invoice: 'GB-77' }).supplier_invoice, 'GB-77', 'cancelled purchase does not block');

// search: purchases list and Advance Search
const hits = Q('purchases.list', { q: 'inv-0457', page: 1, per: 10 });
same(hits.total, 3, 'list search finds the supplier invoice');
same(Q('purchases.list', { q: 'rahim', page: 1, per: 10 }).total, 1, 'list search also looks in the note');
const h = Q('history', { q: 'GB-77' });
same([h.kind, h.summary.supplier_invoice, h.summary.status], ['purchase_invoice', 'GB-77', 'active'], 'Advance Search finds it (active one first)');
same(Q('history', { q: a.invoice_no }).summary.supplier_invoice, 'INV-0457', 'our own number still works and shows the supplier invoice');
console.log('Supplier invoice: ' + checks + ' checks passed');
`;
eval(harness + scenario);
