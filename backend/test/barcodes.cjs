// Regression checks for shop barcodes: product.barcodes gives products without a barcode a unique
// in-store EAN-13 (prefix 20) and never touches or duplicates existing codes.
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
const prod = (id) => Q('products.list', {}).find((x) => x.id === id);
const code = (n) => { const d = '20' + String(n).padStart(10, '0'); let t = 0; for (let i = 0; i < 12; i++) t += +d[i] * (i % 2 ? 3 : 1); return d + ((10 - t % 10) % 10); };
const validEan = (c) => { if (!/^\\d{13}$/.test(c)) return false; let s = 0; for (let i = 0; i < 12; i++) s += +c[i] * (i % 2 ? 3 : 1); return (10 - s % 10) % 10 === +c[12]; };

same(sandbox.ean13Check_('400638133393'), '1', 'known EAN-13 check digit (4006381333931)');
same(sandbox.ean13Check_('200000000001'), '5');

const a = Q('product.save', {name:'Mouse A'});
const b = Q('product.save', {name:'Keyboard B', barcode:'8901234567890'});
const c = Q('product.save', {name:'Cable C', sku:code(2)}); // an SKU that looks like the 2nd shop code
const d = Q('product.save', {name:'SSD D'});
const r = Q('product.barcodes', {ids:[a.id, b.id, c.id, d.id]});
same(r.assigned.map((x) => x.id), [a.id, c.id, d.id], 'only products without a barcode get one');
same(prod(b.id).barcode, '8901234567890', 'existing barcode untouched');
same(prod(a.id).barcode, code(1), 'first shop code');
truthy(r.assigned.every((x) => validEan(x.barcode) && x.barcode.startsWith('20')), 'valid EAN-13 in the 20 in-store range');
truthy(r.assigned.every((x) => x.barcode !== code(2)), 'skips a code already used as an SKU');
same(new Set(r.assigned.map((x) => x.barcode)).size, 3, 'all unique');
same(prod(c.id).barcode, code(3), 'numbering continues past the clash');

// running again changes nothing; the next new product continues the numbering
same(Q('product.barcodes', {ids:[a.id, c.id]}).assigned, [], 'second run assigns nothing');
const e = Q('product.save', {name:'Monitor E'});
same(Q('product.barcodes', {ids:[e.id]}).assigned[0].barcode, code(5), 'continues after the highest (…004 was taken by D)');
same(prod(d.id).barcode, code(4));

// a shop code typed by hand on another product is respected
Q('product.save', {name:'Hand F', barcode:code(100)});
const g = Q('product.save', {name:'Router G'});
same(Q('product.barcodes', {ids:[g.id]}).assigned[0].barcode, code(101), 'continues after a higher hand-typed shop code');

// the new barcode is what the product save check guards against too
truthy(/already used/.test(QF('product.save', {name:'Dup H', barcode:code(1)})), 'cannot reuse an assigned code');

// a serial number equal to the next code is skipped
const s = Q('supplier.save', {name:'Sup'});
const lap = Q('product.save', {name:'Laptop', has_warranty:true, warranty_type:'serial', warranty_days:365});
Q('purchase.create', {supplier_id:s.id, items:[{product_id:lap.id, qty:1, cost:50000, sale_price:60000, serials:[code(102)]}], payments:[]});
const h = Q('product.save', {name:'Speaker H'});
same(Q('product.barcodes', {ids:[h.id]}).assigned[0].barcode, code(103), 'skips a code used as a serial number');

// errors and permissions
truthy(/Select at least one/.test(QF('product.barcodes', {ids:[]})));
truthy(/not found/.test(QF('product.barcodes', {ids:['nope']})));
Q('user.save', {name:'Karim', username:'karim', password:'secret1', role:'sales'});
const kt = call('login', {username:'karim', password:'secret1'}).data.token;
truthy(/ermission/.test(QF('product.barcodes', {ids:[h.id]}, kt)), 'sales user cannot assign barcodes');
console.log('Barcodes: ' + checks + ' checks passed');
`;
eval(harness + scenario);
